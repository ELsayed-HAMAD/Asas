/**
 * Cross-module export contract — the job-based bulk exports (employee directory, general
 * ledger) that run through the API's queue (`apps/api/src/services/queue.ts`) and land in the
 * existing `ExportJob` table.
 *
 * PDF documents (payslips, invoices) are NOT jobs: they are deterministic, single-document
 * downloads served on demand, so they get a plain GET endpoint instead of job bookkeeping.
 * The two kinds live here because the worker needs to know what to render — the kind is the
 * queue payload's only business field besides the id of the job row.
 */
import { z } from 'zod'
import { exportJobStatusSchema } from './enums.generated.js'
import { idSchema, isoDateTimeSchema } from './primitives/ids.js'
import { paginationQuerySchema, paginated } from './primitives/pagination.js'

export const exportJobKindSchema = z.enum(['employees', 'ledger'])
export type ExportJobKind = z.infer<typeof exportJobKindSchema>

export const exportJobCreateSchema = z.object({
  kind: exportJobKindSchema,
})
export type ExportJobCreateInput = z.infer<typeof exportJobCreateSchema>

export const exportJobSchema = z.object({
  id: idSchema,
  kind: exportJobKindSchema,
  status: exportJobStatusSchema,
  progressPct: z.number().min(0).max(100),
  /** Set once the file exists on disk; the download endpoint streams from it. */
  downloadUrl: z.string().nullable(),
  filename: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type ExportJob = z.infer<typeof exportJobSchema>

/** List a tenant's export jobs, newest first — the page polls this after creating a job. */
export const exportJobListQuerySchema = paginationQuerySchema
export type ExportJobListQuery = z.infer<typeof exportJobListQuerySchema>
export const exportJobListResponseSchema = paginated(exportJobSchema, z.null())
