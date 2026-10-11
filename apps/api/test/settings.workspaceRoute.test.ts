import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { settingsRoutes } from '../src/modules/settings/settings.routes.js'

async function setup(options: { role?: string; unauthenticated?: boolean } = {}) {
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
    journalLine: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    journalEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ledgerAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    exchangeRate: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    invitation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    member: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tenant: { delete: vi.fn().mockResolvedValue({ id: 'tenant_1' }) },
  }

  const prisma = {
    member: {
      findUnique: vi.fn().mockResolvedValue(options.role ? { role: options.role } : null),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1' }),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
  } as unknown as PrismaClient

  app.decorate('prisma', prisma)
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
})
