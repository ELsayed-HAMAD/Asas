import { Prisma, type PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { listPayables, listReceivables, listCustomers } from '../src/modules/finance/finance.service.js'

const currency = { findUnique: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }) }
const bucket = (status: string, amount: string) => ({ status, _count: { _all: 1 }, _sum: { amount: new Prisma.Decimal(amount) } })

describe('void documents do not represent money still owed', () => {
  it('excludes void payables from outstanding and date-based totals', async () => {
    const delegate = {
      findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(2),
      groupBy: vi.fn().mockResolvedValue([bucket('PENDING', '10'), bucket('VOID', '100')]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
    }
    const result = await listPayables({
      tenant: currency,
      payableInvoice: delegate,
      $queryRaw: vi.fn().mockResolvedValue([{ currentTotal: new Prisma.Decimal(0), previousTotal: null }]),
    } as unknown as PrismaClient, 'tenant_1', { page: 1, limit: 10 })
    expect(result.summary.openOutstanding).toEqual({ amount: 1000, currency: 'USD' })
    expect(result.summary.paidTotal.amount).toBe(0)
    for (const [args] of delegate.aggregate.mock.calls as Array<[{ where: { status: string | { in: string[] } } }]>) {
      expect(JSON.stringify(args.where.status)).not.toContain('VOID')
    }
  })
  it('excludes void receivables from the outstanding summary and SQL aging query', async () => {
    const queryRaw = vi.fn().mockResolvedValue([])
    const delegate = {
      findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(2),
      groupBy: vi.fn().mockResolvedValue([bucket('CURRENT', '10'), bucket('VOID', '100')]),
    }
    const result = await listReceivables({ tenant: currency, receivableInvoice: delegate, $queryRaw: queryRaw } as unknown as PrismaClient, 'tenant_1', { page: 1, limit: 10 })
    expect(result.summary.openBalance).toEqual({ amount: 1000, currency: 'USD' })
    expect(result.summary.paidTotal.amount).toBe(0)
    const statusSql = queryRaw.mock.calls[0]?.[3] as Prisma.Sql
    expect(statusSql.values).toEqual(['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'])
  })
  it('adds tenant-local valued collection totals and comparison dates to the receivables summary', async () => {
    const queryRaw = vi.fn(async (strings: TemplateStringsArray) => strings.join('').includes('SettlementHistoryCoverage')
      ? [{ currentTotal: new Prisma.Decimal('24.50'), previousTotal: new Prisma.Decimal('20.00') }]
      : [])
    const delegate = {
      findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    }
    const result = await listReceivables({ tenant: currency, receivableInvoice: delegate, $queryRaw: queryRaw } as unknown as PrismaClient, 'tenant_1', { page: 1, limit: 10 })
    expect(result.summary.collectedThisMonthTotal).toEqual({ amount: 2450, currency: 'USD' })
    expect(result.summary.collectedThisMonthComparison).toMatchObject({
      previousStartDate: expect.any(String),
      previousEndDateExclusive: expect.any(String),
      previousTotal: { amount: 2000, currency: 'USD' },
    })
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
  it('filters overdue receivables across open statuses using the tenant calendar day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T00:30:00.000Z'))
    try {
      const delegate = {
        findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([bucket('CURRENT', '10')]),
      }
      await listReceivables({
        tenant: currency, receivableInvoice: delegate, $queryRaw: vi.fn().mockResolvedValue([]),
      } as unknown as PrismaClient, 'tenant_1', { page: 1, limit: 10, status: 'CURRENT', overdueOnly: true })
      expect(delegate.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant_1',
          status: 'CURRENT',
          AND: [{
            status: { in: ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'] },
            dueDate: { lt: new Date('2026-10-07T00:00:00.000Z') },
          }],
        }),
      }))
    } finally {
      vi.useRealTimers()
    }
  })
  it('excludes void invoices from customer balances and overdue age', async () => {
    const groupBy = vi.fn().mockResolvedValue([])
    await listCustomers({ tenant: currency, customer: { findMany: vi.fn().mockResolvedValue([]) }, receivableInvoice: { groupBy } } as unknown as PrismaClient, 'tenant_1')
    expect(groupBy).toHaveBeenCalledTimes(2)
    for (const [args] of groupBy.mock.calls as Array<[{ where: { tenantId: string; status: { in: string[] } } }]>) {
      expect(args.where.tenantId).toBe('tenant_1')
      expect(args.where.status.in).toEqual(['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'])
    }
  })
})
