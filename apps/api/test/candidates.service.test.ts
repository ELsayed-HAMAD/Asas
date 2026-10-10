import type { Prisma, PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelCandidateInterview, getCandidatesForExport, listCandidates, scheduleCandidateInterview, updateCandidateStageInTransaction } from '../src/modules/hr/candidates.service.js'

const appliedAt = new Date('2026-09-01T00:00:00.000Z')
const enteredAt = new Date('2026-10-01T00:00:00.000Z')
const baseCandidate = {
  id: 'candid1234567890123456789', tenantId: 'tenant_1', employeeId: null, name: 'Ada Candidate', role: 'Engineer',
  stage: 'APPLIED' as const, stageEnteredAt: enteredAt, timeInStage: 'stale seed', appliedAt,
  avatarUrl: null, currentRole: null, experience: null, source: null, location: null, email: null,
  education: null, resumeUrl: null, createdAt: appliedAt, updatedAt: enteredAt,
}

afterEach(() => vi.useRealTimers())

describe('recruitment pipeline service', () => {
  it('records a valid stage transition and updates its entry time in the transaction', async () => {
    const candidate = { ...baseCandidate }
    const tx = {
      candidate: {
        findFirst: vi.fn().mockResolvedValue(candidate),
        update: vi.fn().mockImplementation(async ({ data }: { data: { stage: string; stageEnteredAt: Date } }) => ({ ...candidate, ...data })),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => ({
          ...candidate, stage: 'SCREENING', stageEnteredAt: new Date(),
          activities: [{ id: 'cactivity12345678901234567', action: 'stage.changed', description: 'APPLIED → SCREENING', fromStage: 'APPLIED', toStage: 'SCREENING', createdAt: enteredAt }],
        })),
      },
      candidateActivity: { create: vi.fn().mockResolvedValue({}) },
    }
    const result = await updateCandidateStageInTransaction(tx as unknown as Prisma.TransactionClient, 'tenant_1', candidate.id, { stage: 'SCREENING' })
    expect(tx.candidate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_tenantId: { id: candidate.id, tenantId: 'tenant_1' } },
      data: expect.objectContaining({ stage: 'SCREENING', stageEnteredAt: expect.any(Date) }),
    }))
    expect(tx.candidateActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromStage: 'APPLIED', toStage: 'SCREENING', action: 'stage.changed' }),
    }))
    expect(result.stage).toBe('SCREENING')
    expect(result.activity).toHaveLength(1)
  })

  it('rejects no-op and skipped stage transitions without writing', async () => {
    const tx = {
      candidate: { findFirst: vi.fn().mockResolvedValue(baseCandidate), update: vi.fn() },
      candidateActivity: { create: vi.fn() },
    }
    await expect(updateCandidateStageInTransaction(tx as unknown as Prisma.TransactionClient, 'tenant_1', baseCandidate.id, { stage: 'APPLIED' }))
      .rejects.toMatchObject({ statusCode: 409 })
    await expect(updateCandidateStageInTransaction(tx as unknown as Prisma.TransactionClient, 'tenant_1', baseCandidate.id, { stage: 'HIRED' }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(tx.candidate.update).not.toHaveBeenCalled()
    expect(tx.candidateActivity.create).not.toHaveBeenCalled()
  })

  it('creates and links an employee atomically when a candidate reaches HIRED', async () => {
    const candidate = { ...baseCandidate, stage: 'OFFER_SENT' as const, email: 'ada@example.test', location: 'Cairo' }
    const activities: Array<Record<string, unknown>> = []
    const tx = {
      candidate: {
        findFirst: vi.fn().mockResolvedValue(candidate),
        update: vi.fn().mockResolvedValue({ ...candidate, stage: 'HIRED', employeeId: 'employee12345678901234567' }),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => ({
          ...candidate, stage: 'HIRED', employeeId: 'employee12345678901234567', stageEnteredAt: new Date(),
          activities: activities.map((activity, index) => ({ id: `activity_${index}`, createdAt: enteredAt, fromStage: null, toStage: null, ...activity })),
        })),
      },
      employee: { create: vi.fn().mockResolvedValue({ id: 'employee12345678901234567' }) },
      candidateActivity: { create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { activities.push(data); return data }) },
    }
    const result = await updateCandidateStageInTransaction(tx as unknown as Prisma.TransactionClient, 'tenant_1', candidate.id, { stage: 'HIRED' })
    expect(tx.employee.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant_1', name: candidate.name, title: candidate.role, status: 'ACTIVE',
      hiredAt: expect.any(Date), location: 'Cairo', email: 'ada@example.test',
    }) })
    expect(tx.candidate.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'HIRED', employeeId: 'employee12345678901234567' }) }))
    expect(tx.candidateActivity.create).toHaveBeenCalledTimes(2)
    expect(result.employeeId).toBe('employee12345678901234567')
    expect(result.activity.map(item => item.action)).toEqual(['employee.created', 'stage.changed'])
  })

  it('calculates hiring metrics over the filtered tenant dataset, beyond the current page', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'))
    const pageCandidate = { ...baseCandidate, activities: [] }
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Africa/Cairo' }) },
      candidate: {
        findMany: vi.fn()
          .mockResolvedValueOnce([pageCandidate])
          .mockResolvedValueOnce([
            { id: 'candidate_hired', stage: 'HIRED' },
            { id: 'candidate_hired_2', stage: 'HIRED' },
            { id: 'candidate_offer', stage: 'OFFER_SENT' },
            { id: 'candidate_active', stage: 'SCREENING' },
            { id: 'candidate_rejected', stage: 'REJECTED' },
          ]),
        count: vi.fn().mockResolvedValue(5),
      },
      candidateActivity: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            { createdAt: new Date('2026-10-02T00:00:00.000Z'), candidate: { appliedAt: new Date('2026-09-20T00:00:00.000Z') } },
            { createdAt: new Date('2026-09-02T00:00:00.000Z'), candidate: { appliedAt: new Date('2026-08-10T00:00:00.000Z') } },
          ])
          .mockResolvedValueOnce([
            { fromStage: 'OFFER_SENT', toStage: 'HIRED', createdAt: new Date('2026-09-30T22:00:00.000Z') },
            { fromStage: 'OFFER_SENT', toStage: 'REJECTED', createdAt: new Date('2026-10-03T00:00:00.000Z') },
            { fromStage: 'OFFER_SENT', toStage: 'HIRED', createdAt: new Date('2026-09-02T00:00:00.000Z') },
          ]),
      },
    } as unknown as PrismaClient
    const result = await listCandidates(prisma, 'tenant_1', { page: 1, limit: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.pagination.total).toBe(5)
    expect(result.summary).toEqual({
      stageCounts: { APPLIED: 0, SCREENING: 1, TECH_INTERVIEW: 0, FINAL_INTERVIEW: 0, OFFER_SENT: 1, HIRED: 2, REJECTED: 1 },
      activeCandidates: 2,
      totalHired: 2,
      hiredThisPeriod: 1,
      hiredPreviousPeriod: 1,
      averageTimeToHireDays: 17.5,
      averageTimeToHireThisPeriod: 12,
      averageTimeToHirePreviousPeriod: 23,
      offerAcceptanceRate: 66.67,
      offerAcceptanceRateThisPeriod: 50,
      offerAcceptanceRatePreviousPeriod: 100,
      offersDecided: 3,
      offersDecidedThisPeriod: 2,
      offersDecidedPreviousPeriod: 1,
    })
    expect(prisma.candidateActivity.findMany).toHaveBeenCalledTimes(2)
  })

  it('schedules a future interview for a tenant candidate and records its activity', async () => {
    const candidateInterview = {
      id: 'interview1234567890123456789', candidateId: baseCandidate.id,
      startsAt: new Date(Date.now() + 86_400_000), durationMin: 60, stage: 'TECH_INTERVIEW',
      interviewer: 'Sam Recruiter', meetingUrl: 'https://meet.example.test/room', notes: null,
      status: 'SCHEDULED', createdAt: enteredAt, updatedAt: enteredAt,
    }
    const tx = {
      candidate: { findFirst: vi.fn().mockResolvedValue(baseCandidate) },
      candidateInterview: { create: vi.fn().mockResolvedValue(candidateInterview) },
      candidateActivity: { create: vi.fn().mockResolvedValue({}) },
    }
    const result = await scheduleCandidateInterview(tx as never, 'tenant_1', baseCandidate.id, {
      startsAt: candidateInterview.startsAt.toISOString(), durationMin: 60, stage: 'TECH_INTERVIEW', interviewer: 'Sam Recruiter', meetingUrl: 'https://meet.example.test/room',
    })
    expect(result.startsAt).toBe(candidateInterview.startsAt.toISOString())
    expect(tx.candidateInterview.create).toHaveBeenCalledWith({ data: expect.objectContaining({ candidateId: baseCandidate.id, stage: 'TECH_INTERVIEW', durationMin: 60 }) })
    expect(tx.candidateActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ candidateId: baseCandidate.id, action: 'interview.scheduled' }) })
  })

  it('rejects past interview times and prevents scheduling for closed candidates', async () => {
    const tx = {
      candidate: { findFirst: vi.fn().mockResolvedValue(baseCandidate) },
      candidateInterview: { create: vi.fn() },
      candidateActivity: { create: vi.fn() },
    }
    await expect(scheduleCandidateInterview(tx as never, 'tenant_1', baseCandidate.id, {
      startsAt: '2020-01-01T00:00:00.000Z', durationMin: 60, stage: 'SCREENING',
    })).rejects.toMatchObject({ statusCode: 400 })
    tx.candidate.findFirst.mockResolvedValue({ ...baseCandidate, stage: 'HIRED' })
    await expect(scheduleCandidateInterview(tx as never, 'tenant_1', baseCandidate.id, {
      startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMin: 60, stage: 'SCREENING',
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.candidateInterview.create).not.toHaveBeenCalled()
  })

  it('cancels only a scheduled interview scoped to the tenant candidate and records activity', async () => {
    const interview = { id: 'interview1234567890123456789', candidateId: baseCandidate.id, stage: 'SCREENING', startsAt: enteredAt, status: 'SCHEDULED' }
    const tx = {
      candidateInterview: {
        findFirst: vi.fn().mockResolvedValue(interview),
        update: vi.fn().mockResolvedValue({ ...interview, status: 'CANCELLED', durationMin: 60, interviewer: null, meetingUrl: null, notes: null, createdAt: enteredAt, updatedAt: enteredAt }),
      },
      candidateActivity: { create: vi.fn().mockResolvedValue({}) },
    }
    const result = await cancelCandidateInterview(tx as never, 'tenant_1', baseCandidate.id, interview.id)
    expect(result.status).toBe('CANCELLED')
    expect(tx.candidateInterview.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: interview.id, candidate: { is: { id: baseCandidate.id, tenantId: 'tenant_1' } } } }))
    expect(tx.candidateActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'interview.cancelled' }) })
  })

  it('exports every matching tenant candidate without paging and selects only report fields', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { candidate: { findMany } } as unknown as PrismaClient
    await getCandidatesForExport(prisma, 'tenant_1', { search: 'Engineer', stage: 'SCREENING' })
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant_1', stage: 'SCREENING',
        OR: [
          { name: { contains: 'Engineer', mode: 'insensitive' } },
          { role: { contains: 'Engineer', mode: 'insensitive' } },
          { email: { contains: 'Engineer', mode: 'insensitive' } },
        ],
      },
      orderBy: { appliedAt: 'desc' },
      select: { name: true, email: true, role: true, stage: true, appliedAt: true, location: true, source: true },
    })
  })
})
