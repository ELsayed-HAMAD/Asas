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

export const stageConversionSchema = z.object({
  fromStage: dealStageSchema,
  toStage: dealStageSchema,
  /** Distinct deals with recorded history of entering `fromStage`. */
  enteredCount: z.int().min(0),
  /** Distinct source-stage deals that later entered `toStage`. */
  convertedCount: z.int().min(0),
  /** Converted / entered, or null when the stage has no recorded cohort. */
  rate: z.number().min(0).max(100).nullable(),
})

export type StageConversion = z.infer<typeof stageConversionSchema>

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
  /** Previous-month same-date open-deal count; null until history covers that date. */
  openCountComparison: z.object({
    previousAsOfDate: z.iso.date(),
    previousCount: z.int().min(0).nullable(),
  }),
  /** Previous-month same-date open pipeline value in workspace currency; null until covered history exists. */
  openTotalComparison: z.object({
    previousAsOfDate: z.iso.date(),
    previousTotal: moneySchema.nullable(),
  }),
})

export const overviewResponseSchema = z.object({
  pipeline: overviewPipelineSchema,
  /** Open deals created in the previous seven days. */
  createdLast7Days: z.int().min(0),
  /** Won / (won + lost) over closed deals, percentage 0–100, or null when nothing has closed. */
  winRate: z.number().min(0).max(100).nullable(),
  /** Current month-to-date compared with the same elapsed calendar dates in the previous month, in workspace timezone. */
  winRateComparison: z.object({
    current: z.object({
      startDate: z.iso.date(),
      endDateExclusive: z.iso.date(),
      wonCount: z.int().min(0),
      lostCount: z.int().min(0),
      rate: z.number().min(0).max(100).nullable(),
    }),
    previous: z.object({
      startDate: z.iso.date(),
      endDateExclusive: z.iso.date(),
      wonCount: z.int().min(0),
      lostCount: z.int().min(0),
      rate: z.number().min(0).max(100).nullable(),
    }),
  }),
  /** Monthly outcomes for deals with a recorded close date. */
  monthlyWinRate: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    wonCount: z.int().min(0),
    lostCount: z.int().min(0),
    rate: z.number().min(0).max(100).nullable(),
  })),
  /** All five stages, in schema order, zero-filled. */
  funnel: z.array(funnelStageSchema),
  /** All-time, history-based distinct-deal conversion for the three adjacent open stages and won. */
  stageConversions: z.array(stageConversionSchema),
})

export type CrmOverview = z.infer<typeof overviewResponseSchema>
