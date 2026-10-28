import { http } from './http'

/** Client for the platform-owner console (`/api/v1/platform`). */
export const platformApi = {
  me: () => http.get('/platform/me'),
  stepUp: (body) => http.post('/platform/step-up', { body }),
  publicConfig: () => http.get('/platform/public-config'),
  overview: () => http.get('/platform/overview'),

  workspaces: (query) => http.get('/platform/workspaces', { query }),
  workspace: (id) => http.get(`/platform/workspaces/${id}`),
  updateWorkspaceStatus: (id, body) => http.patch(`/platform/workspaces/${id}/status`, { body }),
  compPlan: (id, planId) => http.patch(`/platform/workspaces/${id}/plan`, { body: { planId } }),

  users: (query) => http.get('/platform/users', { query }),
  user: (id) => http.get(`/platform/users/${id}`),
  revokeUserSessions: (id) => http.post(`/platform/users/${id}/revoke-sessions`),

  billing: () => http.get('/platform/billing'),
  health: () => http.get('/platform/health'),
  flags: () => http.get('/platform/flags'),
  updateFlag: (key, enabled) => http.patch(`/platform/flags/${key}`, { body: { enabled } }),
  audit: (query) => http.get('/platform/audit', { query }),
}
