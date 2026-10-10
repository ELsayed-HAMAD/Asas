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
  clockInDate: isoDateSchema.nullable(),
  clockIn: z.string().nullable(),
  clockOutDate: isoDateSchema.nullable(),
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

const localClockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM time')
export const attendancePunchCorrectionSchema = z.object({
  clockInDate: isoDateSchema,
  clockInTime: localClockTimeSchema,
  clockOutDate: isoDateSchema.nullable(),
  clockOutTime: localClockTimeSchema.nullable(),
}).superRefine((value, context) => {
  if ((value.clockOutDate === null) !== (value.clockOutTime === null)) {
    context.addIssue({ code: 'custom', path: ['clockOutTime'], message: 'Provide both an out date and time, or leave both empty' })
  }
  if (value.clockOutDate && value.clockOutDate < value.clockInDate) {
    context.addIssue({ code: 'custom', path: ['clockOutDate'], message: 'Clock-out date cannot be before clock-in date' })
  }
})
export type AttendancePunchCorrectionInput = z.infer<typeof attendancePunchCorrectionSchema>

export const attendancePunchCorrectionResponseSchema = z.object({
  id: idSchema,
  clockInDate: isoDateSchema,
  clockInTime: localClockTimeSchema,
  clockOutDate: isoDateSchema.nullable(),
  clockOutTime: localClockTimeSchema.nullable(),
  totalHours: z.number().nonnegative().nullable(),
})

export const leaveRequestWriteSchema = z.object({
  employeeId: idSchema,
  type: leaveTypeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional().nullable(),
}).refine(value => !value.endDate || value.endDate >= value.startDate, {
  path: ['endDate'], message: 'Leave end date must be on or after its start date',
})
export type LeaveRequestWriteInput = z.infer<typeof leaveRequestWriteSchema>

export const selfLeaveRequestWriteSchema = z.object({
  type: leaveTypeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional().nullable(),
}).refine(value => !value.endDate || value.endDate >= value.startDate, {
  path: ['endDate'], message: 'Leave end date must be on or after its start date',
})
export type SelfLeaveRequestWriteInput = z.infer<typeof selfLeaveRequestWriteSchema>

// ── Attendance summary (server-computed rate) ────────────────────────────────

export const attendanceSummarySchema = z.object({
  /** Exceptions dated in the selected trailing window (SQL count). */
  exceptionCount: z.int().min(0),
  /** Exceptions dated in the immediately preceding window of the same length. */
  exceptionCountPreviousPeriod: z.int().min(0),
  /** Employees currently on leave (SQL count of `Employee.status === 'ON_LEAVE'`). */
  onLeaveCount: z.int().min(0),
  /** Percentage of punch-started days with both an in and out punch, over the selected range. */
  attendanceRate: z.number().min(0).max(100).nullable(),
  /** Punch completion rate in the preceding window of the same length. */
  attendanceRatePreviousPeriod: z.number().min(0).max(100).nullable(),
  attendanceRateRangeDays: z.int().min(7).max(90),
  attendanceRateRecordedDays: z.int().min(0),
  timesheetCount: z.int().min(0),
  overtimeHours: z.number().min(0),
})
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>

export const attendanceQuerySchema = z.object({
  rangeDays: z.enum(['7', '30', '90']).transform(Number).default(30),
})
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>

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

export const leavePolicyTypeParamSchema = z.object({ type: leaveTypeSchema })
export const leavePolicyWriteSchema = z.object({
  annualAllowanceDays: z.int().min(0).max(366),
  weekdaysOnly: z.boolean().default(false),
})
export type LeavePolicyWriteInput = z.infer<typeof leavePolicyWriteSchema>
export const leavePolicySchema = z.object({
  type: leaveTypeSchema,
  annualAllowanceDays: z.int().min(0).max(366),
  weekdaysOnly: z.boolean(),
})
export type LeavePolicy = z.infer<typeof leavePolicySchema>

export const leaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
})
export type LeaveBalanceQuery = z.infer<typeof leaveBalanceQuerySchema>
export const leaveBalanceSchema = z.object({
  employeeId: idSchema,
  employeeName: z.string(),
  departmentId: idSchema.nullable(),
  type: leaveTypeSchema,
  annualAllowanceDays: z.int().min(0).nullable(),
  approvedDays: z.int().min(0),
  pendingDays: z.int().min(0),
  remainingDays: z.int().nullable(),
  weekdaysOnly: z.boolean().nullable(),
})
export const leaveBalanceResponseSchema = z.object({ year: z.int().min(2000).max(2200), items: z.array(leaveBalanceSchema) })
export type LeaveBalanceResponse = z.infer<typeof leaveBalanceResponseSchema>
export const leavePolicyListResponseSchema = z.object({ items: z.array(leavePolicySchema) })
