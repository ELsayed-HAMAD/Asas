import Fastify from 'fastify'
import { Prisma, type PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { payrollRoutes } from '../src/modules/hr/payroll.routes.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'

const id = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const employeeId = 'clyyyyyyyyyyyyyyyyyyyyyyy'
const lineId = 'clzzzzzzzzzzzzzzzzzzzzzzz'
const now = new Date('2026-10-07T00:00:00Z')
const createBody = { periodStart: '2026-10-01', periodEnd: '2026-10-31', payFrequency: 'MONTHLY', salaryBasis: 'MONTHLY', requestKey: 'cc35b4e1-07ec-4656-a3d3-8b4e71c67251', label: 'Payroll', employeeIds: [employeeId], taxRates: [{ label: 'A', rate: '0.2' }, { label: 'B', rate: '0.7' }] }
const scenarios = [
  { method: 'POST', url: '/payroll/runs', payload: createBody, action: 'payroll.run.create', code: 201 },
  { method: 'POST', url: `/payroll/runs/${id}/approve`, action: 'payroll.approve', code: 200 },
  { method: 'POST', url: `/payroll/runs/${id}/pay`, action: 'payroll.pay', code: 200 },
  { method: 'POST', url: `/payroll/runs/${id}/void`, payload: { reason: 'Payroll correction' }, action: 'payroll.void', code: 200 },
  { method: 'PATCH', url: `/payroll/runs/${id}/lines/${lineId}`, payload: { bonusAmount: '10' }, action: 'payroll.line.adjust', code: 200 },
] as const

/** Staged transaction stub verifies composition/rollback; it does not simulate Postgres locks. */
async function setup(options: { failAudit?: boolean; failRead?: boolean; status?: string; archived?: boolean; role?: string; missingTenant?: boolean; salary?: string; salaryBasis?: 'ANNUAL' | 'MONTHLY'; hiredAt?: Date; currency?: string; runCurrency?: string; salaryCurrency?: string; existingPeriod?: { start: Date; end: Date } } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) } } as unknown as Auth)
  let committed = {
    run: { id, tenantId: 'tenant_1', label: 'Payroll', payDate: null, currency: options.runCurrency ?? null, status: options.status ?? 'PENDING', taxRates: createBody.taxRates, createdAt: now, updatedAt: now },
    line: { id: lineId, tenantId: 'tenant_1', payrollRunId: id, employeeId, employee: { id: employeeId, name: 'Ada', title: 'Engineer' }, baseSalary: new Prisma.Decimal('5'), missedDaysCount: null, missedDaysAmount: null, bonusLabel: null, bonusAmount: null, gross: new Prisma.Decimal('5'), deductions: new Prisma.Decimal('0.05'), net: new Prisma.Decimal('4.95'), taxLines: [{ id: lineId, label: 'A', amount: new Prisma.Decimal('0.01'), override: false }, { id: lineId, label: 'B', amount: new Prisma.Decimal('0.04'), override: false }] },
    writes: 0, audits: [] as Record<string, unknown>[], journals: [] as Record<string, unknown>[], journalLines: [] as Record<string, unknown>[],
  }
  let attemptedWrites = 0
  const events: string[] = []
  const locks: Array<{ sql: string; values: unknown[] }> = []
  const overlaps: unknown[] = []
  const publish = vi.fn(() => { expect(committed.audits.length).toBe(1) })
  const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    const staged = { run: { ...committed.run }, line: { ...committed.line, taxLines: [...committed.line.taxLines] }, writes: committed.writes, audits: [...committed.audits], journals: [...committed.journals], journalLines: [...committed.journalLines] }
    const write = () => { attemptedWrites++; staged.writes++ }
    const tx = {
      tenant: { findUnique: async () => options.missingTenant ? null : ({ currency: options.currency ?? 'USD' }) },
      employee: { findMany: async ({ where }: { where: { tenantId: string; status: { not: string } } }) => {
        expect(where.tenantId).toBe('tenant_1')
        expect(where.status.not).toBe('ARCHIVED')
        events.push('readEmployee')
                return options.archived ? [] : [{ id: employeeId, name: 'Ada', salary: new Prisma.Decimal(options.salary ?? '5'), salaryBasis: options.salaryBasis ?? null, hiredAt: options.hiredAt ?? null, currency: options.salaryCurrency ?? null }]
      } },
      $queryRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        events.push('lock')
        locks.push({ sql: _strings.join('?'), values })
        return values.includes(id) && values.includes('tenant_1') ? [{ id }] : []
      }),
      payrollRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => { write(); staged.run = { ...staged.run, ...data }; return staged.run },
        findFirst: async ({ where }: { where: { requestKey?: string } }) => {
          if (where.requestKey) return (staged.run as Record<string, unknown>).requestKey === where.requestKey ? staged.run : null
          events.push('readRun'); return staged.run
        },
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          const allowed = data.status === 'PAID' ? ['APPROVED'] : ['DRAFT', 'PENDING']
          if (!allowed.includes(staged.run.status)) return { count: 0 }
          write(); staged.run = { ...staged.run, ...data }; return { count: 1 }
        },
      },
      payrollLine: {
        count: async ({ where }: { where: { tenantId: string; employeeId: { in: string[] }; payrollRun: { tenantId: string; periodStart: { lte: Date }; periodEnd: { gte: Date }; status: { in: string[] } } } }) => {
          overlaps.push(where)
          const period = options.existingPeriod
          return period && period.start <= where.payrollRun.periodStart.lte && period.end >= where.payrollRun.periodEnd.gte ? 1 : 0
        },
        create: async ({ data }: { data: Record<string, unknown> & { taxLines: { create: Array<{ label: string; amount: string }> } } }) => {
          write()
          staged.line = { ...staged.line, ...data, taxLines: data.taxLines.create.map(line => ({ ...line, id: lineId, amount: new Prisma.Decimal(line.amount), override: false })) } as typeof staged.line
        },
        findFirst: async () => { events.push('readLine'); return staged.line },
        findMany: async () => { if (options.failRead) throw new Error('Read failed'); return [staged.line] },
        update: async ({ data }: { data: Record<string, unknown> }) => { write(); staged.line = { ...staged.line, ...data } as typeof staged.line; return staged.line },
        aggregate: async () => ({ _sum: { gross: staged.line.gross, deductions: staged.line.deductions, net: staged.line.net } }),
      },
      ledgerAccount: { upsert: async ({ create }: { create: Record<string, unknown> }) => ({ id: String(create.code) }) },
      journalEntry: { create: async ({ data }: { data: Record<string, unknown> }) => {
        staged.journals.push(data)
        return { id: `journal_${staged.journals.length}` }
      } },
      journalLine: { createMany: async ({ data }: { data: Record<string, unknown>[] }) => { staged.journalLines.push(...data); return { count: data.length } } },
      payrollTaxLine: {
        deleteMany: async () => { write(); staged.line.taxLines = [] },
        createMany: async ({ data }: { data: Array<{ label: string; amount: string }> }) => {
          write(); staged.line.taxLines = data.map(line => ({ id: lineId, label: line.label, amount: new Prisma.Decimal(line.amount), override: false }))
        },
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failAudit) throw new Error('Audit unavailable')
        staged.audits.push(data)
      } },
    }
    const result = await work(tx)
    committed = staged
    return result
  })
  app.decorate('prisma', { member: { findUnique: async () => ({ role: options.role ?? 'ADMIN', employeeId }) }, $transaction: transaction } as unknown as PrismaClient)
  app.decorate('ssePublish', publish)
  await app.register(payrollRoutes)
  return { app, transaction, publish, events, locks, overlaps, state: () => committed, attempts: () => attemptedWrites }
}

for (const scenario of scenarios) {
  describe(`${scenario.method} ${scenario.url}`, () => {
    it('commits its mutation, response read and actor audit before SSE', async () => {
      const fixture = await setup({ status: scenario.action === 'payroll.pay' ? 'APPROVED' : undefined })
      try {
        const response = await fixture.app.inject({ method: scenario.method, url: scenario.url, ...('payload' in scenario && { payload: scenario.payload }) })
        expect(response.statusCode, response.body).toBe(scenario.code)
        expect(fixture.state().audits[0]).toMatchObject({ tenantId: 'tenant_1', actorId: 'admin_1', action: scenario.action })
        expect(fixture.state().writes).toBeGreaterThan(0)
        expect(fixture.transaction).toHaveBeenCalledTimes(1)
        expect(fixture.publish).toHaveBeenCalledTimes(1)
        if (scenario.action === 'payroll.run.create') {
          expect(response.json().data.lines[0].deductions).toBe('0.05')
          expect(response.json().data.lines[0].net).toBe('4.95')
        }
        if (scenario.action === 'payroll.pay') {
          expect(response.json().data).toMatchObject({ status: 'PAID', paidAt: expect.any(String), paidById: 'admin_1' })
          expect(fixture.state().journals).toHaveLength(1)
          expect(fixture.state().journalLines).toMatchObject([
            { side: 'CREDIT', amount: '4.95' }, { side: 'DEBIT', amount: '4.95' },
          ])
        }
        if (scenario.action === 'payroll.line.adjust') {
          expect(fixture.events.slice(0, 3)).toEqual(['lock', 'readRun', 'readLine'])
          expect(response.json().data.lines[0].gross).toBe('15.00')
        }
      } finally { await fixture.app.close() }
    })
    it.each(['audit', 'response read'])('rolls back all writes if the %s fails, without publishing', async failure => {
      const fixture = await setup({ status: scenario.action === 'payroll.pay' ? 'APPROVED' : undefined, failAudit: failure === 'audit', failRead: failure === 'response read' })
      try {
        const response = await fixture.app.inject({ method: scenario.method, url: scenario.url, ...('payload' in scenario && { payload: scenario.payload }) })
        expect(response.statusCode).toBe(500)
        expect(fixture.attempts()).toBeGreaterThan(0)
        expect(fixture.state().writes).toBe(0)
        expect(fixture.state().run.status).toBe(scenario.action === 'payroll.pay' ? 'APPROVED' : 'PENDING')
        expect(fixture.state().line.bonusAmount).toBeNull()
        expect(fixture.state().audits).toEqual([])
        if (scenario.action === 'payroll.pay') {
          expect(fixture.state().run.status).toBe('APPROVED')
          expect(fixture.state().journals).toEqual([])
          expect(fixture.state().journalLines).toEqual([])
        }
        expect(fixture.publish).not.toHaveBeenCalled()
      } finally { await fixture.app.close() }
    })
  })
}

describe('payroll earning policy and retry safety', () => {
  it.each([
    { salary: '120000', salaryBasis: 'ANNUAL' as const, fallback: 'ANNUAL', expected: '10000.00', eligibleDays: 31 },
    { salary: '10000', salaryBasis: 'MONTHLY' as const, fallback: 'ANNUAL', expected: '10000.00', eligibleDays: 31 },
    { salary: '120000', salaryBasis: 'ANNUAL' as const, fallback: 'MONTHLY', hiredAt: new Date('2026-10-16T00:00:00Z'), expected: '5161.29', eligibleDays: 16 },
  ])('snapshots and prices salary $salary / $salaryBasis as $expected', async policy => {
    const fixture = await setup(policy)
    try {
      const response = await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: { ...createBody, salaryBasis: policy.fallback } })
      expect(response.statusCode, response.body).toBe(201)
      expect(response.json().data).toMatchObject({ periodStart: '2026-10-01', periodEnd: '2026-10-31', payFrequency: 'MONTHLY', periodsPerYear: 12, prorationMethod: 'CALENDAR_DAYS', currency: 'USD' })
      expect(response.json().data.lines[0]).toMatchObject({ sourceSalary: policy.salary, salaryBasis: policy.salaryBasis, baseSalary: policy.expected, eligibleDays: policy.eligibleDays, periodDays: 31 })
      expect(fixture.events.indexOf('lock')).toBeLessThan(fixture.events.indexOf('readEmployee'))
      expect(fixture.locks[0].sql).toContain('ORDER BY "id" FOR UPDATE')
      expect(fixture.locks[0].values).toContain('tenant_1')
      expect(fixture.overlaps[0]).toMatchObject({ tenantId: 'tenant_1', employeeId: { in: [employeeId] }, payrollRun: { tenantId: 'tenant_1', status: { in: ['DRAFT', 'PENDING', 'APPROVED', 'PAID'] } } })
    } finally { await fixture.app.close() }
  })
  it('replays an identical request without duplicate writes, audit or SSE', async () => {
    const fixture = await setup()
    try {
      const first = await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: createBody })
      expect(first.statusCode, first.body).toBe(201)
      const writes = fixture.attempts()
      const retry = await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: { ...createBody, periodsPerYear: 12 } })
      expect(retry.statusCode, retry.body).toBe(200)
      expect(retry.json().data.id).toBe(first.json().data.id)
      expect(fixture.attempts()).toBe(writes)
      expect(fixture.state().audits).toHaveLength(1)
      expect(fixture.publish).toHaveBeenCalledTimes(1)
    } finally { await fixture.app.close() }
  })
  it('rejects reuse of a request key with a changed payload', async () => {
    const fixture = await setup()
    try {
      await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: createBody })
      const writes = fixture.attempts()
      const response = await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: { ...createBody, label: 'Different payroll' } })
      expect(response.statusCode, response.body).toBe(409)
      expect(fixture.attempts()).toBe(writes)
      expect(fixture.publish).toHaveBeenCalledTimes(1)
    } finally { await fixture.app.close() }
  })
  it.each([
    { start: '2026-10-01', end: '2026-10-31', code: 409 },
    { start: '2026-09-25', end: '2026-10-01', code: 409 },
    { start: '2026-09-01', end: '2026-09-30', code: 201 },
    { start: '2026-11-01', end: '2026-11-30', code: 201 },
  ])('guards inclusive overlap with $start through $end', async period => {
    const fixture = await setup({ existingPeriod: { start: new Date(period.start), end: new Date(period.end) } })
    try {
      const response = await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: createBody })
      expect(response.statusCode, response.body).toBe(period.code)
      if (period.code === 409) {
        expect(fixture.attempts()).toBe(0)
        expect(fixture.publish).not.toHaveBeenCalled()
      }
    } finally { await fixture.app.close() }
  })
  it('prices adjustments in the recorded run currency, not the new tenant currency', async () => {
    const fixture = await setup({ runCurrency: 'KWD', currency: 'JPY' })
    try {
      const response = await fixture.app.inject({ method: 'PATCH', url: `/payroll/runs/${id}/lines/${lineId}`, payload: { bonusAmount: '0.001' } })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data).toMatchObject({ currency: 'KWD', periodStart: null, periodEnd: null })
      expect(response.json().data.lines[0].gross).toBe('5.001')
    } finally { await fixture.app.close() }
  })
})

describe('payroll guard boundaries', () => {
  it('rejects known foreign salary currency instead of pricing it without FX', async () => {
    const fixture = await setup({ salaryCurrency: 'KWD', currency: 'USD' })
    try {
      const response = await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: createBody })
      expect(response.statusCode, response.body).toBe(409)
      expect(fixture.attempts()).toBe(0)
      expect(fixture.publish).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
  it('rejects archived employees before writing a payroll run', async () => {
    const fixture = await setup({ archived: true })
    try {
      expect((await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: createBody })).statusCode).toBe(400)
      expect(fixture.attempts()).toBe(0)
    } finally { await fixture.app.close() }
  })
  it('does not approve the same run twice', async () => {
    const fixture = await setup({ status: 'APPROVED' })
    try {
      expect((await fixture.app.inject({ method: 'POST', url: `/payroll/runs/${id}/approve` })).statusCode).toBe(409)
      expect(fixture.attempts()).toBe(0)
      expect(fixture.publish).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
  it.each(['APPROVED', 'PAID'])('cannot adjust a %s run', async status => {
    const fixture = await setup({ status })
    try {
      expect((await fixture.app.inject({ method: 'PATCH', url: `/payroll/runs/${id}/lines/${lineId}`, payload: { bonusAmount: '10' } })).statusCode).toBe(409)
      expect(fixture.attempts()).toBe(0)
      expect(fixture.events).not.toContain('readLine')
    } finally { await fixture.app.close() }
  })
  it('does not price an adjustment using a made-up USD fallback when the tenant is missing', async () => {
    const fixture = await setup({ missingTenant: true })
    try {
      expect((await fixture.app.inject({ method: 'PATCH', url: `/payroll/runs/${id}/lines/${lineId}`, payload: { bonusAmount: '10' } })).statusCode).toBe(404)
      expect(fixture.attempts()).toBe(0)
    } finally { await fixture.app.close() }
  })
  it('rejects unsupported rates at the boundary before opening the transaction', async () => {
    const fixture = await setup()
    try {
      expect((await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: { ...createBody, taxRates: [{ label: 'Tax', rate: '100.000000000000000001' }] } })).statusCode).toBe(400)
      expect(fixture.transaction).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
  it('blocks member mutations without touching payroll data', async () => {
    const fixture = await setup({ role: 'MEMBER' })
    try {
      expect((await fixture.app.inject({ method: 'POST', url: '/payroll/runs', payload: createBody })).statusCode).toBe(403)
      expect(fixture.transaction).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
})
