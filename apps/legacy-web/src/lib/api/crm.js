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
  /** Pipeline KPIs + zero-filled 5-stage funnel (server-side SQL aggregates). */
  getOverview: () => http.get('/crm/overview'),

  /** `{ items: Deal[], pagination, summary }` — summary is computed over the whole filtered set. */
  listDeals: (filters = {}) => http.get('/crm/deals', { query: filters }),

  getDeal: (id) => http.get(`/crm/deals/${id}`),

  /** `forecastByRep` (ForecastSnapshot rows) + `quotas` + real open-deal `monthlyPipeline`. */
  getForecast: () => http.get('/crm/forecast'),

  /** Closed-won by month + per-rep leaderboard (ownerName / won / lost / winRate). */
  getSalesPerformance: () => http.get('/crm/sales-performance'),

  /** Body: `{ name, stage?, value? (major-unit string), companyId?, ownerEmployeeId?, ... } */
  createDeal: (body) => http.post('/crm/deals', { body }),

  updateDeal: (id, body) => http.patch(`/crm/deals/${id}`, { body }),
}
