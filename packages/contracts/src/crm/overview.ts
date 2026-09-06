/**
 * CRM overview — `GET /crm/overview`.
 *
 * The funnel is a single SQL `groupBy` over `Deal.stage`: counts and value sums for every stage,
 * zero-filled so the UI always renders the same five stages. Every KPI is a SQL aggregate; the
 * only arithmetic done outside SQL is the win-rate division of two integer counts and the
 * display-only `share` of the largest stage's value.
 */
import { z } from 'zod'
import { dealStageSchema } from '../enums.generated.js'
import { moneySchema } from '../primitives/money.js'

export const funnelStageSchema = z.object({
  stage: dealStageSchema,
  count: z.int().min(0),
  /** Total stored value of deals sitting in this stage, minor units. */
  value: moneySchema,
  /**
   * `value` as a fraction (0–1) of the largest stage's value — the funnel bar's true
   * proportion. `null` when no stage holds any value, so a bar renders at 0% rather than an
   * arbitrary minimum.
   */
  share: z.number().min(0).max(1).nullable(),
})

export type FunnelStage = z.infer<typeof funnelStageSchema>

export const overviewPipelineSchema = z.object({
  /** Total value of open (unclosed) deals, minor units. */
  openTotal: moneySchema,
  openCount: z.int().min(0),
  /** Total closed-won value, minor units. */
  wonTotal: moneySchema,
  wonCount: z.int().min(0),
  /** Total closed-lost value, minor units. */
  lostTotal: moneySchema,
  lostCount: z.int().min(0),
})

export const overviewResponseSchema = z.object({
  pipeline: overviewPipelineSchema,
  /** Won / (won + lost) over closed deals, percentage 0–100, or null when nothing has closed. */
  winRate: z.number().min(0).max(100).nullable(),
  /** All five stages, in schema order, zero-filled. */
  funnel: z.array(funnelStageSchema),
})

export type CrmOverview = z.infer<typeof overviewResponseSchema>
