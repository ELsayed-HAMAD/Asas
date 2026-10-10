import type { Candidate as PrismaCandidate, CandidateStage as PrismaCandidateStage, Prisma, PrismaClient } from '@prisma/client'
import type {
  Candidate,
  CandidateListQuery,
  CandidateStageUpdateInput,
  CandidateWriteInput,
  CandidatePipelineSummary,
  CandidateInterviewWriteInput,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'
import { tenantToday } from '../../utils/dates.js'

/**
 * HR candidates — the recruitment pipeline slice (list, create, stage moves) plus the anchor
 * for the CV surface. The CV itself never lives in the database: `resumeUrl` is the same-
 * origin preview path, and the file is written by the signed-PUT route (see
 * `candidates.routes.ts`) under `storage/resumes/<tenantId>/`.
 */

/** Wire mapping shared by every read path (and the CV upload route's 200 response). */
type CandidateWithActivity = PrismaCandidate & { activities?: Array<{
  id: string; action: string; description: string | null; fromStage: PrismaCandidateStage | null;
  toStage: PrismaCandidateStage | null; createdAt: Date
}> }

function formatStageDuration(stageEnteredAt: Date, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - stageEnteredAt.getTime()) / 60_000))
  if (minutes < 60) return minutes + 'm'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + 'h'
  const days = Math.floor(hours / 24)
  if (days < 30) return days + 'd'
  const months = Math.floor(days / 30)
  if (months < 12) return months + 'mo'
  return Math.floor(days / 365) + 'y'
}

export function mapCandidate(row: CandidateWithActivity): Candidate {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    role: row.role,
    stage: row.stage,
    stageEnteredAt: row.stageEnteredAt.toISOString(),
    timeInStage: formatStageDuration(row.stageEnteredAt),
    activity: row.activities?.map(item => ({
      id: item.id, action: item.action, description: item.description,
      fromStage: item.fromStage, toStage: item.toStage, createdAt: item.createdAt.toISOString(),
    })) ?? [],
    appliedAt: row.appliedAt.toISOString(),
    avatarUrl: row.avatarUrl,
    currentRole: row.currentRole,
    experience: row.experience,
    source: row.source,
    location: row.location,
    email: row.email,
    education: row.education,
    resumeUrl: row.resumeUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface CandidateListResult {
  items: Candidate[]
  pagination: ReturnType<typeof buildPaginationMeta>
  /** Summary covers every record matching this query, independent of the page size. */
  summary: CandidatePipelineSummary
}

export async function listCandidates(
  prisma: PrismaClient,
  tenantId: string,
  query: CandidateListQuery,
): Promise<CandidateListResult> {
  const where: Prisma.CandidateWhereInput = { tenantId }
  if (query.stage) where.stage = query.stage
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { role: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const { skip, take } = toPrismaPage(query)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const today = tenantToday(tenant.timezone)
  const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const currentEnd = new Date(today)
  currentEnd.setUTCDate(currentEnd.getUTCDate() + 1)
  const previousStart = new Date(currentStart)
  previousStart.setUTCMonth(previousStart.getUTCMonth() - 1)
  const previousMonthLength = new Date(Date.UTC(previousStart.getUTCFullYear(), previousStart.getUTCMonth() + 1, 0)).getUTCDate()
  const previousEnd = new Date(previousStart)
  previousEnd.setUTCDate(Math.min(today.getUTCDate(), previousMonthLength) + 1)
  const [items, total, allCandidates, hireActivities, offerDecisions] = await Promise.all([
    prisma.candidate.findMany({ where, skip, take, orderBy: { appliedAt: 'desc' }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } } }),
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({ where, select: { id: true, stage: true } }),
    prisma.candidateActivity.findMany({ where: { action: 'stage.changed', toStage: 'HIRED', candidate: { is: where } }, select: { createdAt: true, candidate: { select: { appliedAt: true } } } }),
    prisma.candidateActivity.findMany({ where: { action: 'stage.changed', fromStage: 'OFFER_SENT', candidate: { is: where } }, select: { fromStage: true, toStage: true, createdAt: true } }),
  ])
  const stageCounts = Object.fromEntries(['APPLIED', 'SCREENING', 'TECH_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_SENT', 'HIRED', 'REJECTED'].map(stage => [stage, 0])) as Record<string, number>
  for (const candidate of allCandidates) stageCounts[candidate.stage] = (stageCounts[candidate.stage] ?? 0) + 1
  const durations = hireActivities.map(activity => Math.max(0, activity.createdAt.getTime() - activity.candidate.appliedAt.getTime()) / 86_400_000)
  const decidedOffers = offerDecisions.filter(activity => activity.toStage === 'HIRED' || activity.toStage === 'REJECTED').length
  const acceptedOffers = offerDecisions.filter(activity => activity.toStage === 'HIRED').length
  const toTenantDateKey = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tenant.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
    return `${value('year')}-${value('month')}-${value('day')}`
  }
  const inRange = (date: Date, start: Date, end: Date) => {
    const localDate = toTenantDateKey(date)
    return localDate >= start.toISOString().slice(0, 10) && localDate < end.toISOString().slice(0, 10)
  }
  const currentHires = hireActivities.filter(activity => inRange(activity.createdAt, currentStart, currentEnd))
  const previousHires = hireActivities.filter(activity => inRange(activity.createdAt, previousStart, previousEnd))
  const currentOffers = offerDecisions.filter(activity => (activity.toStage === 'HIRED' || activity.toStage === 'REJECTED') && inRange(activity.createdAt, currentStart, currentEnd))
  const previousOffers = offerDecisions.filter(activity => (activity.toStage === 'HIRED' || activity.toStage === 'REJECTED') && inRange(activity.createdAt, previousStart, previousEnd))
  const averageHireDays = (activities: typeof hireActivities) => activities.length
    ? Math.round(activities.reduce((sum, activity) => sum + Math.max(0, activity.createdAt.getTime() - activity.candidate.appliedAt.getTime()) / 86_400_000, 0) / activities.length * 10) / 10
    : null
  const acceptanceRate = (activities: typeof currentOffers) => activities.length
    ? Math.round(activities.filter(activity => activity.toStage === 'HIRED').length / activities.length * 10_000) / 100
    : null
  const summary: CandidatePipelineSummary = {
    stageCounts: stageCounts as CandidatePipelineSummary['stageCounts'],
    activeCandidates: allCandidates.filter(candidate => candidate.stage !== 'HIRED' && candidate.stage !== 'REJECTED').length,
    totalHired: stageCounts.HIRED ?? 0,
    hiredThisPeriod: currentHires.length,
    hiredPreviousPeriod: previousHires.length,
    averageTimeToHireDays: durations.length ? Math.round(durations.reduce((sum, days) => sum + days, 0) / durations.length * 10) / 10 : null,
    averageTimeToHireThisPeriod: averageHireDays(currentHires),
    averageTimeToHirePreviousPeriod: averageHireDays(previousHires),
    offerAcceptanceRate: decidedOffers ? Math.round(acceptedOffers / decidedOffers * 10_000) / 100 : null,
    offerAcceptanceRateThisPeriod: acceptanceRate(currentOffers),
    offerAcceptanceRatePreviousPeriod: acceptanceRate(previousOffers),
    offersDecided: decidedOffers,
    offersDecidedThisPeriod: currentOffers.length,
    offersDecidedPreviousPeriod: previousOffers.length,
  }
  return { items: items.map(mapCandidate), pagination: buildPaginationMeta(query, total), summary }
}

export async function getCandidatesForExport(prisma: PrismaClient, tenantId: string, query: Pick<CandidateListQuery, 'search' | 'stage'>) {
  const where: Prisma.CandidateWhereInput = { tenantId }
  if (query.stage) where.stage = query.stage
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { role: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ]
  }
  return prisma.candidate.findMany({ where, orderBy: { appliedAt: 'desc' }, select: {
    name: true, email: true, role: true, stage: true, appliedAt: true, location: true, source: true,
  } })
}

export async function getCandidate(prisma: PrismaClient, tenantId: string, id: string): Promise<Candidate> {
  const candidate = await prisma.candidate.findFirst({ where: { id, tenantId }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } } })
  if (!candidate) throw new AppError(404, 'Candidate not found')
  return mapCandidate(candidate)
}

export async function listCandidateInterviews(prisma: PrismaClient, tenantId: string, candidateId: string) {
  const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, tenantId }, select: { id: true } })
  if (!candidate) throw new AppError(404, 'Candidate not found')
  const rows = await prisma.candidateInterview.findMany({ where: { candidateId }, orderBy: { startsAt: 'asc' } })
  return rows.map(mapCandidateInterview)
}

function mapCandidateInterview(row: Prisma.CandidateInterviewGetPayload<object>) {
  return { ...row, startsAt: row.startsAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function scheduleCandidateInterview(
  tx: Prisma.TransactionClient,
  tenantId: string,
  candidateId: string,
  input: CandidateInterviewWriteInput,
) {
  const candidate = await tx.candidate.findFirst({ where: { id: candidateId, tenantId } })
  if (!candidate) throw new AppError(404, 'Candidate not found')
  if (candidate.stage === 'HIRED' || candidate.stage === 'REJECTED') throw new AppError(409, 'Interviews cannot be scheduled for a closed candidate')
  const startsAt = new Date(input.startsAt)
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) throw new AppError(400, 'Interview must be scheduled in the future')
  const interview = await tx.candidateInterview.create({
    data: {
      candidateId,
      startsAt,
      durationMin: input.durationMin,
      stage: input.stage,
      interviewer: input.interviewer ?? null,
      meetingUrl: input.meetingUrl ?? null,
      notes: input.notes ?? null,
    },
  })
  await tx.candidateActivity.create({ data: { candidateId, action: 'interview.scheduled', description: `${input.stage} interview scheduled for ${startsAt.toISOString()}` } })
  return mapCandidateInterview(interview)
}

export async function cancelCandidateInterview(tx: Prisma.TransactionClient, tenantId: string, candidateId: string, interviewId: string) {
  const interview = await tx.candidateInterview.findFirst({ where: { id: interviewId, candidate: { is: { id: candidateId, tenantId } } } })
  if (!interview) throw new AppError(404, 'Interview not found')
  if (interview.status !== 'SCHEDULED') throw new AppError(409, 'Only scheduled interviews can be cancelled')
  const updated = await tx.candidateInterview.update({ where: { id: interview.id }, data: { status: 'CANCELLED' } })
  await tx.candidateActivity.create({ data: { candidateId, action: 'interview.cancelled', description: `${interview.stage} interview on ${interview.startsAt.toISOString()} cancelled` } })
  return mapCandidateInterview(updated)
}

export async function createCandidate(
  prisma: PrismaClient,
  tenantId: string,
  input: CandidateWriteInput,
): Promise<Candidate> {
  return prisma.$transaction(tx => createCandidateInTransaction(tx, tenantId, input))
}

export async function createCandidateInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: CandidateWriteInput,
): Promise<Candidate> {
  const candidate = await tx.candidate.create({
    data: {
      tenantId,
      name: input.name,
      role: input.role,
      email: input.email ?? null,
      source: input.source ?? null,
      location: input.location ?? null,
      experience: input.experience ?? null,
      education: input.education ?? null,
    },
  })
  await tx.candidateActivity.create({ data: { candidateId: candidate.id, action: 'created' } })
  const created = await tx.candidate.findUniqueOrThrow({ where: { id: candidate.id }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } } })
  return mapCandidate(created)
}

/**
 * A stage move — the kanban drag. Records a `CandidateActivity` so the pipeline's history is
 * real (the model exists for this), not just the current column.
 */
export async function updateCandidateStage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: CandidateStageUpdateInput,
): Promise<Candidate> {
  return prisma.$transaction(tx => updateCandidateStageInTransaction(tx, tenantId, id, input), { isolationLevel: 'Serializable' })
}

const NEXT_STAGES: Record<PrismaCandidateStage, PrismaCandidateStage[]> = {
  APPLIED: ['SCREENING', 'REJECTED'],
  SCREENING: ['TECH_INTERVIEW', 'REJECTED'],
  TECH_INTERVIEW: ['FINAL_INTERVIEW', 'REJECTED'],
  FINAL_INTERVIEW: ['OFFER_SENT', 'REJECTED'],
  OFFER_SENT: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
}

export async function updateCandidateStageInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: CandidateStageUpdateInput,
): Promise<Candidate> {
  const candidate = await tx.candidate.findFirst({ where: { id, tenantId } })
  if (!candidate) throw new AppError(404, 'Candidate not found')
  if (candidate.stage === input.stage) throw new AppError(409, 'Candidate is already in this stage')
  if (!NEXT_STAGES[candidate.stage].includes(input.stage)) throw new AppError(409, 'Candidate cannot move from ' + candidate.stage + ' to ' + input.stage)

  const changedAt = new Date()
  let employeeId = candidate.employeeId
  if (input.stage === 'HIRED' && employeeId === null) {
    const employee = await tx.employee.create({
      data: {
        tenantId,
        name: candidate.name,
        title: candidate.role,
        status: 'ACTIVE',
        avatarUrl: candidate.avatarUrl,
        hiredAt: changedAt,
        location: candidate.location,
        email: candidate.email,
      },
    })
    employeeId = employee.id
    await tx.candidateActivity.create({
      data: { candidateId: candidate.id, action: 'employee.created', description: `Employee ${employee.id} created from hired candidate` },
    })
  }

  const updated = await tx.candidate.update({
    where: { id_tenantId: { id: candidate.id, tenantId } },
    data: { stage: input.stage, stageEnteredAt: changedAt, ...(input.stage === 'HIRED' && { employeeId }) },
  })
  await tx.candidateActivity.create({
    data: {
      candidateId: candidate.id,
      action: 'stage.changed',
      description: candidate.stage + ' → ' + input.stage,
      fromStage: candidate.stage,
      toStage: input.stage,
    },
  })
  const refreshed = await tx.candidate.findUniqueOrThrow({ where: { id: updated.id }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } } })
  return mapCandidate(refreshed)
}
