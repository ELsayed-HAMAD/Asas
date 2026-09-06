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

function mapProject(project: ProjectWithIncludes, currency: string): Project {
  const spent = toMoneyWire(project.spent, currency)!
  const budget = toMoneyWire(project.budget, currency)
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    departmentId: project.departmentId,
    budget,
    spent,
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
  const [items, totalProjects, activeProjects, budgetSum, spentSum] = await Promise.all([
    prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { sprints: { select: { id: true, name: true } } },
    }),
    prisma.project.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId, status: { in: [...ACTIVE_STATUSES] } } }),
    prisma.project.aggregate({ _sum: { budget: true }, where: { tenantId } }),
    prisma.project.aggregate({ _sum: { spent: true }, where: { tenantId } }),
  ])

  const totalBudget = toMoneyWire(budgetSum._sum.budget ?? new Prisma.Decimal(0), currency)
  const totalSpent = toMoneyWire(spentSum._sum.spent ?? new Prisma.Decimal(0), currency)!

  return {
    items: items.map(item => mapProject(item, currency)),
    pagination: buildPaginationMeta(query, totalProjects),
    summary: {
      totalProjects,
      activeProjects,
      totalBudget,
      totalSpent,
      utilizationPct: utilizationPct(totalSpent.amount, totalBudget?.amount ?? null),
    },
  }
}

export async function getProject(prisma: PrismaClient, tenantId: string, id: string): Promise<Project> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const project = await prisma.project.findFirst({
    where: { id, tenantId },
    include: { sprints: { select: { id: true, name: true } } },
  })
  if (!project) throw new AppError(404, 'Project not found')
  return mapProject(project, currency)
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
  const [projects, totals, totalProjects, activeProjects] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, status: true, budget: true, spent: true },
    }),
    prisma.project.aggregate({ where: { tenantId }, _sum: { budget: true, spent: true } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId, status: { in: [...ACTIVE_STATUSES] } } }),
  ])

  const items: UtilizationRow[] = projects.map(project => {
    const spent = toMoneyWire(project.spent, currency)!
    const budget = toMoneyWire(project.budget, currency)
    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      spent,
      budget,
      utilizationPct: utilizationPct(spent.amount, budget?.amount ?? null),
    }
  })

  const totalSpent = toMoneyWire(totals._sum.spent ?? new Prisma.Decimal(0), currency)!
  const totalBudget = toMoneyWire(totals._sum.budget, currency)

  return {
    items,
    summary: {
      totalSpent,
      totalBudget,
      utilizationPct: utilizationPct(totalSpent.amount, totalBudget?.amount ?? null),
      totalProjects,
      activeProjects,
    },
  }
}

/**
 * Sprint burndown: total scope vs. completed-per-day, the whole series computed in Postgres.
 *
 * The sprint has no `startsAt` column, so the window opens on `createdAt` and closes on
 * `endsAt` (or today, for an open sprint). The per-day completion counts come from one
 * windowed query (`generate_series` × a running `count` of `DONE` issues by `updatedAt`); the
 * headline `totalScope` and `completed` are separate Prisma `count` aggregates. The only
 * client-side arithmetic is the straight ideal line (a linear guide, not a data aggregate).
 */
export async function getBurndown(
  prisma: PrismaClient,
  tenantId: string,
  sprintId: string,
  query: BurndownQuery,
): Promise<BurndownResponse> {
  const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, tenantId } })
  if (!sprint) throw new AppError(404, 'Sprint not found')

  const today = new Date().toISOString().slice(0, 10)
  let start = sprint.createdAt.toISOString().slice(0, 10)
  let end = sprint.endsAt ? sprint.endsAt.toISOString().slice(0, 10) : today
  if (end < start) end = start
  // Cap the returned series to `limit` days, keeping the most recent window.
  if (shiftDateUtc(end, -(query.limit - 1)) > start) start = shiftDateUtc(end, -(query.limit - 1))

  const [totalScope, completed, series] = await Promise.all([
    prisma.issue.count({ where: { tenantId, sprintId } }),
    prisma.issue.count({ where: { tenantId, sprintId, status: 'DONE' } }),
    prisma.$queryRaw<Array<{ date: string; completed: number }>>`
      WITH window AS (
        SELECT generate_series(${start}::date, ${end}::date) AS day
      )
      SELECT
        to_char(w.day, 'YYYY-MM-DD') AS date,
        (SELECT count(*) FROM "Issue"
          WHERE "tenantId" = ${tenantId} AND "sprintId" = ${sprintId}
            AND status = 'DONE'
            AND ("updatedAt" AT TIME ZONE 'UTC')::date <= w.day) AS completed
      FROM window w
      ORDER BY w.day
    `,
  ])

  const n = series.length
  const remainingFirst = n > 0 ? totalScope - (series[0]?.completed ?? 0) : totalScope
  const points = series.map((row, index) => {
    const completedAtDay = row.completed
    const remaining = totalScope - completedAtDay
    const ideal = n > 1 ? remainingFirst * (1 - index / (n - 1)) : remainingFirst
    return { date: row.date, remaining, ideal: Number(ideal.toFixed(1)) }
  })

  return {
    sprintId: sprint.id,
    sprintName: sprint.name,
    totalScope,
    completed,
    points,
  }
}

// ── Sprints ──────────────────────────────────────────────────────────────────────

type SprintWithCount = {
  id: string
  name: string
  projectId: string | null
  endsAt: Date | null
  createdAt: Date
  updatedAt: Date
  _count: { issues: number }
}

function mapSprint(sprint: SprintWithCount, doneCount: number): Sprint {
  const total = sprint._count.issues
  const done = Math.min(doneCount, total)
  return {
    id: sprint.id,
    name: sprint.name,
    projectId: sprint.projectId,
    endsAt: sprint.endsAt?.toISOString() ?? null,
    completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
    issueCounts: { total, done },
    createdAt: sprint.createdAt.toISOString(),
    updatedAt: sprint.updatedAt.toISOString(),
  }
}

/** The Active Sprints board: every tenant sprint with its issue counts (DONE in SQL via groupBy). */
export async function listSprints(prisma: PrismaClient, tenantId: string): Promise<Sprint[]> {
  const [sprints, doneBySprint] = await Promise.all([
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
  ])
  const doneMap = new Map(doneBySprint.map(row => [row.sprintId ?? '', row._count.id]))
  return sprints.map(sprint => mapSprint(sprint, doneMap.get(sprint.id) ?? 0))
}

export async function getSprint(prisma: PrismaClient, tenantId: string, id: string): Promise<Sprint> {
  const [sprint, doneCount] = await Promise.all([
    prisma.sprint.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { issues: true } } },
    }),
    prisma.issue.count({ where: { tenantId, sprintId: id, status: 'DONE' } }),
  ])
  if (!sprint) throw new AppError(404, 'Sprint not found')
  return mapSprint(sprint, doneCount)
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
  const sprint = await prisma.sprint.create({
    data: {
      tenantId,
      name: input.name,
      projectId: input.projectId ?? null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
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

  const sprint = await prisma.sprint.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.projectId !== undefined && { projectId: input.projectId }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
    },
    include: { _count: { select: { issues: true } } },
  })
  const doneCount = await prisma.issue.count({ where: { tenantId, sprintId: id, status: 'DONE' } })
  return mapSprint(sprint, doneCount)
}

export async function deleteSprint(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.sprint.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Sprint not found')
  await prisma.sprint.delete({ where: { id } })
}

// ── Issues (work items a sprint burndowns) ──────────────────────────────────────

function mapIssue(issue: {
  id: string
  sprintId: string | null
  key: string | null
  title: string
  tag: string | null
  priority: IssuePriority
  status: IssueStatus
  createdAt: Date
  updatedAt: Date
}): Issue {
  return {
    id: issue.id,
    sprintId: issue.sprintId,
    key: issue.key,
    title: issue.title,
    tag: issue.tag,
    priority: issue.priority,
    status: issue.status,
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
): Promise<void> {
  if (!sprintId) return
  const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, tenantId } })
  if (!sprint) throw new AppError(400, 'Sprint does not belong to this workspace')
}

export async function createIssue(prisma: PrismaClient, tenantId: string, input: IssueWriteInput): Promise<Issue> {
  await assertSprintInTenant(prisma, tenantId, input.sprintId)
  const issue = await prisma.issue.create({
    data: {
      tenantId,
      sprintId: input.sprintId ?? null,
      key: input.key ?? null,
      title: input.title,
      tag: input.tag ?? null,
      priority: input.priority ?? 'MEDIUM',
      status: input.status ?? 'TODO',
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
  if (input.sprintId !== undefined) await assertSprintInTenant(prisma, tenantId, input.sprintId)

  const issue = await prisma.issue.update({
    where: { id },
    data: {
      ...(input.sprintId !== undefined && { sprintId: input.sprintId }),
      ...(input.key !== undefined && { key: input.key }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.tag !== undefined && { tag: input.tag }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.status !== undefined && { status: input.status }),
    },
  })
  return mapIssue(issue)
}

export async function deleteIssue(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.issue.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Issue not found')
  await prisma.issue.delete({ where: { id } })
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
      name: input.name,
      status: input.status ?? 'PLANNING',
      departmentId: input.departmentId ?? null,
      budget: budgetToDecimal(input.budget, currency),
      timeline: input.timeline ? new Date(input.timeline) : null,
    },
    include: { sprints: { select: { id: true, name: true } } },
  })
  return mapProject(project, currency)
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
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
      ...(input.budget !== undefined && { budget: budgetToDecimal(input.budget, currency) }),
      ...(input.timeline !== undefined && { timeline: input.timeline ? new Date(input.timeline) : null }),
    },
    include: { sprints: { select: { id: true, name: true } } },
  })
  return mapProject(project, currency)
}

export async function deleteProject(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.project.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Project not found')
  await prisma.project.delete({ where: { id } })
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
