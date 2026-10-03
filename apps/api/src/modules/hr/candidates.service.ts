import type { Candidate as PrismaCandidate, Prisma, PrismaClient } from '@prisma/client'
import type {
  Candidate,
  CandidateListQuery,
  CandidateStageUpdateInput,
  CandidateWriteInput,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

/**
 * HR candidates — the recruitment pipeline slice (list, create, stage moves) plus the anchor
 * for the CV surface. The CV itself never lives in the database: `resumeUrl` is the same-
 * origin preview path, and the file is written by the signed-PUT route (see
 * `candidates.routes.ts`) under `storage/resumes/<tenantId>/`.
 */

/** Wire mapping shared by every read path (and the CV upload route's 200 response). */
export function mapCandidate(row: PrismaCandidate): Candidate {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    stage: row.stage,
    timeInStage: row.timeInStage,
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
  /** No aggregate summary for this list — the contract's `paginated(…, z.null())` requires the key. */
  summary: null
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
  const [items, total] = await Promise.all([
    prisma.candidate.findMany({ where, skip, take, orderBy: { appliedAt: 'desc' } }),
    prisma.candidate.count({ where }),
  ])

  return { items: items.map(mapCandidate), pagination: buildPaginationMeta(query, total), summary: null }
}

export async function getCandidate(prisma: PrismaClient, tenantId: string, id: string): Promise<Candidate> {
  const candidate = await prisma.candidate.findFirst({ where: { id, tenantId } })
  if (!candidate) throw new AppError(404, 'Candidate not found')
  return mapCandidate(candidate)
}

export async function createCandidate(
  prisma: PrismaClient,
  tenantId: string,
  input: CandidateWriteInput,
): Promise<Candidate> {
  const candidate = await prisma.candidate.create({
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
  await prisma.candidateActivity.create({ data: { candidateId: candidate.id, action: 'created' } })
  return mapCandidate(candidate)
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
  const candidate = await prisma.candidate.findFirst({ where: { id, tenantId } })
  if (!candidate) throw new AppError(404, 'Candidate not found')

  const updated = await prisma.candidate.update({
    where: { id: candidate.id },
    data: { stage: input.stage },
  })
  await prisma.candidateActivity.create({
    data: {
      candidateId: candidate.id,
      action: 'stage.changed',
      description: `${candidate.stage} → ${input.stage}`,
    },
  })
  return mapCandidate(updated)
}
