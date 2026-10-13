import { describe, expect, it } from 'vitest'
import {
  booleanQueryParamSchema, calendarDateSchema, expenseWriteSchema,
  payableWriteSchema, payableUpdateSchema, receivableWriteSchema,
  financeVoidSchema, payableStatusUpdateSchema, receivableStatusUpdateSchema,
  journalEntrySchema,
  trialBalanceQuerySchema,
  trialBalanceResponseSchema,
  payableListQuerySchema,
  receivableListQuerySchema,
  receivableInvoiceSchema,
} from './index.js'

const vendorId = 'clxxxxxxxxxxxxxxxxxxxxxxx'

describe('finance boundary validation', () => {
  it('accepts bounded Accounts Payable views and rejects unknown filter values', () => {
    expect(payableListQuerySchema.parse({ page: '2', limit: '25', statusGroup: 'HISTORY', dateRange: 'CURRENT_MONTH' })).toMatchObject({ page: 2, limit: 25, statusGroup: 'HISTORY', dateRange: 'CURRENT_MONTH' })
    expect(payableListQuerySchema.safeParse({ statusGroup: 'EVERYTHING' }).success).toBe(false)
    expect(payableListQuerySchema.safeParse({ dateRange: 'LAST_YEAR' }).success).toBe(false)
  })
  it('accepts an open receivables page scoped to one customer', () => {
    expect(receivableListQuerySchema.parse({ page: '2', limit: '10', customerId: vendorId, statusGroup: 'OPEN' })).toMatchObject({ page: 2, limit: 10, customerId: vendorId, statusGroup: 'OPEN' })
    expect(receivableListQuerySchema.safeParse({ statusGroup: 'UNPAID' }).success).toBe(false)
  })
  it('requires a nonnegative server-computed daysPastDue value on receivables', () => {
    const invoice = { id: vendorId, customerId: vendorId, customer: 'Customer', number: null, amount: { amount: 100, currency: 'USD' }, dueDate: '2026-10-12T00:00:00.000Z', status: 'CURRENT', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }
    expect(receivableInvoiceSchema.safeParse({ ...invoice, daysPastDue: 0 }).success).toBe(true)
    expect(receivableInvoiceSchema.safeParse({ ...invoice, daysPastDue: -1 }).success).toBe(false)
    expect(receivableInvoiceSchema.safeParse(invoice).success).toBe(false)
  })
  it('requires a bounded nonblank reason for cancellation', () => {
    for (const reason of ['', '   ', 'x'.repeat(2001)]) {
      expect(financeVoidSchema.safeParse({ reason }).success).toBe(false)
    }
    expect(financeVoidSchema.parse({ reason: ' Duplicate invoice ' })).toEqual({ reason: 'Duplicate invoice' })
  })
  it('cannot bypass the cancellation reason via a generic status endpoint', () => {
    expect(payableStatusUpdateSchema.safeParse({ status: 'VOID' }).success).toBe(false)
    expect(receivableStatusUpdateSchema.safeParse({ status: 'VOID' }).success).toBe(false)
  })
  it.each(['2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '2025-02-29'])('rejects impossible date %s', date => {
    expect(calendarDateSchema.safeParse(date).success).toBe(false)
  })
  it.each(['2024-02-29', '2026-10-07', '2026-12-31'])('accepts real date %s', date => {
    expect(calendarDateSchema.parse(date)).toBe(date)
  })
  it.each([['false', false], ['0', false], ['true', true], ['1', true], [false, false], [true, true]])('parses %s without truthiness coercion', (input, expected) => {
    expect(booleanQueryParamSchema.parse(input)).toBe(expected)
  })
  it('strips client status so create and PATCH cannot bypass the workflow', () => {
    expect(payableWriteSchema.parse({ vendorId, date: '2026-10-07', amount: '10', status: 'PAID' })).not.toHaveProperty('status')
    expect(payableUpdateSchema.parse({ amount: '10', status: 'PAID' })).not.toHaveProperty('status')
    expect(receivableWriteSchema.parse({ customerId: vendorId, amount: '10', status: 'PAID' })).not.toHaveProperty('status')
  })
  it('requires positive amounts and due date not before issue date', () => {
    const input = { vendorId, date: '2026-10-07', amount: '10' }
    expect(payableWriteSchema.safeParse({ ...input, amount: '-1' }).success).toBe(false)
    expect(payableWriteSchema.safeParse({ ...input, amount: '0' }).success).toBe(false)
    expect(payableWriteSchema.safeParse({ ...input, dueDate: '2026-10-06' }).success).toBe(false)
  })
  it('accepts optional project links on payables and expenses', () => {
    const payable = { vendorId, date: '2026-10-07', amount: '10' }
    const expense = { name: 'Travel', date: '2026-10-07', amount: '10' }
    expect(payableWriteSchema.parse({ ...payable, projectId: null }).projectId).toBeNull()
    expect(payableWriteSchema.parse({ ...payable, projectId: vendorId }).projectId).toBe(vendorId)
    expect(expenseWriteSchema.parse({ ...expense, projectId: vendorId }).projectId).toBe(vendorId)
  })
  it('requires non-negative tax no greater than the total, with exact decimal comparison', () => {
    const input = { name: 'Expense', date: '2026-10-07', amount: '10.01' }
    expect(expenseWriteSchema.safeParse({ ...input, tax: '-0.01' }).success).toBe(false)
    expect(expenseWriteSchema.safeParse({ ...input, tax: '10.02' }).success).toBe(false)
    expect(expenseWriteSchema.safeParse({ ...input, tax: '10.01' }).success).toBe(true)
  })
  it('validates self-service expense submission without requiring employeeId', async () => {
    const { selfExpenseWriteSchema } = await import('./index.js')
    const selfInput = { name: 'Taxi', date: '2026-10-07', amount: '25.50', category: 'TRAVEL' as const }
    expect(selfExpenseWriteSchema.safeParse(selfInput).success).toBe(true)
  })
  it('validates mixed-currency journal lines with an explicit base-currency value', () => {
    const payload = {
      id: vendorId, sourceType: 'AP_PAYMENT', sourceId: vendorId, currencyProvenance: 'DOCUMENT',
      amount: { amount: 10000, currency: 'EUR' }, baseCurrency: 'USD',
      baseAmount: { amount: 13200, currency: 'USD' }, exchangeRate: '1.32',
      description: 'Foreign invoice payment', reversalReason: null, actorId: null,
      postedAt: '2026-10-07T12:00:00.000Z', lines: [
        { id: vendorId, accountCode: 'ACCOUNTS_PAYABLE', accountName: 'AP', side: 'DEBIT', amount: { amount: 10000, currency: 'EUR' }, baseAmount: { amount: 12000, currency: 'USD' } },
        { id: vendorId, accountCode: 'CASH_CLEARING', accountName: 'Cash', side: 'CREDIT', amount: { amount: 10000, currency: 'EUR' }, baseAmount: { amount: 13200, currency: 'USD' } },
        { id: vendorId, accountCode: 'FX_LOSS', accountName: 'FX loss', side: 'DEBIT', amount: { amount: 0, currency: 'EUR' }, baseAmount: { amount: 1200, currency: 'USD' } },
      ],
    }
    expect(journalEntrySchema.parse(payload)).toEqual(payload)
    expect(journalEntrySchema.safeParse({ ...payload, baseCurrency: null }).success).toBe(false)
  })
  it('validates trial-balance dates and reports incomplete legacy valuation explicitly', () => {
    expect(trialBalanceQuerySchema.safeParse({ asOf: '2026-02-31' }).success).toBe(false)
    const report = {
      asOf: '2026-10-07', baseCurrency: 'USD', rows: [],
      totalDebitBase: { amount: 0, currency: 'USD' }, totalCreditBase: { amount: 0, currency: 'USD' },
      unvaluedJournalCount: 3, isComplete: false,
    }
    expect(trialBalanceResponseSchema.parse(report)).toEqual(report)
  })
})
