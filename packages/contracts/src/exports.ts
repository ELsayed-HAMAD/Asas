/**
 * Cross-module export contract for employee, ledger, project, and workspace exports. Jobs run
 * through the API queue (`apps/api/src/services/queue.ts`) and land in the
 * existing `ExportJob` table.
 *
 * PDF documents (payslips, invoices) are NOT jobs: they are deterministic, single-document
 * downloads served on demand, so they get a plain GET endpoint instead of job bookkeeping.
 * Supported kinds live here because the worker needs to know what to render — the kind is the
 * queue payload's only business field besides the id of the job row.
 */
import { z } from 'zod'
import { exportJobStatusSchema } from './enums.generated.js'
import { idSchema, isoDateTimeSchema } from './primitives/ids.js'
import { paginationQuerySchema, paginated } from './primitives/pagination.js'

export const exportJobKindSchema = z.enum(['employees', 'ledger', 'projects', 'workspace'])
export type ExportJobKind = z.infer<typeof exportJobKindSchema>

export const exportFormatSchema = z.enum(['csv', 'xlsx', 'json'])
export type ExportFormat = z.infer<typeof exportFormatSchema>

export const exportDateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD format'),
}).strict().superRefine((range, context) => {
  const from = new Date(`${range.from}T00:00:00.000Z`)
  const to = new Date(`${range.to}T00:00:00.000Z`)
  if (!Number.isFinite(from.getTime()) || from.toISOString().slice(0, 10) !== range.from) {
    context.addIssue({ code: 'custom', path: ['from'], message: 'Enter a valid start date' })
  }
  if (!Number.isFinite(to.getTime()) || to.toISOString().slice(0, 10) !== range.to) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'Enter a valid end date' })
  }
  if (range.from > range.to) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'End date must be on or after the start date' })
  }
})
export type ExportDateRange = z.infer<typeof exportDateRangeSchema>

export const exportJobCreateSchema = z.object({
  kind: exportJobKindSchema,
  format: exportFormatSchema.optional(),
  dateRange: exportDateRangeSchema.optional(),
}).strict().superRefine((input, context) => {
  if (input.kind === 'workspace') {
    if (input.format && input.format !== 'json') {
      context.addIssue({ code: 'custom', path: ['format'], message: 'Workspace archives are JSON exports' })
    }
    if (input.dateRange) {
      context.addIssue({ code: 'custom', path: ['dateRange'], message: 'A workspace archive always includes the full workspace history' })
    }
  } else if (input.format === 'json') {
    context.addIssue({ code: 'custom', path: ['format'], message: 'JSON is only available for a full workspace archive' })
  }
})
export type ExportJobCreateInput = z.infer<typeof exportJobCreateSchema>

export const exportJobSchema = z.object({
  id: idSchema,
  kind: exportJobKindSchema,
  status: exportJobStatusSchema,
  progressPct: z.number().min(0).max(100),
  format: exportFormatSchema,
  dateRange: exportDateRangeSchema.nullable(),
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
