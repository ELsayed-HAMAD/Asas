import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { approveValidTimesheets } from '../src/modules/hr/attendance.service.js'

function setup({
  clockOut = '17:00',
  exceptions = [] as Array<{ employeeId: string; date: Date }>,
  updatedCount = 1,
} = {}) {
  const sheet = {
    id: 'sheet_1',
    tenantId: 'tenant_1',
    employeeId: 'employee_1',
    weekStart: new Date('2026-10-05T00:00:00.000Z'),
    approvedAt: null,
    days: [{ clockIn: '09:00', clockOut, totalHours: clockOut ? 8 : null }],
  }
  const tx = {
    timesheet: {
      findMany: vi.fn().mockResolvedValue([sheet]),
      updateMany: vi.fn().mockResolvedValue({ count: updatedCount }),
    },
    attendanceException: {
      findMany: vi.fn().mockResolvedValue(exceptions),
    },
  }
  const prisma = {
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient
  return { prisma, tx }
}

describe('approveValidTimesheets', () => {
  it('approves complete timesheets with no exceptions in their week', async () => {
    const { prisma, tx } = setup()
    const result = await approveValidTimesheets(prisma, 'tenant_1', ['sheet_1'])
    expect(result.ids).toEqual(['sheet_1'])
    expect(tx.timesheet.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['sheet_1'] }, tenantId: 'tenant_1' } }))
    expect(tx.timesheet.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['sheet_1'] }, tenantId: 'tenant_1', approvedAt: null } }))
  })

  it('rejects a sheet with an attendance exception during its week', async () => {
    const { prisma } = setup({ exceptions: [{ employeeId: 'employee_1', date: new Date('2026-10-06T00:00:00.000Z') }] })
    await expect(approveValidTimesheets(prisma, 'tenant_1', ['sheet_1'])).rejects.toThrow('no attendance exceptions')
  })

  it('rejects a sheet with an incomplete punch', async () => {
    const { prisma } = setup({ clockOut: null })
    await expect(approveValidTimesheets(prisma, 'tenant_1', ['sheet_1'])).rejects.toThrow('no attendance exceptions')
  })

  it('rejects a concurrent update that no longer matches the eligible batch', async () => {
    const { prisma } = setup({ updatedCount: 0 })
    await expect(approveValidTimesheets(prisma, 'tenant_1', ['sheet_1'])).rejects.toThrow('changed while approving')
  })
})
