import type { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { approveValidTimesheets, listAttendance } from '../src/modules/hr/attendance.service.js'

function setup({
  clockOut = '17:00',
  exceptions = [] as Array<{ employeeId: string; date: Date; alert: boolean }>,
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

afterEach(() => vi.useRealTimers())

describe('date-ranged punch completion summary', () => {
  it.each([[20, 15, 75], [10, 0, 0], [0, 0, null]])('reports %s started and %s complete punch days as %s percent', async (started, completed, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'))
    const currentRange = { gte: new Date('2026-10-01T00:00:00.000Z'), lt: new Date('2026-10-08T00:00:00.000Z') }
    const previousRange = { gte: new Date('2026-09-24T00:00:00.000Z'), lt: new Date('2026-10-01T00:00:00.000Z') }
    const dayCount = vi.fn(async (args: { where: { clockOut?: unknown; date?: { gte: Date; lt: Date } } }) => {
      expect([currentRange, previousRange]).toContainEqual(args.where.date)
      if (args.where.date?.gte.getTime() === previousRange.gte.getTime()) {
        return started === 0 ? 0 : args.where.clockOut ? 2 : 4
      }
      return args.where.clockOut ? completed : started
    })
    const exceptionCount = vi.fn().mockResolvedValueOnce(50).mockResolvedValueOnce(3)
    const prisma = {
      attendanceException: { findMany: vi.fn().mockResolvedValue([]), count: exceptionCount },
      leaveRequest: { findMany: vi.fn().mockResolvedValue([]) },
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
      employee: { count: vi.fn().mockResolvedValue(0) },
      timesheetDay: { count: dayCount },
      timesheet: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: { overtimeHours: 0 } }) },
    } as unknown as PrismaClient
    const result = await listAttendance(prisma, 'tenant_1', null, 7)
    expect(result.summary.attendanceRate).toBe(expected)
    expect(result.summary.attendanceRatePreviousPeriod).toBe(started === 0 ? null : 50)
    expect(result.summary.exceptionCount).toBe(50)
    expect(result.summary.exceptionCountPreviousPeriod).toBe(3)
    expect(result.summary.attendanceRateRangeDays).toBe(7)
    expect(result.summary.attendanceRateRecordedDays).toBe(started)
    expect(dayCount).toHaveBeenCalledTimes(4)
  })
})

describe('approveValidTimesheets', () => {
  it('approves complete timesheets with no exceptions in their week', async () => {
    const { prisma, tx } = setup()
    const result = await approveValidTimesheets(prisma, 'tenant_1', ['sheet_1'])
    expect(result.ids).toEqual(['sheet_1'])
    expect(tx.timesheet.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['sheet_1'] }, tenantId: 'tenant_1' } }))
    expect(tx.timesheet.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['sheet_1'] }, tenantId: 'tenant_1', approvedAt: null } }))
  })

  it('rejects a sheet with an attendance exception during its week', async () => {
    const { prisma } = setup({ exceptions: [{ employeeId: 'employee_1', date: new Date('2026-10-06T00:00:00.000Z'), alert: true }] })
    await expect(approveValidTimesheets(prisma, 'tenant_1', ['sheet_1'])).rejects.toThrow('no attendance exceptions')
  })

  it('ignores resolved exceptions when checking timesheet eligibility', async () => {
    const { prisma, tx } = setup()
    await expect(approveValidTimesheets(prisma, 'tenant_1', ['sheet_1'])).resolves.toMatchObject({ ids: ['sheet_1'] })
    expect(tx.attendanceException.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ alert: true }) }))
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
