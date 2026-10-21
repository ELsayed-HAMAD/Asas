import { createHash } from 'node:crypto'
import {
  billingCheckoutRequestSchema,
  billingPlansResponseSchema,
  platformPlansResponseSchema,
  PLATFORM_PLANS,
  billingSessionResponseSchema,
  envelope,
  errorResponses,
} from '@asas/contracts'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { AppError } from '../../utils/errors.js'
import { requireAuthContext } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { processStripeWebhookEvent } from '../../services/stripeBilling.js'

export async function stripeBillingRoutes(app: FastifyInstance): Promise<void> {
  // Stripe signs the exact bytes it sends. This isolated parser keeps JSON parsing for regular
  // API routes, but gives the webhook verifier the untouched request bytes.
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1024 * 1024 }, (request, body, done) => {
    if (request.url.endsWith('/stripe/webhook')) {
      done(null, body)
      return
    }
    try {
      done(null, JSON.parse(body.toString('utf8')))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  const server = app.withTypeProvider<ZodTypeProvider>()

  // Platform catalog: always available publicly for marketing and workspace upgrades
  server.get('/plans', {
    schema: { response: { 200: envelope(platformPlansResponseSchema), ...errorResponses } },
  }, async request => {
    const provider = request.server.stripeBilling
    const stripePlans = provider ? await provider.listPlans() : []
    // Never expose internal tier IDs as if they were real Stripe price IDs. Those IDs
    // are not checkout-capable and made the UI claim billing was enabled when it was not.
    const stripeConfigured = Boolean(provider && stripePlans.length > 0)
    return {
      data: {
        enabled: stripeConfigured,
        stripeConfigured,
        defaultPlanId: 'free',
        items: stripePlans,
        tiers: PLATFORM_PLANS,
      },
    }
  })

  server.post('/switch-plan', {
    preHandler: requirePermission('settings.billing.write'),
    schema: {
      body: z.object({
        planId: z.enum(['free', 'starter', 'pro', 'enterprise']),
      }),
      response: {
        200: envelope(z.object({
          success: z.boolean(),
          planName: z.string(),
        })),
        ...errorResponses,
      },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const targetPlan = PLATFORM_PLANS.find(p => p.id === request.body.planId)
    if (!targetPlan) throw new AppError(400, 'Invalid plan selected')

    if (targetPlan.id !== 'free') {
      throw new AppError(409, 'Paid plans must be activated through a configured Stripe checkout.')
    }

    const sub = await request.server.prisma.subscription.findFirst({
      where: { tenantId, status: 'ACTIVE', stripeSubscriptionId: { not: null } },
      orderBy: { createdAt: 'desc' },
    })

    if (sub) {
      throw new AppError(409, 'Cancel the active Stripe subscription in Manage billing before switching to the Free plan.')
    }

    const activeFreePlan = await request.server.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        stripeSubscriptionId: null,
        planName: targetPlan.name,
        seatLimit: targetPlan.seatLimit,
        storageLimitGb: targetPlan.storageLimitGb,
      },
      orderBy: { createdAt: 'desc' },
    })
    if (activeFreePlan) return { data: { success: true, planName: targetPlan.name } }

    await request.server.prisma.$transaction(async tx => {
      await tx.subscription.updateMany({ where: { tenantId, stripeSubscriptionId: null }, data: { status: 'CANCELED' } })
      await tx.subscription.create({
        data: {
          tenantId,
          planName: targetPlan.name,
          priceMonthly: targetPlan.priceMonthly,
          seatLimit: targetPlan.seatLimit,
          storageLimitGb: targetPlan.storageLimitGb,
          status: 'ACTIVE',
        },
      })
    })

    await recordAuditLog(request.server.prisma, {
      tenantId,
      actorId: userId,
      action: 'billing.plan.switched',
      targetType: 'Subscription',
      metadata: { planId: targetPlan.id, planName: targetPlan.name },
    })

    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
    return { data: { success: true, planName: targetPlan.name } }
  })

  server.post('/checkout', {
    preHandler: requirePermission('settings.billing.write'),
    schema: {
      body: billingCheckoutRequestSchema,
      response: { 200: envelope(billingSessionResponseSchema), ...errorResponses },
    },
  }, async request => {
    const provider = request.server.stripeBilling
    if (!provider) throw new AppError(503, 'Online billing is not configured')
    if (!provider.allowsPrice(request.body.priceId)) throw new AppError(400, 'Unknown billing plan')
    const { tenantId, userId } = requireAuthContext(request)
    const tenant = await request.server.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, stripeCustomerId: true },
    })
    if (!tenant) throw new AppError(404, 'Workspace not found')
    const activeSubscription = await request.server.prisma.subscription.findFirst({
      where: { tenantId, status: 'ACTIVE', stripeSubscriptionId: { not: null } },
      select: { id: true },
    })
    if (activeSubscription) throw new AppError(409, 'This workspace already has an active subscription. Use Manage billing to change it.')
    const origin = request.server.environment.frontendOrigin.split(',')[0]?.trim()
    if (!origin) throw new AppError(503, 'Billing return URL is not configured')
    const user = await request.server.prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    const url = await provider.createCheckout({
      tenantId,
      priceId: request.body.priceId,
      customerId: tenant.stripeCustomerId,
      customerEmail: user?.email ?? null,
      successUrl: `${origin}/dashboard/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/dashboard/settings/billing?checkout=cancelled`,
      idempotencyKey: `asas_checkout_${createHash('sha256').update(`${tenantId}:${request.body.priceId}:${Math.floor(Date.now() / 300_000)}`).digest('hex')}`,
    })
    await recordAuditLog(request.server.prisma, {
      tenantId,
      actorId: userId,
      action: 'billing.checkout.started',
      targetType: 'Tenant',
      targetId: tenantId,
      metadata: { priceId: request.body.priceId },
    })
    return { data: { url } }
  })

  server.post('/portal', {
    preHandler: requirePermission('settings.billing.write'),
    schema: { response: { 200: envelope(billingSessionResponseSchema), ...errorResponses } },
  }, async request => {
    const provider = request.server.stripeBilling
    if (!provider) throw new AppError(503, 'Online billing is not configured')
    const { tenantId, userId } = requireAuthContext(request)
    const tenant = await request.server.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeCustomerId: true },
    })
    if (!tenant?.stripeCustomerId) throw new AppError(409, 'Complete a subscription checkout before opening the billing portal')
    const origin = request.server.environment.frontendOrigin.split(',')[0]?.trim()
    if (!origin) throw new AppError(503, 'Billing return URL is not configured')
    const url = await provider.createPortal(tenant.stripeCustomerId, `${origin}/dashboard/settings/billing`)
    await recordAuditLog(request.server.prisma, {
      tenantId,
      actorId: userId,
      action: 'billing.portal.opened',
      targetType: 'Tenant',
      targetId: tenantId,
    })
    return { data: { url } }
  })

  server.post('/stripe/webhook', async (request, reply) => {
    const provider = request.server.stripeBilling
    const secret = request.server.environment.stripeWebhookSecret
    if (!provider || !secret) return reply.code(503).send({ error: { message: 'Stripe webhook is not configured' } })
    const signature = request.headers['stripe-signature']
    if (typeof signature !== 'string' || !Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ error: { message: 'Invalid Stripe webhook request' } })
    }
    let event
    try {
      event = provider.verifyWebhook(request.body, signature, secret)
    } catch {
      return reply.code(400).send({ error: { message: 'Invalid Stripe webhook signature' } })
    }
    await processStripeWebhookEvent(request.server.prisma, provider, event)
    return reply.code(200).send({ received: true })
  })
}
