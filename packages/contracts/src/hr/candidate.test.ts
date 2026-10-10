import { describe, expect, it } from 'vitest'
import { candidateListResponseSchema } from './candidate.js'

const candidate = {
  id: 'candid1234567890123456789',
  name: 'Ada Candidate',
  role: 'Engineer',
  stage: 'HIRED',
  stageEnteredAt: '2026-10-01T00:00:00.000Z',
  timeInStage: '6d',
  activity: [{
    id: 'cactivity12345678901234567',
    action: 'stage.changed',
    description: 'OFFER_SENT → HIRED',
    fromStage: 'OFFER_SENT',
    toStage: 'HIRED',
    createdAt: '2026-10-01T00:00:00.000Z',
  }],
  appliedAt: '2026-09-01T00:00:00.000Z',
  avatarUrl: null,
  currentRole: null,
  experience: null,
  source: null,
  location: null,
  email: null,
  education: null,
  resumeUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

describe('candidate pipeline contract', () => {
  it('requires stage timing and real activity on candidate rows', () => {
    const result = candidateListResponseSchema.safeParse({
      items: [candidate],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
      summary: {
        stageCounts: { APPLIED: 0, SCREENING: 0, TECH_INTERVIEW: 0, FINAL_INTERVIEW: 0, OFFER_SENT: 0, HIRED: 1, REJECTED: 0 },
        activeCandidates: 0,
        totalHired: 1,
        hiredThisPeriod: 1,
        hiredPreviousPeriod: 0,
        averageTimeToHireDays: 30,
        averageTimeToHireThisPeriod: 30,
        averageTimeToHirePreviousPeriod: null,
        offerAcceptanceRate: 100,
        offerAcceptanceRateThisPeriod: 100,
        offerAcceptanceRatePreviousPeriod: null,
        offersDecided: 1,
        offersDecidedThisPeriod: 1,
        offersDecidedPreviousPeriod: 0,
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an offer acceptance rate outside the percentage range', () => {
    const result = candidateListResponseSchema.safeParse({
      items: [candidate],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
      summary: {
        stageCounts: { APPLIED: 0, SCREENING: 0, TECH_INTERVIEW: 0, FINAL_INTERVIEW: 0, OFFER_SENT: 0, HIRED: 1, REJECTED: 0 },
        activeCandidates: 0,
        totalHired: 1,
        hiredThisPeriod: 1,
        hiredPreviousPeriod: 0,
        averageTimeToHireDays: 30,
        averageTimeToHireThisPeriod: 30,
        averageTimeToHirePreviousPeriod: null,
        offerAcceptanceRate: 101,
        offerAcceptanceRateThisPeriod: 101,
        offerAcceptanceRatePreviousPeriod: null,
        offersDecided: 1,
        offersDecidedThisPeriod: 1,
        offersDecidedPreviousPeriod: 0,
      },
    })
    expect(result.success).toBe(false)
  })
})
