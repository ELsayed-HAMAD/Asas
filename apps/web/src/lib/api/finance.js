import { http } from './http'

/**
 * Finance API client — a thin wrapper over lib/api/http.js, one function per verified endpoint
 * (contracts: packages/contracts/src/finance/index.ts; routes: apps/api/src/modules/finance).
 *
 * Money arrives on the wire as `{ amount: <integer minor units, e.g. cents>, currency }`.
 * Pages pass those objects straight to `formatMoney` — never doing money math themselves.
 * List endpoints return `{ items, pagination, summary }` where `summary` is the full-set
 * KPI aggregate computed in SQL on the server.
 */
export const financeApi = {
  /** GET /finance/overview — the KPI row + cash-flow series. */
  getOverview: () => http.get('/finance/overview'),

  /** GET /finance/payables — { items, pagination, summary } over the whole tenant set. */
  listPayables: (params) => http.get('/finance/payables', { query: params }),

  /** GET /finance/receivables — { items, pagination, summary } incl. the AR aging report. */
  listReceivables: (params) => http.get('/finance/receivables', { query: params }),

  /** GET /finance/expenses — { items, pagination, summary } over the whole tenant set. */
  listExpenses: (params) => http.get('/finance/expenses', { query: params }),

  /** GET /finance/vendors — { items } (payables master data). */
  listVendors: () => http.get('/finance/vendors'),

  /** GET /finance/customers — { items } (receivables master data). */
  listCustomers: () => http.get('/finance/customers'),

  /** POST /finance/payables/:id/status — approve, schedule, pay, or reject an invoice. */
  updatePayableStatus: (id, status) => http.post(`/finance/payables/${id}/status`, { body: { status } }),
  updateExpenseStatus: (id, status) => http.post(`/finance/expenses/${id}/status`, { body: { status } }),
  updateReceivableStatus: (id, status) => http.post(`/finance/receivables/${id}/status`, { body: { status } }),
}
