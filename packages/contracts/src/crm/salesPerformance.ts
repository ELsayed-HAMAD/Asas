/**
 * CRM sales performance — `GET /crm/sales-performance`.
 *
 * `monthlyClosedWon` is the real per-calendar-month aggregate over `Deal` rows whose `stage` is
 * `CLOSED_WON` and whose actual `closedAt` is recorded — grouped in SQL, not resampled. `byRep` is the
 * same deals grouped by owner. Nothing here is a projection of future months.
 */
import { z } from 'zod'
import { idSchema } from '../primitives/ids.js'
import { moneySchema } from '../primitives/money.js'

export const monthlyClosedWonSchema = z.object({
  /** `YYYY-MM` of the deals' recorded actual closure. */
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
  weeklyActivity: z.array(z.object({
    week: z.string().length(10),
    active: z.int().min(0),
    won: z.int().min(0),
    lost: z.int().min(0),
  })),
})

export type RepPerformance = z.infer<typeof repPerformanceSchema>

export const weeklyActivitySchema = z.object({
  week: z.string().length(10),
  active: z.int().min(0),
  won: z.int().min(0),
  lost: z.int().min(0),
})

export const salesPerformanceResponseSchema = z.object({
  /** Calendar year for closed outcomes; open pipeline remains a current snapshot. */
  year: z.string().regex(/^\d{4}$/),
  yearWonTotal: moneySchema,
  /** Prior calendar-year closed-won value, based only on recorded actual closure dates. */
  previousYearWonTotal: moneySchema,
  /** Legacy closed deals with unknown actual closure, excluded from dated outcomes. */
  undatedClosedCount: z.int().nonnegative(),
  /** Closed-won by month, ascending. Months with no closed-won deals are simply absent. */
  monthlyClosedWon: z.array(monthlyClosedWonSchema),
  weeklyActivity: z.array(weeklyActivitySchema),
  /** Per-owner breakdown, open pipeline first (largest first), then owners with no open deals. */
  byRep: z.array(repPerformanceSchema),
  summary: z.object({
    totalWon: moneySchema,
    totalWonCount: z.int().min(0),
    totalLostCount: z.int().min(0),
    overallWinRate: z.number().min(0).max(100).nullable(),
    averageSalesCycleDays: z.number().nonnegative().nullable(),
  }),
})

export type CrmSalesPerformance = z.infer<typeof salesPerformanceResponseSchema>
