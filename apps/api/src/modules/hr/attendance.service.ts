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
} from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

// ── Mappers ──────────────────────────────────────────────────────────────────

type ExceptionWithEmployee = Prisma.AttendanceExceptionGetPayload<{
  include: { employee: { select: { name: true; avatarUrl: true } } }
}>

function mapException(row: ExceptionWithEmployee): AttendanceExceptionRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    employeeAvatar: row.employee.avatarUrl,
    type: row.type,
    label: row.label,
    date: row.date.toISOString().slice(0, 10),
    alert: row.alert,
    createdAt: row.createdAt.toISOString(),
  }
}

type LeaveWithEmployee = Prisma.LeaveRequestGetPayload<{
  include: { employee: { select: { name: true; avatarUrl: true } } }
}>

function mapLeaveRequest(row: LeaveWithEmployee): LeaveRequestRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    employeeAvatar: row.employee.avatarUrl,
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
  const [exceptionCount, onLeaveCount, timesheetDayCount] = await Promise.all([
    prisma.attendanceException.count({ where: { tenantId } }),
    prisma.employee.count({ where: { tenantId, status: 'ON_LEAVE' } }),
    prisma.timesheetDay.count({
      where: { timesheet: { tenantId } },
    }),
  ])

  const attendanceRate =
    timesheetDayCount === 0
      ? null
      : Math.round((100 * (1 - exceptionCount / timesheetDayCount)) * 100) / 100

  return { exceptionCount, onLeaveCount, attendanceRate }
}

export async function listAttendance(
  prisma: PrismaClient,
  tenantId: string,
): Promise<AttendanceResponse> {
  const [exceptions, leaveRequests, summary] = await Promise.all([
    prisma.attendanceException.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, avatarUrl: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
      take: 100,
      include: { employee: { select: { name: true, avatarUrl: true } } },
    }),
    computeAttendanceSummary(prisma, tenantId),
  ])

  return {
    exceptions: exceptions.map(mapException),
    leaveRequests: leaveRequests.map(mapLeaveRequest),
    summary,
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
    include: { employee: { select: { name: true, avatarUrl: true } } },
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
    include: { employee: { select: { name: true, avatarUrl: true } } },
  })
  return mapLeaveRequest(leaveRequest)
}
