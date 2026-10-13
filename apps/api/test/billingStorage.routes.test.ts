import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import type { Auth } from '../src/auth.js'
import { settingsRoutes } from '../src/modules/settings/settings.routes.js'
import type { ObjectStorage } from '../src/services/objectStorage.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

const apps: Array<Awaited<ReturnType<typeof makeApp>>> = []

async function makeApp(options: { storageFailure?: boolean } = {}) {
  const app = Fastify({ logger: false }).withTypeProvider()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const prefixes: string[] = []
  const objectStorage = {
    mode: 's3' as const,
    sumPrefixSizes: vi.fn(async (prefix: string) => {
      prefixes.push(prefix)
      if (options.storageFailure) throw new Error('Bucket listing denied')
      if (prefix.startsWith('resumes/')) return 1024
      if (prefix.startsWith('exports/')) return 2048
      return 512
    }),
  } as unknown as ObjectStorage
  const prisma = {
    member: {
      findUnique: vi.fn(async () => ({ role: 'MEMBER', employeeId: null })),
      count: vi.fn(async () => 5),
    },
    subscription: {
      findMany: vi.fn(async () => [{
        id: 'csub12345678', planName: 'Pro', priceMonthly: '20.00', status: 'ACTIVE', renewsOn: null,
        seatsUsed: 1, seatLimit: 50, storageUsedGb: 0, storageLimitGb: 250,
        stripeCurrency: 'USD', stripePriceId: 'price_pro',
      }]),
    },
    paymentMethod: { findMany: vi.fn(async () => []) },
    billingInvoice: { findMany: vi.fn(async () => []) },
    tenant: { findUnique: vi.fn(async () => ({ stripeCustomerId: 'cus_1' })) },
  }
  const auth = { api: { getSession: vi.fn(async () => ({
    session: { activeOrganizationId: 'tenant_1' },
    user: { id: 'member_1' },
  })) } }
  app.decorate('prisma', prisma as unknown as PrismaClient)
  app.decorate('auth', auth as unknown as Auth)
  app.decorate('objectStorage', objectStorage)
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' })
  await app.ready()
  return { app, objectStorage, prefixes }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(({ app }) => app.close()))
})

describe('billing storage usage', () => {
  it('measures tenant resume, export and staging objects and returns the live seat count', async () => {
    const fixture = await makeApp()
    apps.push(fixture)
    const response = await fixture.app.inject({ method: 'GET', url: '/api/v1/settings/billing' })
    expect(response.statusCode, response.body).toBe(200)
    expect(fixture.prefixes.sort()).toEqual([
      'exports/tenant_1/',
      'resumes/tenant_1/',
      'staging/resumes/tenant_1/',
    ])
    expect(response.json().data.subscriptions[0]).toMatchObject({ seatsUsed: 5, storageUsedGb: 3584 / 1_000_000_000 })
  })

  it('reports unknown usage instead of substituting a default when bucket listing fails', async () => {
    const fixture = await makeApp({ storageFailure: true })
    apps.push(fixture)
    const response = await fixture.app.inject({ method: 'GET', url: '/api/v1/settings/billing' })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().data.subscriptions[0].storageUsedGb).toBeNull()
  })
})
