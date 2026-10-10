/**
 * CRM forecast — `GET /crm/forecast`.
 *
 * Recorded CRM amounts only, no synthetic series:
 *
 * - When `ForecastSnapshot` rows exist for the tenant they drive `forecastByRep`, and when
 *   `SalesQuota` rows exist for the tenant they are exposed as `quotas`.
 * - Open-deal Commit/Best Case totals and probability-weighted pipeline are derived from deal
 *   values, buckets and probabilities; unweighted amounts are disclosed rather than guessed.
 * - `monthlyPipeline` is the fallback/always-real view: open deals grouped by their stored
 *   `closeDate` month. A month only appears if a real deal has that close date — no padding,
 *   no projection.
 */
import { z } from 'zod'
import { boundedText, idSchema, isoDateTimeSchema } from '../primitives/ids.js'
import { moneySchema, nonNegativeDecimalStringSchema } from '../primitives/money.js'

export const forecastQuerySchema = z.object({
  year: z.string().regex(/^\d{4}$/).optional(),
})

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
  /** Null means the stored legacy quota has no recorded currency and is not guessed. */
  quota: moneySchema.nullable(),
  createdAt: isoDateTimeSchema,
})

export type SalesQuotaRow = z.infer<typeof salesQuotaSchema>

/** Annual, quarter, or calendar-month identity; other free-text periods remain read-only legacy data. */
export const salesQuotaPeriodSchema = z.string().regex(/^\d{4}(?:-Q[1-4]|-(?:0[1-9]|1[0-2]))?$/)

export const salesQuotaWriteSchema = z.object({
  employeeId: idSchema.nullable().optional(),
  repName: boundedText(160),
  period: salesQuotaPeriodSchema,
  /** Major-unit amount in the workspace's base currency, e.g. '125000.00'. */
  quota: nonNegativeDecimalStringSchema.max(64),
})

export const salesQuotaUpdateSchema = salesQuotaWriteSchema.partial().refine(value => Object.keys(value).length > 0)

export type SalesQuotaWriteInput = z.infer<typeof salesQuotaWriteSchema>
export type SalesQuotaUpdateInput = z.infer<typeof salesQuotaUpdateSchema>

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
  /** Calendar year used to filter snapshots, quotas, and close-month pipeline. */
  year: z.string().regex(/^\d{4}$/),
  /** Calendar years with forecast, quota, or dated deal data for this tenant. */
  availableYears: z.array(z.string().regex(/^\d{4}$/)),
  /** Latest `ForecastSnapshot` rows, or [] when none exist for the tenant. */
  forecastByRep: z.array(forecastSnapshotSchema),
  /** `SalesQuota` rows, or [] when none exist for the tenant. */
  quotas: z.array(salesQuotaSchema),
  /** Open deals by close-date month, ascending. Empty when no open deal has a close date. */
  monthlyPipeline: z.array(monthlyPipelineEntrySchema),
  /** Open deals marked as COMMIT, grouped over the entire tenant by their stored close month. */
  monthlyCommit: z.array(monthlyPipelineEntrySchema),
  /** Open deals with a valid stored probability, weighted by that probability. */
  monthlyWeightedPipeline: z.array(monthlyPipelineEntrySchema),
  summary: z.object({
    totalPipeline: moneySchema,
    totalQuota: moneySchema,
    /** Latest per-rep/per-period committed snapshot amount, in minor units. */
    totalCommit: moneySchema,
    /** Latest per-rep/per-period best-case snapshot amount, in minor units. */
    totalBestCase: moneySchema,
    /** Sum of open deal values × stored probability for selected-year close dates. */
    weightedPipeline: moneySchema,
    /** Open deal value excluded from weightedPipeline because its probability is missing/invalid. */
    unweightedPipeline: moneySchema,
    unweightedDealCount: z.int().min(0),
    /** Open deals explicitly tagged COMMIT, using their recorded full values. */
    dealCommit: moneySchema,
    /** COMMIT plus BEST_CASE open deals, using their recorded full values. */
    dealBestCase: moneySchema,
    quotaAttainmentPct: z.number().min(0).nullable(),
    /** Number of selected-year quota rows excluded from base-currency totals due to period/currency scope. */
    excludedQuotaCount: z.int().min(0),
  }),
})

export type CrmForecast = z.infer<typeof forecastResponseSchema>
