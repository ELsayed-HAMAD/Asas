/**
 * HR / Payroll contract — the wire shape for payroll runs, their lines, and the payslip data.
 *
 * Every monetary field is a major-unit decimal *string* (`decimalStringSchema`) — never a JSON
 * number — because a number cannot hold a currency's minor units exactly. The server computes
 * these with `@asas/domain`'s `Money` and the single `computePayrollLine` composition; the wire
 * only carries the result, so a client can never re-derive payroll its own way.
 */
import { z } from 'zod'
import { payrollRunStatusSchema } from '../enums.generated.js'
import {
  boundedText,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  shortTextSchema,
} from '../primitives/ids.js'
import { decimalStringSchema } from '../primitives/money.js'
import { paginated, paginationQuerySchema } from '../primitives/pagination.js'

/** A named deduction (pension, tax, …) whose `rate` is a *percentage of gross*. */
export const payrollTaxRateSchema = z.object({
  label: shortTextSchema,
  /** Percentage of gross, e.g. `'15.5'` for 15.5%. Stored on the run so it is auditable. */
  rate: decimalStringSchema,
})
export type PayrollTaxRate = z.infer<typeof payrollTaxRateSchema>

/** Create a payroll run for a set of employees, priced from each employee's stored salary. */
export const payrollRunCreateSchema = z.object({
  label: shortTextSchema,
  payDate: isoDateSchema.optional().nullable(),
  /** The tax/deduction lines to apply, split proportionally off gross. At least one. */
  taxRates: z.array(payrollTaxRateSchema).min(1),
  /** Employees to pay. Each must carry a salary on file — see `payroll.service.ts`. */
  employeeIds: z.array(idSchema).min(1),
})
export type PayrollRunCreateInput = z.infer<typeof payrollRunCreateSchema>

/**
 * Adjust the inputs of a single line (base, missed days, bonus). The server recomputes gross,
 * the tax split, deductions, and net from these plus the run's stored tax rates — the client
 * never sends a computed amount, so the money invariant holds.
 */
export const payrollLineAdjustSchema = z.object({
  baseSalary: decimalStringSchema.optional().nullable(),
  missedDaysCount: z.int().min(0).optional().nullable(),
  missedDaysAmount: decimalStringSchema.optional().nullable(),
  bonusLabel: boundedText(120).optional().nullable(),
  bonusAmount: decimalStringSchema.optional().nullable(),
})
export type PayrollLineAdjustInput = z.infer<typeof payrollLineAdjustSchema>

export const payrollTaxLineSchema = z.object({
  id: idSchema,
  label: z.string(),
  amount: decimalStringSchema,
  /** True once an admin has overridden the computed split for this line. */
  override: z.boolean(),
})
export type PayrollTaxLine = z.infer<typeof payrollTaxLineSchema>

export const payrollLineSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  employee: z.object({ id: idSchema, name: z.string(), title: z.string() }),
  baseSalary: decimalStringSchema.nullable(),
  missedDaysCount: z.int().nullable(),
  missedDaysAmount: decimalStringSchema.nullable(),
  bonusLabel: z.string().nullable(),
  bonusAmount: decimalStringSchema.nullable(),
  gross: decimalStringSchema,
  taxLines: z.array(payrollTaxLineSchema),
  deductions: decimalStringSchema,
  net: decimalStringSchema,
})
export type PayrollLine = z.infer<typeof payrollLineSchema>

export const payrollRunListItemSchema = z.object({
  id: idSchema,
  label: z.string(),
  payDate: isoDateSchema.nullable(),
  status: payrollRunStatusSchema,
  lineCount: z.int().min(0),
  createdAt: isoDateTimeSchema,
})
export type PayrollRunListItem = z.infer<typeof payrollRunListItemSchema>

/**
 * Totals computed over the tenant's *entire* payroll history in SQL (not the page), so a KPI
 * card reading "all-time gross paid" is correct even when the list is paginated.
 */
export const payrollRunListSummarySchema = z.object({
  totalRuns: z.int().min(0),
  lineCount: z.int().min(0),
  pendingCount: z.int().min(0),
  totalGross: decimalStringSchema,
  totalNet: decimalStringSchema,
})
export type PayrollRunListSummary = z.infer<typeof payrollRunListSummarySchema>

export const payrollRunListQuerySchema = paginationQuerySchema.extend({
  status: payrollRunStatusSchema.optional(),
})
export type PayrollRunListQuery = z.infer<typeof payrollRunListQuerySchema>

export const payrollRunListResponseSchema = paginated(
  payrollRunListItemSchema,
  payrollRunListSummarySchema,
)
export type PayrollRunListResponse = z.infer<typeof payrollRunListResponseSchema>

/** The full run with every line and its tax split — also the data a payslip renders from. */
export const payrollRunSchema = z.object({
  id: idSchema,
  label: z.string(),
  payDate: isoDateSchema.nullable(),
  status: payrollRunStatusSchema,
  /** The tax rates this run was priced with, so the split is reproducible and auditable. */
  taxRates: z.array(payrollTaxRateSchema),
  lines: z.array(payrollLineSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type PayrollRun = z.infer<typeof payrollRunSchema>
