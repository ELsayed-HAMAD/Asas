import { http } from '../api/http'

/**
 * Projects API client — thin wrapper over `lib/api/http.js`, one function per endpoint the
 * Projects dashboard reads. Base is `/api/v1/projects` (see `apps/api/src/modules/projects/
 * projects.routes.ts`); the `{ data }` envelope is unwrapped by `http` already.
 *
 * Reads return:
 *   - `getPortfolio()` -> `{ items: UtilizationRow[], summary }`  (analytics.ts)
 *   - `getSprints()`   -> `{ items: Sprint[] }`                   (sprint.ts)
 *   - `getBurndown()`  -> `{ points, totalScope, completed, ... }` (analytics.ts)
 *   - `getRoadmap()`   -> `{ phases: RoadmapPhase[] }`            (roadmap.ts)
 *
 * Roadmap task `startDate`/`endDate` are ISO dates (`yyyy-mm-dd`); project/row money is the
 * `{ amount: minorUnits, currency }` wire form handled by `formatMoney`.
 */
export const projectsApi = {
  /** GET /projects/portfolio — portfolio utilization rows + tenant-wide summary. */
  getPortfolio: () => http.get('/projects/portfolio'),

  /** GET /projects/sprints — every sprint with issue counts + completion PCT. */
  getSprints: () => http.get('/projects/sprints'),

  /** GET /projects/sprints/:id/burndown — total scope vs. completed-per-day series. */
  getBurndown: (sprintId, filters) => http.get(`/projects/sprints/${sprintId}/burndown`, { query: filters }),

  /** GET /projects/sprints/:id/issues — the work items a sprint burndowns. */
  getIssues: (sprintId) => http.get(`/projects/sprints/${sprintId}/issues`),

  /** GET /projects/roadmap — ordered phases with their dated tasks. */
  getRoadmap: () => http.get('/projects/roadmap'),
}
