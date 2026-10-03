import { http } from '../api/http'

/**
 * HR API client — one thin wrapper per endpoint under `/api/v1/hr`.
 *
 * Wraps `lib/api/http.js` (which unwraps the `{ data }` envelope, sends the httpOnly session
 * cookie, and normalizes errors to `ApiError`). Money here is MAJOR-UNIT DECIMAL STRINGS
 * (salary, payroll gross/deductions/net); format through `lib/format.js` `formatMoney`, which
 * detects the string form.
 */
export const hrApi = {
  // Departments
  getDepartments: () => http.get('/hr/departments'),

  // Employees
  listEmployees: (params) => http.get('/hr/employees', { query: params }),
  getEmployee: (id) => http.get(`/hr/employees/${id}`),
  createEmployee: (body) => http.post('/hr/employees', { body }),
  updateEmployee: (id, patch) => http.patch(`/hr/employees/${id}`, { body: patch }),
  deleteEmployee: (id) => http.delete(`/hr/employees/${id}`),

  // Payroll
  listPayrollRuns: (params) => http.get('/hr/payroll/runs', { query: params }),
  getPayrollRun: (id) => http.get(`/hr/payroll/runs/${id}`),
  createPayrollRun: (body) => http.post('/hr/payroll/runs', { body }),
  approvePayrollRun: (id) => http.post(`/hr/payroll/runs/${id}/approve`),
  patchPayrollLine: (runId, lineId, patch) =>
    http.patch(`/hr/payroll/runs/${runId}/lines/${lineId}`, { body: patch }),

  // Attendance + leave
  listAttendance: () => http.get('/hr/attendance'),
  createLeaveRequest: (body) => http.post('/hr/leave-requests', { body }),

  // Candidates
  listCandidates: (params) => http.get('/hr/candidates', { query: params }),
  getCandidate: (id) => http.get(`/hr/candidates/${id}`),
  createCandidate: (body) => http.post('/hr/candidates', { body }),
  updateCandidate: (id, patch) => http.patch(`/hr/candidates/${id}`, { body: patch }),
  updateCandidateStage: (id, stage) => http.post(`/hr/candidates/${id}/stage`, { body: { stage } }),

  // Candidate CV (resume) surface — server-side signed PDF upload.
  getResumeUploadUrl: (id) => http.get(`/hr/candidates/${id}/resume-upload-url`),
  uploadResume: async (id, file) => {
    const grant = await http.get(`/hr/candidates/${id}/resume-upload-url`)
    // grant.uploadUrl is absolute (`/api/v1/hr/candidates/:id/resume?h=..&exp=..`); the h/exp
    // signature must travel unchanged, but putRaw prefixes /api/v1 itself, so pass the path
    // RELATIVE to that base and forward the query string as-is.
    const queryString = grant.uploadUrl.split('?')[1] ?? ''
    return http.putRaw(`/hr/candidates/${id}/resume`, { body: file, query: queryString })
  },
  // Streams the stored PDF (binary; 404 when the candidate has no CV).
  getResume: (id) => http.binary(`/hr/candidates/${id}/resume`),

  // Payslips — deterministic per-line PDF (binary download).
  getPayslip: (runId, lineId) => http.binary(`/hr/payroll/runs/${runId}/payslips/${lineId}`),
}
