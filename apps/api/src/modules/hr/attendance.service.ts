/**
 * HR attendance service — reads real `AttendanceException` rows (not derived from timesheet
 * clock-in strings), computes the attendance rate as a SQL aggregate, and manages leave
 * requests.
 *
 * This is the fix the rebuild plan (Phase 2) called for: the legacy `listAttendance` derived
 * exceptions with `new Date('2000-01-01 ' + day.clockIn)` and emitted `'late'`/`'early_out'` —
 * neither of which exists in the `AttendanceExceptionType` enum (`MISSING_IN|MISSING_OUT|
 * OVERTIME`). Here, `AttendanceException` rows are read directly from the table, and the
 * attendance rate is `100 * (1 - exceptions / expectedDays)` computed from SQL counts.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  AttendanceExceptionRow,
  AttendanceResponse,
  AttendanceSummary,
  LeaveRequestRow,
  LeaveRequestWriteInput,
  TimesheetRow,
} from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

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

/**
 * The attendance rate as a percentage (0–100), computed from SQL counts:
 *
 *   rate = 100 * (1 - exceptionCount / totalTimesheetDays)
 *
 * `null` when there are no timesheet days to compute from — a new tenant, or one that has not
 * logged any timesheets yet. The UI shows "—" in that case, not "0%" or "NaN%".
 */
async function computeAttendanceSummary(
  prisma: PrismaClient,
  tenantId: string,
): Promise<AttendanceSummary> {
  const [exceptionCount, onLeaveCount, timesheetDayCount, timesheetCount, overtime] = await Promise.all([
    prisma.attendanceException.count({ where: { tenantId } }),
    prisma.employee.count({ where: { tenantId, status: 'ON_LEAVE' } }),
    prisma.timesheetDay.count({
      where: { timesheet: { tenantId } },
    }),
    prisma.timesheet.count({ where: { tenantId } }),
    prisma.timesheet.aggregate({ where: { tenantId }, _sum: { overtimeHours: true } }),
  ])

  const attendanceRate =
    timesheetDayCount === 0
      ? null
      : Math.round((100 * (1 - exceptionCount / timesheetDayCount)) * 100) / 100

  return { exceptionCount, onLeaveCount, attendanceRate, timesheetCount, overtimeHours: overtime._sum.overtimeHours ?? 0 }
}

function mapTimesheet(row: Prisma.TimesheetGetPayload<{ include: { employee: { select: { name: true; departmentId: true; department: { select: { name: true } } } }; days: true } }>, approvalEligible: boolean): TimesheetRow {
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
    days: row.days.map(day => ({ id: day.id, dayLabel: day.date?.toISOString().slice(0, 10) ?? day.dayLabel, clockIn: day.clockIn, clockOut: day.clockOut, totalHours: day.totalHours })),
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
    where: { tenantId, employeeId: { in: employeeIds }, date: { gte: earliest, lt: latestExclusive } },
    select: { employeeId: true, date: true },
  })
  const exceptionWeeks = new Set(exceptions.map(row => `${row.employeeId}:${mondayUtc(row.date).toISOString().slice(0, 10)}`))
  return new Set(candidates.filter(sheet => !exceptionWeeks.has(`${sheet.employeeId}:${sheet.weekStart.toISOString().slice(0, 10)}`)).map(sheet => sheet.id))
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

function clockTime(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`
}

export async function clockAttendance(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  action: 'IN' | 'OUT',
): Promise<{ employeeId: string; clockIn: string | null; clockOut: string | null }> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId, status: 'ACTIVE' }, select: { id: true } })
  if (!employee) throw new AppError(404, 'Active employee record not found for this member')

  const now = new Date()
  const date = dateAtUtcMidnight(now)
  const weekStart = mondayUtc(now)
  return prisma.$transaction(async tx => {
    const sheet = await tx.timesheet.upsert({
      where: { tenantId_employeeId_weekStart: { tenantId, employeeId, weekStart } },
      create: { tenantId, employeeId, weekStart },
      update: {},
      select: { id: true },
    })
    let day = await tx.timesheetDay.upsert({
      where: { timesheetId_date: { timesheetId: sheet.id, date } },
      create: { timesheetId: sheet.id, date, dayLabel: date.toISOString().slice(0, 10) },
      update: {},
    })

    if (action === 'IN') {
      if (day.clockIn) throw new AppError(409, 'You are already clocked in for today')
      day = await tx.timesheetDay.update({ where: { id: day.id }, data: { clockIn: clockTime(now), clockOut: null, totalHours: null } })
    } else {
      if (!day.clockIn) throw new AppError(409, 'Clock in before clocking out')
      if (day.clockOut) throw new AppError(409, 'You are already clocked out for today')
      const [hoursText = '0', minutesText = '0'] = day.clockIn.split(':')
      const hours = Number(hoursText)
      const minutes = Number(minutesText)
      const clockInAt = new Date(date.getTime() + (hours * 60 + minutes) * 60_000)
      const elapsedHours = Math.max(0, Math.round(((now.getTime() - clockInAt.getTime()) / 3_600_000) * 100) / 100)
      day = await tx.timesheetDay.update({ where: { id: day.id }, data: { clockOut: clockTime(now), totalHours: elapsedHours } })
      const recordedDays = await tx.timesheetDay.findMany({ where: { timesheetId: sheet.id }, select: { totalHours: true } })
      const totalHours = recordedDays.reduce((sum, row) => sum + (row.totalHours ?? 0), 0)
      await tx.timesheet.update({ where: { id: sheet.id }, data: { totalHours } })
    }

    return { employeeId, clockIn: day.clockIn, clockOut: day.clockOut }
  }, { isolationLevel: 'Serializable' })
}

export async function approveTimesheet(
  prisma: PrismaClient,
  tenantId: string,
  timesheetId: string,
): Promise<{ id: string; approvedAt: string }> {
  const approvedAt = new Date()
  const result = await prisma.timesheet.updateMany({
    where: { id: timesheetId, tenantId },
    data: { approvedAt },
  })
  if (!result.count) throw new AppError(404, 'Timesheet not found')
  return { id: timesheetId, approvedAt: approvedAt.toISOString() }
}

export async function approveValidTimesheets(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[],
): Promise<{ ids: string[]; approvedAt: string }> {
  const approvedAt = new Date()
  await prisma.$transaction(async tx => {
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
  }, { isolationLevel: 'Serializable' })
  return { ids, approvedAt: approvedAt.toISOString() }
}

export async function listAttendance(
  prisma: PrismaClient,
  tenantId: string,
  selfEmployeeId: string | null = null,
): Promise<AttendanceResponse> {
  const [exceptions, leaveRequests, timesheets, summary] = await Promise.all([
    prisma.attendanceException.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
    }),
    prisma.timesheet.findMany({
      where: { tenantId },
      orderBy: { weekStart: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, departmentId: true, department: { select: { name: true } } } }, days: true },
    }),
    computeAttendanceSummary(prisma, tenantId),
  ])
  const approvalEligibleIds = await findApprovalEligibleIds(prisma, tenantId, timesheets)

  let selfClock: AttendanceResponse['selfClock'] = null
  if (selfEmployeeId) {
    const employee = await prisma.employee.findFirst({ where: { id: selfEmployeeId, tenantId, status: 'ACTIVE' }, select: { id: true } })
    if (employee) {
      const now = new Date()
      const sheet = await prisma.timesheet.findUnique({
        where: { tenantId_employeeId_weekStart: { tenantId, employeeId: selfEmployeeId, weekStart: mondayUtc(now) } },
        select: { id: true },
      })
      if (sheet) {
        const day = await prisma.timesheetDay.findUnique({
          where: { timesheetId_date: { timesheetId: sheet.id, date: dateAtUtcMidnight(now) } },
          select: { clockIn: true, clockOut: true },
        })
        selfClock = { employeeId: selfEmployeeId, clockIn: day?.clockIn ?? null, clockOut: day?.clockOut ?? null }
      } else selfClock = { employeeId: selfEmployeeId, clockIn: null, clockOut: null }
    }
  }

  return {
    exceptions: exceptions.map(mapException),
    leaveRequests: leaveRequests.map(mapLeaveRequest),
    timesheets: timesheets.map(sheet => mapTimesheet(sheet, approvalEligibleIds.has(sheet.id))),
    summary,
    selfClock,
  }
}

// ── Leave requests ───────────────────────────────────────────────────────────

export async function listLeaveRequests(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ items: LeaveRequestRow[] }> {
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: { tenantId },
    orderBy: { startDate: 'desc' },
    include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
  })
  return { items: leaveRequests.map(mapLeaveRequest) }
}

export async function createLeaveRequest(
  prisma: PrismaClient,
  tenantId: string,
  input: LeaveRequestWriteInput,
): Promise<LeaveRequestRow> {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId } })
  if (!employee) throw new AppError(404, 'Employee not found')

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      tenantId,
      employeeId: input.employeeId,
      type: input.type,
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
      status: 'PENDING',
    },
    include: { employee: { select: { name: true, avatarUrl: true, departmentId: true, department: { select: { name: true } } } } },
  })
  return mapLeaveRequest(leaveRequest)
}
