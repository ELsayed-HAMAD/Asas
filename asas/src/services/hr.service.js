import api from '../lib/axios'

const unwrap = response => response.data.data

export const hrService = {
  listDepartments: () => api.get('/hr/departments').then(unwrap),
  createDepartment: payload => api.post('/hr/departments', payload).then(unwrap),
  listEmployees: (params) => api.get('/hr/employees', { params }).then(unwrap),
  getEmployee: id => api.get(`/hr/employees/${id}`).then(unwrap),
  createEmployee: payload => api.post('/hr/employees', payload).then(unwrap),
  updateEmployee: (id, payload) => api.patch(`/hr/employees/${id}`, payload).then(unwrap),
  deleteEmployee: id => api.delete(`/hr/employees/${id}`),
  listPayrollRuns: () => api.get('/hr/payroll/runs').then(unwrap),
  approvePayrollRun: id => api.post(`/hr/payroll/runs/${id}/approve`).then(unwrap),
  patchPayrollLine: (id, payload) => api.patch(`/hr/payroll/lines/${id}`, payload).then(unwrap),
  listAttendance: () => api.get('/hr/attendance').then(unwrap),
  createLeaveRequest: payload => api.post('/hr/leave-requests', payload).then(unwrap),
  listCandidates: (params) => api.get('/hr/candidates', { params }).then(unwrap),
  createCandidate: payload => api.post('/hr/candidates', payload).then(unwrap),
  updateCandidateStage: (id, payload) => api.patch(`/hr/candidates/${id}/stage`, payload).then(unwrap),
}
