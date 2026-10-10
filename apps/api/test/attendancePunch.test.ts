import type { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clockAttendance } from '../src/modules/hr/attendance.service.js'

afterEach(() => vi.useRealTimers())

function clientFor(tx: Record<string, unknown>, overtimeThresholdHours = 8) {
  return {
    employee: { findFirst: vi.fn().mockResolvedValue({ id: 'employee_1' }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Africa/Cairo', overtimeThresholdHours }) },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient
}

describe('timestamp-backed attendance punches', () => {
  it('buckets clock-in by tenant-local day and stores the exact instant', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T22:30:00.000Z')) // 01:30 on October 7 in Cairo
    const day = { id: 'day_1', clockIn: null, clockInAt: null }
    const tx = {
      timesheet: { upsert: vi.fn().mockResolvedValue({ id: 'sheet_1', approvedAt: null }) },
      timesheetDay: {
        upsert: vi.fn().mockResolvedValue(day),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...day, ...data })),
      },
    }
    const result = await clockAttendance(clientFor(tx), 'tenant_1', 'employee_1', 'IN')
    expect(tx.timesheet.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_employeeId_weekStart: { tenantId: 'tenant_1', employeeId: 'employee_1', weekStart: new Date('2026-10-05T00:00:00.000Z') } },
    }))
    expect(tx.timesheetDay.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { timesheetId_date: { timesheetId: 'sheet_1', date: new Date('2026-10-07T00:00:00.000Z') } },
      create: expect.objectContaining({ dayLabel: '2026-10-07' }),
    }))
    expect(tx.timesheetDay.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      clockIn: '01:30', clockInAt: new Date('2026-10-06T22:30:00.000Z'),
    }) }))
    expect(result).toMatchObject({ employeeId: 'employee_1', clockIn: '01:30', clockOut: null })
  })

  it('closes a punch from the previous local day and separates daily overtime', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T08:30:00.000Z')) // 11:30 in Cairo, after a 23:00 local start
    const day = {
      id: 'day_1', timesheetId: 'sheet_1', date: new Date('2026-10-06T00:00:00.000Z'),
      clockIn: '23:00', clockOut: null, clockInAt: new Date('2026-10-06T20:00:00.000Z'), clockOutAt: null,
      timesheet: { id: 'sheet_1', approvedAt: null, overtimeThresholdHours: 8 },
    }
    const tx = {
      timesheetDay: {
        findFirst: vi.fn().mockResolvedValue(day),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...day, ...data })),
        findMany: vi.fn().mockResolvedValue([{ totalHours: 12.5 }]),
      },
      timesheet: { update: vi.fn().mockResolvedValue({}) },
      attendanceException: { create: vi.fn().mockResolvedValue({ id: 'exception_1' }) },
    }
    const result = await clockAttendance(clientFor(tx), 'tenant_1', 'employee_1', 'OUT')
    expect(tx.timesheetDay.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { timesheet: { tenantId: 'tenant_1', employeeId: 'employee_1' }, clockInAt: { not: null }, clockOutAt: null },
    }))
    expect(tx.timesheetDay.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      clockOut: '11:30', clockOutAt: new Date('2026-10-07T08:30:00.000Z'), totalHours: 12.5,
    }) }))
    expect(tx.timesheet.update).toHaveBeenCalledWith({ where: { id: 'sheet_1' }, data: { totalHours: 12.5, regularHours: 8, overtimeHours: 4.5 } })
    expect(tx.attendanceException.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'OVERTIME', label: 'Overtime: 4.50 hours', date: day.date,
    }) })
    expect(result).toMatchObject({ employeeId: 'employee_1', clockIn: '23:00', clockOut: '11:30' })
  })

  it('uses the threshold captured by the weekly timesheet', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T08:30:00.000Z'))
    const day = {
      id: 'day_1', timesheetId: 'sheet_1', date: new Date('2026-10-06T00:00:00.000Z'),
      clockIn: '23:00', clockOut: null, clockInAt: new Date('2026-10-06T20:00:00.000Z'), clockOutAt: null,
      timesheet: { id: 'sheet_1', approvedAt: null, overtimeThresholdHours: 10 },
    }
    const tx = {
      timesheetDay: {
        findFirst: vi.fn().mockResolvedValue(day),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...day, ...data })),
        findMany: vi.fn().mockResolvedValue([{ totalHours: 12.5 }]),
      },
      timesheet: { update: vi.fn().mockResolvedValue({}) },
      attendanceException: { create: vi.fn().mockResolvedValue({ id: 'exception_1' }) },
    }
    await clockAttendance(clientFor(tx, 12), 'tenant_1', 'employee_1', 'OUT')
    expect(tx.timesheet.update).toHaveBeenCalledWith({ where: { id: 'sheet_1' }, data: { totalHours: 12.5, regularHours: 10, overtimeHours: 2.5 } })
    expect(tx.attendanceException.create).toHaveBeenCalledWith({ data: expect.objectContaining({ label: 'Overtime: 2.50 hours' }) })
  })

  it('captures the workspace threshold when a new weekly timesheet is created', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T22:30:00.000Z'))
    const day = { id: 'day_1', clockIn: null, clockInAt: null }
    const tx = {
      timesheet: { upsert: vi.fn().mockResolvedValue({ id: 'sheet_1', approvedAt: null }) },
      timesheetDay: {
        upsert: vi.fn().mockResolvedValue(day),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...day, ...data })),
      },
    }
    await clockAttendance(clientFor(tx, 9.5), 'tenant_1', 'employee_1', 'IN')
    expect(tx.timesheet.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ overtimeThresholdHours: 9.5 }),
    }))
  })
})
