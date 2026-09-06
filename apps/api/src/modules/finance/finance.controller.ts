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
  Expense,
  ExpenseListQuery,
  ExpenseStatus,
  ExpenseUpdateInput,
  ExpenseWriteInput,
  FinanceOverview,
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
import type { PrismaClient } from '@prisma/client'
import * as service from './finance.service.js'

export type { ExpenseListResult, PayableListResult, ReceivableListResult } from './finance.service.js'

// ── Vendors ─────────────────────────────────────────────────────────────────────

export function listVendors(prisma: PrismaClient, tenantId: string): Promise<Vendor[]> {
  return service.listVendors(prisma, tenantId)
}

export function getVendor(prisma: PrismaClient, tenantId: string, id: string): Promise<Vendor> {
  return service.getVendor(prisma, tenantId, id)
}

export function createVendor(prisma: PrismaClient, tenantId: string, input: VendorWriteInput): Promise<Vendor> {
  return service.createVendor(prisma, tenantId, input)
}

// ── Payables ────────────────────────────────────────────────────────────────────

export function listPayables(prisma: PrismaClient, tenantId: string, query: PayableListQuery) {
  return service.listPayables(prisma, tenantId, query)
}

export function getPayable(prisma: PrismaClient, tenantId: string, id: string): Promise<PayableInvoice> {
  return service.getPayable(prisma, tenantId, id)
}

export function createPayable(prisma: PrismaClient, tenantId: string, input: PayableWriteInput): Promise<PayableInvoice> {
  return service.createPayable(prisma, tenantId, input)
}

export function updatePayable(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: PayableUpdateInput,
): Promise<PayableInvoice> {
  return service.updatePayable(prisma, tenantId, id, input)
}

export function updatePayableStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: PayableStatus,
): Promise<PayableInvoice> {
  return service.updatePayableStatus(prisma, tenantId, id, status)
}

export function deletePayable(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deletePayable(prisma, tenantId, id)
}

// ── Customers ───────────────────────────────────────────────────────────────────

export function listCustomers(prisma: PrismaClient, tenantId: string): Promise<Customer[]> {
  return service.listCustomers(prisma, tenantId)
}

export function createCustomer(
  prisma: PrismaClient,
  tenantId: string,
  input: CustomerWriteInput,
): Promise<Customer> {
  return service.createCustomer(prisma, tenantId, input)
}

// ── Receivables ─────────────────────────────────────────────────────────────────

export function listReceivables(prisma: PrismaClient, tenantId: string, query: ReceivableListQuery) {
  return service.listReceivables(prisma, tenantId, query)
}

export function getReceivable(prisma: PrismaClient, tenantId: string, id: string): Promise<ReceivableInvoice> {
  return service.getReceivable(prisma, tenantId, id)
}

export function createReceivable(
  prisma: PrismaClient,
  tenantId: string,
  input: ReceivableWriteInput,
): Promise<ReceivableInvoice> {
  return service.createReceivable(prisma, tenantId, input)
}

export function updateReceivable(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ReceivableUpdateInput,
): Promise<ReceivableInvoice> {
  return service.updateReceivable(prisma, tenantId, id, input)
}

export function updateReceivableStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: ReceivableStatus,
): Promise<ReceivableInvoice> {
  return service.updateReceivableStatus(prisma, tenantId, id, status)
}

export function deleteReceivable(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteReceivable(prisma, tenantId, id)
}

// ── Expenses ────────────────────────────────────────────────────────────────────

export function listExpenses(prisma: PrismaClient, tenantId: string, query: ExpenseListQuery) {
  return service.listExpenses(prisma, tenantId, query)
}

export function getExpense(prisma: PrismaClient, tenantId: string, id: string): Promise<Expense> {
  return service.getExpense(prisma, tenantId, id)
}

export function createExpense(prisma: PrismaClient, tenantId: string, input: ExpenseWriteInput): Promise<Expense> {
  return service.createExpense(prisma, tenantId, input)
}

export function updateExpense(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ExpenseUpdateInput,
): Promise<Expense> {
  return service.updateExpense(prisma, tenantId, id, input)
}

export function updateExpenseStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: ExpenseStatus,
): Promise<Expense> {
  return service.updateExpenseStatus(prisma, tenantId, id, status)
}

export function deleteExpense(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteExpense(prisma, tenantId, id)
}

// ── Overview (SQL aggregates, never client-side) ────────────────────────────────

export function getOverview(prisma: PrismaClient, tenantId: string): Promise<FinanceOverview> {
  return service.getOverview(prisma, tenantId)
}
