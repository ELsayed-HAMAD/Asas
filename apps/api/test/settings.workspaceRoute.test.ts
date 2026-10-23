import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { settingsRoutes } from '../src/modules/settings/settings.routes.js'

async function setup(options: { role?: string; unauthenticated?: boolean; stripeBilling?: unknown; activeStripeSubscription?: string } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: {
      getSession: async () => {
        if (options.unauthenticated) return null
        return {
          session: { activeOrganizationId: 'tenant_1' },
          user: { id: 'user_1', email: 'owner@example.com' },
        }
      },
    },
  } as unknown as Auth)

  const tx = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    journalLine: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    journalEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ledgerAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    exchangeRate: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    invitation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    member: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1' }),
      update: vi.fn().mockResolvedValue({ id: 'tenant_1', status: 'ARCHIVED' }),
      delete: vi.fn().mockResolvedValue({ id: 'tenant_1' }),
    },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    subscription: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notificationPreference: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    quietHours: {
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    integration: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'clxxxxxxxxxxxxxxxxxxxxxxx', tenantId: 'tenant_1', description: null, status: 'CONFIGURE',
        syncPullRequests: false, syncCiCdStatus: false, credential: null,
        createdAt: new Date('2026-10-21T00:00:00.000Z'), updatedAt: new Date('2026-10-21T00:00:00.000Z'),
        ...data,
      })),
    },
  }

  const prisma = {
    member: {
      findUnique: vi.fn().mockResolvedValue(options.role ? { role: options.role } : null),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1' }),
    },
    subscription: {
      findMany: vi.fn().mockResolvedValue(options.activeStripeSubscription ? [{ stripeSubscriptionId: options.activeStripeSubscription }] : []),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
  } as unknown as PrismaClient

  app.decorate('prisma', prisma)
  app.decorate('stripeBilling', options.stripeBilling ?? null)
  app.decorate('ssePublish', vi.fn())
  await app.register(settingsRoutes)
  return { app, prisma, tx }
}

describe('DELETE /workspace', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { app } = await setup({ unauthenticated: true })
    const res = await app.inject({ method: 'DELETE', url: '/workspace' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects MEMBER role with 403', async () => {
    const { app } = await setup({ role: 'MEMBER' })
    const res = await app.inject({ method: 'DELETE', url: '/workspace' })
    expect(res.statusCode).toBe(403)
  })

  it('rejects ADMIN role with 403 (OWNER required)', async () => {
    const { app } = await setup({ role: 'ADMIN' })
    const res = await app.inject({ method: 'DELETE', url: '/workspace' })
    expect(res.statusCode).toBe(403)
  })

  it('allows OWNER to delete workspace successfully', async () => {
    const { app, tx } = await setup({ role: 'OWNER' })
    const res = await app.inject({ method: 'DELETE', url: '/workspace' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: { success: true } })
    expect(tx.tenant.delete).toHaveBeenCalledWith({ where: { id: 'tenant_1' } })
  })

  it('retains workspace data when Stripe cannot confirm cancellation', async () => {
    const cancelSubscription = vi.fn().mockRejectedValue(new Error('Stripe unavailable'))
    const { app, tx } = await setup({
      role: 'OWNER',
      activeStripeSubscription: 'sub_live',
      stripeBilling: { cancelSubscription },
    })
    const res = await app.inject({ method: 'DELETE', url: '/workspace' })
    expect(res.statusCode, res.body).toBe(502)
    expect(cancelSubscription).toHaveBeenCalledWith('sub_live')
    expect(tx.tenant.update).not.toHaveBeenCalled()
    expect(tx.tenant.delete).not.toHaveBeenCalled()
    await app.close()
  })
})

describe('settings reliability', () => {
  it('blocks MEMBER writes to notification preferences and integrations before mutation', async () => {
    const { app, prisma } = await setup({ role: 'MEMBER' })
    const notifications = await app.inject({
      method: 'PATCH',
      url: '/notifications',
      payload: { modules: { finance: { 'invoice.created': { inApp: false } } } },
    })
    const integration = await app.inject({ method: 'POST', url: '/integrations', payload: { name: 'Operations webhook' } })
    expect(notifications.statusCode).toBe(403)
    expect(integration.statusCode).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    await app.close()
  })

  it('commits notification preferences and their audit record in the same transaction', async () => {
    const { app, prisma, tx } = await setup({ role: 'ADMIN' })
    const response = await app.inject({
      method: 'PATCH',
      url: '/notifications',
      payload: { modules: { finance: { 'invoice.created': { inApp: false } } } },
    })
    expect(response.statusCode, response.body).toBe(200)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_module_eventType: { tenantId: 'tenant_1', module: 'finance', eventType: 'invoice.created' } },
    }))
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant_1', actorId: 'user_1', action: 'settings.notifications.update' }),
    }))
    await app.close()
  })

  it('rejects backup schedule operations instead of returning fabricated success', async () => {
    const { app } = await setup({ role: 'ADMIN' })
    const get = await app.inject({ method: 'GET', url: '/backups' })
    const create = await app.inject({ method: 'POST', url: '/backups', payload: { name: 'Daily', schedule: '0 0 * * *' } })
    expect(get.statusCode).toBe(409)
    expect(create.statusCode).toBe(409)
    expect(get.json().error.message).toContain('Automated backups are not configured')
    await app.close()
  })

  it('commits integration configuration and its audit record in one transaction', async () => {
    const { app, prisma, tx } = await setup({ role: 'ADMIN' })
    const response = await app.inject({ method: 'POST', url: '/integrations', payload: { name: 'Operations webhook' } })
    expect(response.statusCode, response.body).toBe(201)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.integration.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'tenant_1', name: 'Operations webhook' }) })
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant_1', actorId: 'user_1', action: 'settings.integration.create', targetId: 'clxxxxxxxxxxxxxxxxxxxxxxx' }),
    }))
    await app.close()
  })
})

