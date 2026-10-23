import { Money } from '@asas/domain'
import type { Prisma, PrismaClient, SubscriptionStatus } from '@prisma/client'
import Stripe from 'stripe'
import type { AsasEnv } from '../config/env.js'

export interface BillingPlan {
  priceId: string
  name: string
  amount: string
  currency: string
  interval: 'month'
  seatLimit: number
  storageLimitGb: number
}

function getPlanLimits(product: string | Stripe.Product | Stripe.DeletedProduct): { seatLimit: number; storageLimitGb: number } | null {
  if (typeof product === 'string' || product.deleted) return null
  const seatLimit = Number(product.metadata.seat_limit)
  const storageLimitGb = Number(product.metadata.storage_limit_gb)
  if (!Number.isSafeInteger(seatLimit) || seatLimit < 1 || !Number.isFinite(storageLimitGb) || storageLimitGb <= 0) return null
  return { seatLimit, storageLimitGb }
}

export interface StripeBillingProvider {
  listPlans(): Promise<BillingPlan[]>
  createCheckout(input: {
    tenantId: string
    priceId: string
    customerId: string | null
    customerEmail: string | null
    successUrl: string
    cancelUrl: string
    idempotencyKey: string
  }): Promise<string>
  createPortal(customerId: string, returnUrl: string): Promise<string>
  verifyWebhook(payload: Buffer, signature: string, secret: string): Stripe.Event
  retrieveSubscription(id: string): Promise<Stripe.Subscription>
  cancelSubscription(id: string): Promise<Stripe.Subscription>
  retrievePrice(id: string): Promise<Stripe.Price>
  retrieveInvoice(id: string): Promise<Stripe.Invoice>
  listCustomerPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]>
  allowsPrice(id: string): boolean
}

declare module 'fastify' {
  interface FastifyInstance {
    stripeBilling: StripeBillingProvider | null
    environment: AsasEnv
  }
}

export function createStripeBillingProvider(secretKey: string, configuredPriceIds: string[]): StripeBillingProvider {
  const stripe = new Stripe(secretKey)
  const allowedPrices = new Set(configuredPriceIds)

  return {
    async listPlans() {
      const prices = await Promise.all([...allowedPrices].map(id => stripe.prices.retrieve(id, { expand: ['product'] })))
      return prices.flatMap(price => {
        const recurring = price.recurring
        if (!price.active || !recurring || recurring.interval !== 'month' || recurring.interval_count !== 1 || price.unit_amount == null) return []
        const product = price.product
        const limits = getPlanLimits(product)
        if (!limits) return []
        const name = typeof product === 'string' || product.deleted ? `Plan ${price.id}` : product.name
        return [{
          priceId: price.id,
          name,
          amount: Money.fromMinorUnits(price.unit_amount, price.currency.toUpperCase()).toDecimalString(),
          currency: price.currency.toUpperCase(),
          interval: 'month' as const,
          ...limits,
        }]
      })
    },
    async createCheckout(input) {
      if (!allowedPrices.has(input.priceId)) throw new Error('Unsupported billing plan')
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: input.priceId, quantity: 1 }],
        ...(input.customerId ? { customer: input.customerId } : input.customerEmail ? { customer_email: input.customerEmail } : {}),
        client_reference_id: input.tenantId,
        metadata: { tenantId: input.tenantId },
        subscription_data: { metadata: { tenantId: input.tenantId } },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }, { idempotencyKey: input.idempotencyKey })
      if (!session.url) throw new Error('Stripe did not return a checkout URL')
      return session.url
    },
    async createPortal(customerId, returnUrl) {
      const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })
      return session.url
    },
    verifyWebhook(payload, signature, secret) {
      return stripe.webhooks.constructEvent(payload, signature, secret)
    },
    retrieveSubscription(id) {
      return stripe.subscriptions.retrieve(id, { expand: ['items.data.price.product'] })
    },
    async cancelSubscription(id) {
      const current = await stripe.subscriptions.retrieve(id)
      if (current.status === 'canceled') return current
      return stripe.subscriptions.cancel(id)
    },
    retrievePrice(id) {
      return stripe.prices.retrieve(id, { expand: ['product'] })
    },
    retrieveInvoice(id) {
      return stripe.invoices.retrieve(id)
    },
    async listCustomerPaymentMethods(customerId) {
      const result = await stripe.paymentMethods.list({ customer: customerId, type: 'card' })
      return result.data
    },
    allowsPrice(id) {
      return allowedPrices.has(id)
    },
  }
}

function normalizeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === 'active' || status === 'trialing') return 'ACTIVE'
  if (status === 'canceled' || status === 'incomplete_expired') return 'CANCELED'
  return 'PAST_DUE'
}

function getCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (!customer || typeof customer === 'string') return customer ?? null
  return customer.id
}

/** Apply supported webhook snapshots and persist their event id atomically for safe retries. */
export async function processStripeWebhookEvent(
  prisma: PrismaClient,
  provider: StripeBillingProvider,
  event: Stripe.Event,
): Promise<'processed' | 'duplicate' | 'ignored'> {
  const candidate = event.data.object as unknown as Record<string, unknown>
  if (event.type === 'payment_method.detached') {
    const paymentMethodId = typeof candidate.id === 'string' ? candidate.id : null
    if (!paymentMethodId) return 'ignored'
    try {
      await prisma.$transaction(async tx => {
        await tx.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } })
        await tx.paymentMethod.deleteMany({ where: { stripePaymentMethodId: paymentMethodId } })
      })
    } catch (error) {
      if (isUniqueConstraintError(error) && await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return 'duplicate'
      throw error
    }
    return 'processed'
  }

  if (event.type === 'customer.updated' || event.type === 'payment_method.attached') {
    const customerId = event.type === 'customer.updated'
      ? (typeof candidate.id === 'string' ? candidate.id : null)
      : getCustomerId((candidate as { customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null }).customer)
    if (!customerId) return 'ignored'
    const tenant = await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } })
    if (!tenant) return 'ignored'
    const methods = await provider.listCustomerPaymentMethods(customerId)
    try {
      await prisma.$transaction(async tx => {
        await tx.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } })
        await syncStripePaymentMethods(tx, tenant.id, methods)
      })
    } catch (error) {
      if (isUniqueConstraintError(error) && await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return 'duplicate'
      throw error
    }
    return 'processed'
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    return processStripeInvoiceEvent(prisma, provider, event, candidate)
  }
  let subscription: Stripe.Subscription | null = null
  let customerId: string | null = null
  let tenantId: string | null = null

  if (event.type === 'checkout.session.completed') {
    const session = candidate as { mode?: string; subscription?: string | Stripe.Subscription | null; customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null; metadata?: Record<string, string> | null }
    if (session.mode !== 'subscription' || !session.subscription) return 'ignored'
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
    subscription = await provider.retrieveSubscription(subscriptionId)
    tenantId = session.metadata?.tenantId ?? subscription.metadata.tenantId ?? null
    customerId = getCustomerId(session.customer) ?? getCustomerId(subscription.customer)
  } else if (event.type.startsWith('customer.subscription.')) {
    const eventSubscription = candidate as unknown as Stripe.Subscription
    try {
      // Fetch current state so a delayed/out-of-order event cannot roll billing back to an old snapshot.
      subscription = await provider.retrieveSubscription(eventSubscription.id)
    } catch (error) {
      if (event.type !== 'customer.subscription.deleted') throw error
      subscription = eventSubscription
    }
    tenantId = subscription.metadata.tenantId ?? eventSubscription.metadata.tenantId ?? null
    customerId = getCustomerId(subscription.customer)
  } else {
    return 'ignored'
  }

  if (!subscription || !tenantId || !customerId) return 'ignored'
  const item = subscription.items.data[0]
  if (!item) return 'ignored'
  const price = await provider.retrievePrice(item.price.id)
  if (!provider.allowsPrice(price.id)) throw new Error('Stripe subscription uses a price that is not configured for Asas')
  if (!price.recurring || price.recurring.interval !== 'month' || price.recurring.interval_count !== 1 || price.unit_amount == null) {
    throw new Error('Stripe subscription must use an allowed monthly recurring price')
  }
  const product = price.product
  const limits = getPlanLimits(product)
  if (!limits) throw new Error('Stripe product must define valid seat_limit and storage_limit_gb metadata')
  const planName = typeof product === 'string' || product.deleted ? `Plan ${price.id}` : product.name
  const amount = Money.fromMinorUnits(price.unit_amount, price.currency.toUpperCase()).toDecimalString()
  const status = event.type === 'customer.subscription.deleted' ? 'CANCELED' : normalizeStatus(subscription.status)
  const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end
  const paymentMethods = await provider.listCustomerPaymentMethods(customerId)

  try {
    await prisma.$transaction(async tx => {
      await tx.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } })
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, stripeCustomerId: true } })
      if (!tenant) throw new Error('Stripe billing event references an unknown tenant')
      if (tenant.stripeCustomerId && tenant.stripeCustomerId !== customerId) {
        throw new Error('Stripe customer does not match the tenant billing record')
      }
      await tx.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customerId } })
      await tx.subscription.upsert({
        where: { stripeSubscriptionId: subscription.id },
        create: {
          tenantId: tenant.id,
          stripeSubscriptionId: subscription.id,
          stripePriceId: price.id,
          stripeCurrency: price.currency.toUpperCase(),
          planName,
          priceMonthly: amount,
          status,
          renewsOn: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
          seatLimit: limits.seatLimit,
          storageLimitGb: limits.storageLimitGb,
        },
        update: {
          stripePriceId: price.id,
          stripeCurrency: price.currency.toUpperCase(),
          planName,
          priceMonthly: amount,
          status,
          renewsOn: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
          seatLimit: limits.seatLimit,
          storageLimitGb: limits.storageLimitGb,
        },
      })
      await syncStripePaymentMethods(tx, tenant.id, paymentMethods)
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      if (await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return 'duplicate'
    }
    throw error
  }
  return 'processed'
}

async function syncStripePaymentMethods(
  tx: Prisma.TransactionClient,
  tenantId: string,
  methods: Stripe.PaymentMethod[],
): Promise<void> {
  const cards = methods.filter(method => method.type === 'card' && method.card)
  for (const method of cards) {
    const card = method.card!
    await tx.paymentMethod.upsert({
      where: { stripePaymentMethodId: method.id },
      create: {
        tenantId,
        stripePaymentMethodId: method.id,
        brand: card.brand || 'Card',
        last4: card.last4,
        expires: `${String(card.exp_month).padStart(2, '0')}/${card.exp_year}`,
      },
      update: {
        tenantId,
        brand: card.brand || 'Card',
        last4: card.last4,
        expires: `${String(card.exp_month).padStart(2, '0')}/${card.exp_year}`,
      },
    })
  }
  const currentIds = cards.map(method => method.id)
  await tx.paymentMethod.deleteMany({
    where: {
      tenantId,
      stripePaymentMethodId: currentIds.length ? { notIn: currentIds } : { not: null },
    },
  })
}

async function processStripeInvoiceEvent(
  prisma: PrismaClient,
  provider: StripeBillingProvider,
  event: Stripe.Event,
  candidate: Record<string, unknown>,
): Promise<'processed' | 'duplicate' | 'ignored'> {
  const invoice = candidate as {
    id: string
    customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null
    currency: string
    amount_paid: number
    amount_due: number
    created: number
    number?: string | null
    description?: string | null
    lines?: { data?: Array<{ description?: string | null }> }
  }
  const currentInvoice = await provider.retrieveInvoice(invoice.id)
  const customerId = getCustomerId(invoice.customer)
  if (!customerId) return 'ignored'
  const tenant = await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } })
  if (!tenant) return 'ignored'
  const current = currentInvoice as Stripe.Invoice & { amount_due: number; amount_paid: number; currency: string; customer: string | Stripe.Customer | Stripe.DeletedCustomer | null }
  const amountMinor = current.status === 'paid' ? current.amount_paid : current.amount_due
  const amount = Money.fromMinorUnits(amountMinor, current.currency.toUpperCase()).toDecimalString()
  const description = current.description || invoice.description || invoice.lines?.data?.[0]?.description || `Stripe invoice ${invoice.number ?? invoice.id}`
  const status = current.status === 'paid' ? 'Paid' : event.type === 'invoice.payment_failed' ? 'Payment failed' : 'Open'
  if (!Number.isFinite(invoice.created)) throw new Error('Stripe invoice is missing its creation timestamp')
  try {
    await prisma.$transaction(async tx => {
      await tx.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } })
      await tx.billingInvoice.upsert({
        where: { stripeInvoiceId: invoice.id },
        create: {
          tenantId: tenant.id,
          stripeInvoiceId: invoice.id,
          stripeCurrency: current.currency.toUpperCase(),
          date: new Date(invoice.created * 1000),
          description,
          amount,
          status,
        },
        update: {
          stripeCurrency: current.currency.toUpperCase(),
          date: new Date(invoice.created * 1000),
          description,
          amount,
          status,
        },
      })
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      if (await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return 'duplicate'
    }
    throw error
  }
  return 'processed'
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
}
