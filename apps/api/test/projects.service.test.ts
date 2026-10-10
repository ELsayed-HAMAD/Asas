import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { getPortfolioUtilization, getSprintVelocityComparison, listProjects, listSprints } from '../src/modules/projects/projects.service.js'

describe('project list summary filters', () => {
  it('applies the list filters to counts and money aggregates across all matching pages', async () => {
    const where = {
      tenantId: 'tenant_1',
      status: 'AT_RISK',
      departmentId: 'cdept12345678901234567890',
      name: { contains: 'Alpha', mode: 'insensitive' },
    }
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      project: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(2),
        aggregate: vi.fn()
          .mockResolvedValueOnce({ _sum: { budget: new Prisma.Decimal('1000') } })
      },
      $queryRaw: vi.fn().mockResolvedValue([{ projectId: null, isTotal: true, spent: new Prisma.Decimal('250'), unvaluedSettlementCount: 0n, unassignedSettlementCount: 0n }]),
    } as unknown as PrismaClient

    const result = await listProjects(prisma, 'tenant_1', {
      page: 1, limit: 1, status: 'AT_RISK', departmentId: 'cdept12345678901234567890', search: 'Alpha',
    })

    expect(prisma.project.count).toHaveBeenNthCalledWith(1, { where })
    expect(prisma.project.count).toHaveBeenNthCalledWith(2, {
      where: { AND: [where, { status: { in: ['ON_TRACK', 'DELAYED', 'AT_RISK'] } }] },
    })
    expect(prisma.project.aggregate).toHaveBeenNthCalledWith(1, { _sum: { budget: true }, where })
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
    expect(result.pagination).toMatchObject({ total: 2, pages: 2 })
    expect(result.summary).toMatchObject({ totalProjects: 2, activeProjects: 2, totalBudget: { currency: 'USD' }, totalSpent: { currency: 'USD' } })
  })

  it('calculates portfolio utilization as spend on budgeted projects divided by total budget', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'p1', name: 'Budgeted Project', status: 'ON_TRACK', budget: new Prisma.Decimal('1000'), spent: new Prisma.Decimal(0) },
          { id: 'p2', name: 'Unbudgeted Project', status: 'ON_TRACK', budget: null, spent: new Prisma.Decimal(0) },
        ]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { budget: new Prisma.Decimal('1000') } }),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        { projectId: 'p1', isTotal: false, spent: new Prisma.Decimal('200'), unvaluedSettlementCount: 0n, unassignedSettlementCount: 0n },
        { projectId: 'p2', isTotal: false, spent: new Prisma.Decimal('300'), unvaluedSettlementCount: 0n, unassignedSettlementCount: 0n },
        { projectId: null, isTotal: true, spent: new Prisma.Decimal('500'), unvaluedSettlementCount: 0n, unassignedSettlementCount: 0n },
      ]),
    } as unknown as PrismaClient

    const result = await getPortfolioUtilization(prisma, 'tenant_1')

    // Total spend across all projects is 500, but only p1 has a budget of 1000 with spend 200.
    // Utilization must be 20.0%, NOT 50.0%
    expect(result.summary.totalSpent).toEqual({ amount: 50000, currency: 'USD' })
    expect(result.summary.totalBudget).toEqual({ amount: 100000, currency: 'USD' })
    expect(result.summary.utilizationPct).toBe(20)
  })
})

describe('sprint velocity', () => {
  it('sums only estimated story points from dated completions and discloses unestimated work', async () => {
    const sprint = {
      id: 'sprint_1', name: 'Sprint 1', status: 'COMPLETED', projectId: 'project_1',
      startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: new Date('2026-10-14T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-14T00:00:00Z'),
      _count: { issues: 4 },
    }
    const groupBy = vi.fn()
      .mockResolvedValueOnce([{ sprintId: 'sprint_1', _count: { id: 3 } }])
      .mockResolvedValueOnce([{ sprintId: 'sprint_1', _count: { _all: 2, storyPoints: 1 }, _sum: { storyPoints: 5 } }])
    const prisma = {
      sprint: { findMany: vi.fn().mockResolvedValue([sprint]) },
      issue: { groupBy },
    } as unknown as PrismaClient

    const result = await listSprints(prisma, 'tenant_1')
    expect(result[0]).toMatchObject({
      issueCounts: { total: 4, done: 3 },
      velocity: { completedStoryPoints: 5, estimatedCompletedIssues: 1, unestimatedCompletedIssues: 1 },
    })
    expect(groupBy.mock.calls[1]?.[0].where).toMatchObject({
      tenantId: 'tenant_1', status: 'DONE', completedAt: { not: null }, sprintId: { not: null },
    })
  })

  it('compares estimated completions in the two latest completed dated sprints', async () => {
    const sprints = [
      { id: 'sprint_new', name: 'Sprint 2', startsAt: new Date('2026-10-15T00:00:00Z'), endsAt: new Date('2026-10-28T00:00:00Z') },
      { id: 'sprint_old', name: 'Sprint 1', startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: new Date('2026-10-14T00:00:00Z') },
    ]
    const projectFindFirst = vi.fn().mockResolvedValue({ id: 'project_1' })
    const sprintFindMany = vi.fn().mockResolvedValue(sprints)
    const groupBy = vi.fn().mockResolvedValue([
      { sprintId: 'sprint_new', _count: { _all: 3, storyPoints: 2 }, _sum: { storyPoints: 8 } },
      { sprintId: 'sprint_old', _count: { _all: 2, storyPoints: 2 }, _sum: { storyPoints: 5 } },
    ])
    const prisma = {
      project: { findFirst: projectFindFirst },
      sprint: { findMany: sprintFindMany },
      issue: { groupBy },
    } as unknown as PrismaClient
    const result = await getSprintVelocityComparison(prisma, 'tenant_1', 'project_1')
    expect(projectFindFirst).toHaveBeenCalledWith({ where: { id: 'project_1', tenantId: 'tenant_1' }, select: { id: true } })
    expect(sprintFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 'tenant_1', projectId: 'project_1', status: 'COMPLETED', startsAt: { not: null }, endsAt: { not: null } },
      take: 2,
    })
    expect(groupBy.mock.calls[0]?.[0].where).toMatchObject({ tenantId: 'tenant_1', status: 'DONE', completedAt: { not: null }, sprintId: { in: ['sprint_new', 'sprint_old'] } })
    expect(result).toMatchObject({
      current: { sprintId: 'sprint_new', completedStoryPoints: 8, estimatedCompletedIssues: 2, unestimatedCompletedIssues: 1 },
      previous: { sprintId: 'sprint_old', completedStoryPoints: 5 },
      deltaStoryPoints: 3,
      deltaPct: 60,
    })
  })

  it('leaves the comparison unavailable when there are not two dated completed sprints', async () => {
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project_1' }) },
      sprint: { findMany: vi.fn().mockResolvedValue([]) },
      issue: { groupBy: vi.fn() },
    } as unknown as PrismaClient
    expect(await getSprintVelocityComparison(prisma, 'tenant_1', 'project_1')).toEqual({
      projectId: 'project_1', current: null, previous: null, deltaStoryPoints: null, deltaPct: null,
    })
    expect(prisma.issue.groupBy).not.toHaveBeenCalled()
  })
})
