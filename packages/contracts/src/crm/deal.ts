/**
 * CRM / Deal contract — the schemas `apps/api`'s crm module and `apps/web` share, so the wire
 * shape is defined exactly once.
 *
 * Money follows the house rule: integer minor units on the wire, `Decimal` in Prisma. Every
 * amount the service returns comes out of a SQL aggregate or a stored column; nothing here is
 * rescaled, and nothing in the UI may `.reduce()` its way to one.
 */
import { z } from 'zod'
import { dealStageSchema } from '../enums.generated.js'
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  percentageSchema,
  boundedText,
  shortTextSchema,
} from '../primitives/ids.js'
import { moneySchema, decimalStringSchema } from '../primitives/money.js'
import { paginated, paginationQuerySchema } from '../primitives/pagination.js'

// ── Deal ─────────────────────────────────────────────────────────────────────

export const dealOwnerSchema = z.object({
  id: idSchema,
  name: z.string(),
  title: z.string(),
})

export const dealSchema = z.object({
  id: idSchema,
  name: z.string(),
  stage: dealStageSchema,
  /** Integer minor units in the tenant's currency, plus the code. See primitives/money.ts. */
  value: moneySchema,
  companyId: idSchema.nullable(),
  company: z.string().nullable(),
  ownerEmployeeId: idSchema.nullable(),
  owner: dealOwnerSchema.nullable(),
  /** Stored `Float` column, percentage 0–100, or `null` when never set. */
  winProbability: percentageSchema.nullable(),
  closeDate: isoDateTimeSchema.nullable(),
  productLine: z.string().nullable(),
  forecastBucket: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Deal = z.infer<typeof dealSchema>

// ── List ─────────────────────────────────────────────────────────────────────

export const dealListQuerySchema = paginationQuerySchema.extend({
  stage: dealStageSchema.optional(),
  /** Open pipeline only: excludes both closed stages. */
  openOnly: z.coerce.boolean().optional(),
  ownerId: idSchema.optional(),
  search: boundedText(200, 0).optional(),
})

export type DealListQuery = z.infer<typeof dealListQuerySchema>

/**
 * KPIs for the pipeline, computed over the *whole* (unfiltered-by-page) result set in SQL —
 * never re-derived client-side from the current page.
 */
export const dealSummarySchema = z.object({
  /** Count of open (unclosed) deals. */
  openDealCount: z.int().min(0),
  /** Total value of open deals, minor units. */
  openPipelineValue: moneySchema,
  /** Count of closed-won deals. */
  wonCount: z.int().min(0),
  /** Total closed-won value, minor units. */
  wonValue: moneySchema,
  /** Count of closed-lost deals. */
  lostCount: z.int().min(0),
  /** Total closed-lost value, minor units. */
  lostValue: moneySchema,
  /** Won / (won + lost) as a percentage, 0–100, or null when nothing has closed yet. */
  winRate: z.number().min(0).max(100).nullable(),
})

export type DealSummary = z.infer<typeof dealSummarySchema>

export const dealListResponseSchema = paginated(dealSchema, dealSummarySchema)

export type DealListResponse = z.infer<typeof dealListResponseSchema>

// ── Writes ───────────────────────────────────────────────────────────────────

export const dealWriteSchema = z.object({
  name: shortTextSchema,
  stage: dealStageSchema.optional(),
  /** Major-unit decimal string in the tenant's currency, e.g. '12500.00'. */
  value: decimalStringSchema.optional().nullable(),
  companyId: idSchema.optional().nullable(),
  ownerEmployeeId: idSchema.optional().nullable(),
  winProbability: percentageSchema.optional().nullable(),
  closeDate: isoDateSchema.optional().nullable(),
  productLine: boundedText(200).optional().nullable(),
  forecastBucket: boundedText(64).optional().nullable(),
})

export type DealWriteInput = z.infer<typeof dealWriteSchema>

export const dealUpdateSchema = dealWriteSchema.partial()

export type DealUpdateInput = z.infer<typeof dealUpdateSchema>
