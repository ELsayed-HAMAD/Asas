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
  createDepartment: (body) => http.post('/hr/departments', { body }),
  updateDepartment: (id, body) => http.patch(`/hr/departments/${id}`, { body }),
  deleteDepartment: (id) => http.delete(`/hr/departments/${id}`),

  // Employees
  listEmployees: (params) => http.get('/hr/employees', { query: params }),
  getEmployee: (id) => http.get(`/hr/employees/${id}`),
  createEmployee: (body) => http.post('/hr/employees', { body }),
  updateEmployee: (id, patch) => http.patch(`/hr/employees/${id}`, { body: patch }),
  deleteEmployee: (id) => http.delete(`/hr/employees/${id}`),

  // Payroll
  listPayrollRuns: (params) => http.get('/hr/payroll/runs', { query: params }),
  getPayrollRoundingReconciliation: (year) => http.get('/hr/payroll/rounding-reconciliation', { query: { year } }),
  getPayrollRun: (id) => http.get(`/hr/payroll/runs/${id}`),
  createPayrollRun: (body) => http.post('/hr/payroll/runs', { body }),
  approvePayrollRun: (id) => http.post(`/hr/payroll/runs/${id}/approve`),
  payPayrollRun: (id) => http.post(`/hr/payroll/runs/${id}/pay`),
  voidPayrollRun: (id, reason) => http.post(`/hr/payroll/runs/${id}/void`, { body: { reason } }),
  patchPayrollLine: (runId, lineId, patch) =>
    http.patch(`/hr/payroll/runs/${runId}/lines/${lineId}`, { body: patch }),
  listMyPayslips: () => http.get('/hr/payroll/my-payslips'),

  // Attendance + leave
  listAttendance: (params) => http.get('/hr/attendance', { query: params }),
  clockIn: () => http.post('/hr/attendance/clock-in'),
  clockOut: () => http.post('/hr/attendance/clock-out'),
  approveTimesheet: (id) => http.post(`/hr/attendance/timesheets/${id}/approve`),
  correctAttendancePunch: (id, body) => http.patch(`/hr/attendance/timesheet-days/${id}/correct`, { body }),
  resolveAttendanceException: (id) => http.post(`/hr/attendance/exceptions/${id}/resolve`),
  approveValidTimesheets: (ids) => http.post('/hr/attendance/timesheets/approve-valid', { body: { ids } }),
  createLeaveRequest: (body) => http.post('/hr/leave-requests', { body }),
  createSelfLeaveRequest: (body) => http.post('/hr/leave-requests/self', { body }),
  approveLeaveRequest: (id) => http.post(`/hr/leave-requests/${id}/approve`),
  rejectLeaveRequest: (id) => http.post(`/hr/leave-requests/${id}/reject`),
  getLeaveBalances: (params) => http.get('/hr/leave-balances', { query: params }),
  getLeavePolicies: () => http.get('/hr/leave-policies'),
  updateLeavePolicy: (type, body) => http.put(`/hr/leave-policies/${type}`, { body }),

  // Candidates
  listCandidates: (params) => http.get('/hr/candidates', { query: params }),
  getCandidate: (id) => http.get(`/hr/candidates/${id}`),
  createCandidate: (body) => http.post('/hr/candidates', { body }),
  updateCandidate: (id, patch) => http.patch(`/hr/candidates/${id}`, { body: patch }),
  updateCandidateStage: (id, stage) => http.post(`/hr/candidates/${id}/stage`, { body: { stage } }),
  listCandidateInterviews: (id) => http.get(`/hr/candidates/${id}/interviews`),
  scheduleCandidateInterview: (id, body) => http.post(`/hr/candidates/${id}/interviews`, { body }),
  cancelCandidateInterview: (id, interviewId) => http.post(`/hr/candidates/${id}/interviews/${interviewId}/cancel`),
  exportCandidates: (params) => http.binary('/hr/candidates/export.csv', params),

  // Candidate CV (resume) surface — server-side signed PDF upload.
  getResumeUploadUrl: (id) => http.get(`/hr/candidates/${id}/resume-upload-url`),
  uploadResume: async (id, file) => {
    const grant = await http.get(`/hr/candidates/${id}/resume-upload-url`)
    if (grant.uploadTarget === 'api') {
      const query = new URL(grant.uploadUrl, window.location.origin).search
      return http.putRaw(`/hr/candidates/${id}/resume`, { body: file, query })
    }

    await http.putPresigned(grant.uploadUrl, { body: file, headers: { 'content-type': grant.contentType } })
    return http.post(`/hr/candidates/${id}/resume/complete`, {
      body: { uploadId: grant.uploadId, expiresUnix: grant.expiresUnix, uploadToken: grant.uploadToken },
    })
  },
  // Streams the stored PDF (binary; 404 when the candidate has no CV).
  getResume: (id) => http.binary(`/hr/candidates/${id}/resume`),

  // Payslips — deterministic per-line PDF (binary download).
  getPayslip: (runId, lineId) => http.binary(`/hr/payroll/runs/${runId}/payslips/${lineId}`),
}
