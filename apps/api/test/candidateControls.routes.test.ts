import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import type { ObjectStorage } from '../src/services/objectStorage.js'
import { LocalObjectStorage } from '../src/services/objectStorage.js'
import { candidateRoutes } from '../src/modules/hr/candidates.routes.js'

const candidateId = 'clxxxxxxxxxxxxxxxxxxxxxxx'

async function setup(role: 'ADMIN' | 'MEMBER' = 'ADMIN', objectStorage: ObjectStorage = new LocalObjectStorage(`candidate-route-test-${process.pid}`)) {
  const events: string[] = []
  const startsAt = new Date(Date.now() + 86_400_000)
  const interview = {
    id: 'clyyyyyyyyyyyyyyyyyyyyyyy', candidateId, startsAt, durationMin: 60,
    stage: 'TECH_INTERVIEW', interviewer: 'Sam', meetingUrl: null, notes: null,
    status: 'SCHEDULED', createdAt: new Date(), updatedAt: new Date(),
  }
  const candidateRecord = {
    id: candidateId,
    tenantId: 'tenant_1',
    employeeId: null,
    name: 'Ada Candidate',
    role: 'Engineer',
    stage: 'SCREENING',
    stageEnteredAt: new Date(),
    timeInStage: null,
    appliedAt: new Date(),
    avatarUrl: null,
    currentRole: null,
    experience: null,
    source: 'LinkedIn',
    location: null,
    email: null,
    education: null,
    resumeUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    activities: [],
  }
  const tx = {
    candidate: {
      findFirst: vi.fn().mockResolvedValue(candidateRecord),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...candidateRecord,
        ...data,
      })),
    },
    candidateInterview: { create: vi.fn().mockResolvedValue(interview) },
    candidateActivity: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn(async () => { events.push('audit') }) },
  }
  const prisma = {
    member: { findUnique: vi.fn().mockResolvedValue({ role, employeeId: null }) },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => {
      const value = await callback(tx)
      events.push('commit')
      return value
    }),
    candidate: {
      findFirst: vi.fn().mockResolvedValue(candidateRecord),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...candidateRecord, ...data })),
      findMany: vi.fn().mockResolvedValue([{
      name: 'Ada Candidate', email: '=formula', role: 'Engineer', stage: 'SCREENING',
      appliedAt: new Date('2026-10-01T00:00:00Z'), location: null, source: 'LinkedIn',
      }]),
    },
    candidateActivity: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn(async () => { events.push('audit') }) },
  }
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } }) } } as unknown as Auth)
  app.decorate('authSecret', 'test-secret')
  app.decorate('objectStorage', objectStorage)
  app.decorate('prisma', prisma as unknown as PrismaClient)
  app.decorate('ssePublish', vi.fn(() => { events.push('sse') }))
  await app.register(candidateRoutes, { prefix: '/hr' })
  return { app, prisma, tx, events, startsAt }
}

describe('candidate scheduling and export routes', () => {
  it('commits interview schedule activity and actor audit before SSE', async () => {
    const { app, tx, events, startsAt } = await setup()
    try {
      const response = await app.inject({
        method: 'POST', url: `/hr/candidates/${candidateId}/interviews`,
        payload: { startsAt: startsAt.toISOString(), durationMin: 60, stage: 'TECH_INTERVIEW', interviewer: 'Sam' },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().data).toMatchObject({ candidateId, status: 'SCHEDULED', stage: 'TECH_INTERVIEW' })
      expect(tx.candidateActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'interview.scheduled' }) }))
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: 'user_1', action: 'hr.candidate.interview.schedule' }) }))
      expect(events).toEqual(['audit', 'commit', 'sse'])
    } finally { await app.close() }
  })

  it('exports the tenant-filtered report as formula-safe CSV and blocks MEMBER export', async () => {
    const admin = await setup()
    try {
      const response = await admin.app.inject('/hr/candidates/export.csv?search=Ada')
      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/csv')
      expect(response.body).toContain("'=formula")
      expect(admin.prisma.candidate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant_1', OR: expect.any(Array) }) }))
      expect(admin.prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: 'user_1', action: 'hr.candidate.export' }) }))
    } finally { await admin.app.close() }

    const member = await setup('MEMBER')
    try {
      const response = await member.app.inject('/hr/candidates/export.csv')
      expect(response.statusCode).toBe(403)
      expect(member.prisma.candidate.findMany).not.toHaveBeenCalled()
    } finally { await member.app.close() }
  })

  it('updates candidate with audit log and publishes SSE before returning', async () => {
    const { app, tx, events } = await setup()
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/hr/candidates/${candidateId}`,
        payload: { name: 'Ada Lovelace', role: 'Principal Engineer' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toMatchObject({
        id: candidateId,
        name: 'Ada Lovelace',
        role: 'Principal Engineer',
      })
      expect(tx.candidate.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id_tenantId: { id: candidateId, tenantId: 'tenant_1' } },
        data: expect.objectContaining({ name: 'Ada Lovelace', role: 'Principal Engineer' }),
      }))
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'user_1',
          action: 'hr.candidate.update',
          targetId: candidateId,
        }),
      }))
      expect(events).toEqual(['audit', 'commit', 'sse'])
    } finally {
      await app.close()
    }
  })

  it('uses a short-lived object-store PUT and validates the staged PDF before promotion', async () => {
    const objectStorage = {
      mode: 's3' as const,
      presignPut: vi.fn(async () => 'https://objects.example.test/signed-put'),
      head: vi.fn(async () => ({ size: 12 })),
      readPrefix: vi.fn(async () => Buffer.from('%PDF-')),
      copy: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      presignGet: vi.fn(async () => 'https://objects.example.test/signed-get'),
    } as unknown as ObjectStorage
    const { app, prisma, events } = await setup('ADMIN', objectStorage)
    try {
      const grantResponse = await app.inject(`/hr/candidates/${candidateId}/resume-upload-url`)
      expect(grantResponse.statusCode).toBe(200)
      const grant = grantResponse.json().data
      expect(grant).toMatchObject({ uploadUrl: 'https://objects.example.test/signed-put', uploadTarget: 'object', method: 'PUT', maxBytes: 5 * 1024 * 1024 })
      expect(objectStorage.presignPut).toHaveBeenCalledWith(`staging/resumes/tenant_1/${candidateId}/${grant.uploadId}.pdf`, 'application/pdf', 600, 5 * 1024 * 1024)

      const completion = await app.inject({
        method: 'POST',
        url: `/hr/candidates/${candidateId}/resume/complete`,
        payload: { uploadId: grant.uploadId, expiresUnix: grant.expiresUnix, uploadToken: grant.uploadToken },
      })
      expect(completion.statusCode).toBe(200)
      expect(completion.json().data.resumeUrl).toBe(`/api/v1/hr/candidates/${candidateId}/resume`)
      expect(objectStorage.copy).toHaveBeenCalledWith(`staging/resumes/tenant_1/${candidateId}/${grant.uploadId}.pdf`, `resumes/tenant_1/${candidateId}.pdf`, 'application/pdf')
      expect(objectStorage.delete).toHaveBeenCalledOnce()
      expect(prisma.candidateActivity.create).toHaveBeenCalledWith({ data: { candidateId, action: 'cv.uploaded' } })
      expect(events).toEqual(['sse'])
    } finally { await app.close() }
  })

  it('rejects oversized staged resumes and deletes the temporary object', async () => {
    const objectStorage = {
      mode: 's3' as const,
      presignPut: vi.fn(async () => 'https://objects.example.test/signed-put'),
      head: vi.fn(async () => ({ size: 5 * 1024 * 1024 + 1 })),
      readPrefix: vi.fn(async () => Buffer.from('%PDF-')),
      copy: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      presignGet: vi.fn(async () => 'https://objects.example.test/signed-get'),
    } as unknown as ObjectStorage
    const { app } = await setup('ADMIN', objectStorage)
    try {
      const grant = (await app.inject(`/hr/candidates/${candidateId}/resume-upload-url`)).json().data
      const response = await app.inject({
        method: 'POST',
        url: `/hr/candidates/${candidateId}/resume/complete`,
        payload: { uploadId: grant.uploadId, expiresUnix: grant.expiresUnix, uploadToken: grant.uploadToken },
      })
      expect(response.statusCode).toBe(413)
      expect(objectStorage.delete).toHaveBeenCalledOnce()
      expect(objectStorage.copy).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('rejects candidate updates from MEMBER role without permissions', async () => {
    const member = await setup('MEMBER')
    try {
      const response = await member.app.inject({
        method: 'PATCH',
        url: `/hr/candidates/${candidateId}`,
        payload: { name: 'Ada Lovelace' },
      })
      expect(response.statusCode).toBe(403)
      expect(member.tx.candidate.update).not.toHaveBeenCalled()
    } finally {
      await member.app.close()
    }
  })

  it('rejects candidate reads and resume downloads from MEMBER role without candidate.read permission (Finding 25)', async () => {
    const member = await setup('MEMBER')
    try {
      const listResponse = await member.app.inject({
        method: 'GET',
        url: '/hr/candidates',
      })
      expect(listResponse.statusCode).toBe(403)

      const resumeResponse = await member.app.inject({
        method: 'GET',
        url: `/hr/candidates/${candidateId}/resume`,
      })
      expect(resumeResponse.statusCode).toBe(403)
    } finally {
      await member.app.close()
    }
  })
})
