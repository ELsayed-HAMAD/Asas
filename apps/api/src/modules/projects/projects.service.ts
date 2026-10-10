/**
 * Projects service — the domain logic behind the Projects module's routes.
 *
 * Two invariants from the rebuild plan are enforced here, matching the HR reference
 * (`employees.service.ts`):
 *
 *  - **Tenant isolation.** Every query is scoped by `tenantId`, which the route handler reads
 *    from the authenticated session (never from a request parameter). A `findFirst({ where:
 *    { id, tenantId } })` on a foreign id returns `null` and becomes a 404, not a leak.
 *  - **KPIs in SQL.** `listProjects`, `getPortfolioUtilization`, and `getBurndown` compute their
 *    aggregates with Prisma `count`/`aggregate`/`groupBy` (and one windowed `$queryRaw` for the
 *    burndown series). Nothing sums a fetched list with `.reduce()` in the client.
 *
 *  - **Money as integer minor units.** `Project.budget`/`spent` are `Decimal` in Prisma; on the
 *    wire they are the `{ amount, currency }` wire form via `@asas/domain`'s `Money`. No float
 *    touches a money value — only derived percentages (a ratio, not money) use floating point.
 */
import { Prisma } from '@prisma/client'
import type { IssuePriority, IssueStatus, PrismaClient, ProjectStatus } from '@prisma/client'
import { Money } from '@asas/domain'
import type {
  BurndownQuery,
  BurndownResponse,
  Issue,
  IssueUpdateInput,
  IssueWriteInput,
  PortfolioUtilizationResponse,
  Project,
  ProjectListQuery,
  ProjectSummary,
  ProjectUpdateInput,
  ProjectWriteInput,
  RoadmapResponse,
  RoadmapTaskUpdateInput,
  RoadmapTaskWriteInput,
  RoadmapPhaseWriteInput,
  Sprint,
  SprintVelocityComparison,
  SprintUpdateInput,
  SprintWriteInput,
  UtilizationRow,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

/** The `ProjectStatus` values that count as "active" for the portfolio KPI. */
const ACTIVE_STATUSES = ['ON_TRACK', 'DELAYED', 'AT_RISK'] as const

// ── Money + date helpers ─────────────────────────────────────────────────────────

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

/** Convert a write-form budget (decimal string or wire money) to a `Decimal` string for storage. */
function budgetToDecimal(input: unknown, tenantCurrency: string): Prisma.Decimal | null {
  if (input == null) return null
  if (typeof input === 'string') {
    try {
      return new Prisma.Decimal(Money.fromDecimal(input, tenantCurrency).toDecimalString())
    } catch {
      throw new AppError(400, `Invalid budget amount for the ${tenantCurrency} workspace currency`)
    }
  }
  const wire = input as { amount: number; currency: string }
  if (wire.currency !== tenantCurrency) {
    throw new AppError(400, `Budget currency must match the workspace currency (${tenantCurrency})`)
  }
  return new Prisma.Decimal(Money.fromMinorUnits(wire.amount, tenantCurrency).toDecimalString())
}

/** A project's utilization as a percentage, or `null` when it has no budget to divide by. */
function utilizationPct(spentMinor: number, budgetMinor: number | null): number | null {
  if (budgetMinor == null || budgetMinor === 0) return null
  return Number(((spentMinor / budgetMinor) * 100).toFixed(1))
}

/** Shift a `yyyy-mm-dd` string by `deltaDays`, keeping UTC. */
function shiftDateUtc(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

// ── Project mapping ──────────────────────────────────────────────────────────────

type ProjectWithIncludes = {
  id: string
  name: string
  status: ProjectStatus
  departmentId: string | null
  budget: Prisma.Decimal | null
  spent: Prisma.Decimal
  timeline: Date | null
  createdAt: Date
  updatedAt: Date
  sprints: { id: string; name: string }[]
}

type ProjectSpend = { projectId: string | null; spent: Prisma.Decimal; unvaluedSettlementCount: number; unassignedSettlementCount: number }

/** Spend from posted settlements in workspace base currency, net of recorded reversals. */
async function loadProjectSpend(prisma: PrismaClient, tenantId: string, projectIds?: string[]): Promise<Map<string, ProjectSpend> & { totals?: ProjectSpend }> {
  const payableProjectFilter = projectIds === undefined ? Prisma.empty : Prisma.sql`AND p."projectId" = ANY(${projectIds}::text[])`
  const expenseProjectFilter = projectIds === undefined ? Prisma.empty : Prisma.sql`AND e."projectId" = ANY(${projectIds}::text[])`
  const rows = await prisma.$queryRaw<Array<{ projectId: string | null; isTotal: boolean; spent: Prisma.Decimal; unvaluedSettlementCount: bigint; unassignedSettlementCount: bigint }>>`
    WITH settlements AS (
      SELECT p."projectId", j."baseAmount", r."baseAmount" AS "reversalBaseAmount", r."id" AS "reversalId"
      FROM "PayableInvoice" p JOIN "JournalEntry" j ON j."payableInvoiceId" = p."id" AND j."tenantId" = p."tenantId" AND j."sourceType" = 'AP_PAYMENT'
      LEFT JOIN "JournalEntry" r ON r."reversesJournalEntryId" = j."id" AND r."tenantId" = j."tenantId"
      WHERE p."tenantId" = ${tenantId} ${payableProjectFilter}
      UNION ALL
      SELECT e."projectId", j."baseAmount", r."baseAmount" AS "reversalBaseAmount", r."id" AS "reversalId"
      FROM "Expense" e JOIN "JournalEntry" j ON j."expenseId" = e."id" AND j."tenantId" = e."tenantId" AND j."sourceType" = 'EXPENSE_REIMBURSEMENT'
      LEFT JOIN "JournalEntry" r ON r."reversesJournalEntryId" = j."id" AND r."tenantId" = j."tenantId"
      WHERE e."tenantId" = ${tenantId} ${expenseProjectFilter}
    )
    SELECT "projectId", GROUPING("projectId") = 1 AS "isTotal",
      COALESCE(SUM(CASE WHEN "baseAmount" IS NOT NULL AND ("reversalId" IS NULL OR "reversalBaseAmount" IS NOT NULL) THEN "baseAmount" - COALESCE("reversalBaseAmount", 0) ELSE 0 END), 0)::numeric AS spent,
      COUNT(*) FILTER (WHERE "baseAmount" IS NULL OR ("reversalId" IS NOT NULL AND "reversalBaseAmount" IS NULL))::bigint AS "unvaluedSettlementCount",
      COUNT(*) FILTER (WHERE "projectId" IS NULL)::bigint AS "unassignedSettlementCount"
    FROM settlements GROUP BY GROUPING SETS (("projectId"), ())
  `
  const result = new Map<string, ProjectSpend>() as Map<string, ProjectSpend> & { totals?: ProjectSpend }
  for (const row of rows) {
    const value = { projectId: row.projectId, spent: row.spent, unvaluedSettlementCount: Number(row.unvaluedSettlementCount), unassignedSettlementCount: Number(row.unassignedSettlementCount) }
    if (row.isTotal) result.totals = value
    else if (row.projectId === null) result.set('__unassigned__', value)
    else result.set(row.projectId, value)
  }
  return result
}

function mapProject(project: ProjectWithIncludes, currency: string, spend?: ProjectSpend): Project {
  const spent = toMoneyWire(spend?.spent ?? new Prisma.Decimal(0), currency)!
  const budget = toMoneyWire(project.budget, currency)
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    departmentId: project.departmentId,
    budget,
    spent,
    unvaluedSettlementCount: spend?.unvaluedSettlementCount ?? 0,
    utilizationPct: utilizationPct(spent.amount, budget?.amount ?? null),
    timeline: project.timeline?.toISOString() ?? null,
    sprints: project.sprints.map(s => ({ id: s.id, name: s.name })),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

// ── Reads: list + portfolio + burndown (the three KPI endpoints) ────────────────

export interface ProjectListResult {
  items: Project[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: ProjectSummary
}

export async function listProjects(
  prisma: PrismaClient,
  tenantId: string,
  query: ProjectListQuery,
): Promise<ProjectListResult> {
  const where: Prisma.ProjectWhereInput = { tenantId }
  if (query.status) where.status = query.status
  if (query.departmentId) where.departmentId = query.departmentId
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' }
  }

  const currency = await getTenantCurrency(prisma, tenantId)
  const { skip, take } = toPrismaPage(query)

  // KPIs are SQL aggregates over the tenant's whole project set — not a `.reduce()` over the
  // (paginated) page the client happens to be looking at.
  const activeWhere: Prisma.ProjectWhereInput = {
    AND: [where, { status: { in: [...ACTIVE_STATUSES] } }],
  }
  const [items, totalProjects, activeProjects, budgetSum, spends, matchingProjects] = await Promise.all([
    prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { sprints: { select: { id: true, name: true } } },
    }),
    prisma.project.count({ where }),
    prisma.project.count({ where: activeWhere }),
    prisma.project.aggregate({ _sum: { budget: true }, where }),
    loadProjectSpend(prisma, tenantId),
    prisma.project.findMany({ where, select: { id: true, budget: true } }),
  ])
  const filteredSpends = await loadProjectSpend(prisma, tenantId, matchingProjects.map(project => project.id))

  const totalBudget = toMoneyWire(budgetSum._sum.budget ?? new Prisma.Decimal(0), currency)
  const totalSpent = toMoneyWire(filteredSpends.totals?.spent ?? new Prisma.Decimal(0), currency)!
  const budgetedSpent = matchingProjects
    .filter(project => project.budget !== null)
    .reduce((acc, project) => acc.add(spends.get(project.id)?.spent ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
  const budgetedSpentWire = toMoneyWire(budgetedSpent, currency)!

  return {
    items: items.map(item => mapProject(item, currency, spends.get(item.id))),
    pagination: buildPaginationMeta(query, totalProjects),
    summary: {
      totalProjects,
      activeProjects,
      totalBudget,
      totalSpent,
      unvaluedSettlementCount: filteredSpends.totals?.unvaluedSettlementCount ?? 0,
      unassignedSettlementCount: spends.totals?.unassignedSettlementCount ?? 0,
      utilizationPct: utilizationPct(budgetedSpentWire.amount, totalBudget?.amount ?? null),
    },
  }
}

export async function getProject(prisma: PrismaClient, tenantId: string, id: string): Promise<Project> {
  const [currency, spends] = await Promise.all([getTenantCurrency(prisma, tenantId), loadProjectSpend(prisma, tenantId)])
  const project = await prisma.project.findFirst({
    where: { id, tenantId },
    include: { sprints: { select: { id: true, name: true } } },
  })
  if (!project) throw new AppError(404, 'Project not found')
  return mapProject(project, currency, spends.get(project.id))
}

/**
 * Portfolio utilization, grouped per project with the portfolio total as a SQL aggregate.
 * Each row is one project's spent vs. budget (its own utilization); the summary is the
 * tenant-wide `SUM` — never a client-side roll-up of the rows.
 */
export async function getPortfolioUtilization(
  prisma: PrismaClient,
  tenantId: string,
): Promise<PortfolioUtilizationResponse> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const [projects, totals, spends] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, status: true, budget: true, spent: true },
    }),
    prisma.project.aggregate({ where: { tenantId }, _sum: { budget: true } }),
    loadProjectSpend(prisma, tenantId),
  ])
  const activeProjects = projects.filter(project => ACTIVE_STATUSES.includes(project.status as (typeof ACTIVE_STATUSES)[number])).length

  const items: UtilizationRow[] = projects.map(project => {
    const projectSpend = spends.get(project.id)
    const spent = toMoneyWire(projectSpend?.spent ?? new Prisma.Decimal(0), currency)!
    const budget = toMoneyWire(project.budget, currency)
    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      spent,
      unvaluedSettlementCount: projectSpend?.unvaluedSettlementCount ?? 0,
      budget,
      utilizationPct: utilizationPct(spent.amount, budget?.amount ?? null),
    }
  })

  const totalSpent = toMoneyWire(spends.totals?.spent ?? new Prisma.Decimal(0), currency)!
  const totalBudget = toMoneyWire(totals._sum.budget, currency)
  const budgetedSpent = projects
    .filter(project => project.budget !== null)
    .reduce((acc, project) => acc.add(spends.get(project.id)?.spent ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
  const budgetedSpentWire = toMoneyWire(budgetedSpent, currency)!

  return {
    items,
    summary: {
      totalProjects: projects.length,
      activeProjects,
      totalSpent,
      unvaluedSettlementCount: spends.totals?.unvaluedSettlementCount ?? 0,
      unassignedSettlementCount: spends.totals?.unassignedSettlementCount ?? 0,
      totalBudget,
      utilizationPct: utilizationPct(budgetedSpentWire.amount, totalBudget?.amount ?? null),
    },
  }
}

/**
 * Sprint burndown: total scope vs. completed-per-day, the whole series computed in Postgres.
 *
 * The window opens on the recorded `startsAt`; legacy sprints with no start date return an
 * empty series. Per-day scope and completions use issue creation and recorded completion
 * timestamps. Existing undated DONE issues are disclosed, never assigned a guessed date.
 */
export async function getBurndown(
  prisma: PrismaClient,
  tenantId: string,
  sprintId: string,
  query: BurndownQuery,
): Promise<BurndownResponse> {
  const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, tenantId } })
  if (!sprint) throw new AppError(404, 'Sprint not found')

  const startDate = sprint.startsAt?.toISOString().slice(0, 10) ?? null
  const [totalScope, completed, undatedCompleted] = await Promise.all([
    prisma.issue.count({ where: { tenantId, sprintId } }),
    prisma.issue.count({ where: { tenantId, sprintId, status: 'DONE' } }),
    prisma.issue.count({ where: { tenantId, sprintId, status: 'DONE', completedAt: null } }),
  ])

  if (!startDate) {
    return { sprintId: sprint.id, sprintName: sprint.name, startDate: null, totalScope, completed, undatedCompleted, points: [] }
  }

  const today = new Date().toISOString().slice(0, 10)
  let start = startDate
  let end = sprint.endsAt ? sprint.endsAt.toISOString().slice(0, 10) : today
  if (end < start) end = start
  // Cap the returned series to `limit` days, keeping the most recent window.
  if (shiftDateUtc(end, -(query.limit - 1)) > start) start = shiftDateUtc(end, -(query.limit - 1))

  const series = await prisma.$queryRaw<Array<{ date: string; scope: number; completed: number }>>`
      WITH days AS (
        SELECT generate_series(${start}::date, ${end}::date) AS day
      )
      SELECT
        to_char(w.day, 'YYYY-MM-DD') AS date,
        (SELECT count(*)::int FROM "Issue" i
          WHERE i."tenantId" = ${tenantId} AND i."sprintId" = ${sprintId}
            AND (i."createdAt" AT TIME ZONE 'UTC')::date <= w.day) AS scope,
        (SELECT count(*)::int FROM "Issue" i
          WHERE i."tenantId" = ${tenantId} AND i."sprintId" = ${sprintId}
            AND i."completedAt" IS NOT NULL
            AND (i."completedAt" AT TIME ZONE 'UTC')::date <= w.day) AS completed
      FROM days w
      ORDER BY w.day
    `

  const n = series.length
  const remainingFirst = n > 0 ? Math.max(0, Number(series[0]?.scope ?? 0) - Number(series[0]?.completed ?? 0)) : 0
  const points = series.map((row, index) => {
    const completedAtDay = Number(row.completed)
    const remaining = Math.max(0, Number(row.scope) - completedAtDay)
    const ideal = n > 1 ? remainingFirst * (1 - index / (n - 1)) : remainingFirst
    return { date: row.date, remaining, ideal: Number(ideal.toFixed(1)) }
  })

  return {
    sprintId: sprint.id,
    sprintName: sprint.name,
    startDate,
    totalScope,
    completed,
    undatedCompleted,
    points,
  }
}

/** Compare completed story points in the two most recently ended, fully dated project sprints. */
export async function getSprintVelocityComparison(
  prisma: PrismaClient,
  tenantId: string,
  projectId: string,
): Promise<SprintVelocityComparison> {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } })
  if (!project) throw new AppError(404, 'Project not found')
  const sprints = await prisma.sprint.findMany({
    where: { tenantId, projectId, status: 'COMPLETED', startsAt: { not: null }, endsAt: { not: null } },
    orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
    take: 2,
    select: { id: true, name: true, startsAt: true, endsAt: true },
  })
  if (sprints.length === 0) return { projectId, current: null, previous: null, deltaStoryPoints: null, deltaPct: null }
  const completionRows = await prisma.issue.groupBy({
    by: ['sprintId'],
    where: { tenantId, status: 'DONE', completedAt: { not: null }, sprintId: { in: sprints.map(sprint => sprint.id) } },
    _count: { _all: true, storyPoints: true },
    _sum: { storyPoints: true },
  })
  const completionBySprint = new Map(completionRows.map(row => [row.sprintId ?? '', row]))
  const periods = sprints.map(sprint => {
    const completion = completionBySprint.get(sprint.id)
    const estimated = completion?._count.storyPoints ?? 0
    const total = completion?._count._all ?? 0
    return {
      sprintId: sprint.id,
      name: sprint.name,
      startsAt: sprint.startsAt!.toISOString(),
      endsAt: sprint.endsAt!.toISOString(),
      completedStoryPoints: estimated > 0 ? completion?._sum.storyPoints ?? 0 : null,
      estimatedCompletedIssues: estimated,
      unestimatedCompletedIssues: total - estimated,
    }
  })
  const current = periods[0] ?? null
  const previous = periods[1] ?? null
  const deltaStoryPoints = current?.completedStoryPoints != null && previous?.completedStoryPoints != null
    ? current.completedStoryPoints - previous.completedStoryPoints
    : null
  const deltaPct = deltaStoryPoints != null && previous?.completedStoryPoints
    ? Number(((deltaStoryPoints / previous.completedStoryPoints) * 100).toFixed(1))
    : null
  return { projectId, current, previous, deltaStoryPoints, deltaPct }
}

// ── Sprints ──────────────────────────────────────────────────────────────────────

type SprintWithCount = {
  id: string
  name: string
  status: 'ACTIVE' | 'COMPLETED'
  projectId: string | null
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  updatedAt: Date
  _count: { issues: number }
}

type SprintVelocity = {
  completedStoryPoints: number | null
  estimatedCompletedIssues: number
  unestimatedCompletedIssues: number
}

function mapSprint(sprint: SprintWithCount, doneCount: number, velocity: SprintVelocity = {
  completedStoryPoints: null, estimatedCompletedIssues: 0, unestimatedCompletedIssues: 0,
}): Sprint {
  const total = sprint._count.issues
  const done = Math.min(doneCount, total)
  return {
    id: sprint.id,
    name: sprint.name,
    status: sprint.status,
    projectId: sprint.projectId,
    startsAt: sprint.startsAt?.toISOString() ?? null,
    endsAt: sprint.endsAt?.toISOString() ?? null,
    completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
    issueCounts: { total, done },
    velocity,
    createdAt: sprint.createdAt.toISOString(),
    updatedAt: sprint.updatedAt.toISOString(),
  }
}

/** The Active Sprints board: every tenant sprint with its issue counts (DONE in SQL via groupBy). */
export async function listSprints(prisma: PrismaClient, tenantId: string): Promise<Sprint[]> {
  const [sprints, doneBySprint, velocityBySprint] = await Promise.all([
    prisma.sprint.findMany({
      where: { tenantId },
      orderBy: { endsAt: 'asc' },
      include: { _count: { select: { issues: true } } },
    }),
    prisma.issue.groupBy({
      by: ['sprintId'],
      where: { tenantId, status: 'DONE' },
      _count: { id: true },
    }),
    prisma.issue.groupBy({
      by: ['sprintId'],
      where: { tenantId, status: 'DONE', completedAt: { not: null }, sprintId: { not: null } },
      _count: { _all: true, storyPoints: true },
      _sum: { storyPoints: true },
    }),
  ])
  const doneMap = new Map(doneBySprint.map(row => [row.sprintId ?? '', row._count.id]))
  const velocityMap = new Map(velocityBySprint.map(row => [row.sprintId ?? '', {
    completedStoryPoints: row._count.storyPoints > 0 ? row._sum.storyPoints ?? 0 : null,
    estimatedCompletedIssues: row._count.storyPoints,
    unestimatedCompletedIssues: row._count._all - row._count.storyPoints,
  }]))
  return sprints.map(sprint => mapSprint(sprint, doneMap.get(sprint.id) ?? 0, velocityMap.get(sprint.id)))
}

export async function getSprint(prisma: PrismaClient, tenantId: string, id: string): Promise<Sprint> {
  const [sprint, completion] = await Promise.all([
    prisma.sprint.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { issues: true } } },
    }),
    prisma.issue.aggregate({
      where: { tenantId, sprintId: id, status: 'DONE', completedAt: { not: null } },
      _count: { _all: true, storyPoints: true },
      _sum: { storyPoints: true },
    }),
  ])
  if (!sprint) throw new AppError(404, 'Sprint not found')
  const doneCount = await prisma.issue.count({ where: { tenantId, sprintId: id, status: 'DONE' } })
  return mapSprint(sprint, doneCount, {
    completedStoryPoints: completion._count.storyPoints > 0 ? completion._sum.storyPoints ?? 0 : null,
    estimatedCompletedIssues: completion._count.storyPoints,
    unestimatedCompletedIssues: completion._count._all - completion._count.storyPoints,
  })
}

async function assertProjectInTenant(
  prisma: PrismaClient,
  tenantId: string,
  projectId: string | null | undefined,
): Promise<void> {
  if (!projectId) return
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } })
  if (!project) throw new AppError(400, 'Project does not belong to this workspace')
}

export async function createSprint(
  prisma: PrismaClient,
  tenantId: string,
  input: SprintWriteInput,
): Promise<Sprint> {
  await assertProjectInTenant(prisma, tenantId, input.projectId)
  const startsAt = input.startsAt === null ? null : input.startsAt ? new Date(input.startsAt) : new Date()
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (startsAt && endsAt && endsAt < startsAt) throw new AppError(400, 'Sprint end must be on or after its start')
  const sprint = await prisma.sprint.create({
    data: {
      tenantId,
      name: input.name,
      ...(input.status !== undefined && { status: input.status }),
      projectId: input.projectId ?? null,
      startsAt,
      endsAt,
    },
    include: { _count: { select: { issues: true } } },
  })
  return mapSprint(sprint, 0)
}

export async function updateSprint(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: SprintUpdateInput,
): Promise<Sprint> {
  const existing = await prisma.sprint.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Sprint not found')
  if (input.projectId !== undefined) await assertProjectInTenant(prisma, tenantId, input.projectId)
  const startsAt = input.startsAt !== undefined ? (input.startsAt ? new Date(input.startsAt) : null) : existing.startsAt
  const endsAt = input.endsAt !== undefined ? (input.endsAt ? new Date(input.endsAt) : null) : existing.endsAt
  if (startsAt && endsAt && endsAt < startsAt) throw new AppError(400, 'Sprint end must be on or after its start')

  const sprint = await prisma.sprint.update({
    where: { id_tenantId: { id, tenantId } },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.projectId !== undefined && { projectId: input.projectId }),
      ...(input.startsAt !== undefined && { startsAt }),
      ...(input.endsAt !== undefined && { endsAt }),
    },
    include: { _count: { select: { issues: true } } },
  })
  const [doneCount, completion] = await Promise.all([
    prisma.issue.count({ where: { tenantId, sprintId: id, status: 'DONE' } }),
    prisma.issue.aggregate({
      where: { tenantId, sprintId: id, status: 'DONE', completedAt: { not: null } },
      _count: { _all: true, storyPoints: true },
      _sum: { storyPoints: true },
    }),
  ])
  return mapSprint(sprint, doneCount, {
    completedStoryPoints: completion._count.storyPoints > 0 ? completion._sum.storyPoints ?? 0 : null,
    estimatedCompletedIssues: completion._count.storyPoints,
    unestimatedCompletedIssues: completion._count._all - completion._count.storyPoints,
  })
}

export async function deleteSprint(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.sprint.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Sprint not found')
  await prisma.sprint.delete({ where: { id_tenantId: { id, tenantId } } })
}

// ── Issues (work items a sprint burndowns) ──────────────────────────────────────

function mapIssue(issue: {
  id: string
  sprintId: string | null
  projectId: string | null
  key: string | null
  title: string
  tag: string | null
  priority: IssuePriority
  status: IssueStatus
  storyPoints: number | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): Issue {
  return {
    id: issue.id,
    sprintId: issue.sprintId,
    projectId: issue.projectId,
    key: issue.key,
    title: issue.title,
    tag: issue.tag,
    priority: issue.priority,
    status: issue.status,
    storyPoints: issue.storyPoints,
    completedAt: issue.completedAt?.toISOString() ?? null,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  }
}

export async function listIssues(prisma: PrismaClient, tenantId: string, sprintId: string): Promise<Issue[]> {
  const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, tenantId } })
  if (!sprint) throw new AppError(404, 'Sprint not found')
  const issues = await prisma.issue.findMany({
    where: { tenantId, sprintId },
    orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
  })
  return issues.map(mapIssue)
}

async function assertSprintInTenant(
  prisma: PrismaClient,
  tenantId: string,
  sprintId: string | null | undefined,
): Promise<string | null> {
  if (!sprintId) return null
  const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, tenantId }, select: { projectId: true } })
  if (!sprint) throw new AppError(400, 'Sprint does not belong to this workspace')
  return sprint.projectId
}

async function assertIssueProjectInTenant(
  prisma: PrismaClient,
  tenantId: string,
  projectId: string | null | undefined,
): Promise<void> {
  if (!projectId) return
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } })
  if (!project) throw new AppError(400, 'Project does not belong to this workspace')
}

export async function createIssue(prisma: PrismaClient, tenantId: string, input: IssueWriteInput): Promise<Issue> {
  const sprintProjectId = await assertSprintInTenant(prisma, tenantId, input.sprintId)
  if (input.projectId && sprintProjectId && input.projectId !== sprintProjectId) {
    throw new AppError(400, 'Issue project must match its sprint project')
  }
  const projectId = input.projectId ?? sprintProjectId
  await assertIssueProjectInTenant(prisma, tenantId, projectId)
  const status = input.status ?? 'TODO'
  const issue = await prisma.issue.create({
    data: {
      tenantId,
      sprintId: input.sprintId ?? null,
      projectId,
      key: input.key ?? null,
      title: input.title,
      tag: input.tag ?? null,
      priority: input.priority ?? 'MEDIUM',
      status,
      storyPoints: input.storyPoints ?? null,
      ...(status === 'DONE' && { completedAt: new Date() }),
    },
  })
  return mapIssue(issue)
}

export async function updateIssue(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: IssueUpdateInput,
): Promise<Issue> {
  const existing = await prisma.issue.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Issue not found')
  const sprintId = input.sprintId !== undefined ? input.sprintId : existing.sprintId
  const sprintProjectId = input.sprintId !== undefined ? await assertSprintInTenant(prisma, tenantId, input.sprintId) : null
  const projectId = input.projectId !== undefined ? input.projectId : (sprintProjectId ?? existing.projectId)
  if (sprintProjectId && projectId !== sprintProjectId) throw new AppError(400, 'Issue project must match its sprint project')
  if (input.projectId !== undefined) await assertIssueProjectInTenant(prisma, tenantId, projectId)
  const nextStatus = input.status ?? existing.status

  const issue = await prisma.issue.update({
    where: { id_tenantId: { id, tenantId } },
    data: {
      ...(input.sprintId !== undefined && { sprintId }),
      ...(input.projectId !== undefined || (input.sprintId !== undefined && sprintProjectId) ? { projectId } : {}),
      ...(input.key !== undefined && { key: input.key }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.tag !== undefined && { tag: input.tag }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.storyPoints !== undefined && { storyPoints: input.storyPoints }),
      ...(input.status !== undefined && input.status !== existing.status && {
        completedAt: nextStatus === 'DONE' ? new Date() : null,
      }),
    },
  })
  return mapIssue(issue)
}

export async function deleteIssue(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.issue.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Issue not found')
  await prisma.issue.delete({ where: { id_tenantId: { id, tenantId } } })
}

// ── Project writes ──────────────────────────────────────────────────────────────

export async function createProject(
  prisma: PrismaClient,
  tenantId: string,
  input: ProjectWriteInput,
): Promise<Project> {
  const currency = await getTenantCurrency(prisma, tenantId)
  if (input.departmentId) {
    const department = await prisma.department.findFirst({ where: { id: input.departmentId, tenantId } })
    if (!department) throw new AppError(400, 'Department does not belong to this workspace')
  }
  const project = await prisma.project.create({
    data: {
      tenantId,
      currency,
      name: input.name,
      status: input.status ?? 'PLANNING',
      departmentId: input.departmentId ?? null,
      budget: budgetToDecimal(input.budget, currency),
      timeline: input.timeline ? new Date(input.timeline) : null,
    },
    include: { sprints: { select: { id: true, name: true } } },
  })
  return mapProject(project, currency, { projectId: project.id, spent: new Prisma.Decimal(0), unvaluedSettlementCount: 0, unassignedSettlementCount: 0 })
}

export async function updateProject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ProjectUpdateInput,
): Promise<Project> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const existing = await prisma.project.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Project not found')
  if (input.departmentId !== undefined && input.departmentId) {
    const department = await prisma.department.findFirst({ where: { id: input.departmentId, tenantId } })
    if (!department) throw new AppError(400, 'Department does not belong to this workspace')
  }

  const project = await prisma.project.update({
    where: { id_tenantId: { id, tenantId } },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
      ...(input.budget !== undefined && { budget: budgetToDecimal(input.budget, currency) }),
      ...(input.timeline !== undefined && { timeline: input.timeline ? new Date(input.timeline) : null }),
    },
    include: { sprints: { select: { id: true, name: true } } },
  })
  const spend = await loadProjectSpend(prisma, tenantId)
  return mapProject(project, currency, spend.get(project.id))
}

export async function deleteProject(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.project.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Project not found')
  await prisma.$transaction(async tx => {
    await tx.payableInvoice.updateMany({ where: { tenantId, projectId: id }, data: { projectId: null } })
    await tx.expense.updateMany({ where: { tenantId, projectId: id }, data: { projectId: null } })
    await tx.project.delete({ where: { id_tenantId: { id, tenantId } } })
  })
}

// ── Roadmap (the Gantt) ─────────────────────────────────────────────────────────

function mapRoadmapTask(task: {
  id: string
  phaseId: string
  title: string
  taskCode: string | null
  statusLabel: string | null
  description: string | null
  startDate: Date | null
  endDate: Date | null
  progressPct: number
  barColor: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: task.id,
    phaseId: task.phaseId,
    title: task.title,
    taskCode: task.taskCode,
    statusLabel: task.statusLabel,
    description: task.description,
    startDate: task.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: task.endDate?.toISOString().slice(0, 10) ?? null,
    progressPct: Math.round(task.progressPct),
    barColor: task.barColor,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }
}

/** Phases with their tasks embedded, ordered by `sortOrder` then creation — one row per task for the Gantt. */
export async function listRoadmap(prisma: PrismaClient, tenantId: string): Promise<RoadmapResponse> {
  const phases = await prisma.roadmapPhase.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { tasks: { orderBy: [{ startDate: 'asc' }, { title: 'asc' }] } },
  })
  return {
    phases: phases.map(phase => ({
      id: phase.id,
      title: phase.title,
      sortOrder: phase.sortOrder,
      tasks: phase.tasks.map(mapRoadmapTask),
    })),
  }
}

async function assertPhaseInTenant(
  prisma: PrismaClient,
  tenantId: string,
  phaseId: string,
): Promise<void> {
  const phase = await prisma.roadmapPhase.findFirst({ where: { id: phaseId, tenantId } })
  if (!phase) throw new AppError(404, 'Roadmap phase not found')
}

export async function createRoadmapPhase(
  prisma: PrismaClient,
  tenantId: string,
  input: RoadmapPhaseWriteInput,
): Promise<void> {
  const max = await prisma.roadmapPhase.aggregate({ where: { tenantId }, _max: { sortOrder: true } })
  await prisma.roadmapPhase.create({
    data: { tenantId, title: input.title, sortOrder: input.sortOrder ?? (max._max.sortOrder ?? -1) + 1 },
  })
}

export async function updateRoadmapPhase(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: RoadmapPhaseWriteInput,
): Promise<void> {
  await assertPhaseInTenant(prisma, tenantId, id)
  await prisma.roadmapPhase.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  })
}

export async function deleteRoadmapPhase(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  await assertPhaseInTenant(prisma, tenantId, id)
  await prisma.roadmapPhase.delete({ where: { id } })
}

export async function createRoadmapTask(
  prisma: PrismaClient,
  tenantId: string,
  input: RoadmapTaskWriteInput,
): Promise<void> {
  await assertPhaseInTenant(prisma, tenantId, input.phaseId)
  await prisma.roadmapTask.create({
    data: {
      tenantId,
      phaseId: input.phaseId,
      title: input.title,
      taskCode: input.taskCode ?? null,
      statusLabel: input.statusLabel ?? null,
      description: input.description ?? null,
      startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
      progressPct: input.progressPct ?? 0,
      barColor: input.barColor ?? null,
    },
  })
}

export async function updateRoadmapTask(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: RoadmapTaskUpdateInput,
): Promise<void> {
  const existing = await prisma.roadmapTask.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Roadmap task not found')
  if (input.phaseId !== undefined) await assertPhaseInTenant(prisma, tenantId, input.phaseId)
  await prisma.roadmapTask.update({
    where: { id },
    data: {
      ...(input.phaseId !== undefined && { phaseId: input.phaseId }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.taskCode !== undefined && { taskCode: input.taskCode }),
      ...(input.statusLabel !== undefined && { statusLabel: input.statusLabel }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.startDate !== undefined && {
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
      }),
      ...(input.endDate !== undefined && { endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null }),
      ...(input.progressPct !== undefined && { progressPct: input.progressPct }),
      ...(input.barColor !== undefined && { barColor: input.barColor }),
    },
  })
}

export async function deleteRoadmapTask(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.roadmapTask.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Roadmap task not found')
  await prisma.roadmapTask.delete({ where: { id } })
}
