/**
 * CRM forecast — `GET /crm/forecast`.
 *
 * Two real sources only, no synthetic series:
 *
 * - When `ForecastSnapshot` rows exist for the tenant they drive `forecastByRep`, and when
 *   `SalesQuota` rows exist for the tenant they are exposed as `quotas`.
 * - `monthlyPipeline` is the fallback/always-real view: open deals grouped by their stored
 *   `closeDate` month. A month only appears if a real deal has that close date — no padding,
 *   no projection.
 */
import { z } from 'zod'
import { idSchema, isoDateTimeSchema } from '../primitives/ids.js'
import { moneySchema } from '../primitives/money.js'

export const forecastSnapshotSchema = z.object({
  id: idSchema,
  repName: z.string(),
  /** Stored free-text period, e.g. '2026-Q3'. Echoed, not parsed or normalized. */
  period: z.string(),
  closed: moneySchema,
  commit: moneySchema,
  bestCase: moneySchema,
  /** Stored `Float` percentage, or null. */
  quotaPct: z.number().nullable(),
  createdAt: isoDateTimeSchema,
})

export type ForecastSnapshotRow = z.infer<typeof forecastSnapshotSchema>

export const salesQuotaSchema = z.object({
  id: idSchema,
  employeeId: idSchema.nullable(),
  repName: z.string(),
  period: z.string(),
  quota: moneySchema,
  createdAt: isoDateTimeSchema,
})

export type SalesQuotaRow = z.infer<typeof salesQuotaSchema>

/** One real open-deal close month: `YYYY-MM` plus the aggregate over the deals with that date. */
export const monthlyPipelineEntrySchema = z.object({
  /** `YYYY-MM` of the deals' stored `closeDate`. */
  month: z.string().length(7),
  count: z.int().min(0),
  /** Total value of the open deals closing in that month, minor units. */
  value: moneySchema,
})

export type MonthlyPipelineEntry = z.infer<typeof monthlyPipelineEntrySchema>

export const forecastResponseSchema = z.object({
  /** Latest `ForecastSnapshot` rows, or [] when none exist for the tenant. */
  forecastByRep: z.array(forecastSnapshotSchema),
  /** `SalesQuota` rows, or [] when none exist for the tenant. */
  quotas: z.array(salesQuotaSchema),
  /** Open deals by close-date month, ascending. Empty when no open deal has a close date. */
  monthlyPipeline: z.array(monthlyPipelineEntrySchema),
  summary: z.object({
    totalPipeline: moneySchema,
    totalQuota: moneySchema,
    quotaAttainmentPct: z.number().min(0).nullable(),
  }),
})

export type CrmForecast = z.infer<typeof forecastResponseSchema>
