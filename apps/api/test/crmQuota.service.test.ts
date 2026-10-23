import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createSalesQuota } from '../src/modules/crm/crm.service.js'

function quotaPrisma(duplicate: { id: string } | null, employeeName = 'Ada Lovelace') {
  const findFirst = vi.fn().mockResolvedValue(duplicate)
  const create = vi.fn().mockImplementation(async ({ data }) => ({
    id: 'quota_1', ...data, quota: new Prisma.Decimal(data.quota), createdAt: new Date('2026-01-01T00:00:00Z'),
  }))
  return {
    prisma: {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'tenant_1' }]),
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: 'employee_1', name: employeeName }) },
      salesQuota: { findFirst, create },
    } as unknown as PrismaClient,
    findFirst,
    create,
  }
}

describe('sales quota identity', () => {
  it('rejects an employee-linked quota when a name-only quota already exists for that rep and period', async () => {
    const f = quotaPrisma({ id: 'existing_name_quota' })
    await expect(createSalesQuota(f.prisma, 'tenant_1', {
      employeeId: 'employee_1', repName: 'ignored canonical name', period: '2026', quota: '10000.00',
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(f.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant_1', period: '2026', OR: [
        { employeeId: 'employee_1' },
        { employeeId: null, repName: { equals: 'Ada Lovelace', mode: 'insensitive' } },
      ],
    } }))
    expect(f.create).not.toHaveBeenCalled()
  })

  it('rejects a name-only quota when the same rep already has an employee-linked quota', async () => {
    const f = quotaPrisma({ id: 'existing_employee_quota' })
    await expect(createSalesQuota(f.prisma, 'tenant_1', {
      repName: 'ada lovelace', period: '2026', quota: '10000.00',
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(f.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant_1', period: '2026',
      OR: [{ repName: { equals: 'ada lovelace', mode: 'insensitive' } }],
    } }))
    expect(f.create).not.toHaveBeenCalled()
  })
})
