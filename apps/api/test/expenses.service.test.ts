import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { listExpenses, voidExpense } from '../src/modules/finance/finance.service.js'

describe('listExpenses', () => {
  it('applies tenant-scoped department/search filters to rows and pagination counts, with requested sort', async () => {
    const date = new Date('2026-10-01T00:00:00.000Z')
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ currentTotal: new Prisma.Decimal('12.50'), previousTotal: null }]),
      expense: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([{
          id: 'expense_1', employeeId: 'employee_1', name: 'Taxi', category: 'TRAVEL', merchant: 'Cab Co', date,
          amount: new Prisma.Decimal('12.50'), tax: null, policyMatch: null, status: 'PENDING', reimbursedAt: null, reimbursedById: null, createdAt: date, updatedAt: date,
          employee: { name: 'Alex' },
        }]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient

    const result = await listExpenses(prisma, 'tenant_1', {
      page: 1, limit: 10, search: 'Taxi', departmentId: 'department_1', sort: 'asc',
    })

    const filteredWhere = {
      tenantId: 'tenant_1',
      employee: { is: { tenantId: 'tenant_1', departmentId: 'department_1' } },
      OR: [
        { name: { contains: 'Taxi', mode: 'insensitive' } },
        { merchant: { contains: 'Taxi', mode: 'insensitive' } },
      ],
    }
    expect(prisma.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: filteredWhere, orderBy: { date: 'asc' } }))
    expect(prisma.expense.count).toHaveBeenCalledWith({ where: filteredWhere })
    expect(result.items[0].amount).toEqual({ amount: 1250, currency: 'USD' })
    expect(result.summary.reimbursedThisMonthTotal).toEqual({ amount: 1250, currency: 'USD' })
    expect(result.summary.reimbursedThisMonthComparison.previousTotal).toBeNull()
  })
})

describe('expense voiding', () => {
  it('reverses the reimbursement and retains the original expense facts', async () => {
    const date = new Date('2026-10-07T00:00:00.000Z')
    const expense = {
      id: 'expense_1', tenantId: 'tenant_1', employeeId: null, employee: null,
      name: 'Taxi', category: 'TRAVEL', merchant: 'Cab Co', date, amount: new Prisma.Decimal('18.25'), tax: null,
      currency: 'USD', policyMatch: null, status: 'REIMBURSED', reimbursedAt: date, reimbursedById: 'admin_1',
      createdAt: date, updatedAt: date, voidedAt: null, voidedById: null, voidReason: null,
    }
    const journalEntry = {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => where.expenseId ? ({
        id: 'reimbursement_1', amount: new Prisma.Decimal('18.25'), currency: 'USD', sourceType: 'EXPENSE_REIMBURSEMENT',
        baseCurrency: 'USD', baseAmount: new Prisma.Decimal('18.25'), baseMinorUnitDigits: 2, fxRate: new Prisma.Decimal('1'),
        exchangeRateId: null, currencyProvenance: 'DOCUMENT', description: 'Reimbursement',
        lines: [
          { accountId: 'cash', side: 'CREDIT', amount: new Prisma.Decimal('18.25'), baseAmount: new Prisma.Decimal('18.25') },
          { accountId: 'clearing', side: 'DEBIT', amount: new Prisma.Decimal('18.25'), baseAmount: new Prisma.Decimal('18.25') },
        ],
      }) : null),
      create: vi.fn(async () => ({ id: 'reversal_1' })),
    }
    const journalLine = { createMany: vi.fn(async () => ({ count: 2 })) }
    const prisma = {
      tenant: { findUnique: vi.fn(async () => ({ currency: 'USD' })) },
      $queryRaw: vi.fn(async () => [{ id: 'expense_1' }]),
      expense: {
        findFirstOrThrow: vi.fn(async () => expense),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(expense, data)),
      },
      journalEntry, journalLine,
    } as unknown as PrismaClient

    const result = await voidExpense(prisma, 'tenant_1', 'expense_1', 'Refund received', 'admin_2')
    expect(result).toMatchObject({ status: 'VOID', voidReason: 'Refund received', voidedById: 'admin_2', amount: { amount: 1825, currency: 'USD' } })
    expect(journalEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      sourceType: 'SETTLEMENT_REVERSAL', reversesJournalEntryId: 'reimbursement_1', reversalReason: 'Refund received',
    }) }))
    expect(result.reimbursedAt).toBe(date.toISOString())
  })
})
