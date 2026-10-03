import type {
  Candidate,
  CandidateListQuery,
  CandidateListResponse,
  CandidateStageUpdateInput,
  CandidateWriteInput,
  Department,
  DepartmentWriteInput,
  Employee,
  EmployeeListQuery,
  EmployeeUpdateInput,
  EmployeeWriteInput,
  PayrollLineAdjustInput,
  PayrollRun,
  PayrollRunCreateInput,
  PayrollRunListQuery,
  PayrollRunListResponse,
  ResumeUploadUrl,
  AttendanceResponse,
  LeaveRequestRow,
  LeaveRequestWriteInput,
} from '@asas/contracts'
import { API_ORIGIN_URL, http } from './http.js'

export interface EmployeeListResult {
  items: Employee[]
  pagination: { page: number; limit: number; total: number; pages: number }
  summary: { totalHeadcount: number; onLeaveCount: number; openRoles: number }
}

export const hrApi = {
  listEmployees: (query: Partial<EmployeeListQuery> = {}) =>
    http.get<EmployeeListResult>('/hr/employees', { query }),

  getEmployee: (id: string) => http.get<Employee>(`/hr/employees/${id}`),

  createEmployee: (input: EmployeeWriteInput) => http.post<Employee>('/hr/employees', { body: input }),

  updateEmployee: (id: string, input: EmployeeUpdateInput) =>
    http.patch<Employee>(`/hr/employees/${id}`, { body: input }),

  deleteEmployee: (id: string) => http.delete<void>(`/hr/employees/${id}`),

  listDepartments: () => http.get<{ items: Department[] }>('/hr/departments'),

  createDepartment: (input: DepartmentWriteInput) => http.post<Department>('/hr/departments', { body: input }),

  // ── Payroll ────────────────────────────────────────────────────────────────
  listPayrollRuns: (query: Partial<PayrollRunListQuery> = {}) =>
    http.get<PayrollRunListResponse>('/hr/payroll/runs', { query }),

  getPayrollRun: (id: string) => http.get<PayrollRun>(`/hr/payroll/runs/${id}`),

  createPayrollRun: (input: PayrollRunCreateInput) => http.post<PayrollRun>('/hr/payroll/runs', { body: input }),

  approvePayrollRun: (id: string) => http.post<PayrollRun>(`/hr/payroll/runs/${id}/approve`),

  adjustPayrollLine: (runId: string, lineId: string, input: PayrollLineAdjustInput) =>
    http.patch<PayrollRun>(`/hr/payroll/runs/${runId}/lines/${lineId}`, { body: input }),

  /** One line's payslip as a PDF Blob (deterministic — a re-fetch is byte-identical). */
  downloadPayslip: (runId: string, lineId: string) => http.binary(`/hr/payroll/runs/${runId}/payslips/${lineId}`),

  // ── Candidates (recruitment) ───────────────────────────────────────────────
  listCandidates: (query: Partial<CandidateListQuery> = {}) =>
    http.get<CandidateListResponse>('/hr/candidates', { query }),

  getCandidate: (id: string) => http.get<Candidate>(`/hr/candidates/${id}`),

  createCandidate: (input: CandidateWriteInput) => http.post<Candidate>('/hr/candidates', { body: input }),

  updateCandidateStage: (id: string, input: CandidateStageUpdateInput) =>
    http.post<Candidate>(`/hr/candidates/${id}/stage`, { body: input }),

  /** Mint the short-lived signed grant for uploading a CV (PDF). */
  getResumeUploadUrl: (candidateId: string) => http.get<ResumeUploadUrl>(`/hr/candidates/${candidateId}/resume-upload-url`),

  /**
   * Upload a CV's PDF bytes to the signed grant. `uploadUrl` is returned by the API as a path
   * (with the `h`/`exp` signature in the query); the browser must hit the API origin for it,
   * so it is prefixed here. `credentials: 'include'` sends the session cookie the API needs to
   * scope the upload to this tenant — the same mechanism every other call relies on.
   */
  async uploadResume(candidateId: string, uploadUrl: string, file: File): Promise<Candidate> {
    const response = await fetch(`${API_ORIGIN_URL}${uploadUrl}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/pdf' },
      body: file,
    })
    const payload = (await response.json()) as { data?: Candidate; error?: { message: string } }
    if (!response.ok) throw new Error(payload?.error?.message ?? 'Upload failed')
    return payload.data as Candidate
  },

  /** The CV preview URL (absolute) for in-app rendering. Null when no CV has been uploaded. */
  resumePreviewUrl: (candidate: Candidate): string | null =>
    candidate.resumeUrl ? `${API_ORIGIN_URL}${candidate.resumeUrl}` : null,

  /** The stored CV's raw PDF bytes, for an in-app preview (blob URL) or a download. */
  /** The stored CV's raw PDF bytes, for an in-app preview (blob URL) or a download. */
  downloadResumeBytes: (id: string) => http.binary(`/hr/candidates/${id}/resume`),

  // ── Attendance + leave requests ────────────────────────────────────────────
  listAttendance: () => http.get<AttendanceResponse>('/hr/attendance'),

  listLeaveRequests: () => http.get<{ items: LeaveRequestRow[] }>('/hr/leave-requests'),

  createLeaveRequest: (input: LeaveRequestWriteInput) =>
    http.post<LeaveRequestRow>('/hr/leave-requests', { body: input }),
}
