import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { projectsRoutes } from '../src/modules/projects/projects.routes.js'
import { moduleKeyPrefix } from '../src/plugins/sse.js'

const phaseId = 'claaaaaaaaaaaaaaaaaaaaaaa'
const taskId = 'clbbbbbbbbbbbbbbbbbbbbbbb'
const userId = 'cleeeeeeeeeeeeeeeeeeeeeee'

async function setup(options: { role?: string; foreignPhase?: boolean; foreignTask?: boolean } = {}) {
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

  const state = {
    phases: [] as any[],
    tasks: [] as any[],
    audits: [] as any[],
  }

  const prisma = {
    member: {
      findUnique: vi.fn().mockResolvedValue({ role: options.role ?? 'ADMIN' }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: userId, name: 'Admin User', email: 'admin@example.com' }),
    },
    roadmapPhase: {
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: phaseId,
          tenantId: 'tenant_1',
          title: 'Phase 1',
          sortOrder: 0,
          tasks: [
            {
              id: taskId,
              phaseId,
              title: 'Task 1',
              taskCode: 'TSK-1',
              statusLabel: 'In Progress',
              description: 'Initial task',
              startDate: new Date('2026-10-01T00:00:00Z'),
              endDate: new Date('2026-10-15T00:00:00Z'),
              progressPct: 50,
              barColor: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ]),
      findFirst: vi.fn(async ({ where }: any) => {
        expect(where.tenantId).toBe('tenant_1')
        if (options.foreignPhase) return null
        return { id: phaseId, tenantId: 'tenant_1', title: 'Phase 1', sortOrder: 0 }
      }),
      create: vi.fn(async ({ data }: any) => {
        const p = { id: phaseId, ...data, tasks: [] }
        state.phases.push(p)
        return p
      }),
      delete: vi.fn(async ({ where }: any) => {
        state.phases = state.phases.filter(p => p.id !== where.id)
      }),
    },
    roadmapTask: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (options.foreignTask) return null
        return {
          id: taskId,
          tenantId: 'tenant_1',
          phaseId,
          title: 'Task 1',
          progressPct: 50,
        }
      }),
      create: vi.fn(async ({ data }: any) => {
        const t = { id: taskId, ...data, createdAt: new Date(), updatedAt: new Date() }
        state.tasks.push(t)
        return t
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const updated = { id: where.id, phaseId, ...data, updatedAt: new Date() }
        state.tasks.push(updated)
        return updated
      }),
      delete: vi.fn(async ({ where }: any) => {
        state.tasks = state.tasks.filter(t => t.id !== where.id)
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        state.audits.push(data)
      }),
    },
  } as unknown as PrismaClient

  const publish = vi.fn()
  app.decorate('prisma', prisma)
  app.decorate('ssePublish', publish)
  await app.register(projectsRoutes)

  return { app, prisma, state, publish }
}

describe('Projects Roadmap Routes', () => {
  it('lists phases and tasks for authenticated member', async () => {
    const { app, prisma } = await setup({ role: 'MEMBER' })
    const res = await app.inject({ method: 'GET', url: '/roadmap' })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.phases).toHaveLength(1)
    expect(json.data.phases[0]).toMatchObject({
      id: phaseId,
      title: 'Phase 1',
      tasks: [{ id: taskId, title: 'Task 1', progressPct: 50 }],
    })
    expect(prisma.roadmapPhase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant_1' },
      }),
    )
  })

  it('restricts phase creation to ADMIN, records audit, and publishes SSE', async () => {
    const member = await setup({ role: 'MEMBER' })
    const resForbidden = await member.app.inject({
      method: 'POST',
      url: '/roadmap/phases',
      payload: { title: 'Q4 Launch', sortOrder: 1 },
    })
    expect(resForbidden.statusCode).toBe(403)

    const admin = await setup({ role: 'ADMIN' })
    const resSuccess = await admin.app.inject({
      method: 'POST',
      url: '/roadmap/phases',
      payload: { title: 'Q4 Launch', sortOrder: 1 },
    })
    expect(resSuccess.statusCode).toBe(204)
    expect(admin.prisma.roadmapPhase.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant_1', title: 'Q4 Launch', sortOrder: 1 },
    })
    expect(admin.publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('deletes phase with admin permission, logs audit, and publishes SSE', async () => {
    const { app, state, publish, prisma } = await setup({ role: 'ADMIN' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/roadmap/phases/${phaseId}`,
    })

    expect(res.statusCode).toBe(204)
    expect(prisma.roadmapPhase.delete).toHaveBeenCalledWith({
      where: { id: phaseId },
    })
    expect(state.audits[0]).toMatchObject({
      action: 'roadmap.phase.delete',
      targetType: 'RoadmapPhase',
      targetId: phaseId,
    })
    expect(publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('updates roadmap task timeline and publishes SSE', async () => {
    const { app, publish, prisma } = await setup({ role: 'ADMIN' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/roadmap/tasks/${taskId}`,
      payload: { startDate: '2026-10-05', endDate: '2026-10-20', progressPct: 80 },
    })

    expect(res.statusCode).toBe(204)
    expect(prisma.roadmapTask.update).toHaveBeenCalled()
    expect(publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('deletes roadmap task with admin permission, logs audit, and publishes SSE', async () => {
    const { app, state, publish, prisma } = await setup({ role: 'ADMIN' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/roadmap/tasks/${taskId}`,
    })

    expect(res.statusCode).toBe(204)
    expect(prisma.roadmapTask.delete).toHaveBeenCalledWith({
      where: { id: taskId },
    })
    expect(state.audits[0]).toMatchObject({
      action: 'roadmap.task.delete',
      targetType: 'RoadmapTask',
      targetId: taskId,
    })
    expect(publish).toHaveBeenCalledWith('tenant_1', [moduleKeyPrefix('projects')])
  })

  it('rejects foreign task operations with 404', async () => {
    const { app } = await setup({ role: 'ADMIN', foreignTask: true })
    const res = await app.inject({
      method: 'DELETE',
      url: `/roadmap/tasks/${taskId}`,
    })
    expect(res.statusCode).toBe(404)
  })
})
