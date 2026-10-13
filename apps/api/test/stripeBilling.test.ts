import type { PrismaClient, SubscriptionStatus } from '@prisma/client'
import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { processStripeWebhookEvent, type StripeBillingProvider } from '../src/services/stripeBilling.js'

function fixture(options: { duplicate?: boolean; stripeCustomerId?: string | null } = {}) {
  const eventCreate = vi.fn(async () => {
    if (options.duplicate) throw Object.assign(new Error('duplicate'), { code: 'P2002' })
    return { id: 'evt_1' }
  })
  const tenantUpdate = vi.fn(async () => ({ id: 'tenant_1' }))
  const subscriptionUpsert = vi.fn(async (args: unknown) => args)
  const invoiceUpsert = vi.fn(async (args: unknown) => args)
  const paymentMethodUpsert = vi.fn(async (args: unknown) => args)
  const paymentMethodDeleteMany = vi.fn(async () => ({ count: 0 }))
  const tenantFindUnique = vi.fn(async () => ({ id: 'tenant_1', stripeCustomerId: options.stripeCustomerId ?? 'cus_1' }))
  const tx = {
    stripeWebhookEvent: { create: eventCreate },
    tenant: {
      findUnique: tenantFindUnique,
      update: tenantUpdate,
    },
    subscription: { upsert: subscriptionUpsert },
    billingInvoice: { upsert: invoiceUpsert },
    paymentMethod: { upsert: paymentMethodUpsert, deleteMany: paymentMethodDeleteMany },
  }
  const prisma = {
    $transaction: vi.fn(async callback => callback(tx)),
    stripeWebhookEvent: { findUnique: vi.fn(async () => options.duplicate ? { id: 'evt_1' } : null) },
    tenant: { findUnique: tenantFindUnique },
  } as unknown as PrismaClient
  const subscription = {
    id: 'sub_1',
    customer: 'cus_1',
    metadata: { tenantId: 'tenant_1' },
    status: 'active',
    current_period_end: 1_800_000_000,
    items: { data: [{ price: { id: 'price_monthly' } }] },
  } as unknown as Stripe.Subscription
  const price = {
    id: 'price_monthly',
    active: true,
    currency: 'usd',
    unit_amount: 1299,
    recurring: { interval: 'month', interval_count: 1 },
    product: { id: 'prod_1', name: 'Asas Pro', deleted: false, metadata: { seat_limit: '50', storage_limit_gb: '250' } },
  } as unknown as Stripe.Price
  const provider: StripeBillingProvider = {
    listPlans: vi.fn(async () => []),
    createCheckout: vi.fn(async () => 'https://checkout.stripe.com/session'),
    createPortal: vi.fn(async () => 'https://billing.stripe.com/session'),
    verifyWebhook: vi.fn(),
    retrieveSubscription: vi.fn(async () => subscription),
    retrievePrice: vi.fn(async () => price),
    retrieveInvoice: vi.fn(async () => ({ status: 'paid', amount_paid: 12500, amount_due: 12500, currency: 'egp', description: 'Asas Pro monthly', customer: 'cus_1' } as unknown as Stripe.Invoice)),
    listCustomerPaymentMethods: vi.fn(async () => []),
    allowsPrice: vi.fn(id => id === 'price_monthly'),
  }
  const event = {
    id: 'evt_1',
    type: 'customer.subscription.updated',
    data: { object: subscription },
  } as unknown as Stripe.Event
  return { prisma, provider, event, eventCreate, tenantUpdate, subscriptionUpsert, invoiceUpsert, paymentMethodUpsert, paymentMethodDeleteMany }
}

describe('Stripe subscription webhooks', () => {
  it('atomically maps allowed monthly subscriptions to the tenant billing record', async () => {
    const f = fixture()
    await expect(processStripeWebhookEvent(f.prisma, f.provider, f.event)).resolves.toBe('processed')
    expect(f.prisma.$transaction).toHaveBeenCalledOnce()
    expect(f.tenantUpdate).toHaveBeenCalledWith({ where: { id: 'tenant_1' }, data: { stripeCustomerId: 'cus_1' } })
    const upsert = f.subscriptionUpsert.mock.calls[0]?.[0] as { where: { stripeSubscriptionId: string }; create: { priceMonthly: string; stripeCurrency: string; planName: string; status: SubscriptionStatus; seatLimit: number; storageLimitGb: number } }
    expect(upsert.where).toEqual({ stripeSubscriptionId: 'sub_1' })
    expect(upsert.create).toMatchObject({ priceMonthly: '12.99', stripeCurrency: 'USD', planName: 'Asas Pro', status: 'ACTIVE', seatLimit: 50, storageLimitGb: 250 })
  })

  it('acknowledges an already processed event without applying it twice', async () => {
    const f = fixture({ duplicate: true })
    await expect(processStripeWebhookEvent(f.prisma, f.provider, f.event)).resolves.toBe('duplicate')
    expect(f.subscriptionUpsert).not.toHaveBeenCalled()
  })

  it('rejects an attempt to attach a different Stripe customer to a workspace', async () => {
    const f = fixture({ stripeCustomerId: 'cus_other' })
    await expect(processStripeWebhookEvent(f.prisma, f.provider, f.event)).rejects.toThrow('Stripe customer does not match')
    expect(f.subscriptionUpsert).not.toHaveBeenCalled()
  })

  it('ignores subscription prices outside the configured allow-list', async () => {
    const f = fixture()
    f.provider.allowsPrice = vi.fn(() => false)
    await expect(processStripeWebhookEvent(f.prisma, f.provider, f.event)).rejects.toThrow('not configured for Asas')
    expect(f.eventCreate).not.toHaveBeenCalled()
  })

  it('marks a deleted subscription as canceled', async () => {
    const f = fixture()
    f.provider.retrieveSubscription = vi.fn(async () => { throw new Error('deleted subscriptions are unavailable') })
    const deletedSnapshot = { ...(f.event.data.object as unknown as Record<string, unknown>), status: 'canceled' }
    const deleted = { ...f.event, type: 'customer.subscription.deleted', data: { object: deletedSnapshot } } as Stripe.Event
    await processStripeWebhookEvent(f.prisma, f.provider, deleted)
    const upsert = f.subscriptionUpsert.mock.calls[0]?.[0] as { create: { status: SubscriptionStatus } }
    expect(upsert.create.status).toBe('CANCELED')
  })

  it('syncs attached card details on checkout and removes stale Stripe-linked methods', async () => {
    const f = fixture()
    const card = { id: 'pm_card_1', type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2030 } }
    f.provider.listCustomerPaymentMethods = vi.fn(async () => [card as unknown as Stripe.PaymentMethod])
    await processStripeWebhookEvent(f.prisma, f.provider, f.event)
    expect(f.provider.listCustomerPaymentMethods).toHaveBeenCalledWith('cus_1')
    expect(f.paymentMethodUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { stripePaymentMethodId: 'pm_card_1' },
      create: expect.objectContaining({ tenantId: 'tenant_1', brand: 'visa', last4: '4242', expires: '08/2030' }),
    }))
    expect(f.paymentMethodDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1', stripePaymentMethodId: { notIn: ['pm_card_1'] } },
    })
  })

  it('synchronizes a Stripe customer update and handles detached method events idempotently', async () => {
    const f = fixture()
    const updated = { ...f.event, id: 'evt_customer', type: 'customer.updated', data: { object: { id: 'cus_1' } } } as unknown as Stripe.Event
    await expect(processStripeWebhookEvent(f.prisma, f.provider, updated)).resolves.toBe('processed')
    expect(f.provider.listCustomerPaymentMethods).toHaveBeenCalledWith('cus_1')
    const detached = { ...f.event, id: 'evt_detached', type: 'payment_method.detached', data: { object: { id: 'pm_old' } } } as unknown as Stripe.Event
    await expect(processStripeWebhookEvent(f.prisma, f.provider, detached)).resolves.toBe('processed')
    expect(f.paymentMethodDeleteMany).toHaveBeenCalledWith({ where: { stripePaymentMethodId: 'pm_old' } })
    const duplicate = fixture({ duplicate: true })
    const duplicateDetached = { ...detached, id: 'evt_1' }
    await expect(processStripeWebhookEvent(duplicate.prisma, duplicate.provider, duplicateDetached)).resolves.toBe('duplicate')
    expect(duplicate.paymentMethodDeleteMany).not.toHaveBeenCalled()
  })

  it('records paid invoices with their Stripe currency and can update a prior failed invoice', async () => {
    const f = fixture()
    const invoice = {
      id: 'in_1',
      customer: 'cus_1',
      currency: 'egp',
      amount_paid: 12500,
      amount_due: 12500,
      created: 1_700_000_000,
      number: 'INV-1',
      lines: { data: [{ description: 'Asas Pro monthly' }] },
    }
    const event = { id: 'evt_2', type: 'invoice.paid', data: { object: invoice } } as unknown as Stripe.Event
    await expect(processStripeWebhookEvent(f.prisma, f.provider, event)).resolves.toBe('processed')
    const upsert = f.invoiceUpsert.mock.calls[0]?.[0] as { where: { stripeInvoiceId: string }; create: { amount: string; stripeCurrency: string; description: string; status: string } }
    expect(upsert.where).toEqual({ stripeInvoiceId: 'in_1' })
    expect(upsert.create).toMatchObject({ amount: '125.00', stripeCurrency: 'EGP', description: 'Asas Pro monthly', status: 'Paid' })
  })
})
