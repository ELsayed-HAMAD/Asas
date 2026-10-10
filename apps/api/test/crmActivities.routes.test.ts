import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { crmRoutes } from '../src/modules/crm/crm.routes.js'

const dealId = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const activityId = 'clyyyyyyyyyyyyyyyyyyyyyyy'
const stamp = new Date('2026-10-07T12:00:00Z')

async function setup(options: { role?: string; foreignDeal?: boolean; failAudit?: boolean } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) } } as unknown as Auth)
  let state = { activities: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[] }
  const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    const staged = { activities: [...state.activities], audits: [...state.audits] }
    const tx = {
      deal: { findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        expect(where).toEqual({ id: dealId, tenantId: 'tenant_1' })
        return options.foreignDeal ? null : { id: dealId }
      }) },
      user: { findUnique: vi.fn().mockResolvedValue({ name: 'Ada Lovelace' }) },
      dealActivity: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const activity = { id: activityId, ...data, createdAt: stamp }
          staged.activities.push(activity)
          return activity
        }),
      },
      auditLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failAudit) throw new Error('Audit unavailable')
        staged.audits.push(data)
      }) },
    }
    const result = await work(tx)
    state = staged
    return result
  })
  const prisma = {
    member: { findUnique: async () => ({ role: options.role ?? 'ADMIN' }) },
    $transaction: transaction,
    deal: { findFirst: vi.fn().mockResolvedValue({ id: dealId }) },
    dealActivity: {
      findMany: vi.fn().mockResolvedValue([{ id: activityId, dealId, type: 'CALL', title: 'Follow-up', body: null, actorId: 'admin_1', actorName: 'Ada Lovelace', createdAt: stamp }]),
      count: vi.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaClient
  const publish = vi.fn(() => { expect(state.audits).toHaveLength(1) })
  app.decorate('prisma', prisma)
  app.decorate('ssePublish', publish)
  await app.register(crmRoutes)
  return { app, prisma, transaction, publish, state: () => state }
}

afterEach(() => vi.useRealTimers())

describe('CRM deal activities', () => {
  it('lists only the authenticated tenant and paginates the activity history', async () => {
    const f = await setup({ role: 'MEMBER' })
    try {
      const response = await f.app.inject({ method: 'GET', url: `/deals/${dealId}/activities?page=2&limit=10` })
      expect(response.statusCode, response.body).toBe(200)
      expect(f.prisma.deal.findFirst).toHaveBeenCalledWith({ where: { id: dealId, tenantId: 'tenant_1' }, select: { id: true } })
      expect(f.prisma.dealActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1', dealId }, skip: 10, take: 10 }))
      expect(response.json().data.items[0]).toMatchObject({ type: 'CALL', actorName: 'Ada Lovelace' })
    } finally { await f.app.close() }
  })

  it('commits actor-attributed activity and its audit before publishing CRM invalidation', async () => {
    const f = await setup()
    try {
      const response = await f.app.inject({ method: 'POST', url: `/deals/${dealId}/activities`, payload: { type: 'EMAIL', title: 'Sent proposal', body: 'Followed up with the customer.' } })
      expect(response.statusCode, response.body).toBe(201)
      expect(f.state().activities[0]).toMatchObject({ tenantId: 'tenant_1', dealId, type: 'EMAIL', actorId: 'admin_1', actorName: 'Ada Lovelace' })
      expect(f.state().audits[0]).toMatchObject({ tenantId: 'tenant_1', actorId: 'admin_1', action: 'crm.deal.activity.create', targetType: 'DealActivity', targetId: activityId })
      expect(f.publish).toHaveBeenCalledTimes(1)
    } finally { await f.app.close() }
  })

  it('does not commit or publish if actor audit fails', async () => {
    const f = await setup({ failAudit: true })
    try {
      const response = await f.app.inject({ method: 'POST', url: `/deals/${dealId}/activities`, payload: { type: 'CALL', title: 'Discovery call' } })
      expect(response.statusCode).toBe(500)
      expect(f.state().activities).toHaveLength(0)
      expect(f.publish).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })

  it('rejects foreign deals and blocks member writes before opening a transaction', async () => {
    const foreign = await setup({ foreignDeal: true })
    try {
      const response = await foreign.app.inject({ method: 'POST', url: `/deals/${dealId}/activities`, payload: { type: 'CALL', title: 'Call' } })
      expect(response.statusCode).toBe(404)
      expect(foreign.state().activities).toHaveLength(0)
      expect(foreign.publish).not.toHaveBeenCalled()
    } finally { await foreign.app.close() }

    const member = await setup({ role: 'MEMBER' })
    try {
      const response = await member.app.inject({ method: 'POST', url: `/deals/${dealId}/activities`, payload: { type: 'CALL', title: 'Call' } })
      expect(response.statusCode).toBe(403)
      expect(member.transaction).not.toHaveBeenCalled()
    } finally { await member.app.close() }
  })
})
