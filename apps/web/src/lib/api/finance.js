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
  getOverview: (params) => http.get('/finance/overview', { query: params }),
  /** GET /finance/trial-balance â€” posted account balances through an inclusive date. */
  getTrialBalance: (asOf) => http.get('/finance/trial-balance', { query: { asOf } }),
  createOpeningBalance: body => http.post('/finance/opening-balances', { body }),

  /** GET /finance/payables — { items, pagination, summary } over the whole tenant set. */
  listPayables: (params) => http.get('/finance/payables', { query: params }),
  getPayable: (id) => http.get(`/finance/payables/${id}`),

  /** GET /finance/receivables — { items, pagination, summary } incl. the AR aging report. */
  listReceivables: (params) => http.get('/finance/receivables', { query: params }),

  /** GET /finance/expenses — { items, pagination, summary } over the whole tenant set. */
  listExpenses: (params) => http.get('/finance/expenses', { query: params }),

  /** GET /finance/vendors — { items } (payables master data). */
  listVendors: () => http.get('/finance/vendors'),

  /** GET /finance/customers — { items } (receivables master data). */
  listCustomers: () => http.get('/finance/customers'),
  listCollectionActivities: (customerId) => http.get(`/finance/customers/${customerId}/activities`),
  createCollectionActivity: (customerId, body) => http.post(`/finance/customers/${customerId}/activities`, { body }),
  createReceivable: (body) => http.post('/finance/receivables', { body }),
  createPayable: (body) => http.post('/finance/payables', { body }),

  /** POST /finance/payables/:id/status — approve, schedule, pay, or reject an invoice. */
  updatePayableStatus: (id, status) => http.post(`/finance/payables/${id}/status`, { body: { status } }),
  voidPayable: (id, reason) => http.post(`/finance/payables/${id}/void`, { body: { reason } }),
  voidReceivable: (id, reason) => http.post(`/finance/receivables/${id}/void`, { body: { reason } }),
  requestPayableChanges: (id, reason) => http.post(`/finance/payables/${id}/request-changes`, { body: { reason } }),
  batchPayApprovedPayables: (ids) => http.post('/finance/payables/batch-payment', { body: { ids } }),
  updateExpenseStatus: (id, status) => http.post(`/finance/expenses/${id}/status`, { body: { status } }),
  voidExpense: (id, reason) => http.post(`/finance/expenses/${id}/void`, { body: { reason } }),
  updateReceivableStatus: (id, status) => http.post(`/finance/receivables/${id}/status`, { body: { status } }),
}
