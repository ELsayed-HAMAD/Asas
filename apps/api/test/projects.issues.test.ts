import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { projectsRoutes } from '../src/modules/projects/projects.routes.js'
import { moduleKeyPrefix } from '../src/plugins/sse.js'

const issueId = 'claaaaaaaaaaaaaaaaaaaaaaa'
const checklistItemId = 'clbbbbbbbbbbbbbbbbbbbbbbb'
const commentId = 'clccccccccccccccccccccccc'
const employeeId = 'clddddddddddddddddddddddd'
const userId = 'cleeeeeeeeeeeeeeeeeeeeeee'
const assigneeId = 'clfffffffffffffffffffffff'

async function setup(options: { role?: string; foreignIssue?: boolean } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: {
      getSession: async () => ({
        session: { activeOrganizationId: 'tenant_1' },
        user: { id: userId, name: 'Admin User', email: 'admin@example.com' },
      }),
    },
  } as unknown as Auth)

  let state = {
    checklist: [] as any[],
    comments: [] as any[],
    assignees: [] as any[],
    audits: [] as any[],
  }

  const transaction = vi.fn(async (work: (tx: any) => Promise<any>) => {
    const staged = {
      checklist: [...state.checklist],
      comments: [...state.comments],
      assignees: [...state.assignees],
      audits: [...state.audits],
    }
    const tx = {
      issue: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
          expect(where.tenantId).toBe('tenant_1')
          if (options.foreignIssue) return null
          return { id: issueId, tenantId: 'tenant_1' }
        }),
      },
      issueChecklistItem: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(async ({ data }: any) => {
          const item = { id: checklistItemId, ...data, createdAt: new Date() }
          staged.checklist.push(item)
          return item
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          expect(where.issueId).toBe(issueId)
          if (options.foreignIssue) return null
          return { id: checklistItemId, issueId, done: false, text: 'Item 1' }
        }),
        update: vi.fn(async ({ data }: any) => {
          const updated = { id: checklistItemId, issueId, text: 'Item 1', ...data }
          staged.checklist.push(updated)
          return updated
        }),
        delete: vi.fn(async () => {
          staged.checklist = staged.checklist.filter(i => i.id !== checklistItemId)
        }),
      },
      issueComment: {
        create: vi.fn(async ({ data }: any) => {
          const comment = { id: commentId, ...data, createdAt: new Date() }
          staged.comments.push(comment)
          return comment
        }),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: employeeId, tenantId: 'tenant_1' }),
      },
      issueAssignee: {
        upsert: vi.fn(async ({ create }: any) => {
          const assignee = { id: assigneeId, ...create, employee: { id: employeeId, name: 'Alice Dev', title: null, avatarUrl: null } }
          staged.assignees.push(assignee)
          return assignee
        }),
        deleteMany: vi.fn(async () => {
          staged.assignees = staged.assignees.filter(a => a.employeeId !== employeeId)
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          staged.audits.push(data)
        }),
      },
    }
    const result = await work(tx)
    state = staged
    return result
  })

  const prisma = {
    member: {
      findUnique: vi.fn().mockResolvedValue({ role: options.role ?? 'ADMIN' }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: userId, name: 'Admin User', email: 'admin@example.com' }),
    },
    issue: {
      findFirst: vi.fn(async ({ where }: any) => {
        expect(where.tenantId).toBe('tenant_1')
        if (options.foreignIssue) return null
        return {
          id: issueId,
          tenantId: 'tenant_1',
          key: 'ISS-1',
          title: 'Issue 1',
          priority: 'MEDIUM',
          status: 'TODO',
          storyPoints: 3,
          tag: null,
          sprintId: null,
          projectId: null,
          dueDate: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          checklist: [],
          comments: [],
          assignees: [],
        }
      }),
    },
    $transaction: transaction,
  } as unknown as PrismaClient

  const publish = vi.fn()
  app.decorate('prisma', prisma)
  app.decorate('ssePublish', publish)
  await app.register(projectsRoutes)

  return { app, prisma, state: () => state, publish }
}

describe('Projects Issues Sub-resources', () => {
  it('allows member to create a checklist item, logs audit, and publishes SSE', async () => {
    const { app, state, publish } = await setup({ role: 'MEMBER' })
    const res = await app.inject({
      method: 'POST',
      url: `/issues/${issueId}/checklist`,
      payload: { text: 'Write integration test' },
    })

    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.data).toMatchObject({
      id: checklistItemId,
      text: 'Write integration test',
      done: false,
    })
    expect(state().audits[0]).toMatchObject({
      action: 'projects.issue.checklist.create',
      targetType: 'IssueChecklistItem',
      targetId: checklistItemId,
    })
    expect(publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('allows member to toggle a checklist item done status', async () => {
    const { app, state, publish } = await setup({ role: 'MEMBER' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/issues/${issueId}/checklist/${checklistItemId}`,
      payload: { done: true },
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.done).toBe(true)
    expect(state().audits[0]).toMatchObject({
      action: 'projects.issue.checklist.update',
      targetType: 'IssueChecklistItem',
      targetId: checklistItemId,
    })
    expect(publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('restricts checklist deletion to ADMIN', async () => {
    const member = await setup({ role: 'MEMBER' })
    const resForbidden = await member.app.inject({
      method: 'DELETE',
      url: `/issues/${issueId}/checklist/${checklistItemId}`,
    })
    expect(resForbidden.statusCode).toBe(403)

    const admin = await setup({ role: 'ADMIN' })
    const resSuccess = await admin.app.inject({
      method: 'DELETE',
      url: `/issues/${issueId}/checklist/${checklistItemId}`,
    })
    expect(resSuccess.statusCode).toBe(204)
    expect(admin.state().audits[0]).toMatchObject({
      action: 'projects.issue.checklist.delete',
      targetType: 'IssueChecklistItem',
      targetId: checklistItemId,
    })
    expect(admin.publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('allows member to add comments with resolved author', async () => {
    const { app, state, publish } = await setup({ role: 'MEMBER' })
    const res = await app.inject({
      method: 'POST',
      url: `/issues/${issueId}/comments`,
      payload: { body: 'Ready for review' },
    })

    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.data).toMatchObject({
      id: commentId,
      body: 'Ready for review',
      author: 'Admin User',
    })
    expect(state().audits[0]).toMatchObject({
      action: 'projects.issue.comment.create',
      targetType: 'IssueComment',
      targetId: commentId,
    })
    expect(publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('restricts assignee management to ADMIN and validates tenant boundary', async () => {
    const member = await setup({ role: 'MEMBER' })
    const resForbidden = await member.app.inject({
      method: 'POST',
      url: `/issues/${issueId}/assignees`,
      payload: { employeeId },
    })
    expect(resForbidden.statusCode).toBe(403)

    const admin = await setup({ role: 'ADMIN' })
    const resAdd = await admin.app.inject({
      method: 'POST',
      url: `/issues/${issueId}/assignees`,
      payload: { employeeId },
    })
    expect(resAdd.statusCode).toBe(201)
    expect(admin.state().audits[0]).toMatchObject({
      action: 'projects.issue.assignee.add',
      targetType: 'IssueAssignee',
    })

    const resRemove = await admin.app.inject({
      method: 'DELETE',
      url: `/issues/${issueId}/assignees/${employeeId}`,
    })
    expect(resRemove.statusCode).toBe(204)
    expect(admin.state().audits[1]).toMatchObject({
      action: 'projects.issue.assignee.remove',
      targetType: 'IssueAssignee',
      targetId: employeeId,
    })
    expect(admin.publish).toHaveBeenCalledTimes(2)
  })

  it('rejects foreign issues with 404', async () => {
    const { app } = await setup({ role: 'ADMIN', foreignIssue: true })
    const res = await app.inject({
      method: 'POST',
      url: `/issues/${issueId}/checklist`,
      payload: { text: 'Cross-tenant attack' },
    })
    expect(res.statusCode).toBe(404)
  })
})

