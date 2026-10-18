import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { auditLogRoutes } from '../src/modules/auditLog/auditLog.routes.js'

const logId = 'claaaaaaaaaaaaaaaaaaaaaaa'
const actorId = 'ZsXXnkTqoyuvRM1dgrgqy5TqzZ3jOfSK'
const targetId = 'clccccccccccccccccccccccc'

async function setup(options: { role?: string; logs?: any[]; total?: number } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: {
      getSession: async () => ({
        session: { activeOrganizationId: 'tenant_1' },
        user: { id: actorId, email: 'admin@example.com' },
      }),
    },
  } as unknown as Auth)

  const prisma = {
    member: {
      findUnique: vi.fn().mockResolvedValue({ role: options.role ?? 'ADMIN' }),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue(options.logs ?? []),
      count: vi.fn().mockResolvedValue(options.total ?? 0),
    },
  } as unknown as PrismaClient

  app.decorate('prisma', prisma)
  await app.register(auditLogRoutes)
  return { app, prisma }
}

describe('GET /audit-logs', () => {
  it('rejects non-admin members with 403', async () => {
    const { app } = await setup({ role: 'MEMBER' })
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(403)
  })

  it('returns paginated audit logs with actor details and applies tenantId, targetId, targetType filters', async () => {
    const mockLogs = [
      {
        id: logId,
        action: 'issue.create',
        targetType: 'Issue',
        targetId,
        metadata: null,
        createdAt: new Date('2026-10-11T12:00:00Z'),
        actor: {
          id: actorId,
          name: 'Admin User',
          email: 'admin@example.com',
        },
      },
    ]

    const { app, prisma } = await setup({ role: 'ADMIN', logs: mockLogs, total: 1 })
    const res = await app.inject({
      method: 'GET',
      url: `/?page=1&limit=10&targetType=Issue&targetId=${targetId}`,
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.items).toHaveLength(1)
    expect(json.data.items[0]).toMatchObject({
      id: logId,
      action: 'issue.create',
      targetType: 'Issue',
      targetId,
      actorName: 'Admin User',
    })
    expect(json.data.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      pages: 1,
    })

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1',
        targetType: 'Issue',
        targetId,
      },
      skip: 0,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })
  })
})
