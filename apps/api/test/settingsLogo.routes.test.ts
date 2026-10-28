import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { settingsRoutes } from '../src/modules/settings/settings.routes.js'
import { tenantLogoKey, type ObjectStorage } from '../src/services/objectStorage.js'

const fixtures: Array<Awaited<ReturnType<typeof setup>>> = []
const now = new Date('2026-10-23T00:00:00.000Z')

async function setup() {
  const app = Fastify({ logger: false })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.addContentTypeParser(/^image\/(?:png|jpeg|webp|svg\+xml)$/, { parseAs: 'buffer', bodyLimit: 2 * 1024 * 1024 }, (_request, body, done) => done(null, body))

  let tenant = {
    id: 'tenant_1', name: 'Workspace', slug: 'workspace', supportEmail: null, logoUrl: null,
    timezone: 'UTC', currency: 'USD', currencyLockedAt: null, dateFormat: 'yyyy-MM-dd',
    overtimeThresholdHours: 8, createdAt: now, updatedAt: now,
  }
  const objects = new Map<string, Buffer>()
  const audits: Record<string, unknown>[] = []
  const put = vi.fn(async (key: string, bytes: Buffer) => { objects.set(key, Buffer.from(bytes)) })
  const storage = {
    mode: 'local' as const,
    put,
    get: vi.fn(async (key: string) => objects.get(key) ?? null),
    head: vi.fn(async (key: string) => objects.has(key) ? { size: objects.get(key)!.length } : null),
    delete: vi.fn(async (key: string) => { objects.delete(key) }),
    sumPrefixSizes: vi.fn(async (prefix: string) => [...objects.entries()].filter(([key]) => key.startsWith(prefix)).reduce((sum, [, bytes]) => sum + bytes.length, 0)),
  } as unknown as ObjectStorage

  const prisma = {
    member: { findUnique: vi.fn(async () => ({ role: 'ADMIN' })) },
    tenant: { findUnique: vi.fn(async () => tenant) },
    subscription: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      const stagedTenant = { ...tenant }
      const stagedAudits = [...audits]
      const tx = {
        $executeRaw: vi.fn(async () => 1),
        $executeRawUnsafe: vi.fn(async () => undefined),
        $queryRaw: vi.fn(async () => [{ id: 'tenant_1' }]),
        subscription: { findMany: vi.fn(async () => []) },
        tenant: {
          findUnique: vi.fn(async () => stagedTenant),
          update: vi.fn(async ({ data }: { data: Partial<typeof tenant> }) => {
            Object.assign(stagedTenant, data)
            return stagedTenant
          }),
        },
        auditLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { stagedAudits.push(data) }) },
      }
      const result = await work(tx)
      tenant = stagedTenant
      audits.splice(0, audits.length, ...stagedAudits)
      return result
    }),
  }

  app.decorate('prisma', prisma as unknown as PrismaClient)
  app.decorate('objectStorage', storage)
  app.decorate('auth', { api: { getSession: vi.fn(async () => ({
    session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' },
  })) } } as unknown as Auth)
  app.decorate('ssePublish', vi.fn())
  await app.register(settingsRoutes)
  await app.ready()
  const fixture = { app, objects, audits, put, tenant: () => tenant }
  fixtures.push(fixture)
  return fixture
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(({ app }) => app.close()))
})

describe('workspace logo upload and delivery', () => {
  it('stores an image larger than the JSON body limit and audits the committed logo URL', async () => {
    const fixture = await setup()
    const image = Buffer.alloc(1_100_000)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(image)

    const response = await fixture.app.inject({ method: 'PUT', url: '/general/logo', headers: { 'content-type': 'image/png' }, payload: image })
    expect(response.statusCode, response.body).toBe(200)
    const logoUrl = response.json().data.logoUrl as string
    expect(logoUrl).toMatch(/^http:\/\/127\.0\.0\.1:4000\/api\/v1\/settings\/general\/logo\/[0-9a-f-]{36}\.png$/)
    expect(fixture.put).toHaveBeenCalledTimes(1)
    expect([...fixture.objects.values()][0]).toHaveLength(image.length)
    expect(fixture.audits[0]).toMatchObject({ tenantId: 'tenant_1', actorId: 'admin_1', action: 'settings.general.logo.upload' })
  })

  it('rejects a file whose bytes do not match its declared type before storage or database writes', async () => {
    const fixture = await setup()
    const response = await fixture.app.inject({ method: 'PUT', url: '/general/logo', headers: { 'content-type': 'image/png' }, payload: Buffer.from('not a png') })
    expect(response.statusCode, response.body).toBe(400)
    expect(fixture.put).not.toHaveBeenCalled()
    expect(fixture.audits).toHaveLength(0)
    expect(fixture.tenant().logoUrl).toBeNull()
  })

  it('accepts a normal SVG document while rejecting active or externally referenced SVG content', async () => {
    const fixture = await setup()
    const safe = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="#123456"/></svg>')
    const accepted = await fixture.app.inject({ method: 'PUT', url: '/general/logo', headers: { 'content-type': 'image/svg+xml' }, payload: safe })
    expect(accepted.statusCode, accepted.body).toBe(200)

    const unsafe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/track"/></svg>')
    const rejected = await fixture.app.inject({ method: 'PUT', url: '/general/logo', headers: { 'content-type': 'image/svg+xml' }, payload: unsafe })
    expect(rejected.statusCode, rejected.body).toBe(400)
    expect(fixture.put).toHaveBeenCalledTimes(1)
  })

  it('serves only the active tenant’s logo from its scoped object key', async () => {
    const fixture = await setup()
    const id = '550e8400-e29b-41d4-a716-446655440000'
    const key = tenantLogoKey('tenant_1', id, 'png')
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    fixture.objects.set(key, image)

    const response = await fixture.app.inject({ method: 'GET', url: `/general/logo/${id}.png` })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.rawPayload).toEqual(image)

    const missing = await fixture.app.inject({ method: 'GET', url: '/general/logo/550e8400-e29b-41d4-a716-446655440001.png' })
    expect(missing.statusCode).toBe(404)
  })
})
