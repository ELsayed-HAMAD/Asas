/**
 * HR / Attendance contract — the wire shape for the attendance + leave-request surface.
 *
 * The key fix from the rebuild plan (Phase 2): the legacy `listAttendance` *derived* exceptions
 * from `new Date('2000-01-01 ' + day.clockIn)` and emitted `'late'`/`'early_out'` — neither of
 * which exists in the `AttendanceExceptionType` enum (`MISSING_IN|MISSING_OUT|OVERTIME`). This
 * contract reads the real `AttendanceException` table instead, and the attendance rate is a SQL
 * aggregate computed server-side, never a client-side division on a broken `late` flag.
 */
import { z } from 'zod'
import {
  attendanceExceptionTypeSchema,
  leaveTypeSchema,
  leaveRequestStatusSchema,
} from '../enums.generated.js'
import { idSchema, isoDateSchema, isoDateTimeSchema, shortTextSchema, boundedText } from '../primitives/ids.js'

// ── Attendance exceptions (real rows, not derived) ──────────────────────────

export const attendanceExceptionSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  employeeName: z.string(),
  employeeAvatar: z.string().nullable(),
  departmentId: idSchema.nullable(),
  departmentName: z.string().nullable(),
  type: attendanceExceptionTypeSchema,
  label: z.string(),
  date: isoDateSchema,
  alert: z.boolean(),
  createdAt: isoDateTimeSchema,
})
export type AttendanceExceptionRow = z.infer<typeof attendanceExceptionSchema>

// ── Leave requests ────────────────────────────────────────────────────────────

export const leaveRequestSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  employeeName: z.string(),
  employeeAvatar: z.string().nullable(),
  departmentId: idSchema.nullable(),
  departmentName: z.string().nullable(),
  type: leaveTypeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  status: leaveRequestStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type LeaveRequestRow = z.infer<typeof leaveRequestSchema>

export const timesheetDaySchema = z.object({
  id: idSchema,
  dayLabel: z.string(),
  clockIn: z.string().nullable(),
  clockOut: z.string().nullable(),
  totalHours: z.number().nullable(),
})

export const timesheetSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  employeeName: z.string(),
  departmentId: idSchema.nullable(),
  departmentName: z.string().nullable(),
  weekStart: isoDateSchema,
  regularHours: z.number(),
  overtimeHours: z.number(),
  totalHours: z.number(),
  approvedAt: isoDateTimeSchema.nullable(),
  approvalEligible: z.boolean(),
  days: z.array(timesheetDaySchema),
})
export type TimesheetRow = z.infer<typeof timesheetSchema>

export const timesheetApprovalResponseSchema = z.object({ id: idSchema, approvedAt: isoDateTimeSchema })
export const timesheetBatchApprovalSchema = z.object({
  ids: z.array(idSchema).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Timesheet IDs must be unique'),
})
export const timesheetBatchApprovalResponseSchema = z.object({ ids: z.array(idSchema), approvedAt: isoDateTimeSchema })

export const leaveRequestWriteSchema = z.object({
  employeeId: idSchema,
  type: leaveTypeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional().nullable(),
})
export type LeaveRequestWriteInput = z.infer<typeof leaveRequestWriteSchema>

// ── Attendance summary (server-computed rate) ────────────────────────────────

export const attendanceSummarySchema = z.object({
  /** Total attendance exceptions across the tenant (SQL count). */
  exceptionCount: z.int().min(0),
  /** Employees currently on leave (SQL count of `Employee.status === 'ON_LEAVE'`). */
  onLeaveCount: z.int().min(0),
  /**
   * Attendance rate as a percentage (0–100), computed server-side:
   * `100 * (1 - exceptionCount / totalExpectedDays)`.
   *
   * `null` when there is no timesheet data to compute from (a new tenant, or one that has not
   * logged any timesheets yet). The UI shows "—" in that case, not "0%" or "NaN%".
   */
  attendanceRate: z.number().min(0).max(100).nullable(),
  timesheetCount: z.int().min(0),
  overtimeHours: z.number().min(0),
})
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>

// ── Full attendance response ─────────────────────────────────────────────────

export const attendanceResponseSchema = z.object({
  exceptions: z.array(attendanceExceptionSchema),
  leaveRequests: z.array(leaveRequestSchema),
  timesheets: z.array(timesheetSchema),
  summary: attendanceSummarySchema,
  selfClock: z.object({
    employeeId: idSchema,
    clockIn: z.string().nullable(),
    clockOut: z.string().nullable(),
  }).nullable(),
})
export type AttendanceResponse = z.infer<typeof attendanceResponseSchema>

export const attendanceClockResponseSchema = attendanceResponseSchema.shape.selfClock.unwrap()

export const leaveRequestListResponseSchema = z.object({
  items: z.array(leaveRequestSchema),
})
export type LeaveRequestListResponse = z.infer<typeof leaveRequestListResponseSchema>
