import Fastify from 'fastify'
import { Prisma, type PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { crmRoutes } from '../src/modules/crm/crm.routes.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'

const id = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const stamp = new Date('2026-10-07T12:00:00Z')
const base = {
  id, tenantId: 'tenant_1', name: 'Deal', stage: 'NEGOTIATION', value: new Prisma.Decimal('100'),
  companyId: null, company: null, ownerEmployeeId: null, owner: null, winProbability: 1,
  closeDate: new Date('2026-12-01T00:00:00Z'), closedAt: null as Date | null,
  productLine: null, forecastBucket: null, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: stamp,
}

/** Staged rollback/composition test, not a simulation of PostgreSQL concurrency. */
async function setup(options: { failHistory?: boolean; failAudit?: boolean; role?: string; foreignDeal?: boolean; foreignOwner?: boolean; stage?: string } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) } } as unknown as Auth)
  let state = { deal: { ...base, stage: options.stage ?? base.stage }, history: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], writes: 0 }
  let attempts = 0
  const events: string[] = []
  const publish = vi.fn(() => { expect(state.audits.length).toBeGreaterThan(0) })
  const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    const staged = { deal: { ...state.deal }, history: [...state.history], audits: [...state.audits], writes: state.writes }
    const write = () => { attempts++; staged.writes++ }
    const tx = {
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      company: { findFirst: async () => null },
      employee: { findFirst: async () => options.foreignOwner ? null : ({ id }) },
      $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
        events.push('lock')
        expect(sql.join('?')).toContain('FOR UPDATE')
        expect(values).toEqual([id, 'tenant_1'])
        return options.foreignDeal ? [] : [{ id }]
      },
      deal: {
        findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
          events.push('read')
          expect(where).toEqual({ id, tenantId: 'tenant_1' })
          return staged.deal
        },
        create: async ({ data }: { data: Record<string, unknown> }) => { write(); staged.deal = { ...staged.deal, ...data } as typeof base; return staged.deal },
        update: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
          expect(where).toEqual({ id_tenantId: { id, tenantId: 'tenant_1' } })
          write(); staged.deal = { ...staged.deal, ...data } as typeof base; return staged.deal
        },
      },
      dealStageHistory: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failHistory) throw new Error('History unavailable')
        staged.history.push(data)
      } },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failAudit) throw new Error('Audit unavailable')
        staged.audits.push(data)
      } },
    }
    const result = await work(tx)
    state = staged
    return result
  })
  app.decorate('prisma', { member: { findUnique: async () => ({ role: options.role ?? 'ADMIN' }) }, $transaction: transaction } as unknown as PrismaClient)
  app.decorate('ssePublish', publish)
  await app.register(crmRoutes)
  const patch = (payload: object) => app.inject({ method: 'PATCH', url: `/deals/${id}`, payload })
  return { app, patch, transaction, publish, events, state: () => state, attempts: () => attempts }
}

afterEach(() => { vi.useRealTimers() })

describe('CRM outcome integrity', () => {
  it.each(['LEADS', 'CLOSED_WON', 'CLOSED_LOST'])('records creation in %s with an explicit initial history event', async stage => {
    const f = await setup()
    vi.setSystemTime(stamp)
    try {
      const response = await f.app.inject({ method: 'POST', url: '/deals', payload: { name: 'Deal', stage, value: '100', winProbability: 1, closeDate: '2026-12-01' } })
      expect(response.statusCode, response.body).toBe(201)
      expect(response.json().data.winProbability).toBe(1)
      expect(response.json().data.closedAt).toBe(stage === 'LEADS' ? null : stamp.toISOString())
      expect(f.state().history[0]).toMatchObject({ tenantId: 'tenant_1', dealId: id, actorId: 'admin_1', fromStage: null, toStage: stage, occurredAt: stamp })
      expect(f.state().audits).toHaveLength(1)
      expect(f.publish).toHaveBeenCalledTimes(1)
    } finally { await f.app.close() }
  }, 15000)
  it('records actual closure separately from the expected date and preserves it through later edits', async () => {
    const f = await setup()
    vi.setSystemTime(stamp)
    try {
      const closed = await f.patch({ stage: 'CLOSED_WON' })
      expect(closed.statusCode, closed.body).toBe(200)
      expect(closed.json().data).toMatchObject({ closedAt: stamp.toISOString(), closeDate: base.closeDate.toISOString() })
      expect(f.events.slice(0, 2)).toEqual(['lock', 'read'])
      expect(f.state().history[0]).toMatchObject({ fromStage: 'NEGOTIATION', toStage: 'CLOSED_WON', actorId: 'admin_1' })
      vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
      const edited = await f.patch({ name: 'Edited', stage: 'CLOSED_WON', closeDate: null })
      expect(edited.statusCode, edited.body).toBe(200)
      expect(edited.json().data.closedAt).toBe(stamp.toISOString())
      expect(f.state().history).toHaveLength(1)
      expect(f.state().audits).toHaveLength(2)
    } finally { await f.app.close() }
  })
  it('preserves the transition chain when reopening and reclosing', async () => {
    const f = await setup()
    vi.setSystemTime(stamp)
    try {
      await f.patch({ stage: 'CLOSED_LOST' })
      const reopened = await f.patch({ stage: 'PROPOSAL' })
      expect(reopened.json().data.closedAt).toBeNull()
      vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
      const won = await f.patch({ stage: 'CLOSED_WON' })
      expect(won.json().data.closedAt).toBe('2026-10-21T12:00:00.000Z')
      expect(f.state().history.map(row => [row.fromStage, row.toStage])).toEqual([
        ['NEGOTIATION', 'CLOSED_LOST'], ['CLOSED_LOST', 'PROPOSAL'], ['PROPOSAL', 'CLOSED_WON'],
      ])
    } finally { await f.app.close() }
  })
  it('keeps a legacy closed deal undated instead of fabricating history on an edit', async () => {
    const f = await setup({ stage: 'CLOSED_WON' })
    try {
      const response = await f.patch({ name: 'Legacy edited', stage: 'CLOSED_WON' })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data.closedAt).toBeNull()
      expect(f.state().history).toEqual([])
    } finally { await f.app.close() }
  })
  it('snapshots the resulting owner and value for a stage event', async () => {
    const f = await setup()
    try {
      const response = await f.patch({ stage: 'CLOSED_WON', ownerEmployeeId: id, value: '200' })
      expect(response.statusCode, response.body).toBe(200)
      expect(f.state().history[0]).toMatchObject({ ownerEmployeeId: id, value: new Prisma.Decimal('200') })
      await f.patch({ value: '300', ownerEmployeeId: null })
      expect(f.state().history).toHaveLength(2)
      expect(f.state().history[0]).toMatchObject({ ownerEmployeeId: id, value: new Prisma.Decimal('200') })
      expect(f.state().history[1]).toMatchObject({ fromStage: 'CLOSED_WON', toStage: 'CLOSED_WON', ownerEmployeeId: null, value: new Prisma.Decimal('300') })
    } finally { await f.app.close() }
  })
  it('does not invent a closure for an ordinary edit', async () => {
    const f = await setup()
    try {
      const response = await f.patch({ name: 'Edited', winProbability: 0.5 })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data).toMatchObject({ closedAt: null, winProbability: 0.5 })
      expect(f.state().history).toEqual([])
    } finally { await f.app.close() }
  })
  it.each(['create', 'update'])('rolls back %s if its history or actor audit cannot be saved', async operation => {
    for (const failure of ['history', 'audit']) {
      const f = await setup({ failHistory: failure === 'history', failAudit: failure === 'audit' })
      try {
        const response = operation === 'create'
          ? await f.app.inject({ method: 'POST', url: '/deals', payload: { name: 'Deal', stage: 'CLOSED_WON' } })
          : await f.patch({ stage: 'CLOSED_WON' })
        expect(response.statusCode).toBe(500)
        expect(f.attempts()).toBeGreaterThan(0)
        expect(f.state()).toMatchObject({ writes: 0, history: [], audits: [], deal: { stage: 'NEGOTIATION', closedAt: null } })
        expect(f.publish).not.toHaveBeenCalled()
      } finally { await f.app.close() }
    }
  })
  it('rejects cross-tenant deal IDs before reading or writing', async () => {
    const f = await setup({ foreignDeal: true })
    try {
      expect((await f.patch({ stage: 'CLOSED_WON' })).statusCode).toBe(404)
      expect(f.events).toEqual(['lock'])
      expect(f.attempts()).toBe(0)
    } finally { await f.app.close() }
  })
  it('rejects cross-tenant owner assignment without changes', async () => {
    const f = await setup({ foreignOwner: true })
    try {
      expect((await f.patch({ stage: 'CLOSED_WON', ownerEmployeeId: id })).statusCode).toBe(400)
      expect(f.attempts()).toBe(0)
    } finally { await f.app.close() }
  })
  it('blocks member mutations before opening a transaction', async () => {
    const f = await setup({ role: 'MEMBER' })
    try {
      expect((await f.patch({ stage: 'CLOSED_WON' })).statusCode).toBe(403)
      expect(f.transaction).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
})
