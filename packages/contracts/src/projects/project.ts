/**
 * Projects / Project contract — the schemas both `apps/api`'s projects module and `apps/web`
 * import, so the wire shape is defined exactly once (the HR module's `employee.ts` is the
 * reference for this shape).
 *
 * Money on the wire is an **integer minor unit** (cents) plus an ISO 4217 code — the exact
 * shape {@link moneySchema} emits (see `primitives/money.ts`). The API stores `Decimal` in
 * Prisma and converts to/from this form in the service layer; no float ever crosses the
 * boundary.
 */
import { z } from 'zod'
import { projectStatusSchema } from '../enums.generated.js'
import { idSchema, isoDateTimeSchema, boundedText } from '../primitives/ids.js'
import { decimalStringSchema, moneySchema } from '../primitives/money.js'
import { paginated, paginationQuerySchema } from '../primitives/pagination.js'

export const projectSchema = z.object({
  id: idSchema,
  name: z.string(),
  status: projectStatusSchema,
  departmentId: idSchema.nullable(),
  /** `null` when no budget was set; otherwise integer minor units of the tenant's currency. */
  budget: moneySchema.nullable(),
  /** Integer minor units of the tenant's currency; `0` when nothing has been spent. */
  spent: moneySchema,
  /** Posted settlement rows whose base currency amount is unavailable. */
  unvaluedSettlementCount: z.int().min(0).default(0),
  /**
   * Budget utilization as a percentage, 0–100+ — a server-computed KPI (spent / budget).
   * `null` when there is no budget to divide by, so the UI renders "—" rather than a fake 0.
   */
  utilizationPct: z.number().min(0).nullable(),
  timeline: isoDateTimeSchema.nullable(),
  sprints: z.array(z.object({ id: idSchema, name: z.string() })).default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Project = z.infer<typeof projectSchema>

export const projectListQuerySchema = paginationQuerySchema.extend({
  status: projectStatusSchema.optional(),
  departmentId: idSchema.optional(),
  search: boundedText(200, 0).optional(),
})

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>

export const projectSummarySchema = z.object({
  totalProjects: z.int().min(0),
  activeProjects: z.int().min(0),
  /** `null` when no project in the result set carries a budget. */
  totalBudget: moneySchema.nullable(),
  totalSpent: moneySchema,
  unvaluedSettlementCount: z.int().min(0).default(0),
  unassignedSettlementCount: z.int().min(0).default(0),
  /** Portfolio utilization as a percentage, `null` when total budget is 0. */
  utilizationPct: z.number().min(0).nullable(),
})

export type ProjectSummary = z.infer<typeof projectSummarySchema>

export const projectListResponseSchema = paginated(projectSchema, projectSummarySchema)

/**
 * The write form for `budget`. It accepts either the major-unit decimal string a currency input
 * field produces (`'125000.00'`) or the wire-money object a client that already has the tenant
 * currency would send. The service layer resolves the currency (from the tenant) and normalises
 * both to a `Decimal` for storage.
 */
export const budgetInputSchema = z.union([
  decimalStringSchema,
  moneySchema,
])

export type BudgetInput = z.infer<typeof budgetInputSchema>

export const projectWriteSchema = z.object({
  name: boundedText(200),
  status: projectStatusSchema.optional(),
  departmentId: idSchema.optional().nullable(),
  budget: budgetInputSchema.optional().nullable(),
  timeline: isoDateTimeSchema.optional().nullable(),
})

export type ProjectWriteInput = z.infer<typeof projectWriteSchema>

export const projectUpdateSchema = projectWriteSchema.partial()

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>
