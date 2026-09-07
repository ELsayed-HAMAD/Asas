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
  name: z.string(),
  /** The role the candidate is being screened for (free text — job titles are not a fixed set). */
  role: z.string(),
  stage: candidateStageSchema,
  timeInStage: z.string().nullable(),
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

export const candidateListResponseSchema = paginated(candidateSchema, z.null())
export type CandidateListResponse = z.infer<typeof candidateListResponseSchema>
