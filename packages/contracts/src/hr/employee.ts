/**
 * HR / Employee contract \u2014 the schemas both `apps/api`'s employees module and any client
 * (starting with `apps/web`) import, so the wire shape is defined exactly once.
 */
import { z } from 'zod'
import { employeeStatusSchema, salaryBasisSchema } from '../enums.generated.js'
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
  employmentEndDate: isoDateSchema.nullable(),
  /**
   * Redacted to `null` for callers without the `employee.salary.read` permission \u2014 see
   * `apps/api/src/modules/hr/employees.service.ts`. The wire shape cannot distinguish "no
   * salary set" from "redacted", which is the point: a MEMBER should not be able to tell the
   * difference either.
   */
  salary: decimalStringSchema.nullable(),
  salaryBasis: salaryBasisSchema.nullable(),
  salaryEffectiveFrom: isoDateSchema.nullable(),
  salaryHistory: z.array(z.object({
    salary: decimalStringSchema,
    salaryBasis: salaryBasisSchema.nullable(),
    currency: z.string(),
    effectiveFrom: isoDateSchema,
  })),
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
  sort: z.enum(['NAME_ASC', 'NAME_DESC']).optional(),
})

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>

export const employeeSummarySchema = z.object({
  totalHeadcount: z.int().min(0),
  onLeaveCount: z.int().min(0),
  /** Employees with recorded hire dates from the start of this tenant-local month through today. */
  hiredThisMonth: z.int().min(0),
  /** Employees hired in the matching elapsed date range of the previous tenant-local month. */
  hiredPreviousMonthToDate: z.int().min(0),
  /**
   * Distinct recruitment roles with at least one candidate in a non-terminal pipeline stage
   * (HIRED/REJECTED excluded), counted from the candidate pipeline's free-text `role` values.
   * No requisition model exists yet, so this counts recruited-for roles, not approved
   * headcount requisitions.
   */
  openRoles: z.int().min(0),
})

export type EmployeeSummary = z.infer<typeof employeeSummarySchema>

export const employeeListResponseSchema = paginated(employeeSchema, employeeSummarySchema)

const employeeWriteFields = {
  name: shortTextSchema,
  title: shortTextSchema,
  departmentId: idSchema.optional().nullable(),
  managerId: idSchema.optional().nullable(),
  status: employeeStatusSchema.optional(),
  avatarUrl: z.url().optional().nullable(),
  hiredAt: isoDateSchema.optional().nullable(),
  employmentEndDate: isoDateSchema.optional().nullable(),
  salary: decimalStringSchema.optional().nullable(),
  salaryBasis: salaryBasisSchema.optional().nullable(),
  salaryEffectiveFrom: isoDateSchema.optional().nullable(),
  equityOptions: z.int().nonnegative().optional().nullable(),
  band: boundedText(64).optional().nullable(),
  location: boundedText(200).optional().nullable(),
  employeeNumber: boundedText(64).optional().nullable(),
  email: z.email().optional().nullable(),
}

export const employeeWriteSchema = z.object(employeeWriteFields).superRefine((value, context) => {
  if (value.salary != null && !value.salaryEffectiveFrom) {
    context.addIssue({ code: 'custom', path: ['salaryEffectiveFrom'], message: 'Choose the date this salary becomes effective' })
  }
})

export type EmployeeWriteInput = z.infer<typeof employeeWriteSchema>

export const employeeUpdateSchema = z.object(employeeWriteFields).partial()

export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>
