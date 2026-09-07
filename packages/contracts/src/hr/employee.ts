/**
 * HR / Employee contract \u2014 the schemas both `apps/api`'s employees module and any client
 * (starting with `apps/web`) import, so the wire shape is defined exactly once.
 */
import { z } from 'zod'
import { employeeStatusSchema } from '../enums.generated.js'
import { idSchema, isoDateSchema, isoDateTimeSchema, boundedText, shortTextSchema } from '../primitives/ids.js'
import { decimalStringSchema } from '../primitives/money.js'
import { paginated, paginationQuerySchema } from '../primitives/pagination.js'

export const employeeManagerSchema = z.object({
  id: idSchema,
  name: z.string(),
  title: z.string(),
})

export const employeeSchema = z.object({
  id: idSchema,
  name: z.string(),
  title: z.string(),
  status: employeeStatusSchema,
  departmentId: idSchema.nullable(),
  department: z.string().nullable(),
  managerId: idSchema.nullable(),
  manager: employeeManagerSchema.nullable(),
  directReports: z.int().min(0),
  avatarUrl: z.string().nullable(),
  hiredAt: isoDateTimeSchema.nullable(),
  /**
   * Redacted to `null` for callers without the `employee.salary.read` permission \u2014 see
   * `apps/api/src/modules/hr/employees.service.ts`. The wire shape cannot distinguish "no
   * salary set" from "redacted", which is the point: a MEMBER should not be able to tell the
   * difference either.
   */
  salary: decimalStringSchema.nullable(),
  equityOptions: z.int().nonnegative().nullable(),
  band: z.string().nullable(),
  location: z.string().nullable(),
  employeeNumber: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Employee = z.infer<typeof employeeSchema>

export const employeeListQuerySchema = paginationQuerySchema.extend({
  departmentId: idSchema.optional(),
  status: z.enum(['Active', 'On Leave']).optional(),
  search: boundedText(200, 0).optional(),
})

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>

export const employeeSummarySchema = z.object({
  totalHeadcount: z.int().min(0),
  onLeaveCount: z.int().min(0),
  /**
   * TODO(phase-2-hr): always `0` until a real requisition/job-opening model exists to compute
   * it from. Previously this was read straight off a client-supplied query parameter (any
   * caller could report any number) — see the rebuild plan's Phase 0 audit finding. Zero and
   * honest is the correct interim value, not a plausible-looking guess.
   */
  openRoles: z.int().min(0),
})

export type EmployeeSummary = z.infer<typeof employeeSummarySchema>

export const employeeListResponseSchema = paginated(employeeSchema, employeeSummarySchema)

export const employeeWriteSchema = z.object({
  name: shortTextSchema,
  title: shortTextSchema,
  departmentId: idSchema.optional().nullable(),
  managerId: idSchema.optional().nullable(),
  status: employeeStatusSchema.optional(),
  avatarUrl: z.url().optional().nullable(),
  hiredAt: isoDateSchema.optional().nullable(),
  salary: decimalStringSchema.optional().nullable(),
  equityOptions: z.int().nonnegative().optional().nullable(),
  band: boundedText(64).optional().nullable(),
  location: boundedText(200).optional().nullable(),
  employeeNumber: boundedText(64).optional().nullable(),
  email: z.email().optional().nullable(),
})

export type EmployeeWriteInput = z.infer<typeof employeeWriteSchema>

export const employeeUpdateSchema = employeeWriteSchema.partial()

export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>
