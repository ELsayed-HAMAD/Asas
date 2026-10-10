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
  CollectionActivity,
  CollectionActivityWriteInput,
  Expense,
  ExpenseListQuery,
  ExpenseSummary,
  ExpenseUpdateInput,
  ExpenseWriteInput,
  FinanceOverview,
  PayableInvoice,
  PayableDetail,
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
import { monthToDateComparisonPeriods, tenantToday } from '../../utils/dates.js'
export { monthToDateComparisonPeriods } from '../../utils/dates.js'
import { computeAgingBuckets } from './aging.service.js'
import { expenseSettlementComparison, getJournal as getLedgerJournal, listJournals as listLedgerJournals, payableSettlementComparison, receivableSettlementComparison, postOpeningBalance as postLedgerOpeningBalance, recentSettlements, recordCashSettlement, recordInvoiceRecognition, reverseCashSettlement, reverseInvoiceRecognitionIfPresent, settlementCashFlow, settlementCashFlowComparison, trialBalance as getLedgerTrialBalance } from './ledger.service.js'
import type { InvoiceDoc } from '../../services/pdf.js'

export type FinanceClient = PrismaClient | Prisma.TransactionClient

// ── Money + shared helpers ──────────────────────────────────────────────────────

export const PAYABLE_TRANSITIONS: Record<PayableStatus, readonly PayableStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['SCHEDULED', 'PAID', 'REJECTED'],
  SCHEDULED: ['APPROVED', 'PAID'],
  PAID: [],
  REJECTED: [],
  VOID: [],
}
export const RECEIVABLE_TRANSITIONS: Record<ReceivableStatus, readonly ReceivableStatus[]> = {
  CURRENT: ['OVERDUE', 'IN_COLLECTIONS', 'PAID'],
  OVERDUE: ['CURRENT', 'IN_COLLECTIONS', 'PAID'],
  IN_COLLECTIONS: ['CURRENT', 'OVERDUE', 'PAID'],
  PAID: [],
  VOID: [],
}
export const EXPENSE_TRANSITIONS: Record<ExpenseStatus, readonly ExpenseStatus[]> = {
  PENDING: ['FLAGGED', 'PROCESSING', 'APPROVED', 'REJECTED'],
  FLAGGED: ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED'],
  PROCESSING: ['FLAGGED', 'APPROVED', 'REJECTED'],
  APPROVED: ['REIMBURSED'],
  REIMBURSED: [],
  REJECTED: [],
  VOID: [],
}

function assertTransition<T extends string>(map: Record<T, readonly T[]>, from: T, to: T): void {
  if (!map[from].includes(to)) throw new AppError(409, `Cannot move a ${from.toLowerCase()} record to ${to.toLowerCase()}`)
}

function assertIndependentApproval(createdById: string | null, userId: string): void {
  if (createdById && createdById === userId) throw new AppError(403, 'A different administrator must approve this record')
}

/** All financial edits lock the same tenant-scoped document row, including status changes. */
async function withDocumentLock<T>(
  prisma: FinanceClient,
  table: 'PayableInvoice' | 'ReceivableInvoice' | 'Expense',
  tenantId: string,
  id: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const lockAndWork = async (tx: Prisma.TransactionClient): Promise<T> => {
    // The identifier is a closed union above, never client input; values remain bound parameters.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM ${Prisma.raw(`"${table}"`)}
      WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE
    `
    if (rows.length === 0) throw new AppError(404, table === 'Expense' ? 'Expense not found' : 'Invoice not found')
    return work(tx)
  }
  return '$transaction' in prisma ? prisma.$transaction(lockAndWork) : lockAndWork(prisma)
}

/** Resolve the tenant's reporting currency (the free-form `String` column), or 404 if gone. */
async function getTenantCurrency(prisma: Pick<PrismaClient, 'tenant'>, tenantId: string): Promise<CurrencyCode> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  return tenant.currency
}

async function getTenantTimezone(prisma: FinanceClient, tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  return tenant.timezone
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

export async function listVendors(prisma: FinanceClient, tenantId: string): Promise<Vendor[]> {
  const rows = await prisma.vendor.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
  return rows.map(mapVendor)
}

export async function getVendor(prisma: FinanceClient, tenantId: string, id: string): Promise<Vendor> {
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
  prisma: FinanceClient,
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


/**
 * One `groupBy` over `PayableInvoice.status` gives every status's count and amount sum in a
 * single round trip; the summary zero-fills its existing KPI fields, and `openOutstanding`
 * sums only the three open statuses (never paid, rejected or void invoices).
 */
async function payableAggregates(
  prisma: FinanceClient,
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
  dateTotals: {
    pastDue: Prisma.Decimal
    dueIn7Days: Prisma.Decimal
    paidThisMonth: { amount: number; currency: string } | null
    paidThisMonthComparison: {
      previousStartDate: string
      previousEndDateExclusive: string
      previousTotal: { amount: number; currency: string } | null
    }
  } = {
    pastDue: new Prisma.Decimal(0),
    dueIn7Days: new Prisma.Decimal(0),
    paidThisMonth: null,
    paidThisMonthComparison: {
      previousStartDate: '1970-01-01',
      previousEndDateExclusive: '1970-01-02',
      previousTotal: null,
    },
  },
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
    pastDueTotal: moneyWire(dateTotals.pastDue, currency),
    dueIn7DaysTotal: moneyWire(dateTotals.dueIn7Days, currency),
    paidThisMonthTotal: dateTotals.paidThisMonth,
    paidThisMonthComparison: dateTotals.paidThisMonthComparison,
  }
}

export interface PayableListResult {
  items: PayableInvoice[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: PayableSummary
}

export async function listPayables(
  prisma: FinanceClient,
  tenantId: string,
  query: PayableListQuery,
): Promise<PayableListResult> {
  const [currency, timezone] = await Promise.all([
    getTenantCurrency(prisma, tenantId),
    getTenantTimezone(prisma, tenantId),
  ])

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
  const now = tenantToday(timezone)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const periods = monthToDateComparisonPeriods(now)
  const [items, total, statusMap, pastDue, dueIn7Days, paidThisMonth] = await Promise.all([
    prisma.payableInvoice.findMany({
      where,
      skip,
      take,
      orderBy: { date: 'desc' },
      include: { vendor: true, _count: { select: { lineItems: true } } },
    }),
    prisma.payableInvoice.count({ where }),
    payableAggregates(prisma, tenantId),
    prisma.payableInvoice.aggregate({ where: { tenantId, status: { in: ['PENDING', 'APPROVED', 'SCHEDULED'] }, dueDate: { lt: now } }, _sum: { amount: true } }),
    prisma.payableInvoice.aggregate({ where: { tenantId, status: { in: ['PENDING', 'APPROVED', 'SCHEDULED'] }, dueDate: { gte: now, lte: nextWeek } }, _sum: { amount: true } }),
    payableSettlementComparison(
      prisma, tenantId, currency, timezone,
      periods.current.startDate, periods.current.endDateExclusive,
      periods.previous.startDate, periods.previous.endDateExclusive,
    ),
  ])

  return {
    items: items.map(item => mapPayable(item, currency)),
    pagination: buildPaginationMeta(query, total),
    summary: buildPayableSummary(statusMap, currency, {
      pastDue: pastDue._sum.amount ?? new Prisma.Decimal(0),
      dueIn7Days: dueIn7Days._sum.amount ?? new Prisma.Decimal(0),
      paidThisMonth: paidThisMonth.currentTotal,
      paidThisMonthComparison: {
        previousStartDate: periods.previous.startDate,
        previousEndDateExclusive: periods.previous.endDateExclusive,
        previousTotal: paidThisMonth.previousTotal,
      },
    }),
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
    projectId: invoice.projectId,
    vendorId: invoice.vendorId,
    vendor: invoice.vendor?.name ?? null,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    amount: moneyWire(invoice.amount, invoice.currency ?? currency),
    status: invoice.status,
    lineItemCount: invoice._count.lineItems,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  }
}

export async function getPayable(prisma: FinanceClient, tenantId: string, id: string): Promise<PayableDetail> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const invoice = await prisma.payableInvoice.findFirst({
    where: { id, tenantId },
    include: { vendor: true, lineItems: { orderBy: { id: 'asc' } }, _count: { select: { lineItems: true } } },
  })
  if (!invoice) throw new AppError(404, 'Invoice not found')
  return {
    ...mapPayable(invoice, currency),
    lineItems: invoice.lineItems.map(item => ({
      id: item.id,
      description: item.description,
      periodOrUsage: item.periodOrUsage,
      amount: moneyWire(item.amount, invoice.currency ?? currency),
    })),
  }
}

/** Throws unless `vendorId` names a vendor in this tenant. */
async function assertVendorInTenant(
  prisma: FinanceClient,
  tenantId: string,
  vendorId: string | null | undefined,
): Promise<void> {
  if (!vendorId) return
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } })
  if (!vendor) throw new AppError(400, 'Vendor does not belong to this workspace')
}

export async function createPayable(
  prisma: FinanceClient,
  tenantId: string,
  input: PayableWriteInput,
  userId: string,
): Promise<PayableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  await assertVendorInTenant(prisma, tenantId, input.vendorId)
  await assertProjectInTenant(prisma, tenantId, input.projectId)

  const invoice = await prisma.payableInvoice.create({
    data: {
      tenantId,
      projectId: input.projectId ?? null,
      currency,
      vendorId: input.vendorId,
      invoiceNumber: input.invoiceNumber ?? null,
      date: dayToDate(input.date),
      dueDate: input.dueDate ? dayToDate(input.dueDate) : null,
      amount: toStoredDecimal(input.amount, currency),
      status: 'PENDING',
      createdById: userId,
    },
    include: { vendor: true, _count: { select: { lineItems: true } } },
  })
  return mapPayable(invoice, currency)
}

export async function updatePayable(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  input: PayableUpdateInput,
): Promise<PayableInvoice> {
  const workspaceCurrency = await getTenantCurrency(prisma, tenantId)
  if (input.projectId !== undefined) await assertProjectInTenant(prisma, tenantId, input.projectId)
  return withDocumentLock(prisma, 'PayableInvoice', tenantId, id, async tx => {
    const existing = await tx.payableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    const currency = existing.currency ?? workspaceCurrency
    if (!['PENDING', 'REJECTED'].includes(existing.status)) throw new AppError(409, 'Only pending or rejected invoices can be edited')
    const date = input.date ? dayToDate(input.date) : existing.date
    const dueDate = input.dueDate === undefined ? existing.dueDate : input.dueDate ? dayToDate(input.dueDate) : null
    if (dueDate && dueDate < date) throw new AppError(400, 'The due date cannot be before the invoice date')
    const invoice = await tx.payableInvoice.update({
      where: { id_tenantId: { id, tenantId } },
      data: {
        ...(input.invoiceNumber !== undefined && { invoiceNumber: input.invoiceNumber }),
        ...(input.projectId !== undefined && { projectId: input.projectId }),
        ...(input.date !== undefined && { date }),
        ...(input.dueDate !== undefined && { dueDate }),
        ...(input.amount !== undefined && { amount: toStoredDecimal(input.amount, currency) }),
      },
      include: { vendor: true, _count: { select: { lineItems: true } } },
    })
    return mapPayable(invoice, currency)
  })
}

/** Narrow status transition — the "approve"/"mark paid" actions from the UI. */
export async function updatePayableStatus(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  status: PayableStatus,
  userId: string,
): Promise<PayableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'PayableInvoice', tenantId, id, async tx => {
    const existing = await tx.payableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    assertTransition(PAYABLE_TRANSITIONS, existing.status, status)
    if (status === 'APPROVED') assertIndependentApproval(existing.createdById, userId)
    if (status === 'REJECTED') await reverseInvoiceRecognitionIfPresent(tx, { tenantId, sourceId: id, sourceType: 'AP_RECOGNITION', actorId: userId, reason: 'Payable rejected' })
    const invoice = await tx.payableInvoice.update({
      where: { id_tenantId: { id, tenantId } },
      data: {
        status,
        ...(status === 'APPROVED' && { approvedById: userId, approvedAt: new Date() }),
        ...(status === 'PAID' && { paidAt: new Date() }),
      },
      include: { vendor: true, _count: { select: { lineItems: true } } },
    })
    if (status === 'APPROVED' || status === 'PAID') {
      await recordInvoiceRecognition(tx, {
        tenantId, sourceId: invoice.id, sourceType: 'AP_RECOGNITION', amount: invoice.amount.toString(),
        currency: invoice.currency ?? currency, workspaceCurrency: currency, postedAt: invoice.approvedAt ?? invoice.paidAt ?? new Date(),
        actorId: userId, description: `Payable recognized: ${invoice.vendor.name}${invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ''}`,
      })
    }
    if (status === 'PAID' && invoice.paidAt) {
      await recordCashSettlement(tx, {
        tenantId, sourceId: invoice.id, sourceType: 'AP_PAYMENT', amount: invoice.amount.toString(),
        documentCurrency: invoice.currency, workspaceCurrency: currency, postedAt: invoice.paidAt,
        actorId: userId, description: `Payment to ${invoice.vendor.name}${invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ''}`,
      })
    }
    return mapPayable(invoice, currency)
  })
}

/** Return an approved/scheduled payable to the review queue; the route commits the reason to the audit log with the change. */
export async function requestPayableChanges(prisma: FinanceClient, tenantId: string, id: string, actorId: string | null = null): Promise<PayableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'PayableInvoice', tenantId, id, async tx => {
    const existing = await tx.payableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    if (!['APPROVED', 'SCHEDULED'].includes(existing.status)) {
      throw new AppError(409, 'Changes can only be requested for an approved or scheduled invoice')
    }
    await reverseInvoiceRecognitionIfPresent(tx, { tenantId, sourceId: id, sourceType: 'AP_RECOGNITION', actorId, reason: 'Changes requested for payable' })
    const invoice = await tx.payableInvoice.update({
      where: { id_tenantId: { id, tenantId } },
      data: { status: 'PENDING', approvedById: null, approvedAt: null },
      include: { vendor: true, _count: { select: { lineItems: true } } },
    })
    return mapPayable(invoice, currency)
  })
}

/** Mark a selected set of approved or scheduled invoices paid as one atomic operation. */
export async function payApprovedPayables(prisma: FinanceClient, tenantId: string, ids: string[], actorId: string | null = null): Promise<PayableInvoice[]> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const pay = async (tx: Prisma.TransactionClient): Promise<PayableInvoice[]> => {
    const eligible = await tx.payableInvoice.count({
      where: { tenantId, id: { in: ids }, status: { in: ['APPROVED', 'SCHEDULED'] } },
    })
    if (eligible !== ids.length) throw new AppError(409, 'Every selected invoice must be approved or scheduled before payment')
    const updated = await tx.payableInvoice.updateMany({
      where: { tenantId, id: { in: ids }, status: { in: ['APPROVED', 'SCHEDULED'] } },
      data: { status: 'PAID', paidAt: new Date() },
    })
    if (updated.count !== ids.length) throw new AppError(409, 'One or more invoices changed while processing the batch')
    const rows = await tx.payableInvoice.findMany({
      where: { tenantId, id: { in: ids } },
      include: { vendor: true, _count: { select: { lineItems: true } } },
      orderBy: { id: 'asc' },
    })
    for (const row of rows) {
      if (!row.paidAt) throw new AppError(409, 'Paid invoice is missing its payment timestamp')
      await recordInvoiceRecognition(tx, {
        tenantId, sourceId: row.id, sourceType: 'AP_RECOGNITION', amount: row.amount.toString(),
        currency: row.currency ?? currency, workspaceCurrency: currency, postedAt: row.approvedAt ?? row.paidAt,
        actorId, description: `Payable recognized: ${row.vendor.name}${row.invoiceNumber ? ` · ${row.invoiceNumber}` : ''}`,
      })
      await recordCashSettlement(tx, {
        tenantId, sourceId: row.id, sourceType: 'AP_PAYMENT', amount: row.amount.toString(),
        documentCurrency: row.currency, workspaceCurrency: currency, postedAt: row.paidAt,
        actorId, description: `Payment to ${row.vendor.name}${row.invoiceNumber ? ` · ${row.invoiceNumber}` : ''}`,
      })
    }
    return rows.map(row => mapPayable(row, currency))
  }
  return '$transaction' in prisma ? prisma.$transaction(pay, { isolationLevel: 'Serializable' }) : pay(prisma)
}

export async function deletePayable(prisma: FinanceClient, tenantId: string, id: string, actorId: string | null = null): Promise<void> {
  await withDocumentLock(prisma, 'PayableInvoice', tenantId, id, async tx => {
    const existing = await tx.payableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    if (!['PENDING', 'REJECTED'].includes(existing.status)) throw new AppError(409, 'Only pending or rejected invoices can be deleted')
    const history = await tx.journalEntry.findFirst({ where: { tenantId, recognizesPayableInvoiceId: id }, select: { id: true } })
    if (history) {
      await reverseInvoiceRecognitionIfPresent(tx, { tenantId, sourceId: id, sourceType: 'AP_RECOGNITION', actorId, reason: 'Payable removed' })
      await tx.payableInvoice.update({ where: { id_tenantId: { id, tenantId } }, data: { status: 'VOID' } })
    } else {
      await tx.payableInvoice.delete({ where: { id_tenantId: { id, tenantId } } })
    }
  })
}

/** Cancellation retains the invoice; paid documents need a real reversal, not a status reset. */
export async function voidPayable(prisma: FinanceClient, tenantId: string, id: string, reason = 'Voided', actorId: string | null = null): Promise<PayableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'PayableInvoice', tenantId, id, async tx => {
    const existing = await tx.payableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    if (existing.status === 'VOID') throw new AppError(409, 'This invoice is already void')
    if (existing.status === 'PAID') await reverseCashSettlement(tx, { tenantId, sourceId: id, sourceType: 'AP_PAYMENT', reason, actorId, postedAt: new Date() })
    await reverseInvoiceRecognitionIfPresent(tx, { tenantId, sourceId: id, sourceType: 'AP_RECOGNITION', actorId, reason })
    const invoice = await tx.payableInvoice.update({
      where: { id_tenantId: { id, tenantId } },
      data: { status: 'VOID' },
      include: { vendor: true, _count: { select: { lineItems: true } } },
    })
    return mapPayable(invoice, currency)
  })
}

// ── Customers ───────────────────────────────────────────────────────────────────

export async function listCustomers(prisma: FinanceClient, tenantId: string): Promise<Customer[]> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const [rows, balanceByCustomer, oldestDueByCustomer] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    openReceivableBalanceByCustomer(prisma, tenantId),
    prisma.receivableInvoice.groupBy({
      by: ['customerId'],
      where: { tenantId, status: { in: [...RECEIVABLE_OPEN_STATUSES] }, dueDate: { lt: today } },
      _min: { dueDate: true },
    }),
  ])
  const oldestDue = new Map(oldestDueByCustomer.map(row => [row.customerId, row._min.dueDate]))
  return rows.map(row => {
    const date = oldestDue.get(row.id)
    const oldestOverdueDays = date ? Math.max(1, Math.ceil((today.getTime() - new Date(date).setUTCHours(0, 0, 0, 0)) / 86_400_000)) : 0
    return mapCustomer(row, balanceByCustomer.get(row.id) ?? new Prisma.Decimal(0), currency, oldestOverdueDays)
  })
}

export async function createCustomer(
  prisma: FinanceClient,
  tenantId: string,
  input: CustomerWriteInput,
): Promise<Customer> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const existing = await prisma.customer.findFirst({ where: { tenantId, name: input.name } })
  if (existing) throw new AppError(409, 'A customer with this name already exists')

  const customer = await prisma.customer.create({
    data: { tenantId, name: input.name, avatarUrl: input.avatarUrl ?? null },
  })
  return mapCustomer(customer, new Prisma.Decimal(0), currency, 0)
}

function mapCollectionActivity(row: { id: string; customerId: string; title: string; author: string | null; body: string | null; createdAt: Date }): CollectionActivity {
  return { id: row.id, customerId: row.customerId, title: row.title, author: row.author, body: row.body, date: row.createdAt.toISOString() }
}

export async function listCollectionActivities(prisma: FinanceClient, tenantId: string, customerId: string): Promise<CollectionActivity[]> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } })
  if (!customer) throw new AppError(404, 'Customer not found')
  const rows = await prisma.collectionActivity.findMany({
    where: { tenantId, customerId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
  })
  return rows.map(mapCollectionActivity)
}

export async function createCollectionActivity(
  prisma: FinanceClient,
  tenantId: string,
  customerId: string,
  author: string,
  input: CollectionActivityWriteInput,
): Promise<CollectionActivity> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } })
  if (!customer) throw new AppError(404, 'Customer not found')
  const row = await prisma.collectionActivity.create({
    data: { tenantId, customerId, title: input.title, body: input.body, author },
  })
  return mapCollectionActivity(row)
}

function mapCustomer(
  customer: PrismaCustomer,
  openBalance: Prisma.Decimal,
  currency: string,
  oldestOverdueDays: number,
): Customer {
  return {
    id: customer.id,
    name: customer.name,
    avatarUrl: customer.avatarUrl,
    collectionStatus: customer.collectionStatus,
    openBalance: moneyWire(openBalance, currency),
    oldestOverdueDays,
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
  prisma: FinanceClient,
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
  prisma: FinanceClient,
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
  collectionPeriod: {
    currentTotal: { amount: number; currency: string } | null
    previousStartDate: string
    previousEndDateExclusive: string
    previousTotal: { amount: number; currency: string } | null
  },
): ReceivableSummary {
  return {
    openBalance: receivableOpenBalance(statusMap, currency),
    collectedThisMonthTotal: collectionPeriod.currentTotal,
    collectedThisMonthComparison: {
      previousStartDate: collectionPeriod.previousStartDate,
      previousEndDateExclusive: collectionPeriod.previousEndDateExclusive,
      previousTotal: collectionPeriod.previousTotal,
    },
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

function receivableOpenBalance(
  statusMap: Map<string, { count: number; total: Prisma.Decimal }>,
  currency: string,
): { amount: number; currency: string } {
  let openBalance = new Prisma.Decimal(0)
  for (const status of RECEIVABLE_OPEN_STATUSES) {
    openBalance = openBalance.add(statusMap.get(status)?.total ?? new Prisma.Decimal(0))
  }
  return moneyWire(openBalance, currency)
}

export interface ReceivableListResult {
  items: ReceivableInvoice[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: ReceivableSummary
}

export async function listReceivables(
  prisma: FinanceClient,
  tenantId: string,
  query: ReceivableListQuery,
): Promise<ReceivableListResult> {
  const [currency, timezone] = await Promise.all([
    getTenantCurrency(prisma, tenantId),
    getTenantTimezone(prisma, tenantId),
  ])
  const today = tenantToday(timezone)
  const periods = monthToDateComparisonPeriods(today)

  const where: Prisma.ReceivableInvoiceWhereInput = { tenantId }
  if (query.status) where.status = query.status
  if (query.customerId) where.customerId = query.customerId
  if (query.overdueOnly === true) {
    where.AND = [
      ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
      { status: { in: ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'] }, dueDate: { lt: today } },
    ]
  }
  if (query.search) {
    where.OR = [
      { number: { contains: query.search, mode: 'insensitive' } },
      { customer: { name: { contains: query.search, mode: 'insensitive' } } },
    ]
  }

  const { skip, take } = toPrismaPage(query)
  const [items, total, statusMap, aging, collectedThisMonth] = await Promise.all([
    prisma.receivableInvoice.findMany({
      where,
      skip,
      take,
      orderBy: { dueDate: 'asc' },
      include: { customer: true },
    }),
    prisma.receivableInvoice.count({ where }),
    receivableAggregates(prisma, tenantId),
    computeAgingBuckets(prisma, tenantId, currency, today),
    receivableSettlementComparison(
      prisma, tenantId, currency, timezone,
      periods.current.startDate, periods.current.endDateExclusive,
      periods.previous.startDate, periods.previous.endDateExclusive,
    ),
  ])

  return {
    items: items.map(item => mapReceivable(item, currency)),
    pagination: buildPaginationMeta(query, total),
    summary: buildReceivableSummary(statusMap, currency, aging, {
      currentTotal: collectedThisMonth.currentTotal,
      previousStartDate: periods.previous.startDate,
      previousEndDateExclusive: periods.previous.endDateExclusive,
      previousTotal: collectedThisMonth.previousTotal,
    }),
  }
}

type PrismaReceivableWithIncludes = Prisma.ReceivableInvoiceGetPayload<{ include: { customer: true } }>

function mapReceivable(invoice: PrismaReceivableWithIncludes, currency: string): ReceivableInvoice {
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    customer: invoice.customer?.name ?? null,
    number: invoice.number,
    amount: moneyWire(invoice.amount, invoice.currency ?? currency),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    status: invoice.status,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  }
}

export async function getReceivable(
  prisma: FinanceClient,
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
  prisma: FinanceClient,
  tenantId: string,
  customerId: string | null | undefined,
): Promise<void> {
  if (!customerId) return
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
  if (!customer) throw new AppError(400, 'Customer does not belong to this workspace')
}

export async function createReceivable(
  prisma: FinanceClient,
  tenantId: string,
  input: ReceivableWriteInput,
  actorId: string | null = null,
): Promise<ReceivableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const create = async (tx: Prisma.TransactionClient) => {
    await assertCustomerInTenant(tx, tenantId, input.customerId)
    const invoice = await tx.receivableInvoice.create({
      data: {
        tenantId,
        currency,
        customerId: input.customerId,
        number: input.number ?? null,
        amount: toStoredDecimal(input.amount, currency),
        dueDate: input.dueDate ? dayToDate(input.dueDate) : null,
        status: 'CURRENT',
      },
      include: { customer: true },
    })
    await recordInvoiceRecognition(tx, {
      tenantId, sourceId: invoice.id, sourceType: 'AR_RECOGNITION', amount: invoice.amount.toString(),
      currency: invoice.currency ?? currency, workspaceCurrency: currency, postedAt: invoice.createdAt, actorId,
      description: `Receivable recognized: ${invoice.customer.name}${invoice.number ? ` · ${invoice.number}` : ''}`,
    })
    return mapReceivable(invoice, currency)
  }
  return '$transaction' in prisma ? prisma.$transaction(create, { isolationLevel: 'Serializable' }) : create(prisma)
}

export async function updateReceivable(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  input: ReceivableUpdateInput,
  actorId: string | null = null,
): Promise<ReceivableInvoice> {
  const workspaceCurrency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'ReceivableInvoice', tenantId, id, async tx => {
    const existing = await tx.receivableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    const currency = existing.currency ?? workspaceCurrency
    if (['PAID', 'VOID'].includes(existing.status)) throw new AppError(409, 'Paid or void invoices cannot be edited')
    if (input.amount !== undefined) await reverseInvoiceRecognitionIfPresent(tx, { tenantId, sourceId: id, sourceType: 'AR_RECOGNITION', actorId, reason: 'Receivable amount corrected' })
    const invoice = await tx.receivableInvoice.update({
      where: { id_tenantId: { id, tenantId } },
      data: {
        ...(input.number !== undefined && { number: input.number }),
        ...(input.amount !== undefined && { amount: toStoredDecimal(input.amount, currency) }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate ? dayToDate(input.dueDate) : null }),
      },
      include: { customer: true },
    })
    if (input.amount !== undefined) await recordInvoiceRecognition(tx, {
      tenantId, sourceId: invoice.id, sourceType: 'AR_RECOGNITION', amount: invoice.amount.toString(),
      currency: invoice.currency ?? currency, workspaceCurrency, postedAt: new Date(), actorId,
      description: `Receivable re-recognized: ${invoice.customer.name}${invoice.number ? ` · ${invoice.number}` : ''}`,
    })
    return mapReceivable(invoice, currency)
  })
}

/** Narrow status transition — the "mark overdue"/"mark paid" actions from the UI. */
export async function updateReceivableStatus(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  status: ReceivableStatus,
  userId: string | null = null,
): Promise<ReceivableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'ReceivableInvoice', tenantId, id, async tx => {
    const existing = await tx.receivableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    assertTransition(RECEIVABLE_TRANSITIONS, existing.status, status)
    if (status === 'PAID') await recordInvoiceRecognition(tx, {
      tenantId, sourceId: id, sourceType: 'AR_RECOGNITION', amount: existing.amount.toString(),
      currency: existing.currency ?? currency, workspaceCurrency: currency, postedAt: existing.createdAt, actorId: userId,
      description: `Receivable recognized: ${existing.customerId}${existing.number ? ` · ${existing.number}` : ''}`,
    })
    const invoice = await tx.receivableInvoice.update({
      where: { id_tenantId: { id, tenantId } },
      data: { status, ...(status === 'PAID' && { paidAt: new Date() }) },
      include: { customer: true },
    })
    if (status === 'PAID' && invoice.paidAt) {
      await recordCashSettlement(tx, {
        tenantId, sourceId: invoice.id, sourceType: 'AR_COLLECTION', amount: invoice.amount.toString(),
        documentCurrency: invoice.currency, workspaceCurrency: currency, postedAt: invoice.paidAt,
        actorId: userId, description: `Collection from ${invoice.customer.name}${invoice.number ? ` · ${invoice.number}` : ''}`,
      })
    }
    return mapReceivable(invoice, currency)
  })
}

export async function deleteReceivable(prisma: FinanceClient, tenantId: string, id: string, actorId: string | null = null): Promise<void> {
  await withDocumentLock(prisma, 'ReceivableInvoice', tenantId, id, async tx => {
    const existing = await tx.receivableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    if (['PAID', 'VOID'].includes(existing.status)) throw new AppError(409, 'Paid or void invoices cannot be deleted')
    await reverseInvoiceRecognitionIfPresent(tx, { tenantId, sourceId: id, sourceType: 'AR_RECOGNITION', actorId, reason: 'Receivable removed' })
    await tx.receivableInvoice.update({ where: { id_tenantId: { id, tenantId } }, data: { status: 'VOID' } })
  })
}

export async function voidReceivable(prisma: FinanceClient, tenantId: string, id: string, reason = 'Voided', actorId: string | null = null): Promise<ReceivableInvoice> {
  const currency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'ReceivableInvoice', tenantId, id, async tx => {
    const existing = await tx.receivableInvoice.findFirstOrThrow({ where: { id, tenantId } })
    if (existing.status === 'VOID') throw new AppError(409, 'This invoice is already void')
    if (existing.status === 'PAID') await reverseCashSettlement(tx, { tenantId, sourceId: id, sourceType: 'AR_COLLECTION', reason, actorId, postedAt: new Date() })
    await reverseInvoiceRecognitionIfPresent(tx, { tenantId, sourceId: id, sourceType: 'AR_RECOGNITION', actorId, reason })
    const invoice = await tx.receivableInvoice.update({
      where: { id_tenantId: { id, tenantId } },
      data: { status: 'VOID' },
      include: { customer: true },
    })
    return mapReceivable(invoice, currency)
  })
}

// ── Expenses ────────────────────────────────────────────────────────────────────

const EXPENSE_OPEN_STATUSES = ['PENDING', 'FLAGGED', 'PROCESSING', 'APPROVED', 'REIMBURSED'] as const

async function expenseAggregates(
  prisma: FinanceClient,
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
  settlementTotals: {
    reimbursedThisMonth: { amount: number; currency: string } | null
    previousStartDate: string
    previousEndDateExclusive: string
    previousTotal: { amount: number; currency: string } | null
  } = {
    reimbursedThisMonth: null,
    previousStartDate: '1970-01-01',
    previousEndDateExclusive: '1970-01-02',
    previousTotal: null,
  },
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
    reimbursedCount: statusMap.get('REIMBURSED')?.count ?? 0,
    reimbursedTotal: moneyWire(statusMap.get('REIMBURSED')?.total ?? new Prisma.Decimal(0), currency),
    reimbursedThisMonthTotal: settlementTotals.reimbursedThisMonth,
    reimbursedThisMonthComparison: {
      previousStartDate: settlementTotals.previousStartDate,
      previousEndDateExclusive: settlementTotals.previousEndDateExclusive,
      previousTotal: settlementTotals.previousTotal,
    },
  }
}

export interface ExpenseListResult {
  items: Expense[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: ExpenseSummary
}

export async function listExpenses(
  prisma: FinanceClient,
  tenantId: string,
  query: ExpenseListQuery,
): Promise<ExpenseListResult> {
  const [currency, timezone] = await Promise.all([
    getTenantCurrency(prisma, tenantId),
    getTenantTimezone(prisma, tenantId),
  ])
  const periods = monthToDateComparisonPeriods(tenantToday(timezone))

  const where: Prisma.ExpenseWhereInput = { tenantId }
  if (query.status) where.status = query.status
  if (query.category) where.category = query.category
  if (query.employeeId) where.employeeId = query.employeeId
  if (query.departmentId) where.employee = { is: { tenantId, departmentId: query.departmentId } }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { merchant: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const { skip, take } = toPrismaPage(query)
  const [items, total, statusMap, reimbursedThisMonth] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take,
      orderBy: { date: query.sort },
      include: { employee: { select: { name: true } } },
    }),
    prisma.expense.count({ where }),
    expenseAggregates(prisma, tenantId),
    expenseSettlementComparison(
      prisma, tenantId, currency, timezone,
      periods.current.startDate, periods.current.endDateExclusive,
      periods.previous.startDate, periods.previous.endDateExclusive,
    ),
  ])

  return {
    items: items.map(item => mapExpense(item, currency)),
    pagination: buildPaginationMeta(query, total),
    summary: buildExpenseSummary(statusMap, currency, {
      reimbursedThisMonth: reimbursedThisMonth.currentTotal,
      previousStartDate: periods.previous.startDate,
      previousEndDateExclusive: periods.previous.endDateExclusive,
      previousTotal: reimbursedThisMonth.previousTotal,
    }),
  }
}

type PrismaExpenseWithIncludes = Prisma.ExpenseGetPayload<{ include: { employee: { select: { name: true } } } }>

function mapExpense(expense: PrismaExpenseWithIncludes, currency: string): Expense {
  return {
    id: expense.id,
    projectId: expense.projectId,
    employeeId: expense.employeeId,
    employee: expense.employee?.name ?? null,
    name: expense.name,
    category: expense.category,
    merchant: expense.merchant,
    date: expense.date.toISOString(),
    amount: moneyWire(expense.amount, expense.currency ?? currency),
    tax: toMoneyWire(expense.tax, expense.currency ?? currency),
    policyMatch: expense.policyMatch,
    status: expense.status,
    reimbursedAt: expense.reimbursedAt?.toISOString() ?? null,
    reimbursedById: expense.reimbursedById,
    voidedAt: expense.voidedAt?.toISOString() ?? null,
    voidedById: expense.voidedById,
    voidReason: expense.voidReason,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  }
}

export async function getExpense(prisma: FinanceClient, tenantId: string, id: string): Promise<Expense> {
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
  prisma: FinanceClient,
  tenantId: string,
  employeeId: string | null | undefined,
): Promise<void> {
  if (!employeeId) return
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } })
  if (!employee) throw new AppError(400, 'Employee does not belong to this workspace')
}

async function assertProjectInTenant(prisma: FinanceClient, tenantId: string, projectId: string | null | undefined): Promise<void> {
  if (!projectId) return
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } })
  if (!project) throw new AppError(400, 'Project does not belong to this workspace')
}

export async function createExpense(
  prisma: FinanceClient,
  tenantId: string,
  input: ExpenseWriteInput,
  userId: string,
): Promise<Expense> {
  const currency = await getTenantCurrency(prisma, tenantId)
  await assertEmployeeInTenant(prisma, tenantId, input.employeeId)
  await assertProjectInTenant(prisma, tenantId, input.projectId)

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      projectId: input.projectId ?? null,
      currency,
      employeeId: input.employeeId ?? null,
      name: input.name,
      category: input.category ?? 'OTHER',
      merchant: input.merchant ?? null,
      date: dayToDate(input.date),
      amount: toStoredDecimal(input.amount, currency),
      tax: input.tax != null ? toStoredDecimal(input.tax, currency) : null,
      policyMatch: input.policyMatch ?? null,
      status: 'PENDING',
      createdById: userId,
    },
    include: { employee: { select: { name: true } } },
  })
  return mapExpense(expense, currency)
}

export async function updateExpense(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  input: ExpenseUpdateInput,
): Promise<Expense> {
  const workspaceCurrency = await getTenantCurrency(prisma, tenantId)
  if (input.employeeId !== undefined) await assertEmployeeInTenant(prisma, tenantId, input.employeeId)
  if (input.projectId !== undefined) await assertProjectInTenant(prisma, tenantId, input.projectId)
  return withDocumentLock(prisma, 'Expense', tenantId, id, async tx => {
    const existing = await tx.expense.findFirstOrThrow({ where: { id, tenantId } })
    const currency = existing.currency ?? workspaceCurrency
    if (['APPROVED', 'PROCESSING', 'REIMBURSED', 'VOID'].includes(existing.status)) throw new AppError(409, 'Approved, processing, reimbursed or void expenses cannot be edited')
    const amount = input.amount !== undefined ? new Prisma.Decimal(toStoredDecimal(input.amount, currency)) : existing.amount
    const tax = input.tax === undefined ? existing.tax : input.tax != null ? new Prisma.Decimal(toStoredDecimal(input.tax, currency)) : null
    if (tax && tax.gt(amount)) throw new AppError(400, 'Tax cannot exceed the expense amount')
    const expense = await tx.expense.update({
      where: { id, tenantId },
      data: {
        ...(input.employeeId !== undefined && { employeeId: input.employeeId }),
        ...(input.projectId !== undefined && { projectId: input.projectId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.merchant !== undefined && { merchant: input.merchant }),
        ...(input.date !== undefined && { date: dayToDate(input.date) }),
        ...(input.amount !== undefined && { amount }),
        ...(input.tax !== undefined && { tax }),
        ...(input.policyMatch !== undefined && { policyMatch: input.policyMatch }),
      },
      include: { employee: { select: { name: true } } },
    })
    return mapExpense(expense, currency)
  })
}

/** Narrow status transition — the "approve"/"flag" actions from the UI. */
export async function updateExpenseStatus(
  prisma: FinanceClient,
  tenantId: string,
  id: string,
  status: ExpenseStatus,
  userId: string,
): Promise<Expense> {
  const currency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'Expense', tenantId, id, async tx => {
    const existing = await tx.expense.findFirstOrThrow({ where: { id, tenantId } })
    assertTransition(EXPENSE_TRANSITIONS, existing.status, status)
    if (status === 'APPROVED') assertIndependentApproval(existing.createdById, userId)
    const reimbursedAt = status === 'REIMBURSED' ? new Date() : undefined
    const expense = await tx.expense.update({
      where: { id, tenantId },
      data: {
        status,
        ...(status === 'APPROVED' && { approvedById: userId, approvedAt: new Date() }),
        ...(reimbursedAt && { reimbursedAt, reimbursedById: userId }),
      },
      include: { employee: { select: { name: true } } },
    })
    if (status === 'REIMBURSED' && reimbursedAt) {
      await recordCashSettlement(tx, {
        tenantId, sourceId: expense.id, sourceType: 'EXPENSE_REIMBURSEMENT', amount: expense.amount.toString(),
        documentCurrency: expense.currency, workspaceCurrency: currency, postedAt: reimbursedAt,
        actorId: userId, description: `Expense reimbursement: ${expense.name}${expense.employee?.name ? ` · ${expense.employee.name}` : ''}`,
      })
    }
    return mapExpense(expense, currency)
  })
}

export async function deleteExpense(prisma: FinanceClient, tenantId: string, id: string): Promise<void> {
  await withDocumentLock(prisma, 'Expense', tenantId, id, async tx => {
    const existing = await tx.expense.findFirstOrThrow({ where: { id, tenantId } })
    if (!['PENDING', 'FLAGGED', 'REJECTED'].includes(existing.status)) throw new AppError(409, 'Approved or processing expenses cannot be deleted')
    await tx.expense.delete({ where: { id, tenantId } })
  })
}

export async function voidExpense(prisma: FinanceClient, tenantId: string, id: string, reason: string, actorId: string): Promise<Expense> {
  const currency = await getTenantCurrency(prisma, tenantId)
  return withDocumentLock(prisma, 'Expense', tenantId, id, async tx => {
    const existing = await tx.expense.findFirstOrThrow({ where: { id, tenantId } })
    if (existing.status === 'VOID') throw new AppError(409, 'This expense is already void')
    if (existing.status === 'REIMBURSED') {
      await reverseCashSettlement(tx, {
        tenantId, sourceId: id, sourceType: 'EXPENSE_REIMBURSEMENT', reason, actorId, postedAt: new Date(),
      })
    }
    const expense = await tx.expense.update({
      where: { id, tenantId },
      data: { status: 'VOID', voidReason: reason.trim(), voidedAt: new Date(), voidedById: actorId },
      include: { employee: { select: { name: true } } },
    })
    return mapExpense(expense, currency)
  })
}

// ── Overview ────────────────────────────────────────────────────────────────────

export function financeCashFlowPeriods(year: number, today: Date) {
  const start = new Date(Date.UTC(year, 0, 1))
  const currentYear = today.getUTCFullYear()
  const currentEnd = year < currentYear
    ? new Date(Date.UTC(year + 1, 0, 1))
    : year === currentYear
      ? new Date(today.getTime() + 86_400_000)
      : start
  const previousStart = new Date(Date.UTC(year - 1, 0, 1))
  let previousEnd: Date
  if (year < currentYear) {
    previousEnd = new Date(Date.UTC(year, 0, 1))
  } else if (year === currentYear) {
    const previousMonthLength = new Date(Date.UTC(year - 1, today.getUTCMonth() + 1, 0)).getUTCDate()
    const previousComparableDay = Math.min(today.getUTCDate(), previousMonthLength)
    previousEnd = new Date(Date.UTC(year - 1, today.getUTCMonth(), previousComparableDay + 1))
  } else {
    previousEnd = previousStart
  }
  const key = (date: Date) => date.toISOString().slice(0, 10)
  return {
    current: { startDate: key(start), endDateExclusive: key(currentEnd) },
    previous: { startDate: key(previousStart), endDateExclusive: key(previousEnd) },
  }
}

export async function getOverview(prisma: FinanceClient, tenantId: string, requestedYear?: number): Promise<FinanceOverview> {
  const [currency, timezone] = await Promise.all([
    getTenantCurrency(prisma, tenantId),
    getTenantTimezone(prisma, tenantId),
  ])
  const today = tenantToday(timezone)
  const year = requestedYear ?? today.getUTCFullYear()
  const periods = financeCashFlowPeriods(year, today)

  const [payableMap, receivableMap, expenseMap, cashFlow, cashFlowComparison, receivableAging, transactions] = await Promise.all([
    payableAggregates(prisma, tenantId),
    receivableAggregates(prisma, tenantId),
    expenseAggregates(prisma, tenantId),
    settlementCashFlow(prisma, tenantId, currency, timezone),
    settlementCashFlowComparison(prisma, tenantId, currency, timezone, periods.current.startDate, periods.current.endDateExclusive, periods.previous.startDate, periods.previous.endDateExclusive),
    computeAgingBuckets(prisma, tenantId, currency, today),
    recentSettlements(prisma, tenantId),
  ])

  const payableOutstanding = buildPayableSummary(payableMap, currency).openOutstanding
  const receivableOutstanding = receivableOpenBalance(receivableMap, currency)
  const expenseSummary = buildExpenseSummary(expenseMap, currency)

  return {
    payableOutstanding,
    receivableOutstanding,
    expensesTotal: expenseSummary.total,
    expensesPendingCount: expenseSummary.pendingCount,
    expensesPendingTotal: expenseSummary.pendingTotal,
    cashFlow,
    cashFlowComparison,
    recentTransactions: transactions,
  }
}

export function listJournals(prisma: FinanceClient, tenantId: string, query: import('@asas/contracts').JournalListQuery) {
  return listLedgerJournals(prisma, tenantId, query)
}

export function getJournal(prisma: FinanceClient, tenantId: string, id: string) {
  return getLedgerJournal(prisma, tenantId, id)
}

export function getTrialBalance(prisma: FinanceClient, tenantId: string, asOf?: string) {
  return getLedgerTrialBalance(prisma, tenantId, asOf ?? new Date().toISOString().slice(0, 10))
}

export function postOpeningBalance(tx: Prisma.TransactionClient, tenantId: string, actorId: string, input: import('@asas/contracts').OpeningBalanceWriteInput) {
  return postLedgerOpeningBalance(tx, tenantId, actorId, input)
}

/**
 * Assemble the document data for one payables invoice. The same rule as the payslip: the
 * document is built purely from the stored row — the invoice's own `amount` is the total (the
 * books' number, not a re-sum of the line items), and each line item is drawn as stored. The
 * vendor name and the tenant's name/currency come from their own rows. Money is passed as the
 * stored decimal strings; `pdf.ts` formats them.
 */
export async function getInvoiceDoc(prisma: FinanceClient, tenantId: string, invoiceId: string): Promise<InvoiceDoc> {
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
    currency: invoice.currency ?? tenant.currency,
    status: invoice.status,
    lineItems: invoice.lineItems.map(item => ({
      description: item.description,
      periodOrUsage: item.periodOrUsage,
      amount: item.amount.toString(),
    })),
    total: invoice.amount.toString(),
  }
}
