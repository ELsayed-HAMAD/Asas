import { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { payrollRunSchema } from '@asas/contracts'
import { voidPayrollRun } from '../src/modules/hr/payroll.service.js'

const now = new Date('2026-10-07T10:00:00.000Z')
const runId = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const actorId = 'clyyyyyyyyyyyyyyyyyyyyyyy'

function makePrisma(initialStatus: 'APPROVED' | 'PAID') {
  const run: Record<string, unknown> = {
    id: runId, tenantId: 'tenant_1', label: 'October payroll', status: initialStatus,
    payDate: now, paidAt: initialStatus === 'PAID' ? now : null, paidById: initialStatus === 'PAID' ? 'admin_1' : null,
    currency: 'USD', taxRates: [], createdAt: now, updatedAt: now,
  }
  const original = {
    id: 'payment_1', currency: 'USD', amount: new Prisma.Decimal('90'), sourceType: 'PAYROLL_PAYMENT',
    baseCurrency: 'USD', baseAmount: new Prisma.Decimal('90'), baseMinorUnitDigits: 2,
    fxRate: new Prisma.Decimal('1'), exchangeRateId: null, currencyProvenance: 'DOCUMENT', description: 'Payroll payment',
    lines: [
      { accountId: 'cash', side: 'CREDIT', amount: new Prisma.Decimal('90'), baseAmount: new Prisma.Decimal('90') },
      { accountId: 'payroll', side: 'DEBIT', amount: new Prisma.Decimal('90'), baseAmount: new Prisma.Decimal('90') },
    ],
  }
  const journalEntry = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => where.payrollRunId ? original : null),
    create: vi.fn(async () => ({ id: 'reversal_1' })),
  }
  const journalLine = { createMany: vi.fn(async () => ({ count: 2 })) }
  const payrollRun = {
    findFirst: vi.fn(async () => run),
    updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(run, data); return { count: 1 } }),
  }
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: runId }]),
    payrollRun,
    payrollLine: {
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _sum: { gross: null, deductions: null, net: null } })),
    },
    journalEntry, journalLine,
  } as unknown as Prisma.TransactionClient
  return { tx, run, journalEntry, journalLine, payrollRun }
}

describe('payroll run voiding', () => {
  it('voids an unpaid approved run without creating a payment reversal', async () => {
    const fixture = makePrisma('APPROVED')
    const result = await voidPayrollRun(fixture.tx, 'tenant_1', runId, 'Duplicate run', actorId)
    expect(payrollRunSchema.safeParse(result).success).toBe(true)
    expect(result).toMatchObject({ status: 'VOID', voidReason: 'Duplicate run', voidedById: actorId })
    expect(fixture.journalEntry.create).not.toHaveBeenCalled()
  })

  it('posts an exact payment reversal before voiding a paid run', async () => {
    const fixture = makePrisma('PAID')
    const result = await voidPayrollRun(fixture.tx, 'tenant_1', runId, 'Payroll correction', actorId)
    expect(payrollRunSchema.safeParse(result).success).toBe(true)
    expect(result.status).toBe('VOID')
    expect(fixture.journalEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      sourceType: 'SETTLEMENT_REVERSAL', reversesJournalEntryId: 'payment_1', reversalReason: 'Payroll correction',
      baseCurrency: 'USD', baseAmount: new Prisma.Decimal('90'),
    }) }))
    expect(fixture.journalLine.createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ side: 'DEBIT', amount: new Prisma.Decimal('90') }),
      expect.objectContaining({ side: 'CREDIT', amount: new Prisma.Decimal('90') }),
    ] })
    expect(fixture.payrollRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: runId, tenantId: 'tenant_1', status: 'PAID' },
      data: expect.objectContaining({ status: 'VOID' }),
    }))
  })
})
