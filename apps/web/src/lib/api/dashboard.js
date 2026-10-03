import { http } from './http'

/**
 * Dashboard API client — a thin wrapper over `lib/api/http.js`, one function per endpoint the
 * overview composes. There is NO `/dashboard/overview` route on the server: the page fetches the
 * real module aggregates directly (see the endpoint map in `finance.routes.ts`, `crm.routes.ts`,
 * `hr.routes.ts`, `projects.routes.ts`, `inventory.routes.ts`) and shapes them on the client.
 *
 * Per the restore rules this file calls `http.get` directly rather than importing another
 * module's api file — the dashboard is a read-only composition, so every function here is a GET.
 * Money arrives as `{ amount: <minor units>, currency }` wire objects and goes straight to
 * `formatMoney`; list endpoints return `{ items, pagination, summary }` where `summary` is the
 * full-set aggregate the KPI cards read.
 */
export const dashboardApi = {
  /** GET /hr/employees — `{ items, pagination, summary }`; the page reads `summary.totalHeadcount`. */
  listEmployees: (params) => http.get('/hr/employees', { query: params }),

  /** GET /crm/overview — pipeline KPIs (`pipeline.openTotal` / `openCount`) + funnel. */
  getCrmOverview: () => http.get('/crm/overview'),

  /** GET /finance/overview — `payableOutstanding` + the `cashFlow` series (the AreaChart). */
  getFinanceOverview: () => http.get('/finance/overview'),

  /** GET /projects/sprints — `{ items }` of sprints (unpaginated collection). */
  getSprints: () => http.get('/projects/sprints'),

  /** GET /finance/receivables — `{ items, pagination, summary }`; reads `summary.overdueCount/Total`. */
  listReceivables: (params) => http.get('/finance/receivables', { query: params }),

  /** GET /inventory/products — `{ items, pagination, summary }`; reads `summary.lowStockProducts`. */
  listProducts: (params) => http.get('/inventory/products', { query: params }),

  /** GET /hr/payroll/runs — `{ items, pagination, summary }`; reads `summary.pendingCount`. */
  listPayrollRuns: (params) => http.get('/hr/payroll/runs', { query: params }),

  /** GET /hr/attendance — `{ exceptions, leaveRequests, summary }`; reads `summary.exceptionCount`. */
  getAttendance: () => http.get('/hr/attendance'),
}
