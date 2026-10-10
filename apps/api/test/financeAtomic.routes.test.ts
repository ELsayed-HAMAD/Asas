import Fastify from 'fastify'
import { Prisma, type PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { financeRoutes } from '../src/modules/finance/finance.routes.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'

const id = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const secondId = 'clyyyyyyyyyyyyyyyyyyyyyyy'
const now = new Date('2026-10-07T00:00:00Z')
const cases = [
  { method: 'POST', url: '/vendors', payload: { name: 'New vendor' }, status: 'PENDING', code: 201, action: 'finance.vendor.create' },
  { method: 'POST', url: '/payables', payload: { vendorId: id, date: '2026-10-07', amount: '100' }, status: 'PENDING', code: 201, action: 'finance.payable.create' },
  { method: 'PATCH', url: `/payables/${id}`, payload: { amount: '200' }, status: 'PENDING', code: 200, action: 'finance.payable.update' },
  { method: 'POST', url: `/payables/${id}/status`, payload: { status: 'APPROVED' }, status: 'PENDING', code: 200, action: 'finance.payable.status' },
  { method: 'POST', url: `/payables/${id}/request-changes`, payload: { reason: 'Fix invoice number' }, status: 'APPROVED', code: 200, action: 'finance.payable.request_changes' },
  { method: 'POST', url: '/payables/batch-payment', payload: { ids: [id, secondId] }, status: 'APPROVED', code: 200, action: 'finance.payable.batch_paid' },
  { method: 'DELETE', url: `/payables/${id}`, status: 'PENDING', code: 204, action: 'finance.payable.delete' },
  { method: 'POST', url: `/payables/${id}/void`, payload: { reason: 'Duplicate bill' }, status: 'APPROVED', code: 200, action: 'finance.payable.void' },
  { method: 'POST', url: '/customers', payload: { name: 'New customer' }, status: 'CURRENT', code: 201, action: 'finance.customer.create' },
  { method: 'POST', url: `/customers/${id}/activities`, payload: { title: 'Call', body: 'Followed up' }, status: 'CURRENT', code: 201, action: 'finance.collection_activity.create' },
  { method: 'POST', url: '/receivables', payload: { customerId: id, amount: '100' }, status: 'CURRENT', code: 201, action: 'finance.receivable.create' },
  { method: 'PATCH', url: `/receivables/${id}`, payload: { amount: '200' }, status: 'CURRENT', code: 200, action: 'finance.receivable.update' },
  { method: 'POST', url: `/receivables/${id}/status`, payload: { status: 'PAID' }, status: 'CURRENT', code: 200, action: 'finance.receivable.status' },
  { method: 'DELETE', url: `/receivables/${id}`, status: 'CURRENT', code: 204, action: 'finance.receivable.delete' },
  { method: 'POST', url: `/receivables/${id}/void`, payload: { reason: 'Duplicate invoice' }, status: 'CURRENT', code: 200, action: 'finance.receivable.void' },
  { method: 'POST', url: '/expenses', payload: { name: 'Travel', date: '2026-10-07', amount: '100' }, status: 'PENDING', code: 201, action: 'finance.expense.create' },
  { method: 'PATCH', url: `/expenses/${id}`, payload: { amount: '200' }, status: 'PENDING', code: 200, action: 'finance.expense.update' },
  { method: 'POST', url: `/expenses/${id}/status`, payload: { status: 'APPROVED' }, status: 'PENDING', code: 200, action: 'finance.expense.status' },
  { method: 'POST', url: `/expenses/${id}/status`, payload: { status: 'REIMBURSED' }, status: 'APPROVED', code: 200, action: 'finance.expense.status' },
  { method: 'POST', url: `/expenses/${id}/void`, payload: { reason: 'Refund confirmed' }, status: 'REIMBURSED', code: 200, action: 'finance.expense.void' },
  { method: 'DELETE', url: `/expenses/${id}`, status: 'PENDING', code: 204, action: 'finance.expense.delete' },
] as const

/** Transaction stub stages changes; this verifies route composition, not Postgres isolation. */
async function setup(status: string, failAuditAt = 0, role = 'ADMIN', withSettlementJournal = true) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) } } as unknown as Auth)
  const initial = {
    id, tenantId: 'tenant_1', status, createdById: 'other_admin',
    vendorId: id, vendor: { name: 'Vendor' }, projectId: null, invoiceNumber: 'INV-1', _count: { lineItems: 0 },
    customerId: id, customer: { name: 'Customer' }, number: 'INV-1', collectionStatus: 'CURRENT',
    employeeId: null, employee: null, projectId: null, reimbursedAt: null, reimbursedById: null, name: 'Document', category: 'OTHER', merchant: null, policyMatch: null,
    title: 'Call', author: null, body: null, avatarUrl: null,
    amount: new Prisma.Decimal('100'), tax: null, date: now, dueDate: now, createdAt: now, updatedAt: now,
  }
  let committed = { row: initial, writes: 0, audits: [] as Record<string, unknown>[], journals: [] as Record<string, unknown>[], journalLines: [] as Record<string, unknown>[] }
  let attemptedWrites = 0
  const publish = vi.fn(() => { expect(committed.audits.length).toBeGreaterThan(0) })
  const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    const staged = { row: { ...committed.row }, writes: committed.writes, audits: [...committed.audits], journals: [...committed.journals], journalLines: [...committed.journalLines] }
    const write = (data: Record<string, unknown>) => {
      attemptedWrites++
      staged.writes++
      staged.row = { ...staged.row, projectId: null, ...data, ...(data.amount !== undefined && { amount: new Prisma.Decimal(String(data.amount)) }) }
      return staged.row
    }
    const delegate = {
      findFirst: vi.fn(async ({ where }: { where: { name?: string } }) => where.name ? null : staged.row),
      findFirstOrThrow: vi.fn(async () => staged.row),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => write(data)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => write(data)),
      delete: vi.fn(async () => write({ deleted: true })),
      count: vi.fn(async () => 2),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { write(data); return { count: 2 } }),
      findMany: vi.fn(async () => [staged.row, { ...staged.row, id: secondId }]),
    }
    const tx = {
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      $queryRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => values.includes('tenant_1') && values.includes(id) ? [{ id }] : []),
      payableInvoice: delegate, receivableInvoice: delegate, expense: delegate,
      vendor: delegate, customer: delegate, collectionActivity: delegate,
      ledgerAccount: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: String(create.code) })) },
      journalEntry: { findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.recognizesPayableInvoiceId || where.recognizesReceivableInvoiceId) {
          const field = where.recognizesPayableInvoiceId ? 'recognizesPayableInvoiceId' : 'recognizesReceivableInvoiceId'
          const recognized = staged.journals.find(entry => entry[field] === where[field])
          return recognized ? {
            ...recognized,
            amount: new Prisma.Decimal(String(recognized.amount)),
            baseAmount: new Prisma.Decimal(String(recognized.baseAmount)),
            currency: recognized.currency,
          } : null
        }
        if (withSettlementJournal && (where.payableInvoiceId || where.receivableInvoiceId || where.expenseId)) {
          const isReceivable = Boolean(where.receivableInvoiceId)
          return {
            id: 'payment_journal', sourceType: where.expenseId ? 'EXPENSE_REIMBURSEMENT' : isReceivable ? 'AR_COLLECTION' : 'AP_PAYMENT',
            amount: new Prisma.Decimal('100'), currency: 'USD', currencyProvenance: 'DOCUMENT', description: 'Settlement',
            lines: [
              { accountId: 'cash', side: isReceivable ? 'DEBIT' : 'CREDIT', amount: new Prisma.Decimal('100') },
              { accountId: 'clearing', side: isReceivable ? 'CREDIT' : 'DEBIT', amount: new Prisma.Decimal('100') },
            ],
          }
        }
        return null
      }), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        staged.journals.push(data)
        return { id: `journal_${staged.journals.length}` }
      }), findMany: vi.fn(async () => []) },
      journalLine: { createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => { staged.journalLines.push(...data); return { count: data.length } }) },
      auditLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (staged.audits.length + 1 === failAuditAt) throw new Error('Audit unavailable')
        staged.audits.push(data)
        return data
      }) },
    }
    const result = await work(tx)
    committed = staged
    return result
  })
  app.decorate('prisma', {
    member: { findUnique: async () => ({ role, employeeId: null }) },
    user: { findUnique: async () => ({ name: 'Admin' }) },
    $transaction: transaction,
  } as unknown as PrismaClient)
  app.decorate('ssePublish', publish)
  await app.register(financeRoutes)
  return { app, publish, transaction, state: () => committed, attemptedWrites: () => attemptedWrites }
}

for (const scenario of cases) {
  describe(`${scenario.method} ${scenario.url}`, () => {
    it('commits the mutation and audit before publishing its invalidation', async () => {
      const fixture = await setup(scenario.status)
      const isReimbursement = 'payload' in scenario && 'status' in scenario.payload && scenario.payload.status === 'REIMBURSED'
      const isExpenseVoid = scenario.action === 'finance.expense.void'
      try {
        const response = await fixture.app.inject({ method: scenario.method, url: scenario.url, ...('payload' in scenario && { payload: scenario.payload }) })
        expect(response.statusCode, response.body).toBe(scenario.code)
        expect(fixture.state().writes).toBe(1)
        expect(fixture.state().audits[0]).toMatchObject({ tenantId: 'tenant_1', actorId: 'admin_1', action: scenario.action })
        if (scenario.url === '/payables/batch-payment' || scenario.url === `/receivables/${id}/status` || isReimbursement || isExpenseVoid) {
          expect(fixture.state().journals.length).toBe(scenario.url === '/payables/batch-payment' ? 4 : scenario.url.includes('receivables') ? 2 : 1)
          expect(fixture.state().journalLines).toHaveLength(fixture.state().journals.length * 2)
          const sourceType = scenario.url.includes('receivables') ? 'AR_COLLECTION' : (isReimbursement || isExpenseVoid) ? 'EXPENSE_REIMBURSEMENT' : 'AP_PAYMENT'
          expect(fixture.state().journals).toEqual(expect.arrayContaining([expect.objectContaining({ sourceType: isExpenseVoid ? 'SETTLEMENT_REVERSAL' : sourceType, actorId: 'admin_1' })]))
        }
        expect(fixture.transaction).toHaveBeenCalledTimes(1)
        expect(fixture.publish).toHaveBeenCalledTimes(1)
        if ('payload' in scenario && 'reason' in scenario.payload) {
          expect(JSON.parse(String(fixture.state().audits[0]?.metadata))).toMatchObject({ reason: scenario.payload.reason })
        }
      } finally { await fixture.app.close() }
    })
    it('does not commit or publish when its audit insert fails', async () => {
      const fixture = await setup(scenario.status, 1)
      const isReimbursement = 'payload' in scenario && 'status' in scenario.payload && scenario.payload.status === 'REIMBURSED'
      const isExpenseVoid = scenario.action === 'finance.expense.void'
      try {
        const response = await fixture.app.inject({ method: scenario.method, url: scenario.url, ...('payload' in scenario && { payload: scenario.payload }) })
        expect(response.statusCode).toBe(500)
        expect(fixture.attemptedWrites()).toBe(1)
        expect(fixture.state().writes).toBe(0)
        expect(fixture.state().row.status).toBe(scenario.status)
        expect(fixture.state().audits).toEqual([])
        if (scenario.url === '/payables/batch-payment' || scenario.url === `/receivables/${id}/status` || isReimbursement || isExpenseVoid) {
          expect(fixture.state().journals).toEqual([])
          expect(fixture.state().journalLines).toEqual([])
        }
        expect(fixture.publish).not.toHaveBeenCalled()
      } finally { await fixture.app.close() }
    })
  })
}

describe('finance transaction boundaries and cancellation access', () => {
  it('rolls back the whole batch when a later audit insert fails', async () => {
    const fixture = await setup('APPROVED', 2)
    try {
      const response = await fixture.app.inject({ method: 'POST', url: '/payables/batch-payment', payload: { ids: [id, secondId] } })
      expect(response.statusCode).toBe(500)
      expect(fixture.state().row.status).toBe('APPROVED')
      expect(fixture.state().audits).toEqual([])
      expect(fixture.publish).not.toHaveBeenCalled()
      expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    } finally { await fixture.app.close() }
  })
  it.each(['payables', 'receivables'])('forbids members from cancelling %s', async resource => {
    const fixture = await setup('CURRENT', 0, 'MEMBER')
    try {
      expect((await fixture.app.inject({ method: 'POST', url: `/${resource}/${id}/void`, payload: { reason: 'Duplicate' } })).statusCode).toBe(403)
      expect(fixture.transaction).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
  it.each(['payables', 'receivables'])('refuses to cancel paid %s', async resource => {
    const fixture = await setup('PAID', 0, 'ADMIN', false)
    try {
      expect((await fixture.app.inject({ method: 'POST', url: `/${resource}/${id}/void`, payload: { reason: 'Duplicate' } })).statusCode).toBe(409)
      expect(fixture.attemptedWrites()).toBe(0)
      expect(fixture.state().audits).toEqual([])
      expect(fixture.publish).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
  it.each(['payables', 'receivables'])('reverses a paid %s before committing its audit', async resource => {
    const fixture = await setup('PAID')
    try {
      const response = await fixture.app.inject({ method: 'POST', url: `/${resource}/${id}/void`, payload: { reason: 'Returned by bank' } })
      expect(response.statusCode, response.body).toBe(200)
      expect(fixture.state().row.status).toBe('VOID')
      expect(fixture.state().journals).toMatchObject([{
        sourceType: 'SETTLEMENT_REVERSAL', reversesJournalEntryId: 'payment_journal',
        reversalReason: 'Returned by bank', actorId: 'admin_1',
      }])
      expect(fixture.state().journalLines).toHaveLength(2)
      expect(fixture.state().audits[0]).toMatchObject({ action: resource === 'payables' ? 'finance.payable.void' : 'finance.receivable.void' })
      expect(fixture.publish).toHaveBeenCalledTimes(1)
    } finally { await fixture.app.close() }
  })
  it('rolls back the reversal and status change if its audit insert fails', async () => {
    const fixture = await setup('PAID', 1)
    try {
      const response = await fixture.app.inject({ method: 'POST', url: `/payables/${id}/void`, payload: { reason: 'Returned by bank' } })
      expect(response.statusCode).toBe(500)
      expect(fixture.state().row.status).toBe('PAID')
      expect(fixture.state().journals).toEqual([])
      expect(fixture.state().journalLines).toEqual([])
      expect(fixture.state().audits).toEqual([])
      expect(fixture.publish).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
  it.each(['payables', 'receivables'])('requires a cancellation reason for %s', async resource => {
    const fixture = await setup('CURRENT')
    try {
      expect((await fixture.app.inject({ method: 'POST', url: `/${resource}/${id}/void`, payload: { reason: ' ' } })).statusCode).toBe(400)
      expect(fixture.transaction).not.toHaveBeenCalled()
    } finally { await fixture.app.close() }
  })
})
