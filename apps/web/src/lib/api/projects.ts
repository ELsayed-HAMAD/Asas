import type {
  BurndownQuery,
  BurndownResponse,
  Issue,
  IssueUpdateInput,
  IssueWriteInput,
  PortfolioUtilizationResponse,
  Project,
  ProjectListQuery,
  ProjectSummary,
  ProjectUpdateInput,
  ProjectWriteInput,
  RoadmapResponse,
  RoadmapPhaseWriteInput,
  RoadmapTaskUpdateInput,
  RoadmapTaskWriteInput,
  Sprint,
  SprintUpdateInput,
  SprintWriteInput,
} from '@asas/contracts'
import { http } from './http.js'

/** The `{ items, pagination, summary }` list envelope the projects endpoints return. */
export interface ProjectListResult {
  items: Project[]
  pagination: { page: number; limit: number; total: number; pages: number }
  summary: ProjectSummary
}

/**
 * Typed client for `/api/v1/projects/*`. Every path is relative to the `/api/v1` base set in
 * `http.ts`. This is the Projects module's mirror of `lib/api/hr.ts`.
 */
export const projectsApi = {
  // ── Projects ────────────────────────────────────────────────────────────────
  listProjects: (query: Partial<ProjectListQuery> = {}) =>
    http.get<ProjectListResult>('/projects', { query }),

  getProject: (id: string) => http.get<Project>(`/projects/${id}`),

  createProject: (input: ProjectWriteInput) => http.post<Project>('/projects', { body: input }),

  updateProject: (id: string, input: ProjectUpdateInput) =>
    http.patch<Project>(`/projects/${id}`, { body: input }),

  deleteProject: (id: string) => http.delete<void>(`/projects/${id}`),

  // ── Analytics (server-computed KPIs) ────────────────────────────────────────
  getPortfolioUtilization: () => http.get<PortfolioUtilizationResponse>('/portfolio'),

  getBurndown: (sprintId: string, query: Partial<BurndownQuery> = {}) =>
    http.get<BurndownResponse>(`/sprints/${sprintId}/burndown`, { query }),

  // ── Sprints ─────────────────────────────────────────────────────────────────
  listSprints: () => http.get<{ items: Sprint[] }>('/sprints'),

  getSprint: (id: string) => http.get<Sprint>(`/sprints/${id}`),

  createSprint: (input: SprintWriteInput) => http.post<Sprint>('/sprints', { body: input }),

  updateSprint: (id: string, input: SprintUpdateInput) =>
    http.patch<Sprint>(`/sprints/${id}`, { body: input }),

  deleteSprint: (id: string) => http.delete<void>(`/sprints/${id}`),

  // ── Issues ──────────────────────────────────────────────────────────────────
  listIssues: (sprintId: string) => http.get<{ items: Issue[] }>(`/sprints/${sprintId}/issues`),

  createIssue: (input: IssueWriteInput) => http.post<Issue>('/issues', { body: input }),

  updateIssue: (id: string, input: IssueUpdateInput) => http.patch<Issue>(`/issues/${id}`, { body: input }),

  deleteIssue: (id: string) => http.delete<void>(`/issues/${id}`),

  // ── Roadmap (Gantt) ─────────────────────────────────────────────────────────
  getRoadmap: () => http.get<RoadmapResponse>('/roadmap'),

  createRoadmapPhase: (input: RoadmapPhaseWriteInput) => http.post<void>('/roadmap/phases', { body: input }),

  updateRoadmapPhase: (id: string, input: RoadmapPhaseWriteInput) =>
    http.patch<void>(`/roadmap/phases/${id}`, { body: input }),

  deleteRoadmapPhase: (id: string) => http.delete<void>(`/roadmap/phases/${id}`),

  createRoadmapTask: (input: RoadmapTaskWriteInput) => http.post<void>('/roadmap/tasks', { body: input }),

  updateRoadmapTask: (id: string, input: RoadmapTaskUpdateInput) =>
    http.patch<void>(`/roadmap/tasks/${id}`, { body: input }),

  deleteRoadmapTask: (id: string) => http.delete<void>(`/roadmap/tasks/${id}`),
}
