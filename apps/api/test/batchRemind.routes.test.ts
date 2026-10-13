import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { financeRoutes } from '../src/modules/finance/finance.routes.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { mailer } from '../src/services/mailer.js'

vi.mock('../src/services/mailer.js', () => ({
  mailer: { enqueue: vi.fn().mockResolvedValue(undefined) },
}))

const customerId1 = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const customerId2 = 'clyyyyyyyyyyyyyyyyyyyyyyy'

async function setup(role: 'ADMIN' | 'MEMBER' = 'ADMIN', includeEmail = false) {
  const events: string[] = []
  const tx = {
    customer: {
      findMany: vi.fn().mockResolvedValue([
        { id: customerId1, tenantId: 'tenant_1', name: 'Acme Corp', email: includeEmail ? 'ar@acme.test' : null, invoices: [{ id: 'inv1' }] },
        { id: customerId2, tenantId: 'tenant_1', name: 'Globex Inc', email: null, invoices: [{ id: 'inv2' }, { id: 'inv3' }] },
      ]),
    },
    collectionActivity: {
      create: vi.fn().mockImplementation(async () => {
        events.push('activity')
        return { id: 'act_1' }
      }),
    },
    receivableInvoice: {
      findMany: vi.fn().mockResolvedValue([
        { customerId: customerId1, number: 'AR-1', amount: { toString: () => '125.00' }, currency: 'USD', dueDate: new Date('2026-09-01T00:00:00.000Z') },
        { customerId: customerId2, number: 'AR-2', amount: { toString: () => '50.00' }, currency: 'USD', dueDate: null },
        { customerId: customerId2, number: 'AR-3', amount: { toString: () => '75.00' }, currency: 'USD', dueDate: null },
      ]),
    },
    auditLog: {
      create: vi.fn().mockImplementation(async () => {
        events.push('audit')
        return { id: 'audit_1' }
      }),
    },
  }

  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'user_1', name: 'Admin User' }) },
    member: { findUnique: vi.fn().mockResolvedValue({ role, employeeId: null }) },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => {
      const result = await callback(tx)
      events.push('commit')
      return result
    }),
  }

  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: {
      getSession: async () => ({
        session: { activeOrganizationId: 'tenant_1' },
        user: { id: 'user_1', name: 'Admin User' },
      }),
    },
  } as unknown as Auth)
  app.decorate('authSecret', 'test-secret')
  app.decorate('prisma', prisma as unknown as PrismaClient)
  app.decorate('ssePublish', vi.fn(() => { events.push('sse') }))

  await app.register(financeRoutes)
  return { app, prisma, tx, events }
}

describe('receivables batch remind route', () => {
  it('creates collection activities, records audit log, and publishes SSE on commit', async () => {
    const { app, tx, events } = await setup('ADMIN')
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/receivables/batch-remind',
        payload: { customerIds: [customerId1, customerId2] },
      })

      expect(response.statusCode).toBe(200)
      const data = response.json().data
      expect(data).toEqual({
        remindedCount: 2,
        customerIds: [customerId1, customerId2],
      })

      expect(tx.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: [customerId1, customerId2] }, tenantId: 'tenant_1' },
      }))
      expect(tx.collectionActivity.create).toHaveBeenCalledTimes(2)
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant_1',
          actorId: 'user_1',
          action: 'finance.receivable.batch_remind',
          targetType: 'Customer',
        }),
      }))
      expect(events).toEqual(['activity', 'activity', 'audit', 'commit', 'sse'])
    } finally {
      await app.close()
    }
  })

  it('rejects batch reminder from MEMBER without receivable.write permission', async () => {
    const { app, tx } = await setup('MEMBER')
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/receivables/batch-remind',
        payload: { customerIds: [customerId1] },
      })

      expect(response.statusCode).toBe(403)
      expect(tx.collectionActivity.create).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('queues invoice details to customers with email after the transaction commits', async () => {
    vi.mocked(mailer.enqueue).mockClear()
    const { app, events } = await setup('ADMIN', true)
    try {
      const response = await app.inject({ method: 'POST', url: '/receivables/batch-remind', payload: { customerIds: [customerId1] } })
      expect(response.statusCode).toBe(200)
      expect(mailer.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        to: 'ar@acme.test',
        subject: 'Payment reminder',
        text: expect.stringContaining('AR-1: 125.00 USD'),
      }))
      expect(events.indexOf('commit')).toBeLessThan(events.indexOf('sse'))
    } finally {
      await app.close()
    }
  })

  it('rejects empty customerIds array with 400', async () => {
    const { app } = await setup('ADMIN')
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/receivables/batch-remind',
        payload: { customerIds: [] },
      })

      expect(response.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})
