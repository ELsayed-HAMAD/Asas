import { Prisma } from '@prisma/client'
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
          { id: 'snap_latest', repName: 'Rep One', period: '2026-Q1', closed: new Prisma.Decimal('30'), commit: new Prisma.Decimal('35'), bestCase: new Prisma.Decimal('40'), quotaPct: 50, createdAt: stamp(3) },
          { id: 'snap_old', repName: 'Rep One', period: '2026-Q1', closed: new Prisma.Decimal('20'), commit: new Prisma.Decimal('25'), bestCase: new Prisma.Decimal('30'), quotaPct: 40, createdAt: stamp(2) },
          { id: 'snap_q2', repName: 'Rep One', period: '2026-Q2', closed: new Prisma.Decimal('45'), commit: new Prisma.Decimal('50'), bestCase: new Prisma.Decimal('60'), quotaPct: 60, createdAt: stamp(1) },
        ]),
      },
      salesQuota: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'quota_latest', employeeId: 'employee_1', repName: 'Rep One', period: '2026-Q1', quota: new Prisma.Decimal('110'), createdAt: stamp(3) },
          { id: 'quota_old', employeeId: 'employee_1', repName: 'Rep One', period: '2026-Q1', quota: new Prisma.Decimal('100'), createdAt: stamp(2) },
        ]),
      },
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([]) // monthly open pipeline
        .mockResolvedValueOnce([]) // monthly commit pipeline
        .mockResolvedValueOnce([{ year: '2025' }, { year: '2026' }])
        .mockResolvedValueOnce([{ value: new Prisma.Decimal('0') }]),
    } as unknown as PrismaClient

    const result = await getForecast(prisma, 'tenant_1', '2026')

    expect(prisma.forecastSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1', period: { startsWith: '2026' } }, orderBy: { createdAt: 'desc' } }))
    expect(prisma.salesQuota.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1', period: { startsWith: '2026' } }, orderBy: { createdAt: 'desc' } }))
    expect(result.year).toBe('2026')
    expect(result.availableYears).toEqual(['2025', '2026'])
    expect(result.forecastByRep.map(row => row.id)).toEqual(['snap_latest', 'snap_q2'])
    expect(result.quotas.map(row => row.id)).toEqual(['quota_latest'])
    expect(result.summary.totalQuota).toEqual({ amount: 11000, currency: 'USD' })
    expect(result.summary.totalCommit).toEqual({ amount: 8500, currency: 'USD' })
    expect(result.summary.totalBestCase).toEqual({ amount: 10000, currency: 'USD' })
  })
})
