import type { ExportJob, ExportJobCreateInput, ExportJobListQuery } from '@asas/contracts'
import { http } from './http.js'

/**
 * Typed client for `/api/v1/exports/*` — the job-based bulk exports (employee directory,
 * general ledger). A client's round trip is always two steps: POST a job, poll the row to DONE,
 * then fetch the file. In the default inline mode the POST already returns a DONE job, so the
 * "poll" is a single immediate read — the same code path in both queue modes.
 */
export interface ExportJobListResult {
  items: ExportJob[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export const exportsApi = {
  listJobs: (query: Partial<ExportJobListQuery> = {}) =>
    http.get<ExportJobListResult>('/exports/jobs', { query }),

  getJob: (id: string) => http.get<ExportJob>(`/exports/jobs/${id}`),

  createJob: (input: ExportJobCreateInput) => http.post<ExportJob>('/exports/jobs', { body: input }),

  /**
   * A DONE job's file as a Blob. Keyed by job id rather than the contract's `downloadUrl`
   * because that field is a *full* path (`/api/v1/exports/…`) and `http.binary` already
   * prefixes `/api/v1`.
   */
  download: (jobId: string) => http.binary(`/exports/jobs/${jobId}/download`),
}
