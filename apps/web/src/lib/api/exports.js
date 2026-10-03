import { http } from '../api/http'

/**
 * Exports API client — thin one-function-per-endpoint wrapper over `lib/api/http.js` for the
 * `/api/v1/exports` job surface. The Data Export settings page polls `listJobs` and downloads
 * completed files through `downloadJob` (a binary stream, not the JSON envelope).
 */
export const exportsApi = {
  /**
   * GET /exports/jobs → { items: ExportJob[], pagination }. `ExportJob.status` is
   * 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'.
   */
  listJobs: ({ page = 1, limit = 100 } = {}) =>
    http.get('/exports/jobs', { query: { page, limit } }),

  /**
   * POST /exports/jobs → 202 with the created ExportJob. `kind` is 'employees' | 'ledger';
   * inline queue mode (the default) usually resolves the row to DONE before this returns, but
   * the client treats both modes the same: create, then poll `listJobs` until DONE.
   */
  createJob: ({ kind }) => http.post('/exports/jobs', { body: { kind } }),

  /**
   * GET /exports/jobs/:id/download → Blob. Binary, not the JSON envelope, so this uses
   * `http.binary` (which still sends the session cookie and parses the error envelope on
   * failure). Only meaningful once the job is DONE.
   */
  downloadJob: (id) => http.binary(`/exports/jobs/${id}/download`),
}
