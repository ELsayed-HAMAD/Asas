import { Prisma, type PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSalesPerformance, listDeals } from '../src/modules/crm/crm.service.js'

const tenantId = 'tenant_1'
const openStages = ['LEADS', 'PROPOSAL', 'NEGOTIATION']
const closedStages = ['CLOSED_WON', 'CLOSED_LOST']

afterEach(() => { vi.useRealTimers() })

describe('CRM filtered lists', () => {
  it('sorts top won deals and filters actual close dates before pagination', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { tenant: { findUnique: async () => ({ currency: 'USD' }) }, deal: { findMany, count: async () => 0, groupBy: async () => [] } } as unknown as PrismaClient
    await listDeals(prisma, tenantId, { page: 1, limit: 3, stage: 'CLOSED_WON', sort: 'VALUE_DESC', closedFrom: '2026-10-01', closedBefore: '2026-11-01' })
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId, stage: 'CLOSED_WON', closedAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } },
      skip: 0, take: 3, orderBy: [{ value: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    })
  })
  it('uses matching filters for the page, pagination total and summary', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      deal: {
        findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(3), groupBy: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient
    const result = await listDeals(prisma, tenantId, { page: 1, limit: 10, search: 'Ada', stage: 'PROPOSAL', ownerId: 'rep_1', openOnly: true })
    const listArgs = vi.mocked(prisma.deal.findMany).mock.calls[0]![0]!
    expect(listArgs.where).toMatchObject({ tenantId, stage: 'PROPOSAL', ownerEmployeeId: 'rep_1', AND: [{ stage: { in: openStages } }], OR: expect.any(Array) })
    expect(prisma.deal.count).toHaveBeenCalledWith({ where: listArgs.where })
    expect(prisma.deal.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: listArgs.where }))
    expect(result.pagination.total).toBe(3)
  })
  it('supports later per-stage pages while retaining whole-stage totals from the server', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const groupBy = vi.fn().mockResolvedValue([
      { stage: 'PROPOSAL', _sum: { value: new Prisma.Decimal('9876.54') }, _count: { _all: 123 } },
    ])
    const prisma = {
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      deal: { findMany, count: async () => 123, groupBy },
    } as unknown as PrismaClient

    const result = await listDeals(prisma, tenantId, { page: 5, limit: 25, stage: 'PROPOSAL' })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, stage: 'PROPOSAL' }, skip: 100, take: 25 }))
    expect(result.pagination).toMatchObject({ page: 5, limit: 25, total: 123, pages: 5 })
    expect(result.summary).toMatchObject({ openDealCount: 123, openPipelineValue: { amount: 987654, currency: 'USD' } })
  })
  it('searches the full server result by deal, company, product line, and owner name', async () => {
    const prisma = {
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      deal: { findMany: vi.fn().mockResolvedValue([]), count: async () => 0, groupBy: async () => [] },
    } as unknown as PrismaClient
    await listDeals(prisma, tenantId, { page: 1, limit: 3, stage: 'CLOSED_WON', sort: 'VALUE_DESC', search: 'Ada' })
    const where = vi.mocked(prisma.deal.findMany).mock.calls[0]![0]!.where
    expect(where).toMatchObject({ tenantId, stage: 'CLOSED_WON', OR: [
      { name: { contains: 'Ada', mode: 'insensitive' } },
      { company: { is: { name: { contains: 'Ada', mode: 'insensitive' } } } },
      { owner: { is: { name: { contains: 'Ada', mode: 'insensitive' } } } },
      { productLine: { contains: 'Ada', mode: 'insensitive' } },
    ] })
    expect(prisma.deal.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 3, orderBy: [{ value: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] }))
  })
  it('intersects a closed stage with openOnly instead of silently overriding the stage', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { tenant: { findUnique: async () => ({ currency: 'USD' }) }, deal: { findMany, count: async () => 0, groupBy: async () => [] } } as unknown as PrismaClient
    await listDeals(prisma, tenantId, { page: 1, limit: 10, stage: 'CLOSED_WON', openOnly: true })
    expect(findMany.mock.calls[0][0].where).toMatchObject({ stage: 'CLOSED_WON', AND: [{ stage: { in: openStages } }] })
  })
})

describe('CRM dated performance', () => {
  it.each(['2025', '2026'])('uses recorded closure and event activity consistently for %s', async year => {
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
    const raw = vi.fn()
      .mockResolvedValueOnce([{ month: `${year}-01`, count: 1n, value: new Prisma.Decimal('100') }])
      .mockResolvedValueOnce([{ value: 12 }])
      .mockResolvedValueOnce([{ closedYear: Number(year), value: new Prisma.Decimal('100') }, { closedYear: Number(year) - 1, value: new Prisma.Decimal('80') }])
      .mockResolvedValueOnce([{ week: `${year}-01-05`, active: 2n, won: 1n, lost: 0n }])
      .mockResolvedValueOnce([{ ownerEmployeeId: 'rep_1', week: `${year}-01-05`, active: 2n, won: 1n, lost: 0n }])
    const groupBy = vi.fn().mockResolvedValue([
      { ownerEmployeeId: 'rep_1', stage: 'CLOSED_WON', _sum: { value: new Prisma.Decimal('100') }, _count: { _all: 1 } },
      { ownerEmployeeId: 'rep_1', stage: 'CLOSED_LOST', _sum: { value: new Prisma.Decimal('40') }, _count: { _all: 1 } },
      { ownerEmployeeId: 'rep_1', stage: 'PROPOSAL', _sum: { value: new Prisma.Decimal('200') }, _count: { _all: 2 } },
    ])
    const count = vi.fn().mockResolvedValue(7)
    const prisma = {
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      employee: { findMany: async () => [{ id: 'rep_1', name: 'Ada' }] },
      deal: { groupBy, count }, $queryRaw: raw,
    } as unknown as PrismaClient
    const result = await getSalesPerformance(prisma, tenantId, year)
    const start = new Date(`${year}-01-01T00:00:00Z`)
    const end = new Date(`${Number(year) + 1}-01-01T00:00:00Z`)
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId, OR: [{ stage: { in: openStages } }, { stage: { in: closedStages }, closedAt: { gte: start, lt: end } }],
    } }))
    expect(count).toHaveBeenCalledWith({ where: { tenantId, stage: { in: closedStages }, closedAt: null } })
    for (const [index, [sql, ...values]] of raw.mock.calls.entries()) {
      const text = (sql as TemplateStringsArray).join('?')
      expect(text).not.toContain('"updatedAt"')
      expect(text).not.toContain('"closeDate"')
      expect(text).not.toContain('CURRENT_DATE')
      expect(values).toContain(tenantId)
      expect(values).toContainEqual(end)
      if (index === 2) expect(values).toContainEqual(new Date(`${Number(year) - 1}-01-01T00:00:00Z`))
      else expect(values).toContainEqual(start)
    }
    expect((raw.mock.calls[1][0] as TemplateStringsArray).join('?')).toContain('"closedAt" - "createdAt"')
    for (const index of [3, 4]) {
      const text = (raw.mock.calls[index][0] as TemplateStringsArray).join('?')
      expect(text).toContain('"DealStageHistory"')
      expect(text).toContain('count(DISTINCT history."dealId")')
      expect(text).toContain('"occurredAt"')
    }
    expect(result).toMatchObject({ year, undatedClosedCount: 7, yearWonTotal: { amount: 10000, currency: 'USD' }, previousYearWonTotal: { amount: 8000, currency: 'USD' }, summary: { totalWon: { amount: 10000, currency: 'USD' }, totalWonCount: 1, totalLostCount: 1, overallWinRate: 50, averageSalesCycleDays: 12 } })
    expect(result.byRep[0]).toMatchObject({ ownerEmployeeId: 'rep_1', ownerName: 'Ada', openValue: { amount: 20000, currency: 'USD' }, winRate: 50 })
    expect(result.weeklyActivity[0]).toMatchObject({ active: 2, won: 1, lost: 0 })
    const weeks = raw.mock.calls[3].slice(1).filter((value): value is Date => value instanceof Date)
    expect(weeks[1].getUTCDay()).toBe(1)
    expect(weeks[1].getUTCFullYear()).toBe(Number(year))
  })
  it('retains a former owner with recorded activity after deal reassignment', async () => {
    const raw = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ownerEmployeeId: 'former_rep', week: '2026-10-05', active: 0n, won: 1n, lost: 0n }])
    const prisma = {
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      employee: { findMany: async () => [{ id: 'former_rep', name: 'Former owner' }] },
      deal: { groupBy: async () => [], count: async () => 0 }, $queryRaw: raw,
    } as unknown as PrismaClient
    const result = await getSalesPerformance(prisma, tenantId, '2026')
    expect(result.byRep[0]).toMatchObject({ ownerEmployeeId: 'former_rep', ownerName: 'Former owner', wonCount: 0, weeklyActivity: [{ week: '2026-10-05', won: 1 }] })
    expect((raw.mock.calls[4][0] as TemplateStringsArray).join('?')).toContain('UNION')
  })
  it('returns honest null metrics and zero totals for an empty workspace', async () => {
    const prisma = {
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      employee: { findMany: async () => [] }, deal: { groupBy: async () => [], count: async () => 0 },
      $queryRaw: async () => [],
    } as unknown as PrismaClient
    const result = await getSalesPerformance(prisma, tenantId, '2026')
    expect(result.summary).toEqual({ totalWon: { amount: 0, currency: 'USD' }, totalWonCount: 0, totalLostCount: 0, overallWinRate: null, averageSalesCycleDays: null })
    expect(result.undatedClosedCount).toBe(0)
    expect(result.monthlyClosedWon).toEqual([])
    expect(result.previousYearWonTotal).toEqual({ amount: 0, currency: 'USD' })
  })
})
