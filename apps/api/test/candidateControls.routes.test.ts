import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { candidateRoutes } from '../src/modules/hr/candidates.routes.js'

const candidateId = 'clxxxxxxxxxxxxxxxxxxxxxxx'

async function setup(role: 'ADMIN' | 'MEMBER' = 'ADMIN') {
  const events: string[] = []
  const startsAt = new Date(Date.now() + 86_400_000)
  const interview = {
    id: 'clyyyyyyyyyyyyyyyyyyyyyyy', candidateId, startsAt, durationMin: 60,
    stage: 'TECH_INTERVIEW', interviewer: 'Sam', meetingUrl: null, notes: null,
    status: 'SCHEDULED', createdAt: new Date(), updatedAt: new Date(),
  }
  const tx = {
    candidate: { findFirst: vi.fn().mockResolvedValue({ id: candidateId, tenantId: 'tenant_1', stage: 'SCREENING' }) },
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
    candidate: { findMany: vi.fn().mockResolvedValue([{
      name: 'Ada Candidate', email: '=formula', role: 'Engineer', stage: 'SCREENING',
      appliedAt: new Date('2026-10-01T00:00:00Z'), location: null, source: 'LinkedIn',
    }]) },
    auditLog: { create: vi.fn(async () => { events.push('audit') }) },
  }
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } }) } } as unknown as Auth)
  app.decorate('authSecret', 'test-secret')
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
})
