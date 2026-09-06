import type {
  CrmForecast,
  CrmOverview,
  CrmSalesPerformance,
  Deal,
  DealListQuery,
  DealListResponse,
  DealUpdateInput,
  DealWriteInput,
} from '@asas/contracts'
import { http } from './http.js'

/**
 * Typed client for `/api/v1/crm/*`. `GET /crm/deals` returns the
 * `{ items, pagination, summary }` envelope with SQL-aggregate pipeline KPIs; the
 * overview/forecast/performance endpoints return server-computed aggregates only.
 */
export const crmApi = {
  // ── Analytics (server-computed KPIs) ─────────────────────────────────────────
  getOverview: () => http.get<CrmOverview>('/crm/overview'),

  getForecast: () => http.get<CrmForecast>('/crm/forecast'),

  getSalesPerformance: () => http.get<CrmSalesPerformance>('/crm/sales-performance'),

  // ── Deals ────────────────────────────────────────────────────────────────────
  listDeals: (query: Partial<DealListQuery> = {}) =>
    http.get<DealListResponse>('/crm/deals', { query }),

  getDeal: (id: string) => http.get<Deal>(`/crm/deals/${id}`),

  createDeal: (input: DealWriteInput) => http.post<Deal>('/crm/deals', { body: input }),

  updateDeal: (id: string, input: DealUpdateInput) =>
    http.patch<Deal>(`/crm/deals/${id}`, { body: input }),
}
