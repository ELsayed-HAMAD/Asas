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
  MonthlyPipelineEntry,
  AgendaItem,
  AgendaItemUpdateInput,
  AgendaItemWriteInput,
} from '@asas/contracts'
import { DealStageValues, buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

/** Stages that count as "open" pipeline — everything except the two terminal states. */
const OPEN_STAGES: readonly DealStage[] = ['LEADS', 'PROPOSAL', 'NEGOTIATION']
const CLOSED_STAGES: readonly DealStage[] = ['CLOSED_WON', 'CLOSED_LOST']

function mapAgendaItem(row: { id: string; title: string; timeLabel: string | null; priority: string | null; done: boolean; createdAt: Date }): AgendaItem {
  return { id: row.id, title: row.title, timeLabel: row.timeLabel, priority: row.priority, done: row.done, createdAt: row.createdAt.toISOString() }
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
async function getTenantCurrency(prisma: PrismaClient, tenantId: string): Promise<string> {
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

/**
 * Normalise the stored `winProbability` `Float` to the wire contract (percentage 0–100).
 *
 * The legacy seed wrote 0–1 fractions while the new contract is 0–100, so a stored value at or
 * below 1 is read as a fraction and scaled; anything above 1 is already a percentage. The
 * ambiguity of an exact `1` (100% vs 1%) is resolved toward the wire contract.
 */
function winProbabilityToPercent(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null
  const pct = value <= 1 ? value * 100 : value
  return Math.min(100, Math.max(0, Number(pct.toFixed(1))))
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
    value: toMoneyWire(deal.value, currency) ?? { amount: 0, currency },
    companyId: deal.companyId,
    company: deal.company?.name ?? null,
    ownerEmployeeId: deal.ownerEmployeeId,
    owner: deal.owner,
    winProbability: winProbabilityToPercent(deal.winProbability),
    closeDate: deal.closeDate?.toISOString() ?? null,
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
  if (query.openOnly === true) where.stage = { in: [...OPEN_STAGES] }
  if (query.ownerId) where.ownerEmployeeId = query.ownerId
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { company: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { productLine: { contains: query.search, mode: 'insensitive' } },
    ]
  }
  const { skip, take } = toPrismaPage(query)
  const [items, total, stageMap] = await Promise.all([
    prisma.deal.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: dealInclude }),
    prisma.deal.count({ where: { tenantId } }),
    stageAggregates(prisma, tenantId),
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
  const currency = await getTenantCurrency(prisma, tenantId)
  const stageMap = await stageAggregates(prisma, tenantId)

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

  return {
    pipeline: {
      openTotal: toMoneyWire(openTotal, currency)!,
      openCount,
      wonTotal: toMoneyWire(won?.total ?? new Prisma.Decimal(0), currency)!,
      wonCount: won?.count ?? 0,
      lostTotal: toMoneyWire(lost?.total ?? new Prisma.Decimal(0), currency)!,
      lostCount: lost?.count ?? 0,
    },
    winRate: winRate(won?.count ?? 0, lost?.count ?? 0),
    funnel,
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
): Promise<MonthlyPipelineEntry[]> {
  const rows = await prisma.$queryRaw<Array<{ month: string; count: bigint; value: Prisma.Decimal }>>`
    SELECT to_char("closeDate", 'YYYY-MM') AS month,
           count(*)::bigint AS count,
           sum("value") AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId}
      AND "stage" IN (${Prisma.join([...OPEN_STAGES])})
      AND "closeDate" IS NOT NULL
    GROUP BY to_char("closeDate", 'YYYY-MM')
    ORDER BY month
  `
  return rows.map(row => ({
    month: row.month,
    count: Number(row.count),
    value: toMoneyWire(row.value, currency)!,
  }))
}

export async function getForecast(prisma: PrismaClient, tenantId: string): Promise<CrmForecast> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const [snapshots, quotas, monthlyPipeline] = await Promise.all([
    prisma.forecastSnapshot.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.salesQuota.findMany({ where: { tenantId }, orderBy: { period: 'asc' } }),
    monthlyOpenPipeline(prisma, tenantId, currency),
  ])
  const totalPipeline = monthlyPipeline.reduce((total, entry) => total + entry.value.amount, 0)
  // `quota.quota` is a major-unit Decimal; `toMoneyWire` normalizes it to the integer minor
  // units (cents) that `totalPipeline` and the wire contract use. Summing `Number(quota.quota)`
  // directly was 100× too large (dollars vs cents), which also corrupted `quotaAttainmentPct`.
  const totalQuota = quotas.reduce(
    (total, quota) => total + (toMoneyWire(quota.quota, currency)?.amount ?? 0),
    0,
  )

  return {
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
      quota: toMoneyWire(quota.quota, currency)!,
      createdAt: quota.createdAt.toISOString(),
    })),
    monthlyPipeline,
    summary: {
      totalPipeline: { amount: totalPipeline, currency },
      totalQuota: { amount: totalQuota, currency },
      quotaAttainmentPct: totalQuota === 0 ? null : Math.round((totalPipeline / totalQuota) * 10000) / 100,
    },
  }
}

// ── Sales performance ─────────────────────────────────────────────────────────

export async function getSalesPerformance(
  prisma: PrismaClient,
  tenantId: string,
): Promise<CrmSalesPerformance> {
  const currency = await getTenantCurrency(prisma, tenantId)

  // Real closed-won per calendar month — grouped in SQL, no resampling or projection.
  const wonByMonth = await prisma.$queryRaw<Array<{ month: string; count: bigint; value: Prisma.Decimal }>>`
    SELECT to_char("closeDate", 'YYYY-MM') AS month,
           count(*)::bigint AS count,
           sum("value") AS value
    FROM "Deal"
    WHERE "tenantId" = ${tenantId}
      AND "stage" = 'CLOSED_WON'
      AND "closeDate" IS NOT NULL
    GROUP BY to_char("closeDate", 'YYYY-MM')
    ORDER BY month
  `
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
      where: { tenantId },
      _sum: { value: true },
      _count: { _all: true },
    }),
    prisma.employee.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ])
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

  const byRep = [...reps.values()].sort((a, b) => {
    if (a.openValue !== b.openValue) return b.openValue - a.openValue
    return (a.ownerName ?? '').localeCompare(b.ownerName ?? '')
  })
  const totalWon = byRep.reduce((total, rep) => total + rep.wonValue, 0)
  const totalWonCount = byRep.reduce((total, rep) => total + rep.wonCount, 0)
  const totalLostCount = byRep.reduce((total, rep) => total + rep.lostCount, 0)

  return {
    monthlyClosedWon,
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
    })),
    summary: {
      totalWon: { amount: totalWon, currency },
      totalWonCount,
      totalLostCount,
      overallWinRate: winRate(totalWonCount, totalLostCount),
    },
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Throws unless `companyId` (when provided) names a company in this tenant. */
async function assertCompanyInTenant(
  prisma: PrismaClient,
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
  prisma: PrismaClient,
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
  prisma: PrismaClient,
  tenantId: string,
  input: DealWriteInput,
): Promise<Deal> {
  const currency = await getTenantCurrency(prisma, tenantId)
  await assertCompanyInTenant(prisma, tenantId, input.companyId)
  await assertOwnerInTenant(prisma, tenantId, input.ownerEmployeeId)

  const deal = await prisma.deal.create({
    data: {
      tenantId,
      name: input.name,
      stage: input.stage ?? 'LEADS',
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
  return mapDeal(deal, currency)
}

export async function updateDeal(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: DealUpdateInput,
): Promise<Deal> {
  const existing = await prisma.deal.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Deal not found')

  const currency = await getTenantCurrency(prisma, tenantId)
  if (input.companyId !== undefined) await assertCompanyInTenant(prisma, tenantId, input.companyId)
  if (input.ownerEmployeeId !== undefined) await assertOwnerInTenant(prisma, tenantId, input.ownerEmployeeId)

  const deal = await prisma.deal.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.stage !== undefined && { stage: input.stage }),
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
  return mapDeal(deal, currency)
}
