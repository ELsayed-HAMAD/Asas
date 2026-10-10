import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { correctAttendancePunchInTransaction } from '../src/modules/hr/attendance.service.js'

function setup(timezone = 'UTC', approvedAt: Date | null = null, dayDate = '2026-10-06', overtimeThresholdHours = 8) {
  const id = 'clxxxxxxxxxxxxxxxxxxxxxxx'
  const originalDay = {
    id, date: new Date(`${dayDate}T00:00:00.000Z`), dayLabel: dayDate,
    clockIn: '09:00', clockOut: '17:00', clockInAt: new Date(`${dayDate}T09:00:00.000Z`),
    clockOutAt: new Date(`${dayDate}T17:00:00.000Z`), totalHours: 8, timesheetId: 'sheet_1',
    timesheet: { id: 'sheet_1', employeeId: 'employee_1', approvedAt, overtimeThresholdHours },
  }
  let updatedDay = originalDay
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'sheet_1' }]),
    tenant: { findUnique: vi.fn().mockResolvedValue({ timezone }) },
    timesheetDay: {
      findFirst: vi.fn().mockResolvedValue(originalDay),
      update: vi.fn(async ({ data }: { data: Partial<typeof originalDay> }) => {
        updatedDay = { ...originalDay, ...data }
        return updatedDay
      }),
      findMany: vi.fn(async () => [{ totalHours: 8 }, { totalHours: updatedDay.totalHours }]),
    },
    timesheet: { update: vi.fn().mockResolvedValue({}) },
    attendanceException: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as Prisma.TransactionClient
  return { tx, id }
}

describe('attendance punch corrections', () => {
  it('stores tenant-local punches as instants, recalculates the week, and records overtime', async () => {
    const { tx, id } = setup()
    const result = await correctAttendancePunchInTransaction(tx, 'tenant_1', id, {
      clockInDate: '2026-10-06', clockInTime: '09:00', clockOutDate: '2026-10-06', clockOutTime: '18:30',
    })
    expect(result.correction).toMatchObject({ id, clockInTime: '09:00', clockOutTime: '18:30', totalHours: 9.5 })
    expect(vi.mocked(tx.timesheetDay.update)).toHaveBeenCalledWith(expect.objectContaining({ data: {
      clockIn: '09:00', clockInAt: new Date('2026-10-06T09:00:00.000Z'),
      clockOut: '18:30', clockOutAt: new Date('2026-10-06T18:30:00.000Z'), totalHours: 9.5,
    } }))
    expect(tx.timesheet.update).toHaveBeenCalledWith(expect.objectContaining({ data: { totalHours: 17.5, overtimeHours: 1.5, regularHours: 16 } }))
    expect(tx.attendanceException.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'OVERTIME', alert: true, label: 'Overtime: 1.50 hours' }) }))
  })

  it('supports overnight corrections and rejects a DST wall time that never occurred', async () => {
    const { tx, id } = setup('UTC')
    const overnight = await correctAttendancePunchInTransaction(tx, 'tenant_1', id, {
      clockInDate: '2026-10-06', clockInTime: '23:00', clockOutDate: '2026-10-07', clockOutTime: '01:30',
    })
    expect(overnight.correction.totalHours).toBe(2.5)

    const dst = setup('America/New_York', null, '2026-03-08')
    await expect(correctAttendancePunchInTransaction(dst.tx, 'tenant_1', dst.id, {
      clockInDate: '2026-03-08', clockInTime: '02:30', clockOutDate: null, clockOutTime: null,
    })).rejects.toThrow('does not exist')
    expect(dst.tx.timesheetDay.update).not.toHaveBeenCalled()

    const repeated = setup('America/New_York', null, '2026-11-01')
    await expect(correctAttendancePunchInTransaction(repeated.tx, 'tenant_1', repeated.id, {
      clockInDate: '2026-11-01', clockInTime: '01:30', clockOutDate: null, clockOutTime: null,
    })).rejects.toThrow('occurs twice')
    expect(repeated.tx.timesheetDay.update).not.toHaveBeenCalled()
  })

  it('recalculates corrections using the threshold captured on the timesheet', async () => {
    const { tx, id } = setup('UTC', null, '2026-10-06', 10)
    await correctAttendancePunchInTransaction(tx, 'tenant_1', id, {
      clockInDate: '2026-10-06', clockInTime: '09:00', clockOutDate: '2026-10-06', clockOutTime: '18:30',
    })
    expect(tx.timesheet.update).toHaveBeenCalledWith(expect.objectContaining({ data: { totalHours: 17.5, overtimeHours: 0, regularHours: 17.5 } }))
    expect(tx.attendanceException.create).not.toHaveBeenCalled()
  })

  it('rejects correction of approved timesheets and out times before the in time', async () => {
    const approved = setup('UTC', new Date())
    await expect(correctAttendancePunchInTransaction(approved.tx, 'tenant_1', approved.id, {
      clockInDate: '2026-10-06', clockInTime: '09:00', clockOutDate: null, clockOutTime: null,
    })).rejects.toThrow('Approved timesheets')

    const unapproved = setup()
    await expect(correctAttendancePunchInTransaction(unapproved.tx, 'tenant_1', unapproved.id, {
      clockInDate: '2026-10-06', clockInTime: '12:00', clockOutDate: '2026-10-06', clockOutTime: '11:00',
    })).rejects.toThrow('after clock-in')
    expect(unapproved.tx.timesheetDay.update).not.toHaveBeenCalled()
  })
})
