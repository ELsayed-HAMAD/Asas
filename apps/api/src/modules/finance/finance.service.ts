/**
 * Finance service — the domain logic behind the finance module's routes.
 *
 * Invariants mirror the HR reference (`employees.service.ts`) and the CRM/Projects modules:
 *
 *  - **Tenant isolation.** Every query is scoped by `tenantId`, which the route handler reads
 *    from the authenticated session (never from a request parameter). A `findFirst({ where:
 *    { id, tenantId } })` on a foreign id returns `null` and becomes a 404, not a leak.
 *  - **KPIs in SQL.** `listPayables`, `listReceivables`, `listExpenses`, and `getOverview`
 *    compute their `summary` with Prisma `groupBy`/`aggregate` over the whole tenant set.
 *    Nothing sums a fetched page with `.reduce()` in the client.
 *  - **Money as integer minor units.** Invoice/expense amounts are `Decimal(19,4)` in Prisma and
 *    `{ amount, currency }` on the wire via `@asas/domain`'s `Money`. No float touches a money
 *    value; only derived display ratios use floating point.
 */
import { Prisma } from '@prisma/client'
import type {
  Customer as PrismaCustomer,
  Expense as PrismaExpense,
  ExpenseStatus,
  PayableStatus,
  PrismaClient,
  ReceivableStatus,
  Vendor as PrismaVendor,
} from '@prisma/client'
import type {
  Customer,
  CustomerWriteInput,
  Expense,
  ExpenseListQuery,
  ExpenseSummary,
  ExpenseUpdateInput,
  ExpenseWriteInput,
  FinanceOverview,
  PayableInvoice,
  PayableListQuery,
  PayableSummary,
  PayableUpdateInput,
  PayableWriteInput,
  ReceivableInvoice,
  ReceivableListQuery,
  ReceivableSummary,
  ReceivableUpdateInput,
  ReceivableWriteInput,
  Vendor,
  VendorWriteInput,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { Money } from '@asas/domain'
import type { CurrencyCode } from '@asas/domain'
import { AppError } from '../../utils/errors.js'
import { computeAgingBuckets } from './aging.service.js'
import type { InvoiceDoc } from '../../services/pdf.js'

// ── Money + shared helpers ──────────────────────────────────────────────────────

/** Resolve the tenant's reporting currency (the free-form `String` column), or 404 if gone. */
async function getTenantCurrency(prisma: PrismaClient, tenantId: string): Promise<CurrencyCode> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  return tenant.currency
}

/**
 * Convert a Prisma `Decimal` to the wire money form (integer minor units). Reading uses `'DOWN'`
 * so a stored 4-decimal value never throws on a 2-decimal currency — it truncates, never rounds
 * up into a figure the books don't support.
 */
function toMoneyWire(value: Prisma.Decimal | null, currency: string): { amount: number; currency: string } | null {
  if (value == null) return null
  return Money.fromDecimal(value.toString(), currency, 'DOWN').toWire()
}

/** A required wire amount — the column is never null on these models. */
function moneyWire(value: Prisma.Decimal, currency: string): { amount: number; currency: string } {
  return toMoneyWire(value, currency) as { amount: number; currency: string }
}

/**
 * Normalise a major-unit decimal string to the exact `Decimal` string for storage, validating
 * precision against the tenant's currency so `'10.005'` in a 2-decimal currency is a 400, not a
 * silently-rounded book entry.
 */
function toStoredDecimal(input: string, currency: string): string {
  try {
    return Money.fromDecimal(input, currency).toDecimalString()
  } catch {
    throw new AppError(400, `Invalid amount for the ${currency} workspace currency`)
  }
}

/**
 * Parse a `YYYY-MM-DD` calendar date to a UTC `Date` at midnight. The finance dates are
 * day-granular (an invoice's date, an expense's incurred date), so the time component is
 * irrelevant and the explicit midnight keeps a stored value deterministic across timezones.
 */
function dayToDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

// ── Vendors ─────────────────────────────────────────────────────────────────────

export async function listVendors(prisma: PrismaClient, tenantId: string): Promise<Vendor[]> {
  const rows = await prisma.vendor.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
  return rows.map(mapVendor)
}

export async function getVendor(prisma: PrismaClient, tenantId: string, id: string): Promise<Vendor> {
  const row = await prisma.vendor.findFirst({ where: { id, tenantId } })
  if (!row) throw new AppError(404, 'Vendor not found')
  return mapVendor(row)
}

function mapVendor(vendor: PrismaVendor): Vendor {
  return {
    id: vendor.id,
    name: vendor.name,
    avatarUrl: vendor.avatarUrl,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
  }
}

export async function createVendor(
  prisma: PrismaClient,
  tenantId: string,
  input: VendorWriteInput,
): Promise<Vendor> {
  const existing = await prisma.vendor.findFirst({ where: { tenantId, name: input.name } })
  if (existing) throw new AppError(409, 'A vendor with this name already exists')

  const vendor = await prisma.vendor.create({
    data: { tenantId, name: input.name, avatarUrl: input.avatarUrl ?? null },
  })
  return mapVendor(vendor)
}

// ── Payables ────────────────────────────────────────────────────────────────────

const PAYABLE_OPEN_STATUSES = ['PENDING', 'SCHEDULED', 'APPROVED'] as const
const PAYABLE_ALL_STATUSES = ['PENDING', 'SCHEDULED', 'APPROVED', 'PAID', 'REJECTED'] as const

/**
 * One `groupBy` over `PayableInvoice.status` gives every status's count and amount sum in a
 * single round trip; the summary is then zero-filled over the full status set so the UI always
 * sees all five statuses, and `openOutstanding` is the sum of the three open statuses.
 */
async function payableAggregates(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Map<string, { count: number; total: Prisma.Decimal }>> {
  const rows = await prisma.payableInvoice.groupBy({
    by: ['status'],
    where: { tenantId },
    _sum: { amount: true },
    _count: { _all: true },
  })
  const map = new Map<string, { count: number; total: Prisma.Decimal }>()
  for (const row of rows) {
    map.set(row.status, { count: row._count._all, total: row._sum.amount ?? new Prisma.Decimal(0) })
  }
  return map
}

function buildPayableSummary(
  statusMap: Map<string, { count: number; total: Prisma.Decimal }>,
  currency: string,
): PayableSummary {
  let openOutstanding = new Prisma.Decimal(0)
  for (const status of PAYABLE_OPEN_STATUSES) {
    openOutstanding = openOutstanding.add(statusMap.get(status)?.total ?? new Prisma.Decimal(0))
  }
  return {
    openOutstanding: moneyWire(openOutstanding, currency),
    pendingCount: statusMap.get('PENDING')?.count ?? 0,
    pendingTotal: moneyWire(statusMap.get('PENDING')?.total ?? new Prisma.Decimal(0), currency),
    scheduledCount: statusMap.get('SCHEDULED')?.count ?? 0,
    scheduledTotal: moneyWire(statusMap.get('SCHEDULED')?.total ?? new Prisma.Decimal(0), currency),
    approvedCount: statusMap.get('APPROVED')?.count ?? 0,
    approvedTotal: moneyWire(statusMap.get('APPROVED')?.total ?? new Prisma.Decimal(0), currency),
    paidCount: statusMap.get('PAID')?.count ?? 0,
    paidTotal: moneyWire(statusMap.get('PAID')?.total ?? new Prisma.Decimal(0), currency),
  }
}

export interface PayableListResult {
  items: PayableInvoice[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: PayableSummary
}

export async function listPayables(
  prisma: PrismaClient,
  tenantId: string,
  query: PayableListQuery,
): Promise<PayableListResult> {
  const currency = await getTenantCurrency(prisma, tenantId)

  const where: Prisma.PayableInvoiceWhereInput = { tenantId }
  if (query.status) where.status = query.status
  if (query.vendorId) where.vendorId = query.vendorId
  if (query.search) {
    where.OR = [
      { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
      { vendor: { name: { contains: query.search, mode: 'insensitive' } } },
    ]
  }

  const { skip, take } = toPrismaPage(query)
  const [items, total, statusMap] = await Promise.all([
    prisma.payableInvoice.findMany({
      where,
      skip,
      take,
      orderBy: { date: 'desc' },
      include: { vendor: true, _count: { select: { lineItems: true } } },
    }),
    prisma.payableInvoice.count({ where: { tenantId } }),
    payableAggregates(prisma, tenantId),
  ])

  return {
    items: items.map(item => mapPayable(item, currency)),
    pagination: buildPaginationMeta(query, total),
    summary: buildPayableSummary(statusMap, currency),
  }
}

type PrismaPayableWithIncludes = Prisma.PayableInvoiceGetPayload<{
  include: { vendor: true; _count: { select: { lineItems: true } } }
}>

function mapPayable(
  invoice: PrismaPayableWithIncludes,
  currency: string,
): PayableInvoice {
  return {
    id: invoice.id,
    vendorId: invoice.vendorId,
    vendor: invoice.vendor?.name ?? null,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date.toISOString(),
    amount: moneyWire(invoice.amount, currency),
    status: invoice.status,
    lineItemCount: invoice._count.lineItems,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  }
}

export async function getPayable(prisma: PrismaClient, tenantId: string, id: string): Promise<PayableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const invoice = await prisma.payableInvoice.findFirst({
    where: { id, tenantId },
    include: { vendor: true, _count: { select: { lineItems: true } } },
  })
  if (!invoice) throw new AppError(404, 'Invoice not found')
  return mapPayable(invoice, currency)
}

/** Throws unless `vendorId` names a vendor in this tenant. */
async function assertVendorInTenant(
  prisma: PrismaClient,
  tenantId: string,
  vendorId: string | null | undefined,
): Promise<void> {
  if (!vendorId) return
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } })
  if (!vendor) throw new AppError(400, 'Vendor does not belong to this workspace')
}

export async function createPayable(
  prisma: PrismaClient,
  tenantId: string,
  input: PayableWriteInput,
): Promise<PayableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  await assertVendorInTenant(prisma, tenantId, input.vendorId)

  const invoice = await prisma.payableInvoice.create({
    data: {
      tenantId,
      vendorId: input.vendorId,
      invoiceNumber: input.invoiceNumber ?? null,
      date: dayToDate(input.date),
      amount: toStoredDecimal(input.amount, currency),
      status: input.status ?? 'PENDING',
    },
    include: { vendor: true, _count: { select: { lineItems: true } } },
  })
  return mapPayable(invoice, currency)
}

export async function updatePayable(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: PayableUpdateInput,
): Promise<PayableInvoice> {
  const existing = await prisma.payableInvoice.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Invoice not found')

  const currency = await getTenantCurrency(prisma, tenantId)
  const invoice = await prisma.payableInvoice.update({
    where: { id },
    data: {
      ...(input.invoiceNumber !== undefined && { invoiceNumber: input.invoiceNumber }),
      ...(input.date !== undefined && { date: dayToDate(input.date) }),
      ...(input.amount !== undefined && { amount: toStoredDecimal(input.amount, currency) }),
      ...(input.status !== undefined && { status: input.status }),
    },
    include: { vendor: true, _count: { select: { lineItems: true } } },
  })
  return mapPayable(invoice, currency)
}

/** Narrow status transition — the "approve"/"mark paid" actions from the UI. */
export async function updatePayableStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: PayableStatus,
): Promise<PayableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const existing = await prisma.payableInvoice.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Invoice not found')

  const invoice = await prisma.payableInvoice.update({
    where: { id },
    data: { status },
    include: { vendor: true, _count: { select: { lineItems: true } } },
  })
  return mapPayable(invoice, currency)
}

export async function deletePayable(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.payableInvoice.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Invoice not found')
  await prisma.payableInvoice.delete({ where: { id } })
}

// ── Customers ───────────────────────────────────────────────────────────────────

export async function listCustomers(prisma: PrismaClient, tenantId: string): Promise<Customer[]> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const [rows, balanceByCustomer] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    openReceivableBalanceByCustomer(prisma, tenantId),
  ])
  return rows.map(row => mapCustomer(row, balanceByCustomer.get(row.id) ?? new Prisma.Decimal(0), currency))
}

export async function createCustomer(
  prisma: PrismaClient,
  tenantId: string,
  input: CustomerWriteInput,
): Promise<Customer> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const existing = await prisma.customer.findFirst({ where: { tenantId, name: input.name } })
  if (existing) throw new AppError(409, 'A customer with this name already exists')

  const customer = await prisma.customer.create({
    data: { tenantId, name: input.name, avatarUrl: input.avatarUrl ?? null },
  })
  return mapCustomer(customer, new Prisma.Decimal(0), currency)
}

function mapCustomer(
  customer: PrismaCustomer,
  openBalance: Prisma.Decimal,
  currency: string,
): Customer {
  return {
    id: customer.id,
    name: customer.name,
    avatarUrl: customer.avatarUrl,
    collectionStatus: customer.collectionStatus,
    openBalance: moneyWire(openBalance, currency),
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  }
}

// ── Receivables ─────────────────────────────────────────────────────────────────

const RECEIVABLE_OPEN_STATUSES = ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'] as const

/**
 * Unpaid receivable value per customer, computed in one `groupBy`. `PAID` invoices are excluded
 * — a customer's open balance is what has not yet been collected.
 */
async function openReceivableBalanceByCustomer(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Map<string, Prisma.Decimal>> {
  const rows = await prisma.receivableInvoice.groupBy({
    by: ['customerId'],
    where: { tenantId, status: { in: [...RECEIVABLE_OPEN_STATUSES] } },
    _sum: { amount: true },
  })
  return new Map(rows.map(row => [row.customerId, row._sum.amount ?? new Prisma.Decimal(0)]))
}

async function receivableAggregates(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Map<string, { count: number; total: Prisma.Decimal }>> {
  const rows = await prisma.receivableInvoice.groupBy({
    by: ['status'],
    where: { tenantId },
    _sum: { amount: true },
    _count: { _all: true },
  })
  const map = new Map<string, { count: number; total: Prisma.Decimal }>()
  for (const row of rows) {
    map.set(row.status, { count: row._count._all, total: row._sum.amount ?? new Prisma.Decimal(0) })
  }
  return map
}

/**
 * The receivables summary: status counts/totals plus the AR aging report (Phase 3) — open
 * receivables bucketed by days past due in one SQL `CASE WHEN` query (`aging.service.ts`),
 * zero-filled so the wire always carries all four buckets in report order.
 */
function buildReceivableSummary(
  statusMap: Map<string, { count: number; total: Prisma.Decimal }>,
  currency: string,
  aging: Awaited<ReturnType<typeof computeAgingBuckets>>,
): ReceivableSummary {
  let openBalance = new Prisma.Decimal(0)
  for (const status of RECEIVABLE_OPEN_STATUSES) {
    openBalance = openBalance.add(statusMap.get(status)?.total ?? new Prisma.Decimal(0))
  }
  return {
    openBalance: moneyWire(openBalance, currency),
    agingBuckets: aging,
    currentCount: statusMap.get('CURRENT')?.count ?? 0,
    currentTotal: moneyWire(statusMap.get('CURRENT')?.total ?? new Prisma.Decimal(0), currency),
    overdueCount: statusMap.get('OVERDUE')?.count ?? 0,
    overdueTotal: moneyWire(statusMap.get('OVERDUE')?.total ?? new Prisma.Decimal(0), currency),
    inCollectionsCount: statusMap.get('IN_COLLECTIONS')?.count ?? 0,
    inCollectionsTotal: moneyWire(statusMap.get('IN_COLLECTIONS')?.total ?? new Prisma.Decimal(0), currency),
    paidCount: statusMap.get('PAID')?.count ?? 0,
    paidTotal: moneyWire(statusMap.get('PAID')?.total ?? new Prisma.Decimal(0), currency),
  }
}

export interface ReceivableListResult {
  items: ReceivableInvoice[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: ReceivableSummary
}

export async function listReceivables(
  prisma: PrismaClient,
  tenantId: string,
  query: ReceivableListQuery,
): Promise<ReceivableListResult> {
  const currency = await getTenantCurrency(prisma, tenantId)

  const where: Prisma.ReceivableInvoiceWhereInput = { tenantId }
  if (query.status) where.status = query.status
  if (query.customerId) where.customerId = query.customerId
  if (query.overdueOnly === true) {
    where.status = 'OVERDUE'
    where.dueDate = { lt: new Date() }
  }
  if (query.search) {
    where.OR = [
      { number: { contains: query.search, mode: 'insensitive' } },
      { customer: { name: { contains: query.search, mode: 'insensitive' } } },
    ]
  }

  const { skip, take } = toPrismaPage(query)
  const [items, total, statusMap, aging] = await Promise.all([
    prisma.receivableInvoice.findMany({
      where,
      skip,
      take,
      orderBy: { dueDate: 'asc' },
      include: { customer: true },
    }),
    prisma.receivableInvoice.count({ where: { tenantId } }),
    receivableAggregates(prisma, tenantId),
    computeAgingBuckets(prisma, tenantId, currency),
  ])

  return {
    items: items.map(item => mapReceivable(item, currency)),
    pagination: buildPaginationMeta(query, total),
    summary: buildReceivableSummary(statusMap, currency, aging),
  }
}

type PrismaReceivableWithIncludes = Prisma.ReceivableInvoiceGetPayload<{ include: { customer: true } }>

function mapReceivable(invoice: PrismaReceivableWithIncludes, currency: string): ReceivableInvoice {
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    customer: invoice.customer?.name ?? null,
    number: invoice.number,
    amount: moneyWire(invoice.amount, currency),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    status: invoice.status,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  }
}

export async function getReceivable(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ReceivableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const invoice = await prisma.receivableInvoice.findFirst({
    where: { id, tenantId },
    include: { customer: true },
  })
  if (!invoice) throw new AppError(404, 'Invoice not found')
  return mapReceivable(invoice, currency)
}

/** Throws unless `customerId` names a customer in this tenant. */
async function assertCustomerInTenant(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string | null | undefined,
): Promise<void> {
  if (!customerId) return
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
  if (!customer) throw new AppError(400, 'Customer does not belong to this workspace')
}

export async function createReceivable(
  prisma: PrismaClient,
  tenantId: string,
  input: ReceivableWriteInput,
): Promise<ReceivableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  await assertCustomerInTenant(prisma, tenantId, input.customerId)

  const invoice = await prisma.receivableInvoice.create({
    data: {
      tenantId,
      customerId: input.customerId,
      number: input.number ?? null,
      amount: toStoredDecimal(input.amount, currency),
      dueDate: input.dueDate ? dayToDate(input.dueDate) : null,
      status: input.status ?? 'CURRENT',
    },
    include: { customer: true },
  })
  return mapReceivable(invoice, currency)
}

export async function updateReceivable(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ReceivableUpdateInput,
): Promise<ReceivableInvoice> {
  const existing = await prisma.receivableInvoice.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Invoice not found')

  const currency = await getTenantCurrency(prisma, tenantId)
  const invoice = await prisma.receivableInvoice.update({
    where: { id },
    data: {
      ...(input.number !== undefined && { number: input.number }),
      ...(input.amount !== undefined && { amount: toStoredDecimal(input.amount, currency) }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate ? dayToDate(input.dueDate) : null }),
      ...(input.status !== undefined && { status: input.status }),
    },
    include: { customer: true },
  })
  return mapReceivable(invoice, currency)
}

/** Narrow status transition — the "mark overdue"/"mark paid" actions from the UI. */
export async function updateReceivableStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: ReceivableStatus,
): Promise<ReceivableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const existing = await prisma.receivableInvoice.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Invoice not found')

  const invoice = await prisma.receivableInvoice.update({
    where: { id },
    data: { status },
    include: { customer: true },
  })
  return mapReceivable(invoice, currency)
}

export async function deleteReceivable(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.receivableInvoice.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Invoice not found')
  await prisma.receivableInvoice.delete({ where: { id } })
}

// ── Expenses ────────────────────────────────────────────────────────────────────

const EXPENSE_OPEN_STATUSES = ['PENDING', 'FLAGGED', 'PROCESSING', 'APPROVED'] as const

async function expenseAggregates(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Map<string, { count: number; total: Prisma.Decimal }>> {
  const rows = await prisma.expense.groupBy({
    by: ['status'],
    where: { tenantId },
    _sum: { amount: true },
    _count: { _all: true },
  })
  const map = new Map<string, { count: number; total: Prisma.Decimal }>()
  for (const row of rows) {
    map.set(row.status, { count: row._count._all, total: row._sum.amount ?? new Prisma.Decimal(0) })
  }
  return map
}

export function buildExpenseSummary(
  statusMap: Map<string, { count: number; total: Prisma.Decimal }>,
  currency: string,
): ExpenseSummary {
  let total = new Prisma.Decimal(0)
  for (const status of EXPENSE_OPEN_STATUSES) {
    total = total.add(statusMap.get(status)?.total ?? new Prisma.Decimal(0))
  }
  return {
    total: moneyWire(total, currency),
    pendingCount: statusMap.get('PENDING')?.count ?? 0,
    pendingTotal: moneyWire(statusMap.get('PENDING')?.total ?? new Prisma.Decimal(0), currency),
    flaggedCount: statusMap.get('FLAGGED')?.count ?? 0,
    flaggedTotal: moneyWire(statusMap.get('FLAGGED')?.total ?? new Prisma.Decimal(0), currency),
    processingCount: statusMap.get('PROCESSING')?.count ?? 0,
    processingTotal: moneyWire(statusMap.get('PROCESSING')?.total ?? new Prisma.Decimal(0), currency),
    approvedCount: statusMap.get('APPROVED')?.count ?? 0,
    approvedTotal: moneyWire(statusMap.get('APPROVED')?.total ?? new Prisma.Decimal(0), currency),
  }
}

export interface ExpenseListResult {
  items: Expense[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: ExpenseSummary
}

export async function listExpenses(
  prisma: PrismaClient,
  tenantId: string,
  query: ExpenseListQuery,
): Promise<ExpenseListResult> {
  const currency = await getTenantCurrency(prisma, tenantId)

  const where: Prisma.ExpenseWhereInput = { tenantId }
  if (query.status) where.status = query.status
  if (query.category) where.category = query.category
  if (query.employeeId) where.employeeId = query.employeeId
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { merchant: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const { skip, take } = toPrismaPage(query)
  const [items, total, statusMap] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take,
      orderBy: { date: 'desc' },
      include: { employee: { select: { name: true } } },
    }),
    prisma.expense.count({ where: { tenantId } }),
    expenseAggregates(prisma, tenantId),
  ])

  return {
    items: items.map(item => mapExpense(item, currency)),
    pagination: buildPaginationMeta(query, total),
    summary: buildExpenseSummary(statusMap, currency),
  }
}

type PrismaExpenseWithIncludes = Prisma.ExpenseGetPayload<{ include: { employee: { select: { name: true } } } }>

function mapExpense(expense: PrismaExpenseWithIncludes, currency: string): Expense {
  return {
    id: expense.id,
    employeeId: expense.employeeId,
    employee: expense.employee?.name ?? null,
    name: expense.name,
    category: expense.category,
    merchant: expense.merchant,
    date: expense.date.toISOString(),
    amount: moneyWire(expense.amount, currency),
    tax: toMoneyWire(expense.tax, currency),
    policyMatch: expense.policyMatch,
    status: expense.status,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  }
}

export async function getExpense(prisma: PrismaClient, tenantId: string, id: string): Promise<Expense> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const expense = await prisma.expense.findFirst({
    where: { id, tenantId },
    include: { employee: { select: { name: true } } },
  })
  if (!expense) throw new AppError(404, 'Expense not found')
  return mapExpense(expense, currency)
}

/** Throws unless `employeeId` (when provided) names an employee in this tenant. */
async function assertEmployeeInTenant(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string | null | undefined,
): Promise<void> {
  if (!employeeId) return
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } })
  if (!employee) throw new AppError(400, 'Employee does not belong to this workspace')
}

export async function createExpense(
  prisma: PrismaClient,
  tenantId: string,
  input: ExpenseWriteInput,
): Promise<Expense> {
  const currency = await getTenantCurrency(prisma, tenantId)
  await assertEmployeeInTenant(prisma, tenantId, input.employeeId)

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      employeeId: input.employeeId ?? null,
      name: input.name,
      category: input.category ?? 'OTHER',
      merchant: input.merchant ?? null,
      date: dayToDate(input.date),
      amount: toStoredDecimal(input.amount, currency),
      tax: input.tax != null ? toStoredDecimal(input.tax, currency) : null,
      policyMatch: input.policyMatch ?? null,
      status: input.status ?? 'PENDING',
    },
    include: { employee: { select: { name: true } } },
  })
  return mapExpense(expense, currency)
}

export async function updateExpense(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ExpenseUpdateInput,
): Promise<Expense> {
  const existing = await prisma.expense.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Expense not found')

  const currency = await getTenantCurrency(prisma, tenantId)
  if (input.employeeId !== undefined) await assertEmployeeInTenant(prisma, tenantId, input.employeeId)

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      ...(input.employeeId !== undefined && { employeeId: input.employeeId }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.merchant !== undefined && { merchant: input.merchant }),
      ...(input.date !== undefined && { date: dayToDate(input.date) }),
      ...(input.amount !== undefined && { amount: toStoredDecimal(input.amount, currency) }),
      ...(input.tax !== undefined && { tax: input.tax ? toStoredDecimal(input.tax, currency) : null }),
      ...(input.policyMatch !== undefined && { policyMatch: input.policyMatch }),
      ...(input.status !== undefined && { status: input.status }),
    },
    include: { employee: { select: { name: true } } },
  })
  return mapExpense(expense, currency)
}

/** Narrow status transition — the "approve"/"flag" actions from the UI. */
export async function updateExpenseStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: ExpenseStatus,
): Promise<Expense> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const existing = await prisma.expense.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Expense not found')

  const expense = await prisma.expense.update({
    where: { id },
    data: { status },
    include: { employee: { select: { name: true } } },
  })
  return mapExpense(expense, currency)
}

export async function deleteExpense(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.expense.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Expense not found')
  await prisma.expense.delete({ where: { id } })
}

// ── Overview ────────────────────────────────────────────────────────────────────

export async function getOverview(prisma: PrismaClient, tenantId: string): Promise<FinanceOverview> {
  const currency = await getTenantCurrency(prisma, tenantId)

  const [payableMap, receivableMap, expenseMap, cashFlow, receivableAging] = await Promise.all([
    payableAggregates(prisma, tenantId),
    receivableAggregates(prisma, tenantId),
    expenseAggregates(prisma, tenantId),
    prisma.cashFlowSnapshot.findMany({ where: { tenantId }, orderBy: { month: 'asc' } }),
    computeAgingBuckets(prisma, tenantId, currency),
  ])

  const payableOutstanding = buildPayableSummary(payableMap, currency).openOutstanding
  const receivableOutstanding = buildReceivableSummary(receivableMap, currency, receivableAging).openBalance
  const expenseSummary = buildExpenseSummary(expenseMap, currency)

  return {
    payableOutstanding,
    receivableOutstanding,
    expensesTotal: expenseSummary.total,
    expensesPendingCount: expenseSummary.pendingCount,
    expensesPendingTotal: expenseSummary.pendingTotal,
    cashFlow: cashFlow.map(row => ({
      month: row.month,
      inflow: moneyWire(row.inflow, currency),
      outflow: moneyWire(row.outflow, currency),
      net: moneyWire(row.net, currency),
    })),
  }
}

/**
 * Assemble the document data for one payables invoice. The same rule as the payslip: the
 * document is built purely from the stored row — the invoice's own `amount` is the total (the
 * books' number, not a re-sum of the line items), and each line item is drawn as stored. The
 * vendor name and the tenant's name/currency come from their own rows. Money is passed as the
 * stored decimal strings; `pdf.ts` formats them.
 */
export async function getInvoiceDoc(prisma: PrismaClient, tenantId: string, invoiceId: string): Promise<InvoiceDoc> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')

  const invoice = await prisma.payableInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: {
      vendor: { select: { name: true } },
      lineItems: { orderBy: { id: 'asc' } },
    },
  })
  if (!invoice) throw new AppError(404, 'Invoice not found')

  return {
    tenantName: tenant.name,
    vendorName: invoice.vendor?.name ?? '—',
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date.toISOString().slice(0, 10),
    currency: tenant.currency,
    status: invoice.status,
    lineItems: invoice.lineItems.map(item => ({
      description: item.description,
      periodOrUsage: item.periodOrUsage,
      amount: item.amount.toString(),
    })),
    total: invoice.amount.toString(),
  }
}
