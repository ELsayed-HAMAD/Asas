import { z } from 'zod'
import {
  expenseCategorySchema,
  expenseStatusSchema,
  payableStatusSchema,
  receivableStatusSchema,
} from '../enums.generated.js'
import { idSchema, isoDateTimeSchema, boundedText, shortTextSchema } from '../primitives/ids.js'
import {
  compareDecimalStrings,
  currencyCodeSchema,
  decimalStringSchema,
  moneySchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from '../primitives/money.js'
import { collection, paginated, paginationQuerySchema } from '../primitives/pagination.js'
import { formBooleanQueryParamSchema as booleanQueryParamSchema } from '../primitives/query.js'
export { formBooleanQueryParamSchema as booleanQueryParamSchema } from '../primitives/query.js'

/**
 * Finance contract — the schemas `apps/api`'s finance module and `apps/web` share, so the wire
 * shape is defined exactly once.
 *
 * Money follows the house rule: `Decimal(19,4)` in Prisma, integer minor units on the wire as
 * `{ amount, currency }` in the tenant's currency (see `primitives/money.ts`). Every figure a
 * list endpoint carries in its `summary` is a SQL aggregate over the whole tenant set — never a
 * client-side `.reduce()` over the current page.
 */

// ── Shared finance field primitives ─────────────────────────────────────────────────────

function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * A real calendar date, `YYYY-MM-DD`. The regex alone would let '2026-02-31' through (which
 * `Date` silently rolls into March) and '2026-13-01' (an Invalid Date that 500s on write), so the
 * value must also round-trip through a UTC `Date` with the same components.
 */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date such as '2026-09-01'")
  .refine(isRealCalendarDate, 'Expected a real calendar date')


const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

/** Due date on or after the issue date — only checked when both are present in the payload. */
function dueOnOrAfterIssue(value: { date?: string | undefined; dueDate?: string | null | undefined }): boolean {
  return !value.date || !value.dueDate || value.dueDate >= value.date
}

/** Tax no greater than the amount — only checked when both are present in the payload. */
function taxWithinAmount(value: { amount?: string | undefined; tax?: string | null | undefined }): boolean {
  if (value.amount == null || value.tax == null) return true
  const amount = value.amount.trim()
  const tax = value.tax.trim()
  if (!DECIMAL_PATTERN.test(amount) || !DECIMAL_PATTERN.test(tax)) return true
  return compareDecimalStrings(tax, amount) <= 0
}

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
  projectId: idSchema.nullable().default(null),
  vendorId: idSchema,
  /** Denormalised vendor name so a list row never needs a second fetch. */
  vendor: z.string(),
  invoiceNumber: z.string().nullable(),
  date: isoDateTimeSchema,
  dueDate: isoDateTimeSchema.nullable(),
  amount: moneySchema,
  status: payableStatusSchema,
  lineItemCount: z.int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type PayableInvoice = z.infer<typeof payableInvoiceSchema>

export const payableLineItemSchema = z.object({
  id: idSchema,
  description: z.string(),
  periodOrUsage: z.string().nullable(),
  amount: moneySchema,
})

export const payableDetailSchema = payableInvoiceSchema.extend({
  lineItems: z.array(payableLineItemSchema),
})

export type PayableDetail = z.infer<typeof payableDetailSchema>

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
  /** Total value of pending, approved and scheduled invoices (excludes paid/rejected/void). */
  openOutstanding: moneySchema,
  pendingCount: z.int().min(0),
  pendingTotal: moneySchema,
  scheduledCount: z.int().min(0),
  scheduledTotal: moneySchema,
  approvedCount: z.int().min(0),
  approvedTotal: moneySchema,
  paidCount: z.int().min(0),
  paidTotal: moneySchema,
  pastDueTotal: moneySchema,
  dueIn7DaysTotal: moneySchema,
  /** Valued AP cash settlements posted in the tenant-local current month, in base currency. */
  paidThisMonthTotal: moneySchema.nullable(),
  /** Null prior total means ledger history does not yet cover the comparable month-to-date window. */
  paidThisMonthComparison: z.object({
    previousStartDate: calendarDateSchema,
    previousEndDateExclusive: calendarDateSchema,
    previousTotal: moneySchema.nullable(),
  }),
})

export type PayableSummary = z.infer<typeof payableSummarySchema>

export const payableListResponseSchema = paginated(payableInvoiceSchema, payableSummarySchema)

export type PayableListResponse = z.infer<typeof payableListResponseSchema>

/**
 * Create a bill. There is no `status`: a new bill always starts `PENDING`, and every later
 * status change goes through the status/request-changes/batch-payment endpoints, which enforce
 * the workflow. (An extra `status` key from an older client is stripped, not rejected.)
 */
export const payableWriteSchema = z
  .object({
    vendorId: idSchema,
    projectId: idSchema.optional().nullable(),
    invoiceNumber: boundedText(64).optional().nullable(),
    /** Calendar date the invoice is dated, `YYYY-MM-DD`. */
    date: calendarDateSchema,
    dueDate: calendarDateSchema.optional().nullable(),
    /** Major-unit decimal string in the tenant's currency, e.g. '1250.00'. Must be > 0. */
    amount: positiveDecimalStringSchema,
  })
  .refine(dueOnOrAfterIssue, { message: 'The due date cannot be before the invoice date', path: ['dueDate'] })

export type PayableWriteInput = z.infer<typeof payableWriteSchema>

/** Edit a bill's details. Rejected with 409 once the bill is approved, scheduled, or paid. */
export const payableUpdateSchema = z
  .object({
    invoiceNumber: boundedText(64).optional().nullable(),
    projectId: idSchema.optional().nullable(),
    date: calendarDateSchema.optional(),
    dueDate: calendarDateSchema.optional().nullable(),
    amount: positiveDecimalStringSchema.optional(),
  })
  .refine(dueOnOrAfterIssue, { message: 'The due date cannot be before the invoice date', path: ['dueDate'] })

export type PayableUpdateInput = z.infer<typeof payableUpdateSchema>

/** The status transition a payable can be moved to (e.g. PENDING → APPROVED → PAID). */
export const payableStatusUpdateSchema = z.object({
  status: payableStatusSchema.exclude(['VOID']),
})

export type PayableStatusUpdateInput = z.infer<typeof payableStatusUpdateSchema>

/** Cancellation requires a reason and its own endpoint; it is not a payment reversal. */
export const financeVoidSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
})
export type FinanceVoidInput = z.infer<typeof financeVoidSchema>

export const payableChangeRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
})
export type PayableChangeRequestInput = z.infer<typeof payableChangeRequestSchema>

export const payableBatchPaymentSchema = z.object({
  ids: z.array(idSchema).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Invoice IDs must be unique'),
})
export type PayableBatchPaymentInput = z.infer<typeof payableBatchPaymentSchema>

// ── Customers (accounts receivable master data) ────────────────────────────────────────

export const customerSchema = z.object({
  id: idSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
  collectionStatus: receivableStatusSchema,
  openBalance: moneySchema,
  oldestOverdueDays: z.int().min(0),
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

export const collectionActivitySchema = z.object({
  id: idSchema,
  customerId: idSchema,
  title: shortTextSchema,
  author: z.string().nullable(),
  body: z.string().nullable(),
  date: isoDateTimeSchema,
})
export type CollectionActivity = z.infer<typeof collectionActivitySchema>
export const collectionActivityListResponseSchema = collection(collectionActivitySchema)
export const collectionActivityWriteSchema = z.object({
  title: shortTextSchema,
  body: boundedText(5000),
})
export type CollectionActivityWriteInput = z.infer<typeof collectionActivityWriteSchema>

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
  overdueOnly: booleanQueryParamSchema.optional(),
  search: boundedText(200, 0).optional(),
})

export type ReceivableListQuery = z.infer<typeof receivableListQuerySchema>

export const receivableSummarySchema = z.object({
  /** Total value of all unpaid invoices (everything except `PAID`). */
  openBalance: moneySchema,
  /** Tenant-local month-to-date AR collections; null before settlement history coverage. */
  collectedThisMonthTotal: moneySchema.nullable(),
  collectedThisMonthComparison: z.object({
    previousStartDate: calendarDateSchema,
    previousEndDateExclusive: calendarDateSchema,
    previousTotal: moneySchema.nullable(),
  }),
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

/**
 * Create a receivable. There is no `status`: a new invoice always starts `CURRENT`; status
 * changes go through the status endpoint. (An extra `status` key is stripped, not rejected.)
 */
export const receivableWriteSchema = z.object({
  customerId: idSchema,
  number: boundedText(64).optional().nullable(),
  /** Major-unit decimal string in the tenant's currency, e.g. '4800.00'. Must be > 0. */
  amount: positiveDecimalStringSchema,
  dueDate: calendarDateSchema.optional().nullable(),
})

export type ReceivableWriteInput = z.infer<typeof receivableWriteSchema>

/** Edit a receivable's details. Rejected with 409 once the invoice is paid. */
export const receivableUpdateSchema = z.object({
  number: boundedText(64).optional().nullable(),
  amount: positiveDecimalStringSchema.optional(),
  dueDate: calendarDateSchema.optional().nullable(),
})

export type ReceivableUpdateInput = z.infer<typeof receivableUpdateSchema>

/** The status transition a receivable can be moved to (e.g. CURRENT → PAID). */
export const receivableStatusUpdateSchema = z.object({
  status: receivableStatusSchema.exclude(['VOID']),
})

export type ReceivableStatusUpdateInput = z.infer<typeof receivableStatusUpdateSchema>

// ── Expenses ───────────────────────────────────────────────────────────────────────────

export const expenseSchema = z.object({
  id: idSchema,
  projectId: idSchema.nullable().default(null),
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
  reimbursedAt: isoDateTimeSchema.nullable(),
  reimbursedById: z.string().nullable(),
  voidedAt: isoDateTimeSchema.nullable().optional(),
  voidedById: z.string().nullable().optional(),
  voidReason: z.string().nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Expense = z.infer<typeof expenseSchema>

export const expenseListQuerySchema = paginationQuerySchema.extend({
  status: expenseStatusSchema.optional(),
  category: expenseCategorySchema.optional(),
  employeeId: idSchema.optional(),
  departmentId: idSchema.optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
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
  reimbursedCount: z.int().min(0),
  reimbursedTotal: moneySchema,
  /** Valued reimbursement settlements posted in the tenant-local current month, in base currency. */
  reimbursedThisMonthTotal: moneySchema.nullable(),
  /** Null prior total means ledger history does not cover the comparable window. */
  reimbursedThisMonthComparison: z.object({
    previousStartDate: calendarDateSchema,
    previousEndDateExclusive: calendarDateSchema,
    previousTotal: moneySchema.nullable(),
  }),
})

export type ExpenseSummary = z.infer<typeof expenseSummarySchema>

export const expenseListResponseSchema = paginated(expenseSchema, expenseSummarySchema)

export type ExpenseListResponse = z.infer<typeof expenseListResponseSchema>

/**
 * Submit an expense. There is no `status`: a new expense always starts `PENDING`; status
 * changes go through the status endpoint. (An extra `status` key is stripped, not rejected.)
 */
export const expenseWriteSchema = z
  .object({
    employeeId: idSchema.optional().nullable(),
    projectId: idSchema.optional().nullable(),
    name: shortTextSchema,
    category: expenseCategorySchema.optional(),
    merchant: boundedText(200).optional().nullable(),
    /** Calendar date the expense was incurred, `YYYY-MM-DD`. */
    date: calendarDateSchema,
    /** Major-unit decimal string in the tenant's currency, e.g. '84.20'. Must be > 0. */
    amount: positiveDecimalStringSchema,
    /** Tax component, same form as `amount`; zero or more, and no more than `amount`. */
    tax: nonNegativeDecimalStringSchema.optional().nullable(),
    policyMatch: z.boolean().optional().nullable(),
  })
  .refine(taxWithinAmount, { message: 'Tax cannot exceed the expense amount', path: ['tax'] })

export type ExpenseWriteInput = z.infer<typeof expenseWriteSchema>

/** Edit an expense. Once approved or rejected only `name` stays editable (409 otherwise). */
export const expenseUpdateSchema = z
  .object({
    employeeId: idSchema.optional().nullable(),
    projectId: idSchema.optional().nullable(),
    name: shortTextSchema.optional(),
    category: expenseCategorySchema.optional(),
    merchant: boundedText(200).optional().nullable(),
    date: calendarDateSchema.optional(),
    amount: positiveDecimalStringSchema.optional(),
    tax: nonNegativeDecimalStringSchema.optional().nullable(),
    policyMatch: z.boolean().optional().nullable(),
  })
  .refine(taxWithinAmount, { message: 'Tax cannot exceed the expense amount', path: ['tax'] })

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

export const cashFlowPeriodSchema = z.object({
  startDate: calendarDateSchema,
  endDateExclusive: calendarDateSchema,
  inflow: moneySchema,
  outflow: moneySchema,
  net: moneySchema,
})

export const cashFlowComparisonSchema = z.object({
  current: cashFlowPeriodSchema,
  previous: cashFlowPeriodSchema,
})

export const recentTransactionSchema = z.object({
  id: idSchema,
  date: isoDateTimeSchema,
  description: z.string(),
  amount: moneySchema,
  type: z.enum(['credit', 'debit']),
  status: z.string(),
})

export const financeOverviewResponseSchema = z.object({
  /** Value still to pay out (open payables). */
  payableOutstanding: moneySchema,
  /** Value still to collect (open receivables). */
  receivableOutstanding: moneySchema,
  /** Non-rejected expenses, total and pending. */
  expensesTotal: moneySchema,
  expensesPendingCount: z.int().min(0),
  expensesPendingTotal: moneySchema,
  /** Recorded AP/AR cash settlements, ascending by month. Empty until a settlement is recorded. */
  cashFlow: z.array(cashFlowPointSchema),
  cashFlowComparison: cashFlowComparisonSchema,
  recentTransactions: z.array(recentTransactionSchema),
})

export type FinanceOverview = z.infer<typeof financeOverviewResponseSchema>

export const financeOverviewQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
})
export type FinanceOverviewQuery = z.infer<typeof financeOverviewQuerySchema>

// ── Posted cash settlement journals ─────────────────────────────────────────

export const journalSourceTypeSchema = z.enum(['AP_PAYMENT', 'AR_COLLECTION', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT', 'SETTLEMENT_REVERSAL', 'AP_RECOGNITION', 'AR_RECOGNITION', 'OPENING_BALANCE'])
export const journalSideSchema = z.enum(['DEBIT', 'CREDIT'])
export const journalCurrencyProvenanceSchema = z.enum(['DOCUMENT', 'WORKSPACE_FALLBACK', 'MANUAL_BASE'])

export const openingBalanceLineWriteSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._-]{1,31}$/, 'Use 2–32 uppercase letters, numbers, dots, underscores, or hyphens'),
  name: boundedText(80),
  kind: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME']),
  side: journalSideSchema,
  amount: positiveDecimalStringSchema,
})
export const openingBalanceWriteSchema = z.object({
  asOf: calendarDateSchema,
  description: boundedText(240),
  lines: z.array(openingBalanceLineWriteSchema).min(2).max(100),
}).superRefine((input, ctx) => {
  const seen = new Set<string>()
  input.lines.forEach((line, index) => {
    if (seen.has(line.code)) ctx.addIssue({ code: 'custom', message: 'Account codes must be unique within an opening balance', path: ['lines', index, 'code'] })
    seen.add(line.code)
  })
})
export type OpeningBalanceWriteInput = z.infer<typeof openingBalanceWriteSchema>

export const journalLineSchema = z.object({
  id: idSchema,
  accountCode: shortTextSchema,
  accountName: shortTextSchema,
  side: journalSideSchema,
  amount: moneySchema,
  baseAmount: moneySchema.nullable(),
})

export const journalEntrySchema = z.object({
  id: idSchema,
  sourceType: journalSourceTypeSchema,
  sourceId: idSchema,
  currencyProvenance: journalCurrencyProvenanceSchema,
  amount: moneySchema,
  baseCurrency: currencyCodeSchema.nullable(),
  baseAmount: moneySchema.nullable(),
  exchangeRate: decimalStringSchema.nullable(),
  description: z.string(),
  reversalReason: z.string().nullable(),
  actorId: idSchema.nullable(),
  postedAt: isoDateTimeSchema,
  lines: z.array(journalLineSchema).min(2).max(3),
}).superRefine((entry, ctx) => {
  const valued = entry.baseCurrency !== null
  if (valued !== (entry.baseAmount !== null) || valued !== (entry.exchangeRate !== null)) {
    ctx.addIssue({ code: 'custom', message: 'Journal FX basis fields must be present or absent together', path: ['baseCurrency'] })
  }
  for (const [index, line] of entry.lines.entries()) {
    if (line.amount.currency !== entry.amount.currency) {
      ctx.addIssue({ code: 'custom', message: 'Journal lines must use the entry denomination', path: ['lines', index, 'amount', 'currency'] })
    }
    if (valued && (line.baseAmount === null || line.baseAmount.currency !== entry.baseCurrency)) {
      ctx.addIssue({ code: 'custom', message: 'Valued journal lines must use the entry base denomination', path: ['lines', index, 'baseAmount'] })
    }
    if (!valued && line.baseAmount !== null) {
      ctx.addIssue({ code: 'custom', message: 'Unvalued legacy journal lines cannot claim a base value', path: ['lines', index, 'baseAmount'] })
    }
  }
  if (entry.baseAmount !== null && entry.baseAmount.currency !== entry.baseCurrency) {
    ctx.addIssue({ code: 'custom', message: 'Journal base amount must use the base denomination', path: ['baseAmount', 'currency'] })
  }
})
export type JournalEntry = z.infer<typeof journalEntrySchema>
export type JournalSourceType = z.infer<typeof journalSourceTypeSchema>

export const trialBalanceQuerySchema = z.object({ asOf: calendarDateSchema.optional() })
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>
export const trialBalanceRowSchema = z.object({
  accountId: idSchema,
  accountCode: shortTextSchema,
  accountName: shortTextSchema,
  accountKind: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME']),
  currency: currencyCodeSchema,
  debit: moneySchema,
  credit: moneySchema,
  debitBase: moneySchema,
  creditBase: moneySchema,
  netDebitBase: moneySchema,
  netCreditBase: moneySchema,
})
export const trialBalanceResponseSchema = z.object({
  asOf: calendarDateSchema,
  baseCurrency: currencyCodeSchema,
  rows: z.array(trialBalanceRowSchema),
  totalDebitBase: moneySchema,
  totalCreditBase: moneySchema,
  unvaluedJournalCount: z.int().min(0),
  isComplete: z.boolean(),
})
export type TrialBalance = z.infer<typeof trialBalanceResponseSchema>

export const journalListQuerySchema = paginationQuerySchema.extend({
  sourceType: journalSourceTypeSchema.optional(),
})
export type JournalListQuery = z.infer<typeof journalListQuerySchema>
export const journalListResponseSchema = paginated(journalEntrySchema, z.null())
