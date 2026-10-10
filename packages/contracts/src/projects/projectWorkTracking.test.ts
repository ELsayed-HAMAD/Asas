import { describe, expect, it } from 'vitest'
import { issueSchema, issueWriteSchema } from './issue.js'
import { sprintSchema, sprintWriteSchema } from './sprint.js'

describe('project work tracking contracts', () => {
  it('accepts nullable legacy dates and project/story point fields', () => {
    expect(issueSchema.safeParse({
      id: 'cissue12345678901234567890', sprintId: null, projectId: null, key: null, title: 'Task', tag: null,
      priority: 'MEDIUM', status: 'DONE', storyPoints: null, completedAt: null,
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    }).success).toBe(true)
    expect(sprintSchema.safeParse({
      id: 'csprint1234567890123456789', name: 'Legacy', status: 'ACTIVE', projectId: null, startsAt: null, endsAt: null,
      completionPct: 0, issueCounts: { total: 0, done: 0 },
      velocity: { completedStoryPoints: null, estimatedCompletedIssues: 0, unestimatedCompletedIssues: 0 },
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    }).success).toBe(true)
  })

  it('bounds story points and accepts explicitly recorded sprint dates', () => {
    expect(issueWriteSchema.safeParse({ title: 'Task', storyPoints: 1001 }).success).toBe(false)
    expect(sprintWriteSchema.safeParse({ name: 'Sprint', startsAt: '2026-10-10T00:00:00.000Z', endsAt: '2026-10-12T00:00:00.000Z' }).success).toBe(true)
  })
})
