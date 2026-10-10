import { Prisma } from '@prisma/client'
import { forecastResponseSchema } from '@asas/contracts'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { getForecast } from '../src/modules/crm/crm.service.js'

const stamp = (day: number) => new Date(`2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`)

describe('getForecast', () => {
  it('filters to the selected tenant and year and keeps only the latest row per rep and period', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      forecastSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1234567', repName: 'Rep One', period: '2026-Q1', closed: new Prisma.Decimal('30'), commit: new Prisma.Decimal('35'), bestCase: new Prisma.Decimal('40'), quotaPct: 50, createdAt: stamp(3) },
          { id: 'c1234568', repName: 'Rep One', period: '2026-Q1', closed: new Prisma.Decimal('20'), commit: new Prisma.Decimal('25'), bestCase: new Prisma.Decimal('30'), quotaPct: 40, createdAt: stamp(2) },
          { id: 'c1234569', repName: 'Rep One', period: '2026-Q2', closed: new Prisma.Decimal('45'), commit: new Prisma.Decimal('50'), bestCase: new Prisma.Decimal('60'), quotaPct: 60, createdAt: stamp(1) },
        ]),
      },
      salesQuota: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c2234567', employeeId: 'c3234567', repName: 'Rep One', period: '2026-Q1', quota: new Prisma.Decimal('110'), currency: 'USD', createdAt: stamp(3) },
          { id: 'c2234568', employeeId: 'c3234567', repName: 'Rep One', period: '2026-Q1', quota: new Prisma.Decimal('100'), currency: 'USD', createdAt: stamp(2) },
          { id: 'c2234569', employeeId: 'c3234567', repName: 'Rep One', period: '2026', quota: new Prisma.Decimal('200'), currency: 'USD', createdAt: stamp(1) },
        ]),
      },
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([]) // monthly open pipeline
        .mockResolvedValueOnce([]) // monthly commit pipeline
        .mockResolvedValueOnce([{ month: '2026-01', count: 2n, value: new Prisma.Decimal('17.50') }]) // monthly weighted pipeline
        .mockResolvedValueOnce([{ year: '2025' }, { year: '2026' }])
        .mockResolvedValueOnce([{
          value: new Prisma.Decimal('100'),
          weightedValue: new Prisma.Decimal('17.50'),
          unweightedValue: new Prisma.Decimal('25'),
          unweightedCount: 1n,
          dealCommit: new Prisma.Decimal('15'),
          dealBestCase: new Prisma.Decimal('40'),
        }]),
    } as unknown as PrismaClient

    const result = await getForecast(prisma, 'tenant_1', '2026')

    expect(prisma.forecastSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1', period: { startsWith: '2026' } }, orderBy: { createdAt: 'desc' } }))
    expect(prisma.salesQuota.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1', period: { startsWith: '2026' } }, orderBy: { createdAt: 'desc' } }))
    expect(result.year).toBe('2026')
    expect(result.availableYears).toEqual(['2025', '2026'])
    expect(result.forecastByRep.map(row => row.id)).toEqual(['c1234567', 'c1234569'])
    expect(result.quotas.map(row => row.id)).toEqual(['c2234567', 'c2234569'])
    expect(result.summary.totalQuota).toEqual({ amount: 20000, currency: 'USD' })
    expect(result.summary.excludedQuotaCount).toBe(1)
    expect(result.summary.totalCommit).toEqual({ amount: 8500, currency: 'USD' })
    expect(result.summary.totalBestCase).toEqual({ amount: 10000, currency: 'USD' })
    expect(result.monthlyWeightedPipeline).toEqual([{ month: '2026-01', count: 2, value: { amount: 1750, currency: 'USD' } }])
    expect(result.summary.weightedPipeline).toEqual({ amount: 1750, currency: 'USD' })
    expect(result.summary.unweightedPipeline).toEqual({ amount: 2500, currency: 'USD' })
    expect(result.summary.unweightedDealCount).toBe(1)
    expect(result.summary.dealCommit).toEqual({ amount: 1500, currency: 'USD' })
    expect(result.summary.dealBestCase).toEqual({ amount: 4000, currency: 'USD' })
    expect(forecastResponseSchema.parse(result)).toEqual(result)
    const rawQueries = (prisma.$queryRaw as unknown as { mock: { calls: [TemplateStringsArray, ...unknown[]][] } }).mock.calls
    const weightedSql = rawQueries[2]![0].join(' ')
    expect(weightedSql).toContain('sum("value" * ("winProbability"::numeric / 100))')
    expect(weightedSql).toContain('"winProbability" BETWEEN 0 AND 100')
    const aggregateSql = rawQueries[4]![0].join(' ')
    expect(aggregateSql).toContain("upper(\"forecastBucket\") = 'COMMIT'")
    expect(aggregateSql).toContain("IN ('COMMIT', 'BEST_CASE')")
  })
})
