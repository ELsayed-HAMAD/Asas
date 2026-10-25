import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { dataMigrationRoutes } from '../src/modules/settings/dataMigration.routes.js'

async function setup() {
  const projects: any[] = []
  const auditLog = { create: vi.fn(async () => ({})) }
  const projectModel = {
    findMany: vi.fn(async ({ where }: any) => projects.filter(project => project.tenantId === where.tenantId)),
    findFirst: vi.fn(async ({ where }: any) => projects.find(project => project.id === where.id && project.tenantId === where.tenantId) ?? null),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => projects.find(project => project.id === where.id)),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date('2026-10-23T10:00:00.000Z')
      const project = { id: `c${String(projects.length + 1).padStart(23, '0')}`, status: 'PLANNING', targetCutoverAt: null, sourceSystem: null, createdAt: now, updatedAt: now, ...data }
      projects.push(project)
      return project
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const project = projects.find(item => item.id === where.id)
      Object.assign(project, data, { updatedAt: new Date('2026-10-23T11:00:00.000Z') })
      return project
    }),
  }
  const prisma = {
    member: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', employeeId: null }) },
    dataMigrationProject: projectModel,
    dataMigrationStageBatch: { findFirst: vi.fn(async () => null) },
    auditLog,
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback({ dataMigrationProject: projectModel, dataMigrationStageBatch: { findFirst: vi.fn(async () => null) }, auditLog })),
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
  await app.register(dataMigrationRoutes)
  return { app, prisma, projects, auditLog }
}

describe('data migration project routes', () => {
  it('creates, lists, and updates a tenant project with an audit trail', async () => {
    const { app, prisma, projects, auditLog } = await setup()
    const created = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'Acme ERP migration', sourceSystem: 'Legacy ERP', modules: ['HR', 'CRM'] },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().data).toMatchObject({
      id: 'c00000000000000000000001', name: 'Acme ERP migration', sourceSystem: 'Legacy ERP', modules: ['HR', 'CRM'], status: 'PLANNING',
      targetCutoverAt: null, createdAt: '2026-10-23T10:00:00.000Z',
    })
    expect(created.json().data).not.toHaveProperty('tenantId')
    expect(created.json().data).not.toHaveProperty('createdBy')

    const listed = await app.inject({ method: 'GET', url: '/' })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().data.projects).toHaveLength(1)
    expect(prisma.dataMigrationProject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1' } }))

    const updated = await app.inject({ method: 'PATCH', url: '/c00000000000000000000001', payload: { modules: ['HR', 'CRM', 'INVENTORY'] } })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().data.modules).toEqual(['HR', 'CRM', 'INVENTORY'])
    expect(projects[0].modules).toEqual(['HR', 'CRM', 'INVENTORY'])
    expect(auditLog.create).toHaveBeenCalledTimes(2)
    await app.close()
  })

  it('rejects duplicate module scopes and never creates a project', async () => {
    const { app, prisma } = await setup()
    const response = await app.inject({ method: 'POST', url: '/', payload: { name: 'Bad scope', modules: ['CRM', 'CRM'] } })
    expect(response.statusCode).toBe(400)
    expect(prisma.dataMigrationProject.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('does not disclose another tenant project during updates', async () => {
    const { app, prisma, projects } = await setup()
    projects.push({ id: 'c00000000000000000000002', tenantId: 'tenant_other', status: 'PLANNING', modules: ['HR'] })
    const response = await app.inject({ method: 'PATCH', url: '/c00000000000000000000002', payload: { name: 'Changed' } })
    expect(response.statusCode).toBe(404)
    expect(prisma.dataMigrationProject.update).not.toHaveBeenCalled()
    await app.close()
  })
})
