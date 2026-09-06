/**
 * CRM sales performance — `GET /crm/sales-performance`.
 *
 * `monthlyClosedWon` is the real per-calendar-month aggregate over `Deal` rows whose `stage` is
 * `CLOSED_WON` and whose `closeDate` is set — grouped in SQL, not resampled. `byRep` is the
 * same deals grouped by owner. Nothing here is a projection of future months.
 */
import { z } from 'zod'
import { idSchema } from '../primitives/ids.js'
import { moneySchema } from '../primitives/money.js'

export const monthlyClosedWonSchema = z.object({
  /** `YYYY-MM` of the deals' stored `closeDate`. */
  month: z.string().length(7),
  count: z.int().min(0),
  /** Total closed-won value that month, minor units. */
  value: moneySchema,
})

export type MonthlyClosedWon = z.infer<typeof monthlyClosedWonSchema>

export const repPerformanceSchema = z.object({
  ownerEmployeeId: idSchema.nullable(),
  ownerName: z.string().nullable(),
  openCount: z.int().min(0),
  openValue: moneySchema,
  wonCount: z.int().min(0),
  wonValue: moneySchema,
  lostCount: z.int().min(0),
  lostValue: moneySchema,
  /** Won / (won + lost) for this rep, percentage 0–100, or null when they have no closed deals. */
  winRate: z.number().min(0).max(100).nullable(),
})

export type RepPerformance = z.infer<typeof repPerformanceSchema>

export const salesPerformanceResponseSchema = z.object({
  /** Closed-won by month, ascending. Months with no closed-won deals are simply absent. */
  monthlyClosedWon: z.array(monthlyClosedWonSchema),
  /** Per-owner breakdown, open pipeline first (largest first), then owners with no open deals. */
  byRep: z.array(repPerformanceSchema),
  /**
   * Tenant-wide totals, computed server-side (SQL `SUM`/`COUNT` over the same `Deal` rows)
   * so KPI cards render them instead of re-deriving them from `byRep` in the browser.
   */
  summary: z.object({
    /** `SUM(value)` over all `CLOSED_WON` deals — minor units. */
    totalWon: moneySchema,
    totalWonCount: z.int().min(0),
    totalLostCount: z.int().min(0),
    /** Overall `totalWonCount / (totalWonCount + totalLostCount)` percentage 0–100, or null. */
    overallWinRate: z.number().min(0).max(100).nullable(),
  }),
})

export type CrmSalesPerformance = z.infer<typeof salesPerformanceResponseSchema>
