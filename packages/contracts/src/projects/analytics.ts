/**
 * Projects / analytics contracts — the two KPI endpoints the Projects dashboard renders.
 *
 * Both are computed in **SQL** on the API side (never a client-side `.reduce()` over a
 * fetched list) and shipped back as plain numbers:
 *
 *  - `SprintBurndown`      — total scope vs. completed-per-day for one sprint.
 *  - `PortfolioUtilization` — budget utilization (spent / budget) grouped per project.
 *
 * These carry the chart's *data*, not its styling: the frontend picks the series color from
 * the token system, so the wire shape stays theme-agnostic.
 */
import { z } from 'zod'
import { projectStatusSchema } from '../enums.generated.js'
import { idSchema, isoDateSchema } from '../primitives/ids.js'
import { moneySchema } from '../primitives/money.js'

// ── Sprint burndown ─────────────────────────────────────────────────────────────

export const burndownPointSchema = z.object({
  /** Day (UTC), ISO `yyyy-mm-dd`. */
  date: isoDateSchema,
  /** Issues still open at the end of that day. */
  remaining: z.int().min(0),
  /**
   * Ideal burndown: linear from `totalScope` at the sprint's start to `0` at its end.
   * A number (not an int) because the straight line rarely lands on whole issues.
   */
  ideal: z.number().min(0),
})

export type BurndownPoint = z.infer<typeof burndownPointSchema>

export const burndownQuerySchema = z.object({
  /** One day of history to return; capping keeps the chart legible. */
  limit: z.coerce.number().int().min(1).max(365).default(90),
})

export type BurndownQuery = z.infer<typeof burndownQuerySchema>

export const burndownResponseSchema = z.object({
  sprintId: idSchema,
  sprintName: z.string(),
  /** Total work in the sprint — the top of the burndown at day 0. */
  totalScope: z.int().min(0),
  /** Issues DONE as of the moment the query ran. */
  completed: z.int().min(0),
  points: z.array(burndownPointSchema),
})

export type BurndownResponse = z.infer<typeof burndownResponseSchema>

// ── Portfolio utilization ───────────────────────────────────────────────────────

export const utilizationRowSchema = z.object({
  projectId: idSchema,
  name: z.string(),
  status: projectStatusSchema,
  spent: moneySchema,
  /** `null` when the project has no budget set. */
  budget: moneySchema.nullable(),
  /** Utilization as a percentage, `null` when there is no budget to divide by. */
  utilizationPct: z.number().min(0).nullable(),
})

export type UtilizationRow = z.infer<typeof utilizationRowSchema>

export const portfolioUtilizationResponseSchema = z.object({
  items: z.array(utilizationRowSchema),
  summary: z.object({
    totalSpent: moneySchema,
    totalBudget: moneySchema.nullable(),
    utilizationPct: z.number().min(0).nullable(),
    /** Total project count for the tenant, or 0. */
    totalProjects: z.int().min(0),
    /** Projects in an active status (ON_TRACK/DELAYED/AT_RISK), or 0. */
    activeProjects: z.int().min(0),
  }),
})

export type PortfolioUtilizationResponse = z.infer<typeof portfolioUtilizationResponseSchema>
