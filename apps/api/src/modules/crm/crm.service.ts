/**
 * CRM service — the domain logic behind the CRM module's routes.
 *
 * The invariants follow the HR reference (`employees.service.ts`) and the Projects module:
 *
 *  - **Tenant isolation.** Every query is scoped by `tenantId`, which the route handler reads
 *    from the authenticated session (never from a request parameter). A `findFirst({ where:
 *    { id, tenantId } })` on a foreign id returns `null` and becomes a 404, not a leak.
 *  - **KPIs in SQL.** `listDeals`, `getOverview`, `getForecast`, and `getSalesPerformance`
 *    compute their aggregates with Prisma `count`/`aggregate`/`groupBy` (and one windowed
 *    `$queryRaw` per month-bucketed series, since Postgres has no `date_trunc` in Prisma's
 *    `groupBy`). Nothing sums a fetched list with `.reduce()` in the client.
 *  - **Money as integer minor units.** `Deal.value` is `Decimal` in Prisma; on the wire it is
 *    the `{ amount, currency }` wire form via `@asas/domain`'s `Money`. No float touches a
 *    money value — only derived percentages (ratios, not money) use floating point.
 */
import { Prisma } from '@prisma/client'
import type { Deal as PrismaDeal, PrismaClient } from '@prisma/client'
import { Money } from '@asas/domain'
import type {
  Deal,
  DealListQuery,
  DealSummary,
  DealUpdateInput,
  DealWriteInput,
  CrmForecast,
  CrmOverview,
  CrmSalesPerformance,
  DealStage,
  FunnelStage,
  StageConversion,
  MonthlyPipelineEntry,
  AgendaItem,
  DealActivity,
  DealActivityListQuery,
  DealActivityWriteInput,
  AgendaItemUpdateInput,
  AgendaItemWriteInput,
  SalesQuotaRow,
  SalesQuotaUpdateInput,
  SalesQuotaWriteInput,
} from '@asas/contracts'
import { DealStageValues, buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'
import { tenantToday } from '../../utils/dates.js'

/** Stages that count as "open" pipeline — everything except the two terminal states. */
type CrmClient = PrismaClient | Prisma.TransactionClient

const OPEN_STAGES: readonly DealStage[] = ['LEADS', 'PROPOSAL', 'NEGOTIATION']
const CLOSED_STAGES: readonly DealStage[] = ['CLOSED_WON', 'CLOSED_LOST']

function mapAgendaItem(row: { id: string; title: string; timeLabel: string | null; priority: string | null; done: boolean; createdAt: Date }): AgendaItem {
  return { id: row.id, title: row.title, timeLabel: row.timeLabel, priority: row.priority, done: row.done, createdAt: row.createdAt.toISOString() }
}

type DealActivityRecord = { id: string; dealId: string; type: DealActivity['type']; title: string; body: string | null; actorId: string | null; actorName: string | null; createdAt: Date }

function mapDealActivity(row: DealActivityRecord): DealActivity {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

export async function listDealActivities(prisma: PrismaClient, tenantId: string, dealId: string, query: DealActivityListQuery) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, tenantId }, select: { id: true } })
  if (!deal) throw new AppError(404, 'Deal not found')
  const { skip, take } = toPrismaPage(query)
  const where = { tenantId, dealId }
  const [rows, total] = await Promise.all([
    prisma.dealActivity.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.dealActivity.count({ where }),
  ])
  return { items: rows.map(row => mapDealActivity(row)), pagination: buildPaginationMeta(query, total), summary: null }
}

export async function createDealActivity(
  prisma: CrmClient,
  tenantId: string,
  dealId: string,
  actorId: string,
  input: DealActivityWriteInput,
): Promise<DealActivity> {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, tenantId }, select: { id: true } })
  if (!deal) throw new AppError(404, 'Deal not found')
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
  const row = await prisma.dealActivity.create({
    data: {
      tenantId, dealId, type: input.type, title: input.title.trim(), body: input.body?.trim() || null,
      actorId, actorName: actor?.name ?? null,
    },
  })
  return mapDealActivity(row)
}

export async function listAgendaItems(prisma: PrismaClient, tenantId: string): Promise<{ items: AgendaItem[] }> {
  const rows = await prisma.agendaItem.findMany({ where: { tenantId }, orderBy: [{ done: 'asc' }, { createdAt: 'desc' }] })
  return { items: rows.map(mapAgendaItem) }
}

export async function createAgendaItem(prisma: PrismaClient, tenantId: string, input: AgendaItemWriteInput): Promise<AgendaItem> {
  const row = await prisma.agendaItem.create({ data: { tenantId, title: input.title, timeLabel: input.timeLabel ?? null, priority: input.priority ?? null, done: input.done ?? false } })
  return mapAgendaItem(row)
}

export async function updateAgendaItem(prisma: PrismaClient, tenantId: string, id: string, input: AgendaItemUpdateInput): Promise<AgendaItem> {
  const existing = await prisma.agendaItem.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Agenda item not found')
  const row = await prisma.agendaItem.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.timeLabel !== undefined && { timeLabel: input.timeLabel }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.done !== undefined && { done: input.done }),
    },
  })
  return mapAgendaItem(row)
}

const dealInclude = {
  company: { select: { name: true } },
  owner: { select: { id: true, name: true, title: true } },
} as const

type PrismaDealWithIncludes = PrismaDeal & {
  company: { name: string } | null
  owner: { id: string; name: string; title: string } | null
}

// ── Money + misc helpers ──────────────────────────────────────────────────────

/** Resolve the tenant's reporting currency, or 404 if the tenant row is gone. */
async function getTenantCurrency(prisma: CrmClient, tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  return tenant.currency
}

/**
 * Convert a Prisma `Decimal` to the wire money form (integer minor units). Reading uses `'DOWN'`
 * so a stored 4-decimal value never throws on a 2-decimal currency — it truncates, never rounds
 * up into a figure the books don't support.
 */
function toMoneyWire(value: Prisma.Decimal | null, currency: string): { amount: number; currency: string } | null {
  if (value == null) return null
  return Money.fromDecimal(value.toString(), currency, 'DOWN').toWire()
}

/** Convert a wire-money minor-unit amount to the exact `Decimal` string for storage. */
function minorUnitsToDecimal(amount: number, currency: string): Prisma.Decimal {
  return new Prisma.Decimal(Money.fromMinorUnits(amount, currency).toDecimalString())
}

/** The API contract is percentage 0–100: a stored 1 is 1%, never an inferred fraction. */
function winProbabilityToPercent(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}

/** Won / (won + lost) as a percentage, or `null` when nothing has closed yet. */
function winRate(won: number, lost: number): number | null {
  const decided = won + lost
  if (decided === 0) return null
  return Number(((won / decided) * 100).toFixed(1))
}

function mapDeal(deal: PrismaDealWithIncludes, currency: string): Deal {
  return {
    id: deal.id,
    name: deal.name,
    stage: deal.stage,
    value: toMoneyWire(deal.value, deal.currency ?? currency) ?? { amount: 0, currency: deal.currency ?? currency },
    companyId: deal.companyId,
    company: deal.company?.name ?? null,
    ownerEmployeeId: deal.ownerEmployeeId,
    owner: deal.owner,
    winProbability: winProbabilityToPercent(deal.winProbability),
    closeDate: deal.closeDate?.toISOString() ?? null,
    closedAt: deal.closedAt?.toISOString() ?? null,
    productLine: deal.productLine,
    forecastBucket: deal.forecastBucket,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  }
}

/**
 * A single `groupBy` over `Deal.stage` gives every stage's count and value sum in one round
 * trip; the result is then zero-filled to the full schema order so the UI always renders the
 * same five stages.
 */
async function stageAggregates(
  prisma: PrismaClient,
  tenantId: string,
  extra: Prisma.DealWhereInput = {},
): Promise<Map<DealStage, { count: number; total: Prisma.Decimal }>> {
  const rows = await prisma.deal.groupBy({
    by: ['stage'],
    where: { tenantId, ...extra },
    _sum: { value: true },
    _count: { _all: true },
  })
  const map = new Map<DealStage, { count: number; total: Prisma.Decimal }>()
  for (const row of rows) {
    map.set(row.stage, { count: row._count._all, total: row._sum.value ?? new Prisma.Decimal(0) })
  }
  return map
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface DealListResult {
  items: Deal[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: DealSummary
}

export async function listDeals(
  prisma: PrismaClient,
  tenantId: string,
  query: DealListQuery,
): Promise<DealListResult> {
  const currency = await getTenantCurrency(prisma, tenantId)

  const where: Prisma.DealWhereInput = { tenantId }
  if (query.stage) where.stage = query.stage
  if (query.openOnly === true) {
    if (query.stage) where.AND = [{ stage: { in: [...OPEN_STAGES] } }]
    else where.stage = { in: [...OPEN_STAGES] }
  }
  if (query.ownerId) where.ownerEmployeeId = query.ownerId
  if (query.closedFrom || query.closedBefore) where.closedAt = {
    ...(query.closedFrom && { gte: new Date(`${query.closedFrom}T00:00:00Z`) }),
    ...(query.closedBefore && { lt: new Date(`${query.closedBefore}T00:00:00Z`) }),
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { company: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { owner: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { productLine: { contains: query.search, mode: 'insensitive' } },
    ]
  }
  const { skip, take } = toPrismaPage(query)
  const [items, total, stageMap] = await Promise.all([
    prisma.deal.findMany({ where, skip, take,
      orderBy: query.sort === 'VALUE_DESC' ? [{ value: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }],
      include: dealInclude,
    }),
    prisma.deal.count({ where }),
    stageAggregates(prisma, tenantId, where),
  ])

  const open = OPEN_STAGES.reduce((acc, stage) => acc + (stageMap.get(stage)?.count ?? 0), 0)
  const openValue = OPEN_STAGES.reduce((acc, stage) => acc.add(stageMap.get(stage)?.total ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
  const won = stageMap.get('CLOSED_WON')
  const lost = stageMap.get('CLOSED_LOST')

  return {
    items: items.map(item => mapDeal(item, currency)),
    pagination: buildPaginationMeta(query, total),
    summary: {
      openDealCount: open,
      openPipelineValue: toMoneyWire(openValue, currency)!,
      wonCount: won?.count ?? 0,
      wonValue: toMoneyWire(won?.total ?? new Prisma.Decimal(0), currency)!,
      lostCount: lost?.count ?? 0,
      lostValue: toMoneyWire(lost?.total ?? new Prisma.Decimal(0), currency)!,
      winRate: winRate(won?.count ?? 0, lost?.count ?? 0),
    },
  }
}

export async function getDeal(prisma: PrismaClient, tenantId: string, id: string): Promise<Deal> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const deal = await prisma.deal.findFirst({ where: { id, tenantId }, include: dealInclude })
  if (!deal) throw new AppError(404, 'Deal not found')
  return mapDeal(deal, currency)
}

// ── Overview ──────────────────────────────────────────────────────────────────

export async function getOverview(prisma: PrismaClient, tenantId: string): Promise<CrmOverview> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true, timezone: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const { currency, timezone } = tenant
  const today = tenantToday(timezone)
  const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const currentEnd = new Date(today)
  currentEnd.setUTCDate(currentEnd.getUTCDate() + 1)
  const previousStart = new Date(currentStart)
  previousStart.setUTCMonth(previousStart.getUTCMonth() - 1)
  const previousMonthLength = new Date(Date.UTC(previousStart.getUTCFullYear(), previousStart.getUTCMonth() + 1, 0)).getUTCDate()
  const previousElapsedDays = Math.min(today.getUTCDate(), previousMonthLength)
  const previousEnd = new Date(previousStart)
  previousEnd.setUTCDate(previousElapsedDays + 1)
  const dateKey = (date: Date) => date.toISOString().slice(0, 10)

  const [stageMap, createdLast7Days, monthlyOutcomes, periodOutcomeRows, conversionRows, openCountHistory] = await Promise.all([
    stageAggregates(prisma, tenantId),
    prisma.deal.count({ where: { tenantId, stage: { in: [...OPEN_STAGES] }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.$queryRaw<Array<{ month: string; stage: string; count: bigint }>>`
      SELECT to_char("closedAt" AT TIME ZONE ${timezone}, 'YYYY-MM') AS month,
             "stage"::text AS stage,
             count(*)::bigint AS count
      FROM "Deal"
      WHERE "tenantId" = ${tenantId}
        AND "stage"::text IN ('CLOSED_WON', 'CLOSED_LOST')
        AND "closedAt" IS NOT NULL
      GROUP BY to_char("closedAt" AT TIME ZONE ${timezone}, 'YYYY-MM'), "stage"
      ORDER BY month
    `,
    prisma.$queryRaw<Array<{ currentWonCount: bigint; currentLostCount: bigint; previousWonCount: bigint; previousLostCount: bigint }>>`
      SELECT
        count(*) FILTER (WHERE "stage"::text = 'CLOSED_WON'
          AND "closedAt" >= (${dateKey(currentStart)}::date::timestamp AT TIME ZONE ${timezone})
          AND "closedAt" < (${dateKey(currentEnd)}::date::timestamp AT TIME ZONE ${timezone}))::bigint AS "currentWonCount",
        count(*) FILTER (WHERE "stage"::text = 'CLOSED_LOST'
          AND "closedAt" >= (${dateKey(currentStart)}::date::timestamp AT TIME ZONE ${timezone})
          AND "closedAt" < (${dateKey(currentEnd)}::date::timestamp AT TIME ZONE ${timezone}))::bigint AS "currentLostCount",
        count(*) FILTER (WHERE "stage"::text = 'CLOSED_WON'
          AND "closedAt" >= (${dateKey(previousStart)}::date::timestamp AT TIME ZONE ${timezone})
          AND "closedAt" < (${dateKey(previousEnd)}::date::timestamp AT TIME ZONE ${timezone}))::bigint AS "previousWonCount",
        count(*) FILTER (WHERE "stage"::text = 'CLOSED_LOST'
          AND "closedAt" >= (${dateKey(previousStart)}::date::timestamp AT TIME ZONE ${timezone})
          AND "closedAt" < (${dateKey(previousEnd)}::date::timestamp AT TIME ZONE ${timezone}))::bigint AS "previousLostCount"
      FROM "Deal"
      WHERE "tenantId" = ${tenantId}
        AND "stage"::text IN ('CLOSED_WON', 'CLOSED_LOST')
        AND "closedAt" >= (${dateKey(previousStart)}::date::timestamp AT TIME ZONE ${timezone})
        AND "closedAt" < (${dateKey(currentEnd)}::date::timestamp AT TIME ZONE ${timezone})
    `,
    prisma.$queryRaw<Array<{ fromStage: string; toStage: string; enteredCount: bigint; convertedCount: bigint }>>`
      WITH stage_pairs("fromStage", "toStage") AS (
        VALUES
          ('LEADS'::"DealStage", 'PROPOSAL'::"DealStage"),
          ('PROPOSAL'::"DealStage", 'NEGOTIATION'::"DealStage"),
          ('NEGOTIATION'::"DealStage", 'CLOSED_WON'::"DealStage")
      ), entered AS (
        SELECT history."dealId", history."toStage", min(history."occurredAt") AS "enteredAt"
        FROM "DealStageHistory" AS history
        WHERE history."tenantId" = ${tenantId}
          AND history."isBaseline" = FALSE
          AND history."toStage" IN ('LEADS'::"DealStage", 'PROPOSAL'::"DealStage", 'NEGOTIATION'::"DealStage")
        GROUP BY history."dealId", history."toStage"
      )
      SELECT pair."fromStage"::text AS "fromStage",
             pair."toStage"::text AS "toStage",
             count(entered."dealId")::bigint AS "enteredCount",
             count(entered."dealId") FILTER (WHERE EXISTS (
               SELECT 1 FROM "DealStageHistory" AS converted
               WHERE converted."tenantId" = ${tenantId}
                 AND converted."dealId" = entered."dealId"
                 AND converted."isBaseline" = FALSE
                 AND converted."toStage" = pair."toStage"
                 AND converted."occurredAt" >= entered."enteredAt"
             ))::bigint AS "convertedCount"
      FROM stage_pairs AS pair
      LEFT JOIN entered ON entered."toStage" = pair."fromStage"
      GROUP BY pair."fromStage", pair."toStage"
      ORDER BY pair."fromStage"
    `,
    prisma.$queryRaw<Array<{ previousCount: bigint | null; previousTotal: Prisma.Decimal | null }>>`
      WITH coverage AS (
        SELECT "startsAt" FROM "CrmHistoryCoverage" WHERE "tenantId" = ${tenantId}
      ), latest_stage AS (
        SELECT DISTINCT ON (history."dealId") history."dealId", history."toStage", history."value"
        FROM "DealStageHistory" AS history
        WHERE history."tenantId" = ${tenantId}
          AND history."occurredAt" < ((${dateKey(previousEnd)}::date::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC')
        ORDER BY history."dealId", history."occurredAt" DESC, history."id" DESC
      )
      SELECT CASE WHEN coverage."startsAt" <= ((${dateKey(previousEnd)}::date::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC') THEN
        count(*) FILTER (WHERE latest_stage."toStage"::text IN ('LEADS', 'PROPOSAL', 'NEGOTIATION'))::bigint
        ELSE NULL::bigint END AS "previousCount",
        CASE WHEN coverage."startsAt" <= ((${dateKey(previousEnd)}::date::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC') THEN
          COALESCE(sum(latest_stage."value") FILTER (WHERE latest_stage."toStage"::text IN ('LEADS', 'PROPOSAL', 'NEGOTIATION')), 0)
        ELSE NULL::numeric END AS "previousTotal"
      FROM coverage LEFT JOIN latest_stage ON TRUE
      GROUP BY coverage."startsAt"
    `,
  ])

  const rows = DealStageValues.map(stage => {
    const row = stageMap.get(stage)
    return {
      stage,
      count: row?.count ?? 0,
      value: toMoneyWire(row?.total ?? new Prisma.Decimal(0), currency)!,
    }
  })

  // The bar's true proportion of the largest stage's value — `null` (rendered at 0%) when no
  // stage holds any value, so an empty workspace never paints a misleading full-width bar.
  const maxValue = Math.max(...rows.map(row => row.value.amount))
  const funnel: FunnelStage[] = rows.map(row => ({
    ...row,
    share: maxValue > 0 ? row.value.amount / maxValue : null,
  }))

  const openCount = OPEN_STAGES.reduce((acc, stage) => acc + (stageMap.get(stage)?.count ?? 0), 0)
  const openTotal = OPEN_STAGES.reduce(
    (acc, stage) => acc.add(stageMap.get(stage)?.total ?? new Prisma.Decimal(0)),
    new Prisma.Decimal(0),
  )
  const won = stageMap.get('CLOSED_WON')
  const lost = stageMap.get('CLOSED_LOST')
  const outcomeMonths = new Map<string, { wonCount: number; lostCount: number }>()
  for (const row of monthlyOutcomes) {
    const month = outcomeMonths.get(row.month) ?? { wonCount: 0, lostCount: 0 }
    if (row.stage === 'CLOSED_WON') month.wonCount = Number(row.count)
    if (row.stage === 'CLOSED_LOST') month.lostCount = Number(row.count)
    outcomeMonths.set(row.month, month)
  }
  const monthlyWinRate = [...outcomeMonths.entries()].map(([month, counts]) => ({
    month,
    ...counts,
    rate: winRate(counts.wonCount, counts.lostCount),
  }))
  const periodOutcomes = periodOutcomeRows[0]
  const currentMonthWonCount = Number(periodOutcomes?.currentWonCount ?? 0n)
  const currentMonthLostCount = Number(periodOutcomes?.currentLostCount ?? 0n)
  const previousMonthWonCount = Number(periodOutcomes?.previousWonCount ?? 0n)
  const previousMonthLostCount = Number(periodOutcomes?.previousLostCount ?? 0n)
  const stageConversions: StageConversion[] = conversionRows.map(row => {
    const enteredCount = Number(row.enteredCount)
    const convertedCount = Number(row.convertedCount)
    return {
      fromStage: row.fromStage as StageConversion['fromStage'],
      toStage: row.toStage as StageConversion['toStage'],
      enteredCount,
      convertedCount,
      rate: enteredCount === 0 ? null : Number(((convertedCount / enteredCount) * 100).toFixed(1)),
    }
  })

  return {
    pipeline: {
      openTotal: toMoneyWire(openTotal, currency)!,
      openCount,
      wonTotal: toMoneyWire(won?.total ?? new Prisma.Decimal(0), currency)!,
      wonCount: won?.count ?? 0,
      lostTotal: toMoneyWire(lost?.total ?? new Prisma.Decimal(0), currency)!,
      lostCount: lost?.count ?? 0,
      openCountComparison: {
        previousAsOfDate: dateKey(new Date(previousEnd.getTime() - 86_400_000)),
        previousCount: openCountHistory[0]?.previousCount == null ? null : Number(openCountHistory[0].previousCount),
      },
      openTotalComparison: {
        previousAsOfDate: dateKey(new Date(previousEnd.getTime() - 86_400_000)),
        previousTotal: toMoneyWire(openCountHistory[0]?.previousTotal ?? null, currency),
      },
    },
    winRate: winRate(won?.count ?? 0, lost?.count ?? 0),
    monthlyWinRate,
    winRateComparison: {
      current: {
        startDate: dateKey(currentStart), endDateExclusive: dateKey(currentEnd),
        wonCount: currentMonthWonCount, lostCount: currentMonthLostCount,
        rate: winRate(currentMonthWonCount, currentMonthLostCount),
      },
      previous: {
        startDate: dateKey(previousStart), endDateExclusive: dateKey(previousEnd),
        wonCount: previousMonthWonCount, lostCount: previousMonthLostCount,
        rate: winRate(previousMonthWonCount, previousMonthLostCount),
      },
    },
    createdLast7Days,
    funnel,
    stageConversions,
  }
}

// ── Forecast ──────────────────────────────────────────────────────────────────

/**
 * Open deals bucketed by their stored `closeDate` month — the only row that appears for a
 * month is one with a real deal closing in it. `to_char` in a single `$queryRaw` is the
 * supported way to bucket by month in Postgres (Prisma's `groupBy` cannot `date_trunc`).
 */
async function monthlyOpenPipeline(
  prisma: PrismaClient,
  tenantId: string,
  currency: string,
  year: string,
): Promise<MonthlyPipelineEntry[]> {
  const rows = await prisma.$queryRaw<Array<{ month: string; count: bigint; value: Prisma.Decimal }>>`
    SELECT to_char("closeDate", 'YYYY-MM') AS month,
           count(*)::bigint AS count,
           sum("value") AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId}
      AND "stage"::text IN (${Prisma.join([...OPEN_STAGES])})
      AND "closeDate" IS NOT NULL
      AND "closeDate" >= ${new Date(`${year}-01-01T00:00:00.000Z`)}
      AND "closeDate" < ${new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`)}
    GROUP BY to_char("closeDate", 'YYYY-MM')
    ORDER BY month
  `
  return rows.map(row => ({
    month: row.month,
    count: Number(row.count),
    value: toMoneyWire(row.value, currency)!,
  }))
}

async function monthlyCommittedPipeline(
  prisma: PrismaClient,
  tenantId: string,
  currency: string,
  year: string,
): Promise<MonthlyPipelineEntry[]> {
  const rows = await prisma.$queryRaw<Array<{ month: string; count: bigint; value: Prisma.Decimal }>>`
    SELECT to_char("closeDate", 'YYYY-MM') AS month,
           count(*)::bigint AS count,
           sum("value") AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId}
      AND "stage"::text IN (${Prisma.join([...OPEN_STAGES])})
      AND upper("forecastBucket") = 'COMMIT'
      AND "closeDate" IS NOT NULL
      AND "closeDate" >= ${new Date(`${year}-01-01T00:00:00.000Z`)}
      AND "closeDate" < ${new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`)}
    GROUP BY to_char("closeDate", 'YYYY-MM')
    ORDER BY month
  `
  return rows.map(row => ({ month: row.month, count: Number(row.count), value: toMoneyWire(row.value, currency)! }))
}

async function monthlyWeightedOpenPipeline(
  prisma: PrismaClient,
  tenantId: string,
  currency: string,
  year: string,
): Promise<MonthlyPipelineEntry[]> {
  const rows = await prisma.$queryRaw<Array<{ month: string; count: bigint; value: Prisma.Decimal }>>`
    SELECT to_char("closeDate", 'YYYY-MM') AS month,
           count(*)::bigint AS count,
           sum("value" * ("winProbability"::numeric / 100)) AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId}
      AND "stage"::text IN (${Prisma.join([...OPEN_STAGES])})
      AND "winProbability" BETWEEN 0 AND 100
      AND "closeDate" IS NOT NULL
      AND "closeDate" >= ${new Date(`${year}-01-01T00:00:00.000Z`)}
      AND "closeDate" < ${new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`)}
    GROUP BY to_char("closeDate", 'YYYY-MM')
    ORDER BY month
  `
  return rows.map(row => ({ month: row.month, count: Number(row.count), value: toMoneyWire(row.value, currency)! }))
}

function mapSalesQuota(row: { id: string; employeeId: string | null; repName: string; period: string; quota: Prisma.Decimal; currency: string | null; createdAt: Date }): SalesQuotaRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    repName: row.repName,
    period: row.period,
    quota: row.currency ? toMoneyWire(row.quota, row.currency) : null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function lockQuotaTenant(prisma: CrmClient, tenantId: string): Promise<string> {
  const locked = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`
  if (!locked.length) throw new AppError(404, 'Workspace not found')
  return getTenantCurrency(prisma, tenantId)
}

async function quotaRepName(prisma: CrmClient, tenantId: string, employeeId: string | null, requestedName: string): Promise<string> {
  if (!employeeId) return requestedName.trim()
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { name: true } })
  if (!employee) throw new AppError(400, 'Quota owner does not belong to this workspace')
  return employee.name
}

function quotaIdentityWhere(tenantId: string, employeeId: string | null, repName: string, period: string) {
  return {
    tenantId,
    period,
    ...(employeeId
      ? { employeeId }
      : { employeeId: null, repName: { equals: repName, mode: 'insensitive' as const } }),
  }
}

function quotaAmountToDecimal(input: string, currency: string): Prisma.Decimal {
  try {
    return new Prisma.Decimal(Money.fromDecimal(input, currency).toDecimalString())
  } catch {
    throw new AppError(400, `Invalid quota amount for the ${currency} workspace currency`)
  }
}

export async function createSalesQuota(prisma: CrmClient, tenantId: string, input: SalesQuotaWriteInput): Promise<SalesQuotaRow> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => createSalesQuota(tx, tenantId, input))
  const currency = await lockQuotaTenant(prisma, tenantId)
  const employeeId = input.employeeId ?? null
  const repName = await quotaRepName(prisma, tenantId, employeeId, input.repName)
  const duplicate = await prisma.salesQuota.findFirst({
    where: quotaIdentityWhere(tenantId, employeeId, repName, input.period),
    select: { id: true },
  })
  if (duplicate) throw new AppError(409, 'A quota already exists for this rep and period')
  const row = await prisma.salesQuota.create({ data: {
    tenantId, currency, employeeId, repName, period: input.period,
    quota: quotaAmountToDecimal(input.quota, currency),
  } })
  return mapSalesQuota(row)
}

export async function updateSalesQuota(prisma: CrmClient, tenantId: string, id: string, input: SalesQuotaUpdateInput): Promise<SalesQuotaRow> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => updateSalesQuota(tx, tenantId, id, input))
  const currency = await lockQuotaTenant(prisma, tenantId)
  const existing = await prisma.salesQuota.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Quota not found')
  const employeeId = input.employeeId !== undefined ? input.employeeId : existing.employeeId
  const repName = await quotaRepName(prisma, tenantId, employeeId, input.repName ?? existing.repName)
  const period = input.period ?? existing.period
  const duplicate = await prisma.salesQuota.findFirst({
    where: {
      ...quotaIdentityWhere(tenantId, employeeId, repName, period),
      id: { not: id },
    },
    select: { id: true },
  })
  if (duplicate) throw new AppError(409, 'A quota already exists for this rep and period')
  const row = await prisma.salesQuota.update({
    where: { id, tenantId },
    data: {
      ...(input.employeeId !== undefined && { employeeId }),
      ...(input.repName !== undefined || input.employeeId !== undefined ? { repName } : {}),
      ...(input.period !== undefined && { period }),
      ...(input.quota !== undefined && { quota: quotaAmountToDecimal(input.quota, currency), currency }),
    },
  })
  return mapSalesQuota(row)
}

export async function deleteSalesQuota(prisma: CrmClient, tenantId: string, id: string): Promise<SalesQuotaRow> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => deleteSalesQuota(tx, tenantId, id))
  await lockQuotaTenant(prisma, tenantId)
  const existing = await prisma.salesQuota.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Quota not found')
  return mapSalesQuota(await prisma.salesQuota.delete({ where: { id, tenantId } }))
}

export async function getForecast(prisma: PrismaClient, tenantId: string, year = String(new Date().getFullYear())): Promise<CrmForecast> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const [snapshotRows, quotaRows, monthlyPipeline, monthlyCommit, monthlyWeightedPipeline, yearRows, totalPipelineRows] = await Promise.all([
    prisma.forecastSnapshot.findMany({ where: { tenantId, period: { startsWith: year } }, orderBy: { createdAt: 'desc' } }),
    prisma.salesQuota.findMany({ where: { tenantId, period: { startsWith: year } }, orderBy: { createdAt: 'desc' } }),
    monthlyOpenPipeline(prisma, tenantId, currency, year),
    monthlyCommittedPipeline(prisma, tenantId, currency, year),
    monthlyWeightedOpenPipeline(prisma, tenantId, currency, year),
    prisma.$queryRaw<Array<{ year: string }>>`
      SELECT DISTINCT year FROM (
        SELECT substring("period" from 1 for 4) AS year FROM "ForecastSnapshot"
          WHERE "tenantId" = ${tenantId} AND "period" ~ '^[0-9]{4}'
        UNION
        SELECT substring("period" from 1 for 4) AS year FROM "SalesQuota"
          WHERE "tenantId" = ${tenantId} AND "period" ~ '^[0-9]{4}'
        UNION
        SELECT to_char("closeDate", 'YYYY') AS year FROM "Deal"
          WHERE "tenantId" = ${tenantId} AND "closeDate" IS NOT NULL
      ) AS years
      ORDER BY year DESC
    `,
    prisma.$queryRaw<Array<{ value: Prisma.Decimal; weightedValue: Prisma.Decimal; unweightedValue: Prisma.Decimal; unweightedCount: bigint; dealCommit: Prisma.Decimal; dealBestCase: Prisma.Decimal }>>`
      SELECT COALESCE(sum("value"), 0) AS value,
        COALESCE(sum("value" * ("winProbability"::numeric / 100)) FILTER (WHERE "winProbability" BETWEEN 0 AND 100), 0) AS "weightedValue",
        COALESCE(sum("value") FILTER (WHERE "winProbability" IS NULL OR "winProbability" < 0 OR "winProbability" > 100), 0) AS "unweightedValue",
        count(*) FILTER (WHERE "winProbability" IS NULL OR "winProbability" < 0 OR "winProbability" > 100)::bigint AS "unweightedCount",
        COALESCE(sum("value") FILTER (WHERE upper("forecastBucket") = 'COMMIT'), 0) AS "dealCommit",
        COALESCE(sum("value") FILTER (WHERE upper("forecastBucket") IN ('COMMIT', 'BEST_CASE')), 0) AS "dealBestCase"
      FROM "Deal"
      WHERE "tenantId" = ${tenantId}
        AND "stage"::text IN (${Prisma.join([...OPEN_STAGES])})
        AND "closeDate" >= ${new Date(`${year}-01-01T00:00:00.000Z`)}
        AND "closeDate" < ${new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`)}
    `,
  ])
  const snapshotKeys = new Set<string>()
  const snapshots = snapshotRows.filter(row => {
    const key = `${row.repName}\u0000${row.period}`
    if (snapshotKeys.has(key)) return false
    snapshotKeys.add(key)
    return true
  })
  const quotaKeys = new Set<string>()
  const quotas = quotaRows.filter(row => {
    const key = `${row.employeeId ?? row.repName}\u0000${row.period}`
    if (quotaKeys.has(key)) return false
    quotaKeys.add(key)
    return true
  })
  const totals = totalPipelineRows[0]
  const totalPipeline = toMoneyWire(totals?.value ?? new Prisma.Decimal(0), currency)?.amount ?? 0
  const weightedPipeline = toMoneyWire(totals?.weightedValue ?? new Prisma.Decimal(0), currency)!
  const unweightedPipeline = toMoneyWire(totals?.unweightedValue ?? new Prisma.Decimal(0), currency)!
  const dealCommit = toMoneyWire(totals?.dealCommit ?? new Prisma.Decimal(0), currency)!
  const dealBestCase = toMoneyWire(totals?.dealBestCase ?? new Prisma.Decimal(0), currency)!
  // Only annual quotas recorded in the tenant base currency belong in the selected-year total.
  // Quarter/month quotas remain available for matching forecast periods but are not mixed into
  // the annual coverage calculation; unknown/foreign legacy currency is never relabeled.
  const annualBaseQuotas = quotas.filter(quota => quota.period === year && quota.currency === currency)
  const totalQuota = toMoneyWire(
    annualBaseQuotas.reduce((total, quota) => total.add(quota.quota), new Prisma.Decimal(0)),
    currency,
  )?.amount ?? 0
  const totalCommit = toMoneyWire(
    snapshots.reduce((total, snapshot) => total.add(snapshot.commit), new Prisma.Decimal(0)),
    currency,
  )!
  const totalBestCase = toMoneyWire(
    snapshots.reduce((total, snapshot) => total.add(snapshot.bestCase), new Prisma.Decimal(0)),
    currency,
  )!

  return {
    year,
    availableYears: [...new Set([...yearRows.map(row => row.year), year])],
    forecastByRep: snapshots.map(snapshot => ({
      id: snapshot.id,
      repName: snapshot.repName,
      period: snapshot.period,
      closed: toMoneyWire(snapshot.closed, currency)!,
      commit: toMoneyWire(snapshot.commit, currency)!,
      bestCase: toMoneyWire(snapshot.bestCase, currency)!,
      quotaPct: snapshot.quotaPct == null ? null : Number(snapshot.quotaPct.toFixed(1)),
      createdAt: snapshot.createdAt.toISOString(),
    })),
    quotas: quotas.map(quota => ({
      id: quota.id,
      employeeId: quota.employeeId,
      repName: quota.repName,
      period: quota.period,
      quota: quota.currency ? toMoneyWire(quota.quota, quota.currency) : null,
      createdAt: quota.createdAt.toISOString(),
    })),
    monthlyPipeline,
    monthlyCommit,
    monthlyWeightedPipeline,
    summary: {
      totalPipeline: { amount: totalPipeline, currency },
      totalQuota: { amount: totalQuota, currency },
      totalCommit,
      totalBestCase,
      weightedPipeline,
      unweightedPipeline,
      unweightedDealCount: Number(totals?.unweightedCount ?? 0),
      dealCommit,
      dealBestCase,
      quotaAttainmentPct: totalQuota === 0 ? null : Math.round((totalPipeline / totalQuota) * 10000) / 100,
      excludedQuotaCount: quotas.length - annualBaseQuotas.length,
    },
  }
}

// ── Sales performance ─────────────────────────────────────────────────────────

export async function getSalesPerformance(
  prisma: PrismaClient,
  tenantId: string,
  year = String(new Date().getUTCFullYear()),
): Promise<CrmSalesPerformance> {
  const currency = await getTenantCurrency(prisma, tenantId)

  const yearStart = new Date(0)
  yearStart.setUTCFullYear(Number(year), 0, 1)
  yearStart.setUTCHours(0, 0, 0, 0)
  const yearEnd = new Date(yearStart)
  yearEnd.setUTCFullYear(Number(year) + 1)
  const previousYearStart = new Date(yearStart)
  previousYearStart.setUTCFullYear(Number(year) - 1)
  const now = new Date()
  const anchor = now < yearStart ? yearStart : now >= yearEnd ? new Date(yearEnd.getTime() - 1) : now
  const lastWeek = new Date(anchor)
  lastWeek.setUTCHours(0, 0, 0, 0)
  lastWeek.setUTCDate(lastWeek.getUTCDate() - (lastWeek.getUTCDay() + 6) % 7)
  const firstWeek = new Date(lastWeek.getTime() - 21 * 86400000)

  // Actual outcomes in the selected UTC calendar year, never expected dates or last edits.
  const wonByMonth = await prisma.$queryRaw<Array<{ month: string; count: bigint; value: Prisma.Decimal }>>`
    SELECT to_char("closedAt", 'YYYY-MM') AS month,
           count(*)::bigint AS count,
           sum("value") AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId}
      AND "stage"::text = 'CLOSED_WON'
      AND "closedAt" >= ${yearStart} AND "closedAt" < ${yearEnd}
    GROUP BY to_char("closedAt", 'YYYY-MM')
    ORDER BY month
  `
  const cycleRows = await prisma.$queryRaw<Array<{ value: number | null }>>`
    SELECT AVG(EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 86400)::float8 AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId} AND "stage"::text = 'CLOSED_WON'
      AND "closedAt" >= ${yearStart} AND "closedAt" < ${yearEnd}
      AND "closedAt" >= "createdAt"
  `
  const yearWonRows = await prisma.$queryRaw<Array<{ closedYear: number; value: Prisma.Decimal | null }>>`
    SELECT EXTRACT(YEAR FROM "closedAt")::int AS "closedYear", COALESCE(sum("value"), 0) AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId}
      AND "stage"::text = 'CLOSED_WON'
      AND "closedAt" >= ${previousYearStart} AND "closedAt" < ${yearEnd}
    GROUP BY EXTRACT(YEAR FROM "closedAt")
  `
  const undatedClosedCount = await prisma.deal.count({ where: { tenantId, stage: { in: [...CLOSED_STAGES] }, closedAt: null } })
  const activityRows = await prisma.$queryRaw<Array<{ week: string; active: bigint; won: bigint; lost: bigint }>>`
    WITH weeks AS (
      SELECT generate_series(${firstWeek}::timestamp, ${lastWeek}::timestamp, INTERVAL '1 week') AS week_start
    )
    SELECT to_char(weeks.week_start, 'YYYY-MM-DD') AS week,
      count(DISTINCT history."dealId") FILTER (WHERE history."toStage"::text IN (${Prisma.join([...OPEN_STAGES])}))::bigint AS active,
      count(DISTINCT history."dealId") FILTER (WHERE history."toStage"::text = 'CLOSED_WON')::bigint AS won,
      count(DISTINCT history."dealId") FILTER (WHERE history."toStage"::text = 'CLOSED_LOST')::bigint AS lost
    FROM weeks
    LEFT JOIN "DealStageHistory" AS history ON history."tenantId" = ${tenantId}
      AND history."occurredAt" >= weeks.week_start AND history."occurredAt" < weeks.week_start + INTERVAL '1 week'
      AND history."occurredAt" >= ${yearStart} AND history."occurredAt" < ${yearEnd}
    GROUP BY weeks.week_start
    ORDER BY weeks.week_start
  `
  const activityByWeek = new Map(activityRows.map(row => [row.week, { active: Number(row.active), won: Number(row.won), lost: Number(row.lost) }]))
  const weeklyActivity = [...activityByWeek].map(([week, counts]) => ({ week, ...counts }))
  const monthlyClosedWon = wonByMonth.map(row => ({
    month: row.month,
    count: Number(row.count),
    value: toMoneyWire(row.value, currency)!,
  }))

  // Per-rep breakdown: one groupBy by owner + stage gives every rep's open/won/lost counts and
  // values in a single round trip. `groupBy` cannot include a relation, so the display names are
  // fetched once (every tenant employee) and looked up by id rather than per-row.
  const [byOwner, employees] = await Promise.all([
    prisma.deal.groupBy({
      by: ['ownerEmployeeId', 'stage'],
      where: { tenantId, OR: [
        { stage: { in: [...OPEN_STAGES] } },
        { stage: { in: [...CLOSED_STAGES] }, closedAt: { gte: yearStart, lt: yearEnd } },
      ] },
      _sum: { value: true },
      _count: { _all: true },
    }),
    prisma.employee.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ])
  const repActivityRows = await prisma.$queryRaw<Array<{ ownerEmployeeId: string | null; week: string; active: bigint; won: bigint; lost: bigint }>>`
    WITH weeks AS (
      SELECT generate_series(${firstWeek}::timestamp, ${lastWeek}::timestamp, INTERVAL '1 week') AS week_start
    ), owners AS (
      SELECT DISTINCT "ownerEmployeeId" FROM "Deal" WHERE "tenantId" = ${tenantId}
      UNION
      SELECT DISTINCT "ownerEmployeeId" FROM "DealStageHistory" WHERE "tenantId" = ${tenantId}
        AND "occurredAt" >= ${firstWeek} AND "occurredAt" >= ${yearStart} AND "occurredAt" < ${yearEnd}
    )
    SELECT owners."ownerEmployeeId",
      to_char(weeks.week_start, 'YYYY-MM-DD') AS week,
      count(DISTINCT history."dealId") FILTER (WHERE history."toStage"::text IN (${Prisma.join([...OPEN_STAGES])}))::bigint AS active,
      count(DISTINCT history."dealId") FILTER (WHERE history."toStage"::text = 'CLOSED_WON')::bigint AS won,
      count(DISTINCT history."dealId") FILTER (WHERE history."toStage"::text = 'CLOSED_LOST')::bigint AS lost
    FROM owners CROSS JOIN weeks
    LEFT JOIN "DealStageHistory" AS history ON history."tenantId" = ${tenantId}
      AND history."ownerEmployeeId" IS NOT DISTINCT FROM owners."ownerEmployeeId"
      AND history."occurredAt" >= weeks.week_start AND history."occurredAt" < weeks.week_start + INTERVAL '1 week'
      AND history."occurredAt" >= ${yearStart} AND history."occurredAt" < ${yearEnd}
    GROUP BY owners."ownerEmployeeId", weeks.week_start
    ORDER BY weeks.week_start
  `
  const activityByOwner = new Map<string, Array<{ week: string; active: number; won: number; lost: number }>>()
  for (const row of repActivityRows) {
    const key = row.ownerEmployeeId ?? '__unassigned__'
    const trend = activityByOwner.get(key) ?? []
    trend.push({ week: row.week, active: Number(row.active), won: Number(row.won), lost: Number(row.lost) })
    activityByOwner.set(key, trend)
  }
  const ownerNameById = new Map(employees.map(employee => [employee.id, employee.name]))

  interface RepAccumulator {
    ownerEmployeeId: string | null
    ownerName: string | null
    openValue: number
    wonValue: number
    lostValue: number
    openCount: number
    wonCount: number
    lostCount: number
  }
  const reps = new Map<string, RepAccumulator>()
  for (const row of byOwner) {
    const key = row.ownerEmployeeId ?? '__unassigned__'
    let rep = reps.get(key)
    if (!rep) {
      rep = {
        ownerEmployeeId: row.ownerEmployeeId,
        ownerName: row.ownerEmployeeId ? (ownerNameById.get(row.ownerEmployeeId) ?? null) : null,
        openValue: 0,
        wonValue: 0,
        lostValue: 0,
        openCount: 0,
        wonCount: 0,
        lostCount: 0,
      }
      reps.set(key, rep)
    }
    const value = toMoneyWire(row._sum.value ?? new Prisma.Decimal(0), currency)?.amount ?? 0
    if (row.stage === 'CLOSED_WON') {
      rep.wonCount += row._count._all
      rep.wonValue += value
    } else if (row.stage === 'CLOSED_LOST') {
      rep.lostCount += row._count._all
      rep.lostValue += value
    } else {
      rep.openCount += row._count._all
      rep.openValue += value
    }
  }

  // Keep activity under the owner recorded at the event, even after reassignment.
  for (const [key, activity] of activityByOwner) {
    if (reps.has(key) || !activity.some(week => week.active + week.won + week.lost > 0)) continue
    const ownerEmployeeId = key === '__unassigned__' ? null : key
    reps.set(key, {
      ownerEmployeeId, ownerName: ownerEmployeeId ? ownerNameById.get(ownerEmployeeId) ?? null : null,
      openValue: 0, wonValue: 0, lostValue: 0, openCount: 0, wonCount: 0, lostCount: 0,
    })
  }
  const byRep = [...reps.values()].sort((a, b) => {
    if (a.openValue !== b.openValue) return b.openValue - a.openValue
    return (a.ownerName ?? '').localeCompare(b.ownerName ?? '')
  })
  const totalWon = Money.sum(byRep.map(rep => Money.fromMinorUnits(rep.wonValue, currency)), currency).toWire()
  const totalWonCount = byRep.reduce((total, rep) => total + rep.wonCount, 0)
  const totalLostCount = byRep.reduce((total, rep) => total + rep.lostCount, 0)
  const yearWonTotal = yearWonRows.find(row => row.closedYear === Number(year))?.value ?? new Prisma.Decimal(0)
  const previousYearWonTotal = yearWonRows.find(row => row.closedYear === Number(year) - 1)?.value ?? new Prisma.Decimal(0)

  return {
    year,
    yearWonTotal: toMoneyWire(yearWonTotal, currency)!,
    previousYearWonTotal: toMoneyWire(previousYearWonTotal, currency)!,
    undatedClosedCount,
    monthlyClosedWon,
    weeklyActivity,
    byRep: byRep.map(rep => ({
      ownerEmployeeId: rep.ownerEmployeeId,
      ownerName: rep.ownerName,
      openCount: rep.openCount,
      openValue: { amount: rep.openValue, currency },
      wonCount: rep.wonCount,
      wonValue: { amount: rep.wonValue, currency },
      lostCount: rep.lostCount,
      lostValue: { amount: rep.lostValue, currency },
      winRate: winRate(rep.wonCount, rep.lostCount),
      weeklyActivity: activityByOwner.get(rep.ownerEmployeeId ?? '__unassigned__') ?? [],
    })),
    summary: {
      totalWon,
      totalWonCount,
      totalLostCount,
      overallWinRate: winRate(totalWonCount, totalLostCount),
      averageSalesCycleDays: cycleRows[0]?.value ?? null,
    },
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Throws unless `companyId` (when provided) names a company in this tenant. */
async function assertCompanyInTenant(
  prisma: CrmClient,
  tenantId: string,
  companyId: string | null | undefined,
): Promise<void> {
  if (companyId === undefined) return
  if (companyId === null) return
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } })
  if (!company) throw new AppError(400, 'Company does not belong to this workspace')
}

/** Throws unless `ownerEmployeeId` (when provided) names an employee in this tenant. */
async function assertOwnerInTenant(
  prisma: CrmClient,
  tenantId: string,
  ownerEmployeeId: string | null | undefined,
): Promise<void> {
  if (ownerEmployeeId === undefined) return
  if (ownerEmployeeId === null) return
  const employee = await prisma.employee.findFirst({ where: { id: ownerEmployeeId, tenantId } })
  if (!employee) throw new AppError(400, 'Owner does not belong to this workspace')
}

/** Parse a deal's write-form value into a `Decimal`, in the tenant's currency. Null/undefined store zero. */
function dealValueToDecimal(input: string | number | null | undefined, currency: string): Prisma.Decimal {
  if (input == null) return new Prisma.Decimal(0)
  if (typeof input === 'string') {
    try {
      return new Prisma.Decimal(Money.fromDecimal(input, currency).toDecimalString())
    } catch {
      throw new AppError(400, `Invalid deal value for the ${currency} workspace currency`)
    }
  }
  try {
    return minorUnitsToDecimal(input, currency)
  } catch {
    throw new AppError(400, `Invalid deal value for the ${currency} workspace currency`)
  }
}

export async function createDeal(
  prisma: CrmClient,
  tenantId: string,
  input: DealWriteInput,
  actorId: string | null = null,
): Promise<Deal> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => createDeal(tx, tenantId, input, actorId))
  const stage = input.stage ?? 'LEADS'
  const occurredAt = new Date()
  const currency = await getTenantCurrency(prisma, tenantId)
  await assertCompanyInTenant(prisma, tenantId, input.companyId)
  await assertOwnerInTenant(prisma, tenantId, input.ownerEmployeeId)

  const deal = await prisma.deal.create({
    data: {
      tenantId,
      currency,
      name: input.name,
      stage,
      closedAt: CLOSED_STAGES.includes(stage) ? occurredAt : null,
      value: dealValueToDecimal(input.value, currency),
      companyId: input.companyId ?? null,
      ownerEmployeeId: input.ownerEmployeeId ?? null,
      winProbability: input.winProbability ?? null,
      closeDate: input.closeDate ? new Date(`${input.closeDate}T00:00:00Z`) : null,
      productLine: input.productLine ?? null,
      forecastBucket: input.forecastBucket ?? null,
    },
    include: dealInclude,
  })
  await prisma.dealStageHistory.create({ data: {
    tenantId, dealId: deal.id, fromStage: null, toStage: stage, occurredAt,
    actorId, ownerEmployeeId: deal.ownerEmployeeId, value: deal.value,
  } })
  return mapDeal(deal, currency)
}

export async function updateDeal(
  prisma: CrmClient,
  tenantId: string,
  id: string,
  input: DealUpdateInput,
  actorId: string | null = null,
): Promise<Deal> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => updateDeal(tx, tenantId, id, input, actorId))
  // Lock before reading the old stage so concurrent moves record a truthful transition chain.
  const locked = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Deal" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE
  `
  if (locked.length === 0) throw new AppError(404, 'Deal not found')
  const existing = await prisma.deal.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Deal not found')

  const changedStage = input.stage !== undefined && input.stage !== existing.stage
  const occurredAt = new Date()
  const currency = await getTenantCurrency(prisma, tenantId)
  const changedValue = input.value !== undefined && !dealValueToDecimal(input.value, currency).equals(existing.value)
  if (input.companyId !== undefined) await assertCompanyInTenant(prisma, tenantId, input.companyId)
  if (input.ownerEmployeeId !== undefined) await assertOwnerInTenant(prisma, tenantId, input.ownerEmployeeId)

  const deal = await prisma.deal.update({
    where: { id_tenantId: { id, tenantId } },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.stage !== undefined && { stage: input.stage }),
      ...(changedStage && { closedAt: CLOSED_STAGES.includes(input.stage!) ? occurredAt : null }),
      ...(input.value !== undefined && { value: dealValueToDecimal(input.value, currency) }),
      ...(input.companyId !== undefined && { companyId: input.companyId }),
      ...(input.ownerEmployeeId !== undefined && { ownerEmployeeId: input.ownerEmployeeId }),
      ...(input.winProbability !== undefined && { winProbability: input.winProbability }),
      ...(input.closeDate !== undefined && {
        closeDate: input.closeDate ? new Date(`${input.closeDate}T00:00:00Z`) : null,
      }),
      ...(input.productLine !== undefined && { productLine: input.productLine }),
      ...(input.forecastBucket !== undefined && { forecastBucket: input.forecastBucket }),
    },
    include: dealInclude,
  })
  if (changedStage || changedValue) await prisma.dealStageHistory.create({ data: {
    tenantId, dealId: deal.id, fromStage: existing.stage, toStage: deal.stage, occurredAt,
    actorId, ownerEmployeeId: deal.ownerEmployeeId, value: deal.value,
  } })
  return mapDeal(deal, currency)
}
