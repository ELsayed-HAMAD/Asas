/**
 * HR / Candidate contract — the wire shape for the recruitment pipeline slice: candidate rows,
 * stage moves, and the CV (resume) presigned-upload surface.
 *
 * `resumeUrl` is the same-origin preview path (`/api/v1/hr/candidates/:id/resume`), not a
 * storage URL — the file itself never leaves the server (see `candidates.routes.ts`), and a
 * `null` here means no CV has been uploaded.
 */
import { z } from 'zod'
import { candidateStageSchema } from '../enums.generated.js'
import { boundedText, idSchema, isoDateTimeSchema, shortTextSchema } from '../primitives/ids.js'
import { paginated, paginationQuerySchema } from '../primitives/pagination.js'

export const candidateSchema = z.object({
  id: idSchema,
  employeeId: idSchema.nullable().default(null),
  name: z.string(),
  /** The role the candidate is being screened for (free text — job titles are not a fixed set). */
  role: z.string(),
  stage: candidateStageSchema,
  stageEnteredAt: isoDateTimeSchema,
  timeInStage: z.string().nullable(),
  activity: z.array(z.object({
    id: idSchema,
    action: z.string(),
    description: z.string().nullable(),
    fromStage: candidateStageSchema.nullable(),
    toStage: candidateStageSchema.nullable(),
    createdAt: isoDateTimeSchema,
  })),
  appliedAt: isoDateTimeSchema,
  avatarUrl: z.string().nullable(),
  currentRole: z.string().nullable(),
  experience: z.string().nullable(),
  source: z.string().nullable(),
  location: z.string().nullable(),
  email: z.string().nullable(),
  education: z.string().nullable(),
  /** The preview path for the uploaded CV, or null when none exists. */
  resumeUrl: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type Candidate = z.infer<typeof candidateSchema>

export const candidateWriteSchema = z.object({
  name: shortTextSchema,
  role: shortTextSchema,
  email: z.email().optional().nullable(),
  source: boundedText(120).optional().nullable(),
  location: boundedText(200).optional().nullable(),
  experience: boundedText(2000).optional().nullable(),
  education: boundedText(500).optional().nullable(),
})
export type CandidateWriteInput = z.infer<typeof candidateWriteSchema>

/** A narrow stage transition — the kanban drag. The service records a `CandidateActivity` row. */
export const candidateStageUpdateSchema = z.object({
  stage: candidateStageSchema,
})
export type CandidateStageUpdateInput = z.infer<typeof candidateStageUpdateSchema>

export const candidateInterviewSchema = z.object({
  id: idSchema,
  candidateId: idSchema,
  startsAt: isoDateTimeSchema,
  durationMin: z.int().min(15).max(480),
  stage: candidateStageSchema,
  interviewer: boundedText(160).nullable(),
  meetingUrl: z.url().refine(value => /^https?:\/\//i.test(value), 'Meeting links must use HTTPS or HTTP').nullable(),
  notes: boundedText(2000).nullable(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type CandidateInterview = z.infer<typeof candidateInterviewSchema>

export const candidateInterviewWriteSchema = z.object({
  startsAt: isoDateTimeSchema,
  durationMin: z.int().min(15).max(480).default(60),
  stage: candidateStageSchema,
  interviewer: boundedText(160).optional().nullable(),
  meetingUrl: z.url().refine(value => /^https?:\/\//i.test(value), 'Meeting links must use HTTPS or HTTP').optional().nullable(),
  notes: boundedText(2000).optional().nullable(),
})
export type CandidateInterviewWriteInput = z.infer<typeof candidateInterviewWriteSchema>

export const candidateInterviewListSchema = z.array(candidateInterviewSchema)

/** The presigned upload grant: where to PUT the CV file, and the rules of that upload. */
export const resumeUploadUrlSchema = z.object({
  uploadUrl: z.string(),
  method: z.literal('PUT'),
  /** ISO datetime after which the signature stops validating. */
  expiresAt: isoDateTimeSchema,
  contentType: z.literal('application/pdf'),
  maxBytes: z.int().positive(),
})
export type ResumeUploadUrl = z.infer<typeof resumeUploadUrlSchema>

export const candidateListQuerySchema = paginationQuerySchema.extend({
  stage: candidateStageSchema.optional(),
  search: boundedText(200, 0).optional(),
})
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>

export const candidatePipelineSummarySchema = z.object({
  stageCounts: z.record(candidateStageSchema, z.int().min(0)),
  activeCandidates: z.int().min(0),
  totalHired: z.int().min(0),
  hiredThisPeriod: z.int().min(0),
  hiredPreviousPeriod: z.int().min(0),
  averageTimeToHireDays: z.number().nonnegative().nullable(),
  averageTimeToHireThisPeriod: z.number().nonnegative().nullable(),
  averageTimeToHirePreviousPeriod: z.number().nonnegative().nullable(),
  offerAcceptanceRate: z.number().min(0).max(100).nullable(),
  offerAcceptanceRateThisPeriod: z.number().min(0).max(100).nullable(),
  offerAcceptanceRatePreviousPeriod: z.number().min(0).max(100).nullable(),
  offersDecided: z.int().min(0),
  offersDecidedThisPeriod: z.int().min(0),
  offersDecidedPreviousPeriod: z.int().min(0),
})
export type CandidatePipelineSummary = z.infer<typeof candidatePipelineSummarySchema>

export const candidateListResponseSchema = paginated(candidateSchema, candidatePipelineSummarySchema)
export type CandidateListResponse = z.infer<typeof candidateListResponseSchema>
