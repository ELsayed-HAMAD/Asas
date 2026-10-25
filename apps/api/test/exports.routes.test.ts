import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { clearAuthContextCache } from '../src/middlewares/rbac.js'
import { exportRoutes } from '../src/modules/exports/exports.routes.js'

const exportId = 'clh0000000000000000000000'

async function setup(options: { failAudit?: boolean; failDispatch?: boolean } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler((error, _request, reply) => {
    void reply.code(error.statusCode ?? 500).send({ error: { message: error.message } })
  })
  app.decorate('auth', {
    api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) },
  } as unknown as Auth)

  const events: string[] = []
  const dispatch = vi.fn(async (_id: string, _kind: string, _data: unknown) => {
    events.push('dispatch')
    if (options.failDispatch) {
      if (job) job = { ...job, status: 'FAILED' }
      throw new Error('queue unavailable')
    }
    if (job) job = { ...job, status: 'DONE', progressPct: 100 }
  })
  const jobTemplate = {
    id: exportId,
    tenantId: 'tenant_1',
    filename: 'workspace-archive.json',
    dataScope: 'workspace',
    format: 'json',
    dateRange: null,
    status: 'QUEUED' as 'QUEUED' | 'DONE' | 'FAILED',
    progressPct: 0,
    createdAt: new Date('2026-10-23T10:00:00.000Z'),
    updatedAt: new Date('2026-10-23T10:00:00.000Z'),
  }
  let job: typeof jobTemplate | null = null
  const createJob = vi.fn(async ({ data }) => {
    events.push('job.create')
    job = { ...jobTemplate, ...data }
    return job
  })
  const prisma = {
    member: { findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN', employeeId: null }) },
    exportJob: {
      findFirstOrThrow: vi.fn(async () => job),
      findFirst: vi.fn(async () => job),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async callback => {
      const before = job
      const tx = {
        exportJob: { create: createJob },
        auditLog: { create: vi.fn(async () => {
          events.push('audit.create')
          if (options.failAudit) throw new Error('audit database unavailable')
        }) },
      }
      try {
        const result = await callback(tx)
        events.push('transaction.commit')
        return result
      } catch (error) {
        job = before
        events.push('transaction.rollback')
        throw error
      }
    }),
  } as unknown as PrismaClient
  app.decorate('prisma', prisma)
  app.decorate('exportQueue', { dispatch } as never)
  const storageGet = vi.fn(async () => Buffer.from('Name,Status\r\nAda,ACTIVE\r\n'))
  app.decorate('objectStorage', { mode: 'local', get: storageGet } as never)
  app.decorate('ssePublish', vi.fn(() => events.push('sse')))
  await app.register(exportRoutes, { prefix: '/api/v1/exports' })
  return { app, events, prisma, createJob, dispatch, storageGet, job: () => job }
}

afterEach(() => clearAuthContextCache())

describe('POST /exports/jobs', () => {
  it('commits the export request and audit record before dispatching it', async () => {
    const f = await setup()
    try {
      const response = await f.app.inject({
        method: 'POST',
        url: '/api/v1/exports/jobs',
        headers: { cookie: 'better-auth.session_token=export-test-token' },
        payload: { kind: 'workspace' },
      })

      expect(response.statusCode, response.body).toBe(202)
      expect(f.events).toEqual(['job.create', 'audit.create', 'transaction.commit', 'dispatch', 'sse'])
      expect(response.json().data).toMatchObject({ id: exportId, status: 'DONE', kind: 'workspace' })
      expect(f.createJob).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: 'tenant_1', dataScope: 'workspace', status: 'QUEUED', format: 'json' }),
      })
    } finally {
      await f.app.close()
    }
  })

  it('persists and dispatches CSV format and inclusive date filters', async () => {
    const f = await setup()
    try {
      const response = await f.app.inject({
        method: 'POST',
        url: '/api/v1/exports/jobs',
        headers: { cookie: 'better-auth.session_token=export-test-token' },
        payload: { kind: 'employees', format: 'csv', dateRange: { from: '2026-01-01', to: '2026-03-31' } },
      })

      expect(response.statusCode, response.body).toBe(202)
      expect(response.json().data).toMatchObject({
        kind: 'employees', format: 'csv',
        dateRange: { from: '2026-01-01', to: '2026-03-31' }, filename: 'employees.csv',
      })
      expect(f.createJob).toHaveBeenCalledWith({ data: expect.objectContaining({
        dataScope: 'employees', filename: 'employees.csv', format: 'csv',
        dateRange: '{"from":"2026-01-01","to":"2026-03-31"}',
      }) })
      expect(f.dispatch).toHaveBeenCalledWith(exportId, 'employees', expect.objectContaining({
        format: 'csv', dateRange: { from: '2026-01-01', to: '2026-03-31' },
      }))
    } finally {
      await f.app.close()
    }
  })

  it('downloads a CSV job from its matching tenant-scoped key and content type', async () => {
    const f = await setup()
    try {
      const created = await f.app.inject({
        method: 'POST',
        url: '/api/v1/exports/jobs',
        headers: { cookie: 'better-auth.session_token=export-test-token' },
        payload: { kind: 'employees', format: 'csv' },
      })
      expect(created.statusCode).toBe(202)

      const response = await f.app.inject({
        method: 'GET',
        url: `/api/v1/exports/jobs/${exportId}/download`,
        headers: { cookie: 'better-auth.session_token=export-test-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
      expect(response.headers['content-disposition']).toBe('attachment; filename="employees.csv"')
      expect(response.body).toBe('Name,Status\r\nAda,ACTIVE\r\n')
      expect(f.storageGet).toHaveBeenCalledWith(`exports/tenant_1/${exportId}.csv`)
      expect(f.prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'export.download' }) }))
    } finally {
      await f.app.close()
    }
  })

  it('does not dispatch or generate an export when audit persistence fails', async () => {
    const f = await setup({ failAudit: true })
    try {
      const response = await f.app.inject({
        method: 'POST',
        url: '/api/v1/exports/jobs',
        headers: { cookie: 'better-auth.session_token=export-test-token' },
        payload: { kind: 'workspace' },
      })

      expect(response.statusCode).toBe(500)
      expect(f.events).toEqual(['job.create', 'audit.create', 'transaction.rollback'])
      expect(f.job()).toBeNull()
      expect(f.prisma.exportJob.findFirstOrThrow).not.toHaveBeenCalled()
    } finally {
      await f.app.close()
    }
  })

  it('keeps the audited request visible when queue dispatch fails', async () => {
    const f = await setup({ failDispatch: true })
    try {
      const response = await f.app.inject({
        method: 'POST',
        url: '/api/v1/exports/jobs',
        headers: { cookie: 'better-auth.session_token=export-test-token' },
        payload: { kind: 'workspace' },
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error.message).toContain('recorded')
      expect(f.events).toEqual(['job.create', 'audit.create', 'transaction.commit', 'dispatch', 'sse'])
    } finally {
      await f.app.close()
    }
  })
})
