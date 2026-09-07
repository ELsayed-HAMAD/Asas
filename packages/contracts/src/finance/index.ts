import { z } from 'zod'
import {
  expenseCategorySchema,
  expenseStatusSchema,
  payableStatusSchema,
  receivableStatusSchema,
} from '../enums.generated.js'
import { idSchema, isoDateTimeSchema, boundedText, shortTextSchema } from '../primitives/ids.js'
import { moneySchema, decimalStringSchema } from '../primitives/money.js'
import { collection, paginated, paginationQuerySchema } from '../primitives/pagination.js'

/**
 * Finance contract — the schemas `apps/api`'s finance module and `apps/web` share, so the wire
 * shape is defined exactly once.
 *
 * Money follows the house rule: `Decimal(19,4)` in Prisma, integer minor units on the wire as
 * `{ amount, currency }` in the tenant's currency (see `primitives/money.ts`). Every figure a
 * list endpoint carries in its `summary` is a SQL aggregate over the whole tenant set — never a
 * client-side `.reduce()` over the current page.
 */

// ── AR aging report ─────────────────────────────────────────────────────────────────────

/**
 * One bucket of the AR aging report (rebuild plan, Phase 3): open receivables by days past due.
 *
 * Four fixed buckets in report order — `current` (not yet due), `1-30`, `31-60`, `60+`. The
 * values are one SQL `CASE WHEN` query over the whole unpaid receivable set (see
 * `apps/api/src/modules/finance/aging.service.ts`), zero-filled so the report always carries
 * all four rows; the page renders them, never aggregates.
 */
export const agingBucketSchema = z.object({
  bucket: z.enum(['current', '1-30', '31-60', '60+']),
  count: z.int().min(0),
  total: moneySchema,
})

export type AgingBucket = z.infer<typeof agingBucketSchema>

// ── Vendors (accounts payable master data) ─────────────────────────────────────────────

export const vendorSchema = z.object({
  id: idSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Vendor = z.infer<typeof vendorSchema>

export const vendorListResponseSchema = collection(vendorSchema)

export type VendorListResponse = z.infer<typeof vendorListResponseSchema>

export const vendorWriteSchema = z.object({
  name: shortTextSchema,
  avatarUrl: z.url().optional().nullable(),
})

export type VendorWriteInput = z.infer<typeof vendorWriteSchema>

// ── Payable invoices (accounts payable) ────────────────────────────────────────────────

export const payableInvoiceSchema = z.object({
  id: idSchema,
  vendorId: idSchema,
  /** Denormalised vendor name so a list row never needs a second fetch. */
  vendor: z.string(),
  invoiceNumber: z.string().nullable(),
  date: isoDateTimeSchema,
  amount: moneySchema,
  status: payableStatusSchema,
  lineItemCount: z.int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type PayableInvoice = z.infer<typeof payableInvoiceSchema>

export const payableListQuerySchema = paginationQuerySchema.extend({
  status: payableStatusSchema.optional(),
  vendorId: idSchema.optional(),
  search: boundedText(200, 0).optional(),
})

export type PayableListQuery = z.infer<typeof payableListQuerySchema>

/**
 * KPIs over the *whole* payable set in the tenant (not the current page), computed in SQL:
 * the sum of what is still owed (`openOutstanding`) sits next to each status's count and sum.
 */
export const payableSummarySchema = z.object({
  /** Total value of all non-paid, non-rejected invoices. */
  openOutstanding: moneySchema,
  pendingCount: z.int().min(0),
  pendingTotal: moneySchema,
  scheduledCount: z.int().min(0),
  scheduledTotal: moneySchema,
  approvedCount: z.int().min(0),
  approvedTotal: moneySchema,
  paidCount: z.int().min(0),
  paidTotal: moneySchema,
})

export type PayableSummary = z.infer<typeof payableSummarySchema>

export const payableListResponseSchema = paginated(payableInvoiceSchema, payableSummarySchema)

export type PayableListResponse = z.infer<typeof payableListResponseSchema>

export const payableWriteSchema = z.object({
  vendorId: idSchema,
  invoiceNumber: boundedText(64).optional().nullable(),
  /** Calendar date the invoice is dated, `YYYY-MM-DD`. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date such as '2026-09-01'"),
  /** Major-unit decimal string in the tenant's currency, e.g. '1250.00'. */
  amount: decimalStringSchema,
  status: payableStatusSchema.optional(),
})

export type PayableWriteInput = z.infer<typeof payableWriteSchema>

export const payableUpdateSchema = z.object({
  invoiceNumber: boundedText(64).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date such as '2026-09-01'").optional(),
  amount: decimalStringSchema.optional(),
  status: payableStatusSchema.optional(),
})

export type PayableUpdateInput = z.infer<typeof payableUpdateSchema>

/** The status transition a payable can be moved to (e.g. PENDING → APPROVED → PAID). */
export const payableStatusUpdateSchema = z.object({
  status: payableStatusSchema,
})

export type PayableStatusUpdateInput = z.infer<typeof payableStatusUpdateSchema>

// ── Customers (accounts receivable master data) ────────────────────────────────────────

export const customerSchema = z.object({
  id: idSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
  collectionStatus: receivableStatusSchema,
  openBalance: moneySchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Customer = z.infer<typeof customerSchema>

export const customerListResponseSchema = collection(customerSchema)

export type CustomerListResponse = z.infer<typeof customerListResponseSchema>

export const customerWriteSchema = z.object({
  name: shortTextSchema,
  avatarUrl: z.url().optional().nullable(),
})

export type CustomerWriteInput = z.infer<typeof customerWriteSchema>

// ── Receivable invoices (accounts receivable) ──────────────────────────────────────────

export const receivableInvoiceSchema = z.object({
  id: idSchema,
  customerId: idSchema,
  /** Denormalised customer name so a list row never needs a second fetch. */
  customer: z.string(),
  number: z.string().nullable(),
  amount: moneySchema,
  dueDate: isoDateTimeSchema.nullable(),
  status: receivableStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type ReceivableInvoice = z.infer<typeof receivableInvoiceSchema>

export const receivableListQuerySchema = paginationQuerySchema.extend({
  status: receivableStatusSchema.optional(),
  customerId: idSchema.optional(),
  /** When true, only invoices whose due date has passed and are not yet paid. */
  overdueOnly: z.coerce.boolean().optional(),
  search: boundedText(200, 0).optional(),
})

export type ReceivableListQuery = z.infer<typeof receivableListQuerySchema>

export const receivableSummarySchema = z.object({
  /** Total value of all unpaid invoices (everything except `PAID`). */
  openBalance: moneySchema,
  /**
   * The AR aging report (rebuild plan, Phase 3): the same unpaid set bucketed by days past due —
   * one SQL `CASE WHEN` query, always four zero-filled rows in report order.
   */
  agingBuckets: z.array(agingBucketSchema).length(4),
  currentCount: z.int().min(0),
  currentTotal: moneySchema,
  overdueCount: z.int().min(0),
  overdueTotal: moneySchema,
  inCollectionsCount: z.int().min(0),
  inCollectionsTotal: moneySchema,
  paidCount: z.int().min(0),
  paidTotal: moneySchema,
})

export type ReceivableSummary = z.infer<typeof receivableSummarySchema>

export const receivableListResponseSchema = paginated(receivableInvoiceSchema, receivableSummarySchema)

export type ReceivableListResponse = z.infer<typeof receivableListResponseSchema>

export const receivableWriteSchema = z.object({
  customerId: idSchema,
  number: boundedText(64).optional().nullable(),
  /** Major-unit decimal string in the tenant's currency, e.g. '4800.00'. */
  amount: decimalStringSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date such as '2026-10-01'").optional().nullable(),
  status: receivableStatusSchema.optional(),
})

export type ReceivableWriteInput = z.infer<typeof receivableWriteSchema>

export const receivableUpdateSchema = z.object({
  number: boundedText(64).optional().nullable(),
  amount: decimalStringSchema.optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date such as '2026-10-01'").optional().nullable(),
  status: receivableStatusSchema.optional(),
})

export type ReceivableUpdateInput = z.infer<typeof receivableUpdateSchema>

/** The status transition a receivable can be moved to (e.g. CURRENT → PAID). */
export const receivableStatusUpdateSchema = z.object({
  status: receivableStatusSchema,
})

export type ReceivableStatusUpdateInput = z.infer<typeof receivableStatusUpdateSchema>

// ── Expenses ───────────────────────────────────────────────────────────────────────────

export const expenseSchema = z.object({
  id: idSchema,
  employeeId: idSchema.nullable(),
  /** Denormalised employee name, or null when the expense has no claimant. */
  employee: z.string().nullable(),
  name: z.string(),
  category: expenseCategorySchema,
  merchant: z.string().nullable(),
  date: isoDateTimeSchema,
  amount: moneySchema,
  tax: moneySchema.nullable(),
  policyMatch: z.boolean().nullable(),
  status: expenseStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Expense = z.infer<typeof expenseSchema>

export const expenseListQuerySchema = paginationQuerySchema.extend({
  status: expenseStatusSchema.optional(),
  category: expenseCategorySchema.optional(),
  employeeId: idSchema.optional(),
  search: boundedText(200, 0).optional(),
})

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>

export const expenseSummarySchema = z.object({
  /** Total of non-rejected expenses, i.e. what the books will have to carry. */
  total: moneySchema,
  pendingCount: z.int().min(0),
  pendingTotal: moneySchema,
  flaggedCount: z.int().min(0),
  flaggedTotal: moneySchema,
  processingCount: z.int().min(0),
  processingTotal: moneySchema,
  approvedCount: z.int().min(0),
  approvedTotal: moneySchema,
})

export type ExpenseSummary = z.infer<typeof expenseSummarySchema>

export const expenseListResponseSchema = paginated(expenseSchema, expenseSummarySchema)

export type ExpenseListResponse = z.infer<typeof expenseListResponseSchema>

export const expenseWriteSchema = z.object({
  employeeId: idSchema.optional().nullable(),
  name: shortTextSchema,
  category: expenseCategorySchema.optional(),
  merchant: boundedText(200).optional().nullable(),
  /** Calendar date the expense was incurred, `YYYY-MM-DD`. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date such as '2026-09-01'"),
  /** Major-unit decimal string in the tenant's currency, e.g. '84.20'. */
  amount: decimalStringSchema,
  /** Tax component, same form as `amount`. */
  tax: decimalStringSchema.optional().nullable(),
  policyMatch: z.boolean().optional().nullable(),
  status: expenseStatusSchema.optional(),
})

export type ExpenseWriteInput = z.infer<typeof expenseWriteSchema>

export const expenseUpdateSchema = z.object({
  employeeId: idSchema.optional().nullable(),
  name: shortTextSchema.optional(),
  category: expenseCategorySchema.optional(),
  merchant: boundedText(200).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date such as '2026-09-01'").optional(),
  amount: decimalStringSchema.optional(),
  tax: decimalStringSchema.optional().nullable(),
  policyMatch: z.boolean().optional().nullable(),
  status: expenseStatusSchema.optional(),
})

export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>

export const expenseStatusUpdateSchema = z.object({
  status: expenseStatusSchema,
})

export type ExpenseStatusUpdateInput = z.infer<typeof expenseStatusUpdateSchema>

// ── Overview (the KPI row above the ledger tabs) ───────────────────────────────────────

export const cashFlowPointSchema = z.object({
  /** `YYYY-MM` of the snapshot row. */
  month: z.string().length(7),
  inflow: moneySchema,
  outflow: moneySchema,
  net: moneySchema,
})

export type CashFlowPoint = z.infer<typeof cashFlowPointSchema>

export const financeOverviewResponseSchema = z.object({
  /** Value still to pay out (open payables). */
  payableOutstanding: moneySchema,
  /** Value still to collect (open receivables). */
  receivableOutstanding: moneySchema,
  /** Non-rejected expenses, total and pending. */
  expensesTotal: moneySchema,
  expensesPendingCount: z.int().min(0),
  expensesPendingTotal: moneySchema,
  /** `CashFlowSnapshot` rows, ascending by month. Empty until snapshots exist. */
  cashFlow: z.array(cashFlowPointSchema),
})

export type FinanceOverview = z.infer<typeof financeOverviewResponseSchema>
