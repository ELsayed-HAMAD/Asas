import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { onboardingRoutes } from '../src/modules/onboarding/onboarding.routes.js'

async function setup(options: { auditFails?: boolean } = {}) {
  let onboardingStatus = 'PENDING'
  const migrationProjects: any[] = []
  const auditLog = { create: options.auditFails ? vi.fn().mockRejectedValue(new Error('audit unavailable')) : vi.fn().mockResolvedValue({}) }
  const dataMigrationProject = {
    findFirst: vi.fn(async ({ where }: any) => migrationProjects.find(project => project.tenantId === where.tenantId && project.createdDuringOnboarding === where.createdDuringOnboarding && where.status.in.includes(project.status)) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date('2026-10-23T10:00:00.000Z')
      const project = { id: 'migration_1', status: 'PLANNING', targetCutoverAt: null, sourceSystem: null, createdAt: now, updatedAt: now, ...data }
      migrationProjects.push(project)
      return project
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const project = migrationProjects.find(item => item.id === where.id)
      Object.assign(project, data, { updatedAt: new Date('2026-10-23T11:00:00.000Z') })
      return project
    }),
  }
  const tx = {
    tenant: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (onboardingStatus !== where.onboardingStatus) return { count: 0 }
        onboardingStatus = data.onboardingStatus
        return { count: 1 }
      }),
      findUnique: vi.fn(async () => ({ id: 'tenant_1', onboardingStatus, name: 'Acme Ltd.' })),
    },
    auditLog,
    dataMigrationProject,
  }
  const prisma = {
    member: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', employeeId: null }) },
    tenant: { findUnique: vi.fn(async () => ({ id: 'tenant_1', onboardingStatus, name: 'Acme Ltd.' })) },
    employee: { count: vi.fn().mockResolvedValue(0) },
    dataMigrationProject,
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const previousStatus = onboardingStatus
      try {
        return await callback(tx)
      } catch (error) {
        onboardingStatus = previousStatus
        throw error
      }
    }),
  } as unknown as PrismaClient

  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1', email: 'owner@example.com' } }) },
  } as unknown as Auth)
  app.decorate('prisma', prisma)
  app.decorate('ssePublish', vi.fn())
  await app.register(onboardingRoutes)
  return { app, prisma, tx, auditLog, migrationProjects, getStatus: () => onboardingStatus }
}

describe('POST /migration-project', () => {
  it('creates a durable multi-area plan and resumes the same planning project on retry', async () => {
    const { app, prisma, migrationProjects, auditLog } = await setup()
    const payload = { name: 'Acme Ltd. data migration', modules: ['HR', 'CRM', 'FINANCE', 'INVENTORY', 'PROJECTS'] }
    const first = await app.inject({ method: 'POST', url: '/migration-project', payload })
    const retry = await app.inject({ method: 'POST', url: '/migration-project', payload: { ...payload, modules: ['HR', 'CRM'] } })

    expect(first.statusCode).toBe(200)
    expect(first.json().data.modules).toHaveLength(5)
    expect(retry.statusCode).toBe(200)
    expect(retry.json().data.id).toBe(first.json().data.id)
    expect(retry.json().data.modules).toEqual(['HR', 'CRM'])
    expect(migrationProjects).toHaveLength(1)
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(auditLog.create).toHaveBeenCalledTimes(2)
    await app.close()
  })

  it('resumes the same onboarding project after an import has moved it to IN_PROGRESS', async () => {
    const { app, migrationProjects } = await setup()
    const payload = { name: 'Acme Ltd. data migration', modules: ['HR', 'INVENTORY'] }
    const first = await app.inject({ method: 'POST', url: '/migration-project', payload })
    migrationProjects[0].status = 'IN_PROGRESS'
    const retry = await app.inject({ method: 'POST', url: '/migration-project', payload: { ...payload, modules: ['HR', 'FINANCE', 'INVENTORY'] } })

    expect(first.statusCode).toBe(200)
    expect(retry.statusCode).toBe(200)
    expect(retry.json().data.id).toBe(first.json().data.id)
    expect(retry.json().data.status).toBe('IN_PROGRESS')
    expect(retry.json().data.modules).toEqual(['HR', 'FINANCE', 'INVENTORY'])
    expect(migrationProjects).toHaveLength(1)
    await app.close()
  })
})

describe('POST /empty', () => {
  it('records the state change and audit atomically and returns success on a retry', async () => {
    const { app, prisma, tx, auditLog, getStatus } = await setup()

    const first = await app.inject({ method: 'POST', url: '/empty' })
    const second = await app.inject({ method: 'POST', url: '/empty' })

    expect(first.statusCode).toBe(200)
    expect(first.json().data.onboardingStatus).toBe('EMPTY')
    expect(second.statusCode).toBe(200)
    expect(second.json().data.onboardingStatus).toBe('EMPTY')
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(tx.tenant.updateMany).toHaveBeenCalledTimes(2)
    expect(auditLog.create).toHaveBeenCalledTimes(1)
    expect(auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant_1', actorId: 'user_1', action: 'onboarding.markEmpty' }),
    }))
    expect(getStatus()).toBe('EMPTY')
    await app.close()
  })

  it('rolls back the initialization when the audit write fails', async () => {
    const { app, auditLog, getStatus } = await setup({ auditFails: true })

    const response = await app.inject({ method: 'POST', url: '/empty' })

    expect(response.statusCode).toBe(500)
    expect(auditLog.create).toHaveBeenCalledOnce()
    expect(getStatus()).toBe('PENDING')
    await app.close()
  })
})

describe('POST /import/validate', () => {
  it('validates supported employee rows without writing records or completing onboarding', async () => {
    const { app, prisma, getStatus } = await setup()
    const response = await app.inject({
      method: 'POST',
      url: '/import/validate',
      payload: { employees: [{ name: 'Ada Lovelace', title: 'Engineer', email: 'ada@example.test' }] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.validRows).toBe(1)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(getStatus()).toBe('PENDING')
    await app.close()
  })

  it('rejects rows outside the shared import contract before writes', async () => {
    const { app, prisma, getStatus } = await setup()
    const response = await app.inject({ method: 'POST', url: '/import/validate', payload: { employees: [{ name: '', title: 'Engineer' }] } })

    expect(response.statusCode).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(getStatus()).toBe('PENDING')
    await app.close()
  })
})
