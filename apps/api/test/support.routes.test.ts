import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { supportRoutes } from '../src/modules/support/support.routes.js'

const { mockMailer } = vi.hoisted(() => ({
  mockMailer: {
    send: vi.fn().mockResolvedValue({ id: 'mail_1', sentAt: new Date() }),
  },
}))
vi.mock('../src/services/mailer.js', () => ({
  mailer: mockMailer,
}))

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
          user: { id: 'user_1', email: 'user@example.com' },
        }
      },
    },
  } as unknown as Auth)

  const prisma = {
    member: {
      findUnique: vi.fn().mockResolvedValue(options.role ? { role: options.role } : null),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'tenant_1',
        name: 'Acme Corp',
        supportEmail: 'help@acme.com',
      }),
    },
    supportTicket: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'cjy1234567890123456789012',
          tenantId: 'tenant_1',
          subject: 'Cannot export ledger',
          channel: 'dashboard',
          status: 'OPEN',
          createdAt: new Date('2026-10-10T12:00:00Z'),
          resolvedAt: null,
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'cjy1234567890123456789012',
        tenantId: 'tenant_1',
        subject: 'Cannot export ledger',
        channel: 'dashboard',
        status: 'OPEN',
        createdAt: new Date('2026-10-10T12:00:00Z'),
        resolvedAt: null,
      }),
      create: vi.fn().mockResolvedValue({
        id: 'cjy9876543210987654321098',
        tenantId: 'tenant_1',
        subject: 'Bug in expenses report',
        channel: 'dashboard',
        status: 'OPEN',
        createdAt: new Date('2026-10-11T12:00:00Z'),
        resolvedAt: null,
      }),
      update: vi.fn().mockResolvedValue({
        id: 'cjy1234567890123456789012',
        tenantId: 'tenant_1',
        subject: 'Cannot export ledger',
        channel: 'dashboard',
        status: 'RESOLVED',
        createdAt: new Date('2026-10-10T12:00:00Z'),
        resolvedAt: new Date('2026-10-11T12:30:00Z'),
      }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'log_1' }),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => callback(prisma)),
  } as unknown as PrismaClient

  app.decorate('prisma', prisma)
  app.decorate('ssePublish', vi.fn())
  await app.register(supportRoutes, { prefix: '/support' })
  return { app, prisma }
}

describe('Support Routes', () => {
  it('GET /support/tickets lists all tenant support tickets for MEMBER', async () => {
    const { app } = await setup({ role: 'MEMBER' })
    const res = await app.inject({
      method: 'GET',
      url: '/support/tickets',
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.items).toHaveLength(1)
    expect(json.data.items[0].subject).toBe('Cannot export ledger')
    expect(json.data.items[0].status).toBe('OPEN')
  })

  it('POST /support/tickets creates a ticket with audit logging and mail notification', async () => {
    const { app, prisma } = await setup({ role: 'MEMBER' })
    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      payload: {
        subject: 'Bug in expenses report',
        channel: 'dashboard',
      },
    })

    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.data.id).toBe('cjy9876543210987654321098')
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant_1',
        subject: 'Bug in expenses report',
        channel: 'dashboard',
      },
    })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'support.ticket.create',
          targetId: 'cjy9876543210987654321098',
        }),
      }),
    )
    expect(mockMailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'help@acme.com',
        subject: expect.stringContaining('Bug in expenses report'),
      }),
    )
  })

  it('PATCH /support/tickets/:id rejects MEMBER role with 403', async () => {
    const { app } = await setup({ role: 'MEMBER' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/support/tickets/cjy1234567890123456789012',
      payload: {
        status: 'RESOLVED',
      },
    })

    expect(res.statusCode).toBe(403)
  })

  it('PATCH /support/tickets/:id allows ADMIN to resolve ticket and writes audit log', async () => {
    const { app, prisma } = await setup({ role: 'ADMIN' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/support/tickets/cjy1234567890123456789012',
      payload: {
        status: 'RESOLVED',
      },
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.status).toBe('RESOLVED')
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.supportTicket.update).toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'support.ticket.update',
          targetId: 'cjy1234567890123456789012',
        }),
      }),
    )
  })
})
