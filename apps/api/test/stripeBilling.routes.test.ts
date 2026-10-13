import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import type Stripe from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { stripeBillingRoutes } from '../src/modules/billing/stripe.routes.js'
import type { StripeBillingProvider } from '../src/services/stripeBilling.js'

const apps: Awaited<ReturnType<typeof makeApp>>[] = []

async function makeApp(role: 'ADMIN' | 'MEMBER', provider: StripeBillingProvider | null) {
  const app = Fastify({ logger: false }).withTypeProvider()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const prisma = {
    auditLog: { create: vi.fn(async () => ({})) },
    member: { findUnique: vi.fn(async () => ({ role, employeeId: null })) },
    tenant: {
      findUnique: vi.fn(async () => ({ id: 'tenant_1', stripeCustomerId: null })),
    },
    subscription: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ email: 'owner@example.com' })) },
  }
  const auth = { api: { getSession: vi.fn(async () => ({ user: { id: 'user_1' }, session: { activeOrganizationId: 'tenant_1' } })) } }
  app.decorate('prisma', prisma as unknown as PrismaClient)
  app.decorate('auth', auth as never)
  app.decorate('stripeBilling', provider)
  app.decorate('environment', loadEnv({ STRIPE_SECRET_KEY: 'sk_test_key', STRIPE_WEBHOOK_SECRET: 'whsec_test', FRONTEND_ORIGIN: 'https://app.example.test' }))
  await app.register(stripeBillingRoutes, { prefix: '/api/v1/billing' })
  await app.ready()
  return { app, prisma }
}

function provider(overrides: Partial<StripeBillingProvider> = {}): StripeBillingProvider {
  return {
    listPlans: vi.fn(async () => [{ priceId: 'price_basic', name: 'Basic', amount: '10.00', currency: 'USD', interval: 'month', seatLimit: 10, storageLimitGb: 100 }]),
    createCheckout: vi.fn(async () => 'https://checkout.stripe.com/session'),
    createPortal: vi.fn(async () => 'https://billing.stripe.com/session'),
    verifyWebhook: vi.fn(() => ({ id: 'evt_ignored', type: 'charge.succeeded', data: { object: {} } } as unknown as Stripe.Event)),
    retrieveSubscription: vi.fn(),
    retrievePrice: vi.fn(),
    retrieveInvoice: vi.fn(),
    allowsPrice: vi.fn(id => id === 'price_basic'),
    ...overrides,
  }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(({ app }) => app.close()))
})

describe('Stripe billing routes', () => {
  it('returns configured prices only to authenticated workspace members', async () => {
    const stripe = provider()
    const { app } = await makeApp('MEMBER', stripe)
    apps.push({ app } as Awaited<ReturnType<typeof makeApp>>)
    const response = await app.inject({ method: 'GET', url: '/api/v1/billing/plans' })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({ enabled: true, items: [{ priceId: 'price_basic', amount: '10.00' }] })
  })

  it('creates hosted checkout for admins with server-owned tenant and return URL values', async () => {
    const stripe = provider()
    const { app, prisma } = await makeApp('ADMIN', stripe)
    apps.push({ app } as Awaited<ReturnType<typeof makeApp>>)
    const response = await app.inject({ method: 'POST', url: '/api/v1/billing/checkout', payload: { priceId: 'price_basic' } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.url).toBe('https://checkout.stripe.com/session')
    expect(stripe.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      priceId: 'price_basic',
      customerEmail: 'owner@example.com',
      successUrl: expect.stringContaining('https://app.example.test/dashboard/settings/billing'),
      cancelUrl: 'https://app.example.test/dashboard/settings/billing?checkout=cancelled',
    }))
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'billing.checkout.started', actorId: 'user_1', tenantId: 'tenant_1' }) })
  })

  it('blocks members from opening checkout', async () => {
    const stripe = provider()
    const { app } = await makeApp('MEMBER', stripe)
    apps.push({ app } as Awaited<ReturnType<typeof makeApp>>)
    const response = await app.inject({ method: 'POST', url: '/api/v1/billing/checkout', payload: { priceId: 'price_basic' } })
    expect(response.statusCode).toBe(403)
    expect(stripe.createCheckout).not.toHaveBeenCalled()
  })

  it('rejects a forged webhook signature before processing the event', async () => {
    const stripe = provider({ verifyWebhook: vi.fn(() => { throw new Error('bad signature') }) })
    const { app } = await makeApp('MEMBER', stripe)
    apps.push({ app } as Awaited<ReturnType<typeof makeApp>>)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'invalid' },
      payload: '{"amount":1}',
    })
    expect(response.statusCode).toBe(400)
    expect(stripe.verifyWebhook).toHaveBeenCalledWith(Buffer.from('{"amount":1}'), 'invalid', 'whsec_test')
  })
})
