import { http } from '../api/http'

/**
 * CRM API client — thin wrapper over `lib/api/http.js`, one function per endpoint under
 * `/api/v1/crm` (routes: `apps/api/src/modules/crm/crm.routes.ts`). Money values arrive as
 * `{ amount: <minor units>, currency }` wire objects and go straight to `formatMoney`.
 *
 * Mutations: `POST /deals` and `PATCH /deals/:id` are the only write routes the server exposes
 * (guarded by the `deal.write` permission). Each page wires only the buttons it can honestly
 * drive; the rest stay visually intact but disabled.
 */
export const crmApi = {
  listAgenda: () => http.get('/crm/agenda'),
  createAgenda: (body) => http.post('/crm/agenda', { body }),
  updateAgenda: (id, body) => http.patch(`/crm/agenda/${id}`, { body }),
  /** Pipeline KPIs + zero-filled 5-stage funnel (server-side SQL aggregates). */
  getOverview: () => http.get('/crm/overview'),

  /** `{ items: Deal[], pagination, summary }` — summary is computed over the whole filtered set. */
  listDeals: (filters = {}) => http.get('/crm/deals', { query: filters }),

  /** Quotas returned with the forecast; writes are ADMIN-only and use workspace base currency. */
  createQuota: (body) => http.post('/crm/quotas', { body }),
  updateQuota: (id, body) => http.patch(`/crm/quotas/${id}`, { body }),
  deleteQuota: (id) => http.delete(`/crm/quotas/${id}`),

  getDeal: (id) => http.get(`/crm/deals/${id}`),
  listDealActivities: (id, filters = {}) => http.get(`/crm/deals/${id}/activities`, { query: filters }),
  createDealActivity: (id, body) => http.post(`/crm/deals/${id}/activities`, { body }),

  /** `forecastByRep` (ForecastSnapshot rows) + `quotas` + real open-deal `monthlyPipeline`. */
  getForecast: (year) => http.get('/crm/forecast', { query: year ? { year } : undefined }),

  /** Closed-won by month + per-rep leaderboard (ownerName / won / lost / winRate). */
  getSalesPerformance: (year) => http.get('/crm/sales-performance', { query: year ? { year } : undefined }),

  /** Body: `{ name, stage?, value? (major-unit string), companyId?, ownerEmployeeId?, ... } */
  createDeal: (body) => http.post('/crm/deals', { body }),

  updateDeal: (id, body) => http.patch(`/crm/deals/${id}`, { body }),
}
