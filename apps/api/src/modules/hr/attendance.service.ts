/**
 * HR attendance service — reads real `AttendanceException` rows, computes punch completion for
 * a tenant-local date range, and manages leave requests.
 *
 * This is the fix the rebuild plan (Phase 2) called for: the legacy `listAttendance` derived
 * exceptions with `new Date('2000-01-01 ' + day.clockIn)` and emitted `'late'`/`'early_out'` —
 * neither of which exists in the `AttendanceExceptionType` enum (`MISSING_IN|MISSING_OUT|
 * OVERTIME`). Punch completion is `completed punch days / punch-started days` for the selected
 * tenant-local trailing range; this does not claim punctuality or infer an employee work schedule.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  AttendanceExceptionRow,
  AttendanceResponse,
  AttendanceSummary,
  AttendancePunchCorrectionInput,
  LeaveRequestRow,
  LeaveBalanceQuery,
  LeaveBalanceResponse,
  LeavePolicy,
  LeavePolicyWriteInput,
  LeaveRequestWriteInput,
  SelfLeaveRequestWriteInput,
  TimesheetRow,
} from '@asas/contracts'
import { AppError } from '../../utils/errors.js'
import { tenantToday } from '../../utils/dates.js'

const LEAVE_TYPES = ['VACATION', 'SICK', 'PERSONAL'] as const

// ── Mappers ──────────────────────────────────────────────────────────────────

type ExceptionWithEmployee = Prisma.AttendanceExceptionGetPayload<{
  include: { employee: { select: { name: true; avatarUrl: true; departmentId: true; department: { select: { name: true } } } } }
}>

function mapException(row: ExceptionWithEmployee): AttendanceExceptionRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    employeeAvatar: row.employee.avatarUrl,
    departmentId: row.employee.departmentId,
    departmentName: row.employee.department?.name ?? null,
    type: row.type,
    label: row.label,
    date: row.date.toISOString().slice(0, 10),
    alert: row.alert,
    createdAt: row.createdAt.toISOString(),
  }
}

type LeaveWithEmployee = Prisma.LeaveRequestGetPayload<{
  include: { employee: { select: { name: true; avatarUrl: true; departmentId: true; department: { select: { name: true } } } } }
}>

function mapLeaveRequest(row: LeaveWithEmployee): LeaveRequestRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    employeeAvatar: row.employee.avatarUrl,
    departmentId: row.employee.departmentId,
    departmentName: row.employee.department?.name ?? null,
    type: row.type,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── Attendance ───────────────────────────────────────────────────────────────

/** Summary metrics use SQL counts; punch completion is null until at least one punch was started in range. */
async function computeAttendanceSummary(
  prisma: PrismaClient,
  tenantId: string,
  rangeDays: 7 | 30 | 90,
  rangeStart: Date,
  rangeEndExclusive: Date,
  employeeId?: string,
): Promise<AttendanceSummary> {
  const scope = employeeId ? { employeeId } : {}
  const previousRangeEnd = rangeStart
  const previousRangeStart = new Date(previousRangeEnd)
  previousRangeStart.setUTCDate(previousRangeStart.getUTCDate() - rangeDays)
  const dayRange = (start: Date, end: Date) => ({
    timesheet: { tenantId, ...(employeeId ? { employeeId } : {}) },
    date: { gte: start, lt: end },
    clockIn: { not: null },
  })
  const [exceptionCount, previousPeriodExceptionCount, onLeaveCount, startedPunchDays, completedPunchDays, previousStartedPunchDays, previousCompletedPunchDays, timesheetCount, overtime] = await Promise.all([
    prisma.attendanceException.count({ where: { tenantId, ...scope, date: { gte: rangeStart, lt: rangeEndExclusive } } }),
    prisma.attendanceException.count({ where: { tenantId, ...scope, date: { gte: previousRangeStart, lt: previousRangeEnd } } }),
    prisma.employee.count({ where: { tenantId, status: 'ON_LEAVE', ...scope } }),
    prisma.timesheetDay.count({ where: dayRange(rangeStart, rangeEndExclusive) }),
    prisma.timesheetDay.count({ where: { ...dayRange(rangeStart, rangeEndExclusive), clockOut: { not: null } } }),
    prisma.timesheetDay.count({ where: dayRange(previousRangeStart, previousRangeEnd) }),
    prisma.timesheetDay.count({ where: { ...dayRange(previousRangeStart, previousRangeEnd), clockOut: { not: null } } }),
    prisma.timesheet.count({ where: { tenantId, ...scope } }),
    prisma.timesheet.aggregate({ where: { tenantId, ...scope }, _sum: { overtimeHours: true } }),
  ])

  const rate = (started: number, completed: number) => started === 0 ? null : Math.round((completed / started) * 10_000) / 100
  const attendanceRate = rate(startedPunchDays, completedPunchDays)
  const attendanceRatePreviousPeriod = rate(previousStartedPunchDays, previousCompletedPunchDays)

  return {
    exceptionCount, exceptionCountPreviousPeriod: previousPeriodExceptionCount, onLeaveCount,
    attendanceRate, attendanceRatePreviousPeriod, attendanceRateRangeDays: rangeDays,
    attendanceRateRecordedDays: startedPunchDays, timesheetCount, overtimeHours: overtime._sum.overtimeHours ?? 0,
  }
}

function mapTimesheet(row: Prisma.TimesheetGetPayload<{ include: { employee: { select: { name: true; departmentId: true; department: { select: { name: true } } } }; days: true } }>, approvalEligible: boolean, timezone: string): TimesheetRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    departmentId: row.employee.departmentId,
    departmentName: row.employee.department?.name ?? null,
    weekStart: row.weekStart.toISOString().slice(0, 10),
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    totalHours: row.totalHours,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvalEligible,
    days: row.days.map(day => ({
      id: day.id, dayLabel: day.date?.toISOString().slice(0, 10) ?? day.dayLabel,
      clockInDate: day.clockInAt ? dateInTimezone(day.clockInAt, timezone) : day.date?.toISOString().slice(0, 10) ?? null,
      clockIn: day.clockInAt ? clockTime(day.clockInAt, timezone) : day.clockIn,
      clockOutDate: day.clockOutAt ? dateInTimezone(day.clockOutAt, timezone) : day.date?.toISOString().slice(0, 10) ?? null,
      clockOut: day.clockOutAt ? clockTime(day.clockOutAt, timezone) : day.clockOut,
      totalHours: day.totalHours,
    })),
  }
}

type TimesheetForEligibility = { id: string; employeeId: string; weekStart: Date; approvedAt: Date | null; days: Array<{ clockIn: string | null; clockOut: string | null; totalHours: number | null }> }

async function findApprovalEligibleIds(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  timesheets: TimesheetForEligibility[],
): Promise<Set<string>> {
  const candidates = timesheets.filter(sheet => sheet.approvedAt === null && sheet.days.length > 0
    && sheet.days.every(day => day.clockIn !== null && day.clockOut !== null && day.totalHours !== null))
  if (!candidates.length) return new Set()
  const employeeIds = [...new Set(candidates.map(sheet => sheet.employeeId))]
  const earliest = new Date(Math.min(...candidates.map(sheet => sheet.weekStart.getTime())))
  const latestExclusive = new Date(Math.max(...candidates.map(sheet => sheet.weekStart.getTime())) + 7 * 24 * 60 * 60 * 1000)
  const exceptions = await prisma.attendanceException.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, date: { gte: earliest, lt: latestExclusive }, alert: true },
    select: { employeeId: true, date: true },
  })
  const exceptionWeeks = new Set(exceptions.map(row => `${row.employeeId}:${mondayUtc(row.date).toISOString().slice(0, 10)}`))
  return new Set(candidates.filter(sheet => !exceptionWeeks.has(`${sheet.employeeId}:${sheet.weekStart.toISOString().slice(0, 10)}`)).map(sheet => sheet.id))
}

export async function resolveAttendanceExceptionInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  exceptionId: string,
): Promise<AttendanceExceptionRow> {
  const exception = await tx.attendanceException.findFirst({
    where: { id: exceptionId, tenantId },
    include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
  })
  if (!exception) throw new AppError(404, 'Attendance exception not found')
  if (!exception.alert) throw new AppError(409, 'Attendance exception is already resolved')
  const updated = await tx.attendanceException.updateMany({
    where: { id: exceptionId, tenantId, alert: true },
    data: { alert: false },
  })
  if (!updated.count) throw new AppError(409, 'Attendance exception changed while it was being resolved')
  return mapException({ ...exception, alert: false })
}

function dateAtUtcMidnight(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function mondayUtc(value: Date): Date {
  const day = dateAtUtcMidnight(value)
  const offset = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - offset)
  return day
}

function clockTime(value: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
  } catch {
    throw new AppError(409, 'Workspace timezone is invalid; update it in settings before clocking attendance')
  }
}

function dateInTimezone(value: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
    return `${part('year')}-${part('month')}-${part('day')}`
  } catch {
    throw new AppError(409, 'Workspace timezone is invalid; update it in settings before correcting attendance')
  }
}

/** Convert an explicit tenant-local wall time to one unambiguous instant; DST gaps/folds are rejected. */
function localDateTimeToInstant(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!)
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
  } catch {
    throw new AppError(409, 'Workspace timezone is invalid; update it in settings before correcting attendance')
  }
  const partsAt = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant))
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value)
    return [part('year'), part('month'), part('day'), part('hour'), part('minute')]
  }
  const targetParts = [year, month, day, hour, minute]
  const offsets = new Set<number>()
  for (const deltaHours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = target + deltaHours * 3_600_000
    const [sampleYear, sampleMonth, sampleDay, sampleHour, sampleMinute] = partsAt(sample)
    offsets.add(Date.UTC(sampleYear!, sampleMonth! - 1, sampleDay!, sampleHour!, sampleMinute!) - sample)
  }
  const matches = new Set<number>()
  for (const offset of offsets) {
    const candidate = target - offset
    if (partsAt(candidate).every((value, index) => value === targetParts[index])) matches.add(candidate)
  }
  if (matches.size === 0) throw new AppError(400, 'This local time does not exist because of a daylight-saving clock change')
  if (matches.size > 1) throw new AppError(400, 'This local time occurs twice because of a daylight-saving clock change; choose a different time')
  return new Date([...matches][0]!)
}

export async function correctAttendancePunchInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  dayId: string,
  input: AttendancePunchCorrectionInput,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT sheet."id" FROM "Timesheet" sheet
    JOIN "TimesheetDay" day ON day."timesheetId" = sheet."id"
    WHERE day."id" = ${dayId} AND sheet."tenantId" = ${tenantId}
    FOR UPDATE OF sheet
  `
  if (locked.length === 0) throw new AppError(404, 'Timesheet day not found')
  const day = await tx.timesheetDay.findFirst({
    where: { id: dayId, timesheet: { tenantId } },
    include: { timesheet: { select: { id: true, employeeId: true, approvedAt: true, overtimeThresholdHours: true } } },
  })
  if (!day) throw new AppError(404, 'Timesheet day not found')
  if (day.timesheet.approvedAt) throw new AppError(409, 'Approved timesheets cannot be corrected')
  const sheetDate = day.date?.toISOString().slice(0, 10) ?? day.dayLabel
  if (input.clockInDate !== sheetDate) throw new AppError(400, 'Clock-in date must match the timesheet day')

  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const clockInAt = localDateTimeToInstant(input.clockInDate, input.clockInTime, tenant.timezone)
  const clockOutAt = input.clockOutDate && input.clockOutTime
    ? localDateTimeToInstant(input.clockOutDate, input.clockOutTime, tenant.timezone)
    : null
  if (clockOutAt && clockOutAt <= clockInAt) throw new AppError(400, 'Clock-out time must be after clock-in time')
  const elapsedHours = clockOutAt
    ? Math.round(((clockOutAt.getTime() - clockInAt.getTime()) / 3_600_000) * 100) / 100
    : null

  const updatedDay = await tx.timesheetDay.update({
    where: { id: dayId },
    data: {
      clockIn: input.clockInTime, clockInAt,
      clockOut: clockOutAt ? input.clockOutTime : null, clockOutAt,
      totalHours: elapsedHours,
    },
  })
  const days = await tx.timesheetDay.findMany({ where: { timesheetId: day.timesheetId }, select: { totalHours: true } })
  const hours = days.map(row => row.totalHours ?? 0)
  const totalHours = Math.round(hours.reduce((sum, value) => sum + value, 0) * 100) / 100
  const threshold = day.timesheet.overtimeThresholdHours ?? 8
  const overtimeHours = Math.round(hours.reduce((sum, value) => sum + Math.max(0, value - threshold), 0) * 100) / 100
  await tx.timesheet.update({
    where: { id: day.timesheetId },
    data: { totalHours, overtimeHours, regularHours: Math.round((totalHours - overtimeHours) * 100) / 100 },
  })

  const exceptionDate = day.date ?? new Date(`${input.clockInDate}T00:00:00.000Z`)
  if (elapsedHours != null && elapsedHours > threshold) {
    const existingOvertime = await tx.attendanceException.findFirst({
      where: { tenantId, employeeId: day.timesheet.employeeId, type: 'OVERTIME', date: exceptionDate, alert: true },
      select: { id: true },
    })
    if (existingOvertime) {
      await tx.attendanceException.update({ where: { id: existingOvertime.id }, data: { label: `Overtime: ${(elapsedHours - threshold).toFixed(2)} hours` } })
    } else {
      await tx.attendanceException.create({ data: {
        tenantId, employeeId: day.timesheet.employeeId, type: 'OVERTIME', date: exceptionDate,
        label: `Overtime: ${(elapsedHours - threshold).toFixed(2)} hours`, alert: true,
      } })
    }
  } else if (elapsedHours != null) {
    await tx.attendanceException.updateMany({
      where: { tenantId, employeeId: day.timesheet.employeeId, type: 'OVERTIME', date: exceptionDate, alert: true },
      data: { alert: false },
    })
  }

  return {
    correction: {
      id: updatedDay.id, clockInDate: input.clockInDate, clockInTime: input.clockInTime,
      clockOutDate: clockOutAt ? input.clockOutDate : null, clockOutTime: clockOutAt ? input.clockOutTime : null,
      totalHours: elapsedHours,
    },
    previous: { clockIn: day.clockIn, clockOut: day.clockOut, totalHours: day.totalHours },
  }
}

export async function clockAttendance(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  action: 'IN' | 'OUT',
): Promise<{ employeeId: string; clockIn: string | null; clockOut: string | null }> {
  const [employee, tenant] = await Promise.all([
    prisma.employee.findFirst({ where: { id: employeeId, tenantId, status: 'ACTIVE' }, select: { id: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, overtimeThresholdHours: true } }),
  ])
  if (!employee) throw new AppError(404, 'Active employee record not found for this member')
  if (!tenant) throw new AppError(404, 'Workspace not found')

  const now = new Date()
  const date = tenantToday(tenant.timezone, now)
  const weekStart = mondayUtc(date)
  const localTime = clockTime(now, tenant.timezone)
  return prisma.$transaction(async tx => {
    if (action === 'IN') {
      const sheet = await tx.timesheet.upsert({
        where: { tenantId_employeeId_weekStart: { tenantId, employeeId, weekStart } },
        create: { tenantId, employeeId, weekStart, overtimeThresholdHours: tenant.overtimeThresholdHours ?? 8 }, update: {}, select: { id: true, approvedAt: true },
      })
      if (sheet.approvedAt) throw new AppError(409, 'This timesheet is already approved')
      const day = await tx.timesheetDay.upsert({
        where: { timesheetId_date: { timesheetId: sheet.id, date } },
        create: { timesheetId: sheet.id, date, dayLabel: date.toISOString().slice(0, 10) }, update: {},
      })
      if (day.clockIn) throw new AppError(409, 'You are already clocked in for today')
      if (day.clockInAt && !day.clockOutAt) throw new AppError(409, 'You are already clocked in')
      const updated = await tx.timesheetDay.update({ where: { id: day.id }, data: { clockIn: localTime, clockOut: null, clockInAt: now, clockOutAt: null, totalHours: null } })
      return { employeeId, clockIn: updated.clockIn, clockOut: updated.clockOut }
    }

    let day = await tx.timesheetDay.findFirst({
      where: { timesheet: { tenantId, employeeId }, clockInAt: { not: null }, clockOutAt: null },
      orderBy: { clockInAt: 'desc' }, include: { timesheet: { select: { id: true, approvedAt: true, overtimeThresholdHours: true } } },
    })
    // Old wall-clock punches have no known timezone or instant; only close one on its local date.
    if (!day) {
      const sheet = await tx.timesheet.findUnique({ where: { tenantId_employeeId_weekStart: { tenantId, employeeId, weekStart } }, select: { id: true, approvedAt: true } })
      if (sheet) {
        const legacy = await tx.timesheetDay.findUnique({
          where: { timesheetId_date: { timesheetId: sheet.id, date } },
          include: { timesheet: { select: { id: true, approvedAt: true, overtimeThresholdHours: true } } },
        })
        if (legacy?.clockIn && !legacy.clockOut && !legacy.clockInAt) day = legacy
      }
    }
    if (!day) throw new AppError(409, 'Clock in before clocking out')
    if (day.timesheet.approvedAt) throw new AppError(409, 'This timesheet is already approved')
    const threshold = day.timesheet.overtimeThresholdHours ?? 8
    let elapsedHours: number
    if (day.clockInAt) {
      if (now.getTime() <= day.clockInAt.getTime()) throw new AppError(409, 'Clock-out time must be after clock-in time')
      elapsedHours = Math.round(((now.getTime() - day.clockInAt.getTime()) / 3_600_000) * 100) / 100
    } else {
      const [startHour, startMinute] = (day.clockIn ?? '').split(':').map(Number)
      const [endHour, endMinute] = localTime.split(':').map(Number)
      const elapsedMinutes = endHour! * 60 + endMinute! - (startHour! * 60 + startMinute!)
      if (!Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) throw new AppError(409, 'Legacy punch duration cannot be determined; contact an administrator to correct this timesheet')
      elapsedHours = Math.round((elapsedMinutes / 60) * 100) / 100
    }
    const updated = await tx.timesheetDay.update({ where: { id: day.id }, data: { clockOut: localTime, ...(day.clockInAt ? { clockOutAt: now } : {}), totalHours: elapsedHours } })
    const recordedDays = await tx.timesheetDay.findMany({ where: { timesheetId: day.timesheetId }, select: { totalHours: true } })
    const dailyHours = recordedDays.map(row => row.totalHours ?? 0)
    const totalHours = Math.round(dailyHours.reduce((sum, hours) => sum + hours, 0) * 100) / 100
    const overtimeHours = Math.round(dailyHours.reduce((sum, hours) => sum + Math.max(0, hours - threshold), 0) * 100) / 100
    const regularHours = Math.round((totalHours - overtimeHours) * 100) / 100
    await tx.timesheet.update({ where: { id: day.timesheetId }, data: { totalHours, regularHours, overtimeHours } })
    if (elapsedHours > threshold) {
      await tx.attendanceException.create({ data: {
        tenantId, employeeId, type: 'OVERTIME', label: `Overtime: ${(elapsedHours - threshold).toFixed(2)} hours`,
        date: day.date ?? date, alert: true,
      } })
    }
    return { employeeId, clockIn: updated.clockIn, clockOut: updated.clockOut }
  }, { isolationLevel: 'Serializable' })
}

export async function approveTimesheet(
  prisma: PrismaClient,
  tenantId: string,
  timesheetId: string,
): Promise<{ id: string; approvedAt: string }> {
  const result = await prisma.$transaction(
    tx => approveTimesheetsInTransaction(tx, tenantId, [timesheetId]),
    { isolationLevel: 'Serializable' },
  )
  return { id: timesheetId, approvedAt: result.approvedAt }
}

export async function approveTimesheetsInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ids: string[],
): Promise<{ ids: string[]; approvedAt: string }> {
  const approvedAt = new Date()
  const sheets = await tx.timesheet.findMany({
    where: { id: { in: ids }, tenantId },
    include: { days: { select: { clockIn: true, clockOut: true, totalHours: true } } },
  })
  if (sheets.length !== ids.length) throw new AppError(404, 'One or more timesheets were not found in this workspace')
  const eligibleIds = await findApprovalEligibleIds(tx, tenantId, sheets)
  if (eligibleIds.size !== ids.length) throw new AppError(409, 'Every selected timesheet must be complete and have no attendance exceptions')
  const result = await tx.timesheet.updateMany({
    where: { id: { in: ids }, tenantId, approvedAt: null },
    data: { approvedAt },
  })
  if (result.count !== ids.length) throw new AppError(409, 'One or more timesheets changed while approving the batch')
  return { ids, approvedAt: approvedAt.toISOString() }
}

export async function approveValidTimesheets(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[],
): Promise<{ ids: string[]; approvedAt: string }> {
  return prisma.$transaction(
    tx => approveTimesheetsInTransaction(tx, tenantId, ids),
    { isolationLevel: 'Serializable' },
  )
}

export async function listAttendance(
  prisma: PrismaClient,
  tenantId: string,
  selfEmployeeId: string | null = null,
  rangeDays: 7 | 30 | 90 = 30,
  includeWorkspace: boolean = true,
): Promise<AttendanceResponse> {
  const employeeScope = includeWorkspace ? {} : { employeeId: selfEmployeeId ?? '__unlinked_employee__' }
  const [exceptions, leaveRequests, timesheets, tenant] = await Promise.all([
    prisma.attendanceException.findMany({
      where: { tenantId, ...employeeScope },
      orderBy: { date: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId, ...employeeScope },
      orderBy: { startDate: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
    }),
    prisma.timesheet.findMany({
      where: { tenantId, ...(includeWorkspace ? {} : { employeeId: selfEmployeeId ?? '__unlinked_employee__' }) },
      orderBy: { weekStart: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, departmentId: true, department: { select: { name: true } } } }, days: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }),
  ])
  const timezone = tenant?.timezone ?? 'UTC'
  const localToday = tenantToday(timezone)
  const rangeStart = new Date(localToday)
  rangeStart.setUTCDate(rangeStart.getUTCDate() - rangeDays + 1)
  const rangeEndExclusive = new Date(localToday)
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1)
  const summary = await computeAttendanceSummary(
    prisma, tenantId, rangeDays, rangeStart, rangeEndExclusive,
    includeWorkspace ? undefined : selfEmployeeId ?? '__unlinked_employee__',
  )
  const approvalEligibleIds = await findApprovalEligibleIds(prisma, tenantId, timesheets)

  let selfClock: AttendanceResponse['selfClock'] = null
  if (selfEmployeeId) {
    const employee = await prisma.employee.findFirst({ where: { id: selfEmployeeId, tenantId, status: 'ACTIVE' }, select: { id: true } })
    if (employee) {
      const now = new Date()
      const date = tenantToday(timezone, now)
      const openPunch = await prisma.timesheetDay.findFirst({
        where: { timesheet: { tenantId, employeeId: selfEmployeeId }, clockInAt: { not: null }, clockOutAt: null },
        orderBy: { clockInAt: 'desc' }, select: { clockIn: true, clockOut: true, clockInAt: true, clockOutAt: true },
      })
      if (openPunch) {
        selfClock = {
          employeeId: selfEmployeeId,
          clockIn: openPunch.clockInAt ? clockTime(openPunch.clockInAt, timezone) : openPunch.clockIn,
          clockOut: openPunch.clockOutAt ? clockTime(openPunch.clockOutAt, timezone) : openPunch.clockOut,
        }
      }
      const sheet = await prisma.timesheet.findUnique({
        where: { tenantId_employeeId_weekStart: { tenantId, employeeId: selfEmployeeId, weekStart: mondayUtc(date) } },
        select: { id: true },
      })
      if (!openPunch && sheet) {
        const day = await prisma.timesheetDay.findUnique({
          where: { timesheetId_date: { timesheetId: sheet.id, date } },
          select: { clockIn: true, clockOut: true, clockInAt: true, clockOutAt: true },
        })
        selfClock = {
          employeeId: selfEmployeeId,
          clockIn: day?.clockInAt ? clockTime(day.clockInAt, timezone) : day?.clockIn ?? null,
          clockOut: day?.clockOutAt ? clockTime(day.clockOutAt, timezone) : day?.clockOut ?? null,
        }
      } else if (!openPunch && !sheet) selfClock = { employeeId: selfEmployeeId, clockIn: null, clockOut: null }
    }
  }

  return {
    exceptions: exceptions.map(mapException),
    leaveRequests: leaveRequests.map(mapLeaveRequest),
    timesheets: timesheets.map(sheet => mapTimesheet(sheet, approvalEligibleIds.has(sheet.id), timezone)),
    summary,
    selfClock,
  }
}

// ── Leave requests ───────────────────────────────────────────────────────────

export async function listLeaveRequests(
  prisma: PrismaClient,
  tenantId: string,
  employeeId?: string,
): Promise<{ items: LeaveRequestRow[] }> {
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: { tenantId, ...(employeeId ? { employeeId } : {}) },
    orderBy: { startDate: 'desc' },
    include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
  })
  return { items: leaveRequests.map(mapLeaveRequest) }
}

export async function listLeavePolicies(prisma: PrismaClient, tenantId: string): Promise<{ items: LeavePolicy[] }> {
  const rows = await prisma.leavePolicy.findMany({ where: { tenantId }, orderBy: { type: 'asc' } })
  return { items: rows.map(({ type, annualAllowanceDays, weekdaysOnly }) => ({ type, annualAllowanceDays, weekdaysOnly })) }
}

export async function upsertLeavePolicy(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  type: LeavePolicy['type'],
  input: LeavePolicyWriteInput,
): Promise<LeavePolicy> {
  const row = await prisma.leavePolicy.upsert({
    where: { tenantId_type: { tenantId, type } },
    create: { tenantId, type, annualAllowanceDays: input.annualAllowanceDays, weekdaysOnly: input.weekdaysOnly },
    update: { annualAllowanceDays: input.annualAllowanceDays, weekdaysOnly: input.weekdaysOnly },
  })
  return { type: row.type, annualAllowanceDays: row.annualAllowanceDays, weekdaysOnly: row.weekdaysOnly }
}

type LeaveUsageRow = { employeeId: string; type: LeavePolicy['type']; status: 'PENDING' | 'APPROVED'; days: bigint }

/** Current calendar-year balance, counting pending requests as reserved days. Unconfigured policies have null remaining days. */
export async function getLeaveBalances(
  prisma: PrismaClient,
  tenantId: string,
  query: LeaveBalanceQuery,
  employeeId?: string,
): Promise<LeaveBalanceResponse> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const year = query.year ?? tenantToday(tenant.timezone).getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
  const [employees, policies, usage] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId, status: { not: 'ARCHIVED' }, ...(employeeId ? { id: employeeId } : {}) },
      orderBy: { name: 'asc' }, select: { id: true, name: true, departmentId: true },
    }),
    prisma.leavePolicy.findMany({ where: { tenantId } }),
    prisma.$queryRaw<LeaveUsageRow[]>`
      SELECT lr."employeeId", lr."type", lr."status",
        COUNT(*) FILTER (WHERE COALESCE(lp."weekdaysOnly", FALSE) = FALSE OR EXTRACT(ISODOW FROM dates."day") <= 5)::bigint AS days
      FROM "LeaveRequest" lr
      LEFT JOIN "LeavePolicy" lp ON lp."tenantId" = lr."tenantId" AND lp."type" = lr."type"
      CROSS JOIN LATERAL generate_series(
        GREATEST((lr."startDate" AT TIME ZONE 'UTC')::date, ${yearStart}::date)::timestamp,
        LEAST((COALESCE(lr."endDate", lr."startDate") AT TIME ZONE 'UTC')::date, ${yearEnd}::date - 1)::timestamp,
        INTERVAL '1 day'
      ) AS dates("day")
      WHERE lr."tenantId" = ${tenantId}
        AND (${employeeId ?? null}::text IS NULL OR lr."employeeId" = ${employeeId ?? null})
        AND lr."status" IN ('PENDING'::"LeaveRequestStatus", 'APPROVED'::"LeaveRequestStatus")
        AND lr."startDate" < ${yearEnd}
        AND COALESCE(lr."endDate", lr."startDate") >= ${yearStart}
      GROUP BY lr."employeeId", lr."type", lr."status"
    `,
  ])
  const policyByType = new Map(policies.map(policy => [policy.type, policy]))
  const usageByKey = new Map(usage.map(row => [`${row.employeeId}:${row.type}:${row.status}`, Number(row.days)]))
  return {
    year,
    items: employees.flatMap(employee => LEAVE_TYPES.map(type => {
      const policy = policyByType.get(type)
      const approvedDays = usageByKey.get(`${employee.id}:${type}:APPROVED`) ?? 0
      const pendingDays = usageByKey.get(`${employee.id}:${type}:PENDING`) ?? 0
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        departmentId: employee.departmentId,
        type,
        annualAllowanceDays: policy?.annualAllowanceDays ?? null,
        approvedDays,
        pendingDays,
        remainingDays: policy ? policy.annualAllowanceDays - approvedDays - pendingDays : null,
        weekdaysOnly: policy?.weekdaysOnly ?? null,
      }
    })),
  }
}

async function assertNoLeaveOverlap(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<void> {
  const overlap = await tx.leaveRequest.findFirst({
    where: {
      tenantId, employeeId, status: { in: ['PENDING', 'APPROVED'] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      OR: [
        { endDate: { gte: startDate } },
        { endDate: null, startDate: { gte: startDate } },
      ],
    },
    select: { id: true },
  })
  if (overlap) throw new AppError(409, 'This employee already has a pending or approved leave request for overlapping dates')
}

function countLeaveDays(start: Date, end: Date, weekdaysOnly: boolean): number {
  let count = 0
  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay()
    if (!weekdaysOnly || (weekday !== 0 && weekday !== 6)) count++
  }
  return count
}

async function assertLeaveAllowance(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  type: LeavePolicy['type'],
  startDate: Date,
  endDate: Date,
  additionalReservation: boolean,
  excludeRequestId?: string,
): Promise<void> {
  const firstYear = startDate.getUTCFullYear()
  const lastYear = endDate.getUTCFullYear()
  for (let year = firstYear; year <= lastYear; year++) {
    const policy = await tx.leavePolicy.findUnique({ where: { tenantId_type: { tenantId, type } } })
    if (!policy) continue
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
    const usage = await tx.$queryRaw<Array<{ days: bigint }>>`
      SELECT COALESCE(SUM(CASE WHEN NOT ${policy.weekdaysOnly} OR EXTRACT(ISODOW FROM dates."day") <= 5 THEN 1 ELSE 0 END), 0)::bigint AS days
      FROM "LeaveRequest" lr
      CROSS JOIN LATERAL generate_series(
        GREATEST((lr."startDate" AT TIME ZONE 'UTC')::date, ${yearStart}::date)::timestamp,
        LEAST((COALESCE(lr."endDate", lr."startDate") AT TIME ZONE 'UTC')::date, ${yearEnd}::date - 1)::timestamp,
        INTERVAL '1 day'
      ) AS dates("day")
      WHERE lr."tenantId" = ${tenantId} AND lr."employeeId" = ${employeeId} AND lr."type" = ${type}::"LeaveType"
        AND lr."status" IN ('PENDING'::"LeaveRequestStatus", 'APPROVED'::"LeaveRequestStatus")
        AND lr."startDate" < ${yearEnd} AND COALESCE(lr."endDate", lr."startDate") >= ${yearStart}
        AND (${excludeRequestId ?? null}::text IS NULL OR lr."id" <> ${excludeRequestId ?? null})
    `
    const usedDays = Number(usage[0]?.days ?? 0n)
    const requestedStart = startDate > yearStart ? startDate : yearStart
    const requestedEnd = endDate < new Date(yearEnd.getTime() - 1) ? endDate : new Date(yearEnd.getTime() - 1)
    const requestedDays = additionalReservation ? countLeaveDays(requestedStart, requestedEnd, policy.weekdaysOnly) : 0
    if (usedDays + requestedDays > policy.annualAllowanceDays) {
      throw new AppError(409, `The ${type.toLowerCase()} leave allowance for ${year} would be exceeded`)
    }
  }
}

export async function createLeaveRequestInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  input: Omit<LeaveRequestWriteInput, 'employeeId'>,
): Promise<LeaveRequestRow> {
  const employee = await tx.employee.findFirst({ where: { id: employeeId, tenantId, status: 'ACTIVE' }, select: { id: true } })
  if (!employee) throw new AppError(404, 'Active employee not found in this workspace')
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`)
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null
  const effectiveEndDate = endDate ?? startDate
  await assertNoLeaveOverlap(tx, tenantId, employeeId, startDate, effectiveEndDate)
  await assertLeaveAllowance(tx, tenantId, employeeId, input.type, startDate, effectiveEndDate, true)
  const leaveRequest = await tx.leaveRequest.create({
    data: { tenantId, employeeId, type: input.type, startDate, endDate, status: 'PENDING' },
    include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
  })
  return mapLeaveRequest(leaveRequest)
}

export async function createLeaveRequest(
  prisma: PrismaClient,
  tenantId: string,
  input: LeaveRequestWriteInput,
): Promise<LeaveRequestRow> {
  return prisma.$transaction(
    tx => createLeaveRequestInTransaction(tx, tenantId, input.employeeId, input),
    { isolationLevel: 'Serializable' },
  )
}

export async function createSelfLeaveRequest(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  input: SelfLeaveRequestWriteInput,
): Promise<LeaveRequestRow> {
  return prisma.$transaction(
    tx => createLeaveRequestInTransaction(tx, tenantId, employeeId, input),
    { isolationLevel: 'Serializable' },
  )
}

export async function decideLeaveRequestInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requestId: string,
  decision: 'APPROVED' | 'REJECTED',
): Promise<LeaveRequestRow> {
  const request = await tx.leaveRequest.findFirst({
    where: { id: requestId, tenantId },
    include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, status: true, department: { select: { name: true } } } } },
  })
  if (!request) throw new AppError(404, 'Leave request not found')
  if (request.status !== 'PENDING') throw new AppError(409, 'Only pending leave requests can be reviewed')
  if (request.employee.status === 'ARCHIVED') throw new AppError(409, 'Archived employees cannot have leave requests approved')

  if (decision === 'APPROVED') {
    await assertNoLeaveOverlap(tx, tenantId, request.employeeId, request.startDate, request.endDate ?? request.startDate, request.id)
    await assertLeaveAllowance(tx, tenantId, request.employeeId, request.type, request.startDate, request.endDate ?? request.startDate, false)
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
    if (!tenant) throw new AppError(404, 'Workspace not found')
    const today = tenantToday(tenant.timezone)
    const start = new Date(request.startDate.toISOString().slice(0, 10) + 'T00:00:00.000Z')
    const end = request.endDate
      ? new Date(request.endDate.toISOString().slice(0, 10) + 'T00:00:00.000Z')
      : start
    if (start <= today && end >= today) {
      await tx.employee.updateMany({ where: { id: request.employeeId, tenantId, status: 'ACTIVE' }, data: { status: 'ON_LEAVE' } })
    }
  }

  const updated = await tx.leaveRequest.updateMany({
    where: { id: requestId, tenantId, status: 'PENDING' }, data: { status: decision },
  })
  if (!updated.count) throw new AppError(409, 'Leave request changed while it was being reviewed')
  return mapLeaveRequest({ ...request, status: decision, updatedAt: new Date() })
}

/** Apply date-effective approved leave transitions; safe to run at startup and on a timer. */
export async function syncApprovedLeaveEmployeeStatuses(prisma: PrismaClient): Promise<{ started: number; ended: number }> {
  return prisma.$transaction(async tx => {
    const started = await tx.$queryRaw<Array<{ id: string; tenantId: string }>>`
      WITH changed AS (
        UPDATE "Employee" e
        SET "status" = 'ON_LEAVE'::"EmployeeStatus", "updatedAt" = CURRENT_TIMESTAMP
        FROM "Tenant" t
        WHERE e."tenantId" = t."id" AND e."status" = 'ACTIVE'::"EmployeeStatus"
          AND EXISTS (
            SELECT 1 FROM "LeaveRequest" lr
            WHERE lr."tenantId" = e."tenantId" AND lr."employeeId" = e."id" AND lr."status" = 'APPROVED'::"LeaveRequestStatus"
              AND (lr."startDate" AT TIME ZONE 'UTC')::date <= (CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date
              AND COALESCE((lr."endDate" AT TIME ZONE 'UTC')::date, (lr."startDate" AT TIME ZONE 'UTC')::date)
                >= (CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date
          )
        RETURNING e."id", e."tenantId"
      ) SELECT "id", "tenantId" FROM changed
    `
    const ended = await tx.$queryRaw<Array<{ id: string; tenantId: string }>>`
      WITH changed AS (
        UPDATE "Employee" e
        SET "status" = 'ACTIVE'::"EmployeeStatus", "updatedAt" = CURRENT_TIMESTAMP
        WHERE e."status" = 'ON_LEAVE'::"EmployeeStatus"
          AND EXISTS (
            SELECT 1 FROM "LeaveRequest" lr
            WHERE lr."tenantId" = e."tenantId" AND lr."employeeId" = e."id" AND lr."status" = 'APPROVED'::"LeaveRequestStatus"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "LeaveRequest" lr
            JOIN "Tenant" t ON t."id" = lr."tenantId"
            WHERE lr."tenantId" = e."tenantId" AND lr."employeeId" = e."id" AND lr."status" = 'APPROVED'::"LeaveRequestStatus"
              AND (lr."startDate" AT TIME ZONE 'UTC')::date <= (CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date
              AND COALESCE((lr."endDate" AT TIME ZONE 'UTC')::date, (lr."startDate" AT TIME ZONE 'UTC')::date)
                >= (CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date
          )
        RETURNING e."id", e."tenantId"
      ) SELECT "id", "tenantId" FROM changed
    `
    const auditRows = [
      ...started.map(row => ({ row, action: 'hr.leave.employee.on_leave' })),
      ...ended.map(row => ({ row, action: 'hr.leave.employee.active' })),
    ]
    if (auditRows.length) {
      await tx.auditLog.createMany({ data: auditRows.map(({ row, action }) => ({
        tenantId: row.tenantId, actorId: null, action, targetType: 'Employee', targetId: row.id,
        metadata: JSON.stringify({ source: 'approved_leave_schedule' }),
      })) })
    }
    return { started: started.length, ended: ended.length }
  })
}
