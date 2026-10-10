import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { settingsRoutes } from '../src/modules/settings/settings.routes.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'

const now = new Date('2026-10-07T00:00:00Z')
async function setup(options: { locked?: boolean; failAudit?: boolean; missing?: boolean; role?: string } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) } } as unknown as Auth)
  let state = {
    tenant: { id: 'tenant_1', name: 'Workspace', slug: 'workspace', supportEmail: null, logoUrl: null, timezone: 'UTC', currency: 'USD', currencyLockedAt: options.locked ? now : null, dateFormat: 'yyyy-MM-dd', overtimeThresholdHours: 8, createdAt: now, updatedAt: now },
    audits: [] as Record<string, unknown>[], writes: 0, rates: [] as Record<string, unknown>[],
  }
  const events: string[] = []
  let attempts = 0
  const publish = vi.fn(() => expect(state.audits).toHaveLength(1))
  const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    const staged = { tenant: { ...state.tenant }, audits: [...state.audits], writes: state.writes, rates: [...state.rates] }
    const tx = {
      $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
        events.push('lock')
        expect(sql.join('?')).toContain('FOR UPDATE')
        expect(values).toEqual(['tenant_1'])
        return options.missing ? [] : [{ id: 'tenant_1' }]
      },
      tenant: {
        findUnique: async () => { events.push('read'); return staged.tenant },
        update: async ({ where, data }: { where: object; data: Record<string, unknown> }) => {
          expect(where).toEqual({ id: 'tenant_1' })
          attempts++; staged.writes++; staged.tenant = { ...staged.tenant, ...data }
          return staged.tenant
        },
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failAudit) throw new Error('Audit unavailable')
        staged.audits.push(data)
      } },
      exchangeRate: { create: async ({ data }: { data: Record<string, unknown> }) => {
        attempts++; staged.writes++
        const row = { id: 'clxxxxxxxxxxxxxxxxxxxxxxx', ...data, createdAt: now }
        staged.rates.push(row)
        return row
      } },
    }
    const result = await work(tx)
    state = staged
    return result
  })
  app.decorate('prisma', {
    member: { findUnique: async () => ({ role: options.role ?? 'ADMIN' }) },
    tenant: { findUnique: async () => options.missing ? null : state.tenant },
    exchangeRate: {
      findMany: async () => state.rates,
      count: async () => state.rates.length,
    },
    $transaction: transaction,
  } as unknown as PrismaClient)
  app.decorate('ssePublish', publish)
  await app.register(settingsRoutes)
  const patch = (payload: object) => app.inject({ method: 'PATCH', url: '/general', payload })
  return { app, patch, publish, transaction, events, state: () => state, attempts: () => attempts }
}

describe('base currency settings guards', () => {
  it('allows empty-workspace currency changes with an atomic actor audit', async () => {
    const f = await setup()
    try {
      const response = await f.patch({ currency: 'EUR' })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data).toMatchObject({ currency: 'EUR', currencyLockedAt: null })
      expect(f.events).toEqual(['lock', 'read'])
      expect(f.state().audits[0]).toMatchObject({ tenantId: 'tenant_1', actorId: 'admin_1', action: 'settings.general.update' })
      expect(f.publish).toHaveBeenCalledTimes(1)
    } finally { await f.app.close() }
  })
  it('rejects changing a locked currency before any write', async () => {
    const f = await setup({ locked: true })
    try {
      const response = await f.patch({ currency: 'JPY', name: 'Should not change' })
      expect(response.statusCode, response.body).toBe(409)
      expect(f.attempts()).toBe(0)
      expect(f.state().tenant).toMatchObject({ currency: 'USD', name: 'Workspace' })
      expect(f.publish).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
  it.each([{ name: 'Renamed' }, { name: 'Renamed', currency: 'USD' }])('retains a locked denomination while saving other settings %j', async payload => {
    const f = await setup({ locked: true })
    try {
      const response = await f.patch(payload)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data).toMatchObject({ name: 'Renamed', currency: 'USD', currencyLockedAt: now.toISOString() })
      expect(f.state().writes).toBe(1)
    } finally { await f.app.close() }
  })
  it('rolls back the settings mutation if its audit insert fails', async () => {
    const f = await setup({ failAudit: true })
    try {
      expect((await f.patch({ currency: 'EUR' })).statusCode).toBe(500)
      expect(f.attempts()).toBe(1)
      expect(f.state()).toMatchObject({ writes: 0, audits: [], tenant: { currency: 'USD' } })
      expect(f.publish).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
  it('blocks member writes before opening a transaction', async () => {
    const f = await setup({ role: 'MEMBER' })
    try {
      expect((await f.patch({ currency: 'EUR' })).statusCode).toBe(403)
      expect(f.transaction).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
  it('does not update or audit a missing tenant', async () => {
    const f = await setup({ missing: true })
    try {
      expect((await f.patch({ currency: 'EUR' })).statusCode).toBe(404)
      expect(f.attempts()).toBe(0)
      expect(f.state().audits).toEqual([])
    } finally { await f.app.close() }
  })
  it('does not accept an unregistered currency code', async () => {
    const f = await setup()
    try {
      expect((await f.patch({ currency: 'XXX' })).statusCode).toBe(400)
      expect(f.transaction).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
  it('exposes the existing lock in the settings read', async () => {
    const f = await setup({ locked: true })
    try {
      const response = await f.app.inject({ method: 'GET', url: '/general' })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data.currencyLockedAt).toBe(now.toISOString())
    } finally { await f.app.close() }
  })
})

describe('FX rate administration', () => {
  it('creates a tenant-scoped quote and its actor audit atomically', async () => {
    const f = await setup()
    try {
      const response = await f.app.inject({ method: 'POST', url: '/exchange-rates', payload: { currency: 'EUR', rateToBase: '1.087654321012', effectiveAt: '2026-10-07T10:00:00.000Z', reference: 'Bank quote' } })
      expect(response.statusCode, response.body).toBe(201)
      expect(response.json().data).toMatchObject({ currency: 'EUR', baseCurrency: 'USD', rateToBase: '1.087654321012', source: 'MANUAL', createdById: 'admin_1' })
      expect(f.state().rates).toHaveLength(1)
      expect(f.state().audits[0]).toMatchObject({ tenantId: 'tenant_1', actorId: 'admin_1', action: 'settings.exchange_rate.create', targetType: 'ExchangeRate' })
      expect(f.publish).toHaveBeenCalledTimes(1)
      const history = await f.app.inject({ method: 'GET', url: '/exchange-rates?page=1&limit=20' })
      expect(history.statusCode, history.body).toBe(200)
      expect(history.json().data).toMatchObject({ items: [{ currency: 'EUR', baseCurrency: 'USD', rateToBase: '1.087654321012' }], pagination: { total: 1, pages: 1 }, summary: null })
    } finally { await f.app.close() }
  })

  it('rejects base-currency quotes and member writes before committing', async () => {
    const f = await setup()
    try {
      const baseRate = await f.app.inject({ method: 'POST', url: '/exchange-rates', payload: { currency: 'USD', rateToBase: '1', effectiveAt: '2026-10-07T10:00:00.000Z' } })
      expect(baseRate.statusCode).toBe(400)
      const member = await setup({ role: 'MEMBER' })
      try {
        const response = await member.app.inject({ method: 'POST', url: '/exchange-rates', payload: { currency: 'EUR', rateToBase: '1.1', effectiveAt: '2026-10-07T10:00:00.000Z' } })
        expect(response.statusCode).toBe(403)
        expect(member.transaction).not.toHaveBeenCalled()
      } finally { await member.app.close() }
    } finally { await f.app.close() }
  })

  it('rolls back the FX quote if its audit write fails', async () => {
    const f = await setup({ failAudit: true })
    try {
      const response = await f.app.inject({ method: 'POST', url: '/exchange-rates', payload: { currency: 'EUR', rateToBase: '1.1', effectiveAt: '2026-10-07T10:00:00.000Z' } })
      expect(response.statusCode).toBe(500)
      expect(f.state().rates).toEqual([])
      expect(f.state().audits).toEqual([])
      expect(f.publish).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
  it('updates the workspace overtime threshold in the audited settings transaction', async () => {
    const f = await setup()
    try {
      const response = await f.patch({ overtimeThresholdHours: 9.5 })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data.overtimeThresholdHours).toBe(9.5)
      expect(f.state().tenant.overtimeThresholdHours).toBe(9.5)
      expect(f.state().audits[0]).toMatchObject({ action: 'settings.general.update', metadata: JSON.stringify({ fields: ['overtimeThresholdHours'], currency: 'USD', currencyLockedAt: null }) })
    } finally { await f.app.close() }
  })
  it('rejects an out-of-range overtime threshold before opening a transaction', async () => {
    const f = await setup()
    try {
      expect((await f.patch({ overtimeThresholdHours: 25 })).statusCode).toBe(400)
      expect(f.transaction).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
})
