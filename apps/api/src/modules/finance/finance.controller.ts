/**
 * Finance controller — the HTTP-boundary layer between the Fastify routes and the
 * `finance.service`. The routes (`finance.routes.ts`) own the declarative bits (guards, schema,
 * response codes, auth-context extraction); the controller owns the request→service mapping and
 * is what a route handler actually invokes. Mirrors the HR/Projects split.
 *
 * The controller never reads `tenantId` from a request parameter — the route resolves it from
 * the session and passes it in, so a caller cannot address another tenant's rows.
 */
import type {
  Customer,
  CustomerWriteInput,
  CollectionActivity,
  CollectionActivityWriteInput,
  Expense,
  ExpenseListQuery,
  ExpenseStatus,
  ExpenseUpdateInput,
  ExpenseWriteInput,
  FinanceOverview,
  FinanceOverviewQuery,
  JournalListQuery,
  OpeningBalanceWriteInput,
  PayableDetail,
  PayableBatchPaymentInput,
  PayableInvoice,
  PayableListQuery,
  PayableStatus,
  PayableUpdateInput,
  PayableWriteInput,
  ReceivableInvoice,
  ReceivableListQuery,
  ReceivableStatus,
  ReceivableUpdateInput,
  ReceivableWriteInput,
  Vendor,
  VendorWriteInput,
} from '@asas/contracts'
import type { Prisma } from '@prisma/client'
import type { FinanceClient } from './finance.service.js'
import * as service from './finance.service.js'

export type { ExpenseListResult, PayableListResult, ReceivableListResult } from './finance.service.js'

// ── Vendors ─────────────────────────────────────────────────────────────────────

export function listVendors(prisma: FinanceClient, tenantId: string): Promise<Vendor[]> {
  return service.listVendors(prisma, tenantId)
}

export function getVendor(prisma: FinanceClient, tenantId: string, id: string): Promise<Vendor> {
  return service.getVendor(prisma, tenantId, id)
}

export function createVendor(prisma: FinanceClient, tenantId: string, input: VendorWriteInput): Promise<Vendor> {
  return service.createVendor(prisma, tenantId, input)
}

// ── Payables ────────────────────────────────────────────────────────────────────

export function listPayables(prisma: FinanceClient, tenantId: string, query: PayableListQuery) {
  return service.listPayables(prisma, tenantId, query)
}

export function getPayable(prisma: FinanceClient, tenantId: string, id: string): Promise<PayableDetail> {
  return service.getPayable(prisma, tenantId, id)
}

export function createPayable(prisma: FinanceClient, tenantId: string, input: PayableWriteInput, userId: string): Promise<PayableInvoice> {
  return service.createPayable(prisma, tenantId, input, userId)
}

export function updatePayable(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  input: PayableUpdateInput,
): Promise<PayableInvoice> {
  return service.updatePayable(prisma, tenantId, id, input)
}

export function updatePayableStatus(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  status: PayableStatus,
  userId: string,
): Promise<PayableInvoice> {
  return service.updatePayableStatus(prisma, tenantId, id, status, userId)
}

export function requestPayableChanges(prisma: FinanceClient, tenantId: string, id: string, actorId: string | null = null) {
  return service.requestPayableChanges(prisma, tenantId, id, actorId)
}

export function payApprovedPayables(prisma: FinanceClient, tenantId: string, input: PayableBatchPaymentInput, actorId: string | null = null) {
  return service.payApprovedPayables(prisma, tenantId, input.ids, actorId)
}

export function deletePayable(prisma: FinanceClient, tenantId: string, id: string, actorId: string | null = null): Promise<void> {
  return service.deletePayable(prisma, tenantId, id, actorId)
}

// ── Customers ───────────────────────────────────────────────────────────────────

export function listCustomers(prisma: FinanceClient, tenantId: string): Promise<Customer[]> {
  return service.listCustomers(prisma, tenantId)
}

export function createCustomer(
  prisma: FinanceClient,
  tenantId: string,
  input: CustomerWriteInput,
): Promise<Customer> {
  return service.createCustomer(prisma, tenantId, input)
}

export function listCollectionActivities(prisma: FinanceClient, tenantId: string, customerId: string): Promise<CollectionActivity[]> {
  return service.listCollectionActivities(prisma, tenantId, customerId)
}

export function createCollectionActivity(
  prisma: FinanceClient,
  tenantId: string,
  customerId: string,
  author: string,
  input: CollectionActivityWriteInput,
): Promise<CollectionActivity> {
  return service.createCollectionActivity(prisma, tenantId, customerId, author, input)
}

// ── Receivables ─────────────────────────────────────────────────────────────────

export function listReceivables(prisma: FinanceClient, tenantId: string, query: ReceivableListQuery) {
  return service.listReceivables(prisma, tenantId, query)
}

export function getReceivable(prisma: FinanceClient, tenantId: string, id: string): Promise<ReceivableInvoice> {
  return service.getReceivable(prisma, tenantId, id)
}

export function createReceivable(
  prisma: FinanceClient,
  tenantId: string,
  input: ReceivableWriteInput,
  actorId: string | null = null,
): Promise<ReceivableInvoice> {
  return service.createReceivable(prisma, tenantId, input, actorId)
}

export function updateReceivable(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  input: ReceivableUpdateInput,
  actorId: string | null = null,
): Promise<ReceivableInvoice> {
  return service.updateReceivable(prisma, tenantId, id, input, actorId)
}

export function updateReceivableStatus(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  status: ReceivableStatus,
  userId: string | null = null,
): Promise<ReceivableInvoice> {
  return service.updateReceivableStatus(prisma, tenantId, id, status, userId)
}

export function deleteReceivable(prisma: FinanceClient, tenantId: string, id: string, actorId: string | null = null): Promise<void> {
  return service.deleteReceivable(prisma, tenantId, id, actorId)
}

// ── Expenses ────────────────────────────────────────────────────────────────────

export function listExpenses(prisma: FinanceClient, tenantId: string, query: ExpenseListQuery) {
  return service.listExpenses(prisma, tenantId, query)
}

export function getExpense(prisma: FinanceClient, tenantId: string, id: string): Promise<Expense> {
  return service.getExpense(prisma, tenantId, id)
}

export function createExpense(prisma: FinanceClient, tenantId: string, input: ExpenseWriteInput, userId: string): Promise<Expense> {
  return service.createExpense(prisma, tenantId, input, userId)
}

export function updateExpense(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  input: ExpenseUpdateInput,
): Promise<Expense> {
  return service.updateExpense(prisma, tenantId, id, input)
}

export function updateExpenseStatus(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  status: ExpenseStatus,
  userId: string,
): Promise<Expense> {
  return service.updateExpenseStatus(prisma, tenantId, id, status, userId)
}

export function deleteExpense(prisma: FinanceClient, tenantId: string, id: string): Promise<void> {
  return service.deleteExpense(prisma, tenantId, id)
}

export function voidExpense(prisma: FinanceClient, tenantId: string, id: string, reason: string, actorId: string): Promise<Expense> {
  return service.voidExpense(prisma, tenantId, id, reason, actorId)
}

// ── Overview (SQL aggregates, never client-side) ────────────────────────────────

export function getOverview(prisma: FinanceClient, tenantId: string, query?: FinanceOverviewQuery): Promise<FinanceOverview> {
  return service.getOverview(prisma, tenantId, query?.year)
}

export function listJournals(prisma: FinanceClient, tenantId: string, query: JournalListQuery) {
  return service.listJournals(prisma, tenantId, query)
}

export function getJournal(prisma: FinanceClient, tenantId: string, id: string) {
  return service.getJournal(prisma, tenantId, id)
}

export function getTrialBalance(prisma: FinanceClient, tenantId: string, asOf?: string) {
  return service.getTrialBalance(prisma, tenantId, asOf)
}

export function postOpeningBalance(tx: Prisma.TransactionClient, tenantId: string, actorId: string, input: OpeningBalanceWriteInput) {
  return service.postOpeningBalance(tx, tenantId, actorId, input)
}
