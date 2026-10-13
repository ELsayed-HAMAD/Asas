import { Prisma, type PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { listPayables, listReceivables, listCustomers } from '../src/modules/finance/finance.service.js'

const currency = { findUnique: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }) }
const bucket = (status: string, amount: string) => ({ status, _count: { _all: 1 }, _sum: { amount: new Prisma.Decimal(amount) } })

describe('void documents do not represent money still owed', () => {
  it('applies open/history and tenant month-to-date filters before pagination', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T12:00:00.000Z'))
    try {
      const delegate = {
        findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
      }
      const prisma = {
        tenant: currency,
        payableInvoice: delegate,
        $queryRaw: vi.fn().mockResolvedValue([{ currentTotal: null, previousTotal: null }]),
      } as unknown as PrismaClient

      await listPayables(prisma, 'tenant_1', { page: 1, limit: 25, statusGroup: 'OPEN', dateRange: 'CURRENT_MONTH' })
      expect(delegate.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant_1', status: { in: ['PENDING', 'APPROVED', 'SCHEDULED'] }, date: { gte: '2026-10-01', lt: '2026-11-01' } }),
        skip: 0, take: 25,
      }))

      await listPayables(prisma, 'tenant_1', { page: 2, limit: 25, statusGroup: 'HISTORY' })
      expect(delegate.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { tenantId: 'tenant_1', status: { in: ['PAID', 'REJECTED', 'VOID'] } }, skip: 25, take: 25,
      }))
    } finally {
      vi.useRealTimers()
    }
  })
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
  it('calculates invoice days past due from the tenant calendar and keeps the due date current', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T22:30:00.000Z'))
    try {
      const invoices = [
        { id: 'due_today', customerId: 'customer_1', customer: { name: 'Customer' }, number: 'TODAY', amount: new Prisma.Decimal('10'), dueDate: new Date('2026-10-13T00:00:00.000Z'), status: 'CURRENT', createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z') },
        { id: 'due_yesterday', customerId: 'customer_1', customer: { name: 'Customer' }, number: 'YESTERDAY', amount: new Prisma.Decimal('10'), dueDate: new Date('2026-10-12T00:00:00.000Z'), status: 'CURRENT', createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z') },
      ]
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'Africa/Cairo' }) },
        receivableInvoice: { findMany: vi.fn().mockResolvedValue(invoices), count: vi.fn().mockResolvedValue(2), groupBy: vi.fn().mockResolvedValue([]) },
        $queryRaw: vi.fn().mockResolvedValue([]),
      } as unknown as PrismaClient
      const result = await listReceivables(prisma, 'tenant_1', { page: 1, limit: 10 })
      expect(result.items.map(item => item.daysPastDue)).toEqual([0, 1])
      expect(result.items.map(item => item.status)).toEqual(['CURRENT', 'OVERDUE'])
    } finally {
      vi.useRealTimers()
    }
  })
  it('derives overdue and current summary counts from due dates rather than stale stored status', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-13T12:00:00.000Z'))
    try {
      const todayInvoice = { id: 'due_today', customerId: 'customer_1', customer: { name: 'Customer' }, number: 'TODAY', amount: new Prisma.Decimal('10'), dueDate: new Date('2026-10-13T00:00:00.000Z'), status: 'CURRENT', createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z') }
      const lateInvoice = { ...todayInvoice, id: 'late', number: 'LATE', dueDate: new Date('2026-10-12T00:00:00.000Z') }
      const delegate = {
        findMany: vi.fn().mockResolvedValue([todayInvoice, lateInvoice]), count: vi.fn().mockResolvedValue(2),
        groupBy: vi.fn().mockResolvedValue([bucket('CURRENT', '20')]),
      }
      const queryRaw = vi.fn(async (strings: TemplateStringsArray) => strings.join('').includes('WITH report_date')
        ? [
            { bucket: 'current', count: 1n, total: new Prisma.Decimal('10') },
            { bucket: '1-30', count: 1n, total: new Prisma.Decimal('10') },
          ]
        : [{ currentTotal: null, previousTotal: null }])
      const result = await listReceivables({ tenant: currency, receivableInvoice: delegate, $queryRaw: queryRaw } as unknown as PrismaClient, 'tenant_1', { page: 1, limit: 10 })
      expect(result.items.map(item => item.status)).toEqual(['CURRENT', 'OVERDUE'])
      expect(result.summary.currentCount).toBe(1)
      expect(result.summary.currentTotal.amount).toBe(1000)
      expect(result.summary.overdueCount).toBe(1)
      expect(result.summary.overdueTotal.amount).toBe(1000)
    } finally {
      vi.useRealTimers()
    }
  })
  it('uses tenant-local days for customer aging and excludes invoices due today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T22:30:00.000Z'))
    try {
      const groupBy = vi.fn()
        .mockResolvedValueOnce([{ customerId: 'customer_1', _sum: { amount: new Prisma.Decimal('20') } }])
        .mockResolvedValueOnce([{ customerId: 'customer_1', _min: { dueDate: new Date('2026-10-11T00:00:00.000Z') } }])
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'Africa/Cairo' }) },
        customer: { findMany: vi.fn().mockResolvedValue([{ id: 'customer_1', name: 'Customer', email: null, avatarUrl: null, collectionStatus: 'CURRENT', createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') }]) },
        receivableInvoice: { groupBy },
      } as unknown as PrismaClient
      const result = await listCustomers(prisma, 'tenant_1')
      expect(result[0]?.oldestOverdueDays).toBe(2)
      expect(groupBy.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ where: expect.objectContaining({ dueDate: { lt: new Date('2026-10-13T00:00:00.000Z') } }) }))
    } finally {
      vi.useRealTimers()
    }
  })
  it('pages only the selected customer’s open receivables while preserving the global summary', async () => {
    const delegate = {
      findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    }
    await listReceivables({ tenant: currency, receivableInvoice: delegate, $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as PrismaClient, 'tenant_1', {
      page: 2, limit: 10, customerId: 'customer_1', statusGroup: 'OPEN',
    })
    expect(delegate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant_1', status: { in: ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'] }, customerId: 'customer_1' },
      skip: 10, take: 10,
    }))
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
      } as unknown as PrismaClient, 'tenant_1', { page: 1, limit: 10, status: 'OVERDUE', overdueOnly: true })
      expect(delegate.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant_1',
          AND: [
            { OR: [{ status: 'OVERDUE' }, { status: 'CURRENT', dueDate: { lt: new Date('2026-10-07T00:00:00.000Z') } }] },
            { status: { in: ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'] }, dueDate: { lt: new Date('2026-10-07T00:00:00.000Z') } },
          ],
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
