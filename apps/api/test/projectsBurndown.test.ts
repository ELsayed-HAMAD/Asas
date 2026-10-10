import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createIssue, createSprint, getBurndown, updateIssue } from '../src/modules/projects/projects.service.js'

describe('project sprint burndown', () => {
  it('assigns sprint project scope and dates issue completion only on status transitions', async () => {
    const now = new Date('2026-10-07T12:00:00.000Z')
    const createdIssue = {
      id: 'issue_1', tenantId: 'tenant_1', sprintId: 'sprint_1', projectId: 'project_1', key: null,
      title: 'Ship feature', tag: null, priority: 'MEDIUM', status: 'DONE', storyPoints: 3,
      completedAt: now, createdAt: now, updatedAt: now,
    }
    const create = vi.fn().mockResolvedValue(createdIssue)
    const createPrisma = {
      sprint: { findFirst: vi.fn().mockResolvedValue({ projectId: 'project_1' }) },
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project_1' }) },
      issue: { create },
    } as unknown as PrismaClient
    const result = await createIssue(createPrisma, 'tenant_1', { sprintId: 'sprint_1', title: 'Ship feature', status: 'DONE', storyPoints: 3 })
    expect(result).toMatchObject({ projectId: 'project_1', status: 'DONE', storyPoints: 3, completedAt: now.toISOString() })
    expect(create.mock.calls[0]?.[0].data.completedAt).toBeInstanceOf(Date)

    const doneIssue = { ...createdIssue, projectId: null, status: 'DONE' as const }
    const update = vi.fn().mockResolvedValue({ ...doneIssue, status: 'TODO', completedAt: null })
    const updatePrisma = {
      issue: { findFirst: vi.fn().mockResolvedValue(doneIssue), update },
    } as unknown as PrismaClient
    await updateIssue(updatePrisma, 'tenant_1', 'issue_1', { status: 'TODO' })
    expect(update.mock.calls[0]?.[0].data.completedAt).toBeNull()
  })

  it('rejects a project from another tenant before inserting an issue', async () => {
    const create = vi.fn()
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
      issue: { create },
    } as unknown as PrismaClient
    await expect(createIssue(prisma, 'tenant_1', { projectId: 'cproject1234567890123456789', title: 'Cross-tenant link' }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a sprint end date that precedes its start date', async () => {
    const prisma = { sprint: { create: vi.fn() } } as unknown as PrismaClient
    await expect(createSprint(prisma, 'tenant_1', {
      name: 'Invalid range', startsAt: '2026-10-10T00:00:00.000Z', endsAt: '2026-10-09T00:00:00.000Z',
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.sprint.create).not.toHaveBeenCalled()
  })

  it('uses dated scope and completion events and discloses undated legacy completions', async () => {
    const rawQuery = vi.fn().mockResolvedValue([
      { date: '2026-10-04', scope: 2, completed: 0 },
      { date: '2026-10-05', scope: 3, completed: 1 },
      { date: '2026-10-06', scope: 3, completed: 2 },
    ])
    const prisma = {
      sprint: { findFirst: vi.fn().mockResolvedValue({
        id: 'sprint_1', name: 'Sprint 1', startsAt: new Date('2026-10-04T00:00:00Z'),
        endsAt: new Date('2026-10-06T00:00:00Z'),
      }) },
      issue: { count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1) },
      $queryRaw: rawQuery,
    } as unknown as PrismaClient

    const result = await getBurndown(prisma, 'tenant_1', 'sprint_1', { limit: 90 })

    expect(result).toMatchObject({
      startDate: '2026-10-04', totalScope: 3, completed: 2, undatedCompleted: 1,
      points: [
        { date: '2026-10-04', remaining: 2, ideal: 2 },
        { date: '2026-10-05', remaining: 2, ideal: 1 },
        { date: '2026-10-06', remaining: 1, ideal: 0 },
      ],
    })
    expect(Array.from(rawQuery.mock.calls[0]![0] as TemplateStringsArray).join('')).toContain('"completedAt"')
  })

  it('returns no fabricated series when the sprint start date is unknown', async () => {
    const rawQuery = vi.fn()
    const prisma = {
      sprint: { findFirst: vi.fn().mockResolvedValue({ id: 'sprint_legacy', name: 'Legacy', startsAt: null, endsAt: null }) },
      issue: { count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1) },
      $queryRaw: rawQuery,
    } as unknown as PrismaClient

    await expect(getBurndown(prisma, 'tenant_1', 'sprint_legacy', { limit: 90 })).resolves.toMatchObject({
      startDate: null, totalScope: 2, completed: 1, undatedCompleted: 1, points: [],
    })
    expect(rawQuery).not.toHaveBeenCalled()
  })
})
