import type {
  Customer,
  CustomerListResponse,
  CustomerWriteInput,
  Expense,
  ExpenseListQuery,
  ExpenseListResponse,
  ExpenseStatusUpdateInput,
  ExpenseUpdateInput,
  ExpenseWriteInput,
  FinanceOverview,
  PayableInvoice,
  PayableListQuery,
  PayableListResponse,
  PayableStatusUpdateInput,
  PayableUpdateInput,
  PayableWriteInput,
  ReceivableInvoice,
  ReceivableListQuery,
  ReceivableListResponse,
  ReceivableStatusUpdateInput,
  ReceivableUpdateInput,
  ReceivableWriteInput,
  Vendor,
  VendorListResponse,
  VendorWriteInput,
} from '@asas/contracts'
import { http } from './http.js'

/**
 * Typed client for `/api/v1/finance/*`. Every list endpoint returns the
 * `{ items, pagination, summary }` envelope — `summary` is a SQL aggregate over the whole
 * tenant set (see `finance/index.ts`), so pages render KPI cards from `data.summary` and
 * never `.reduce()` the current page.
 */
export const financeApi = {
  // ── Overview ─────────────────────────────────────────────────────────────────
  getOverview: () => http.get<FinanceOverview>('/finance/overview'),

  // ── Vendors ──────────────────────────────────────────────────────────────────
  listVendors: () => http.get<VendorListResponse>('/finance/vendors'),

  getVendor: (id: string) => http.get<Vendor>(`/finance/vendors/${id}`),

  createVendor: (input: VendorWriteInput) => http.post<Vendor>('/finance/vendors', { body: input }),

  // ── Payables ─────────────────────────────────────────────────────────────────
  listPayables: (query: Partial<PayableListQuery> = {}) =>
    http.get<PayableListResponse>('/finance/payables', { query }),

  getPayable: (id: string) => http.get<PayableInvoice>(`/finance/payables/${id}`),

  createPayable: (input: PayableWriteInput) => http.post<PayableInvoice>('/finance/payables', { body: input }),

  updatePayable: (id: string, input: PayableUpdateInput) =>
    http.patch<PayableInvoice>(`/finance/payables/${id}`, { body: input }),

  updatePayableStatus: (id: string, input: PayableStatusUpdateInput) =>
    http.post<PayableInvoice>(`/finance/payables/${id}/status`, { body: input }),

  deletePayable: (id: string) => http.delete<void>(`/finance/payables/${id}`),

  /** The payable's PDF as a Blob (deterministic — a re-fetch is byte-identical). */
  downloadInvoicePdf: (id: string) => http.binary(`/finance/payables/${id}/pdf`),

  // ── Customers ────────────────────────────────────────────────────────────────
  listCustomers: () => http.get<CustomerListResponse>('/finance/customers'),

  createCustomer: (input: CustomerWriteInput) =>
    http.post<Customer>('/finance/customers', { body: input }),

  // ── Receivables ──────────────────────────────────────────────────────────────
  listReceivables: (query: Partial<ReceivableListQuery> = {}) =>
    http.get<ReceivableListResponse>('/finance/receivables', { query }),

  getReceivable: (id: string) => http.get<ReceivableInvoice>(`/finance/receivables/${id}`),

  createReceivable: (input: ReceivableWriteInput) =>
    http.post<ReceivableInvoice>('/finance/receivables', { body: input }),

  updateReceivable: (id: string, input: ReceivableUpdateInput) =>
    http.patch<ReceivableInvoice>(`/finance/receivables/${id}`, { body: input }),

  updateReceivableStatus: (id: string, input: ReceivableStatusUpdateInput) =>
    http.post<ReceivableInvoice>(`/finance/receivables/${id}/status`, { body: input }),

  deleteReceivable: (id: string) => http.delete<void>(`/finance/receivables/${id}`),

  // ── Expenses ─────────────────────────────────────────────────────────────────
  listExpenses: (query: Partial<ExpenseListQuery> = {}) =>
    http.get<ExpenseListResponse>('/finance/expenses', { query }),

  getExpense: (id: string) => http.get<Expense>(`/finance/expenses/${id}`),

  createExpense: (input: ExpenseWriteInput) => http.post<Expense>('/finance/expenses', { body: input }),

  updateExpense: (id: string, input: ExpenseUpdateInput) =>
    http.patch<Expense>(`/finance/expenses/${id}`, { body: input }),

  updateExpenseStatus: (id: string, input: ExpenseStatusUpdateInput) =>
    http.post<Expense>(`/finance/expenses/${id}/status`, { body: input }),

  deleteExpense: (id: string) => http.delete<void>(`/finance/expenses/${id}`),
}
