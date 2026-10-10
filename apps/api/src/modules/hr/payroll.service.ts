import { Prisma, type PrismaClient, type PayrollRun as StoredPayrollRun } from '@prisma/client'
import { createHash } from 'node:crypto'
import type {
  PayrollLine,
  PayrollLineAdjustInput,
  PayrollRun,
  PayrollRunCreateInput,
  PayrollRunListQuery,
  PayrollRunListItem,
  PayrollRunListSummary,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { computePeriodBaseSalary, validatePayrollPeriod, computePayrollLine, sumPayrollTaxRates, Money, type PayrollLineInputs, type PayrollLineResult, type TaxRate } from '@asas/domain'
import { AppError } from '../../utils/errors.js'
import { monthToDateComparisonPeriods, tenantToday } from '../../utils/dates.js'
import type { PayslipDoc } from '../../services/pdf.js'
import { payrollSettlementComparison, recordCashSettlement, reverseCashSettlement } from '../finance/ledger.service.js'

type PayrollClient = PrismaClient | Prisma.TransactionClient

/** A `PayrollLine` row joined with its employee and tax lines, straight out of Prisma. */
type LineWithIncludes = {
  id: string
  employeeId: string
  baseSalary: Prisma.Decimal | null
  sourceSalary?: Prisma.Decimal | null
  salaryBasis?: 'ANNUAL' | 'MONTHLY' | null
  eligibleDays?: number | null
  periodDays?: number | null
  missedDaysCount: number | null
  missedDaysAmount: Prisma.Decimal | null
  bonusLabel: string | null
  bonusAmount: Prisma.Decimal | null
  gross: Prisma.Decimal
  deductions: Prisma.Decimal
  net: Prisma.Decimal
  employee: { id: string; name: string; title: string }
  taxLines: { id: string; label: string; amount: Prisma.Decimal; override: boolean }[]
}

/**
 * Decode the stored `taxRates` JSON into the rate inputs `computePayrollLine` takes. A
 * malformed column is a data bug, but it surfaces as a clean `AppError` here rather than a raw
 * `JSON.parse`/type throw with a stack, so the client gets a message.
 */
function readTaxRates(raw: Prisma.JsonValue | null | undefined): TaxRate[] {
  if (!Array.isArray(raw)) throw new AppError(500, 'Payroll run has no usable tax rates')
  return (raw as { label: unknown; rate: unknown }[]).map(rate => ({
    label: String(rate.label),
    weight: String(rate.rate),
  }))
}

/**
 * Validate exact percentages in stored runs as well as new contract inputs. No float epsilon
 * may admit deductions above 100%; domain errors become actionable 400s, not opaque 500s.
 */
function assertValidTaxRates(rates: readonly TaxRate[]): void {
  try {
    sumPayrollTaxRates(rates)
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(400, error.message)
    throw error
  }
}

/**
 * `computePayrollLine` plus the invariants a stored line must satisfy: neither gross nor net
 * may be negative (e.g. missed days larger than base + bonus). Any domain `RangeError` is
 * re-thrown as a 400 so a bad input never becomes an unhandled 500.
 */
function priceLine(inputs: PayrollLineInputs, rates: readonly TaxRate[]): PayrollLineResult {
  let result: PayrollLineResult
  try {
    result = computePayrollLine(inputs, rates)
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(400, `Cannot price payroll line: ${error.message}`)
    throw error
  }
  if (result.gross.isNegative()) throw new AppError(400, 'A payroll line cannot have a negative gross amount')
  if (result.net.isNegative()) throw new AppError(400, 'A payroll line cannot have a negative net amount')
  return result
}

function mapLine(line: LineWithIncludes): PayrollLine {
  return {
    id: line.id,
    employeeId: line.employeeId,
    employee: line.employee,
    baseSalary: line.baseSalary?.toString() ?? null,
    sourceSalary: line.sourceSalary?.toString() ?? null,
    salaryBasis: line.salaryBasis ?? null,
    eligibleDays: line.eligibleDays ?? null,
    periodDays: line.periodDays ?? null,
    missedDaysCount: line.missedDaysCount,
    missedDaysAmount: line.missedDaysAmount?.toString() ?? null,
    bonusLabel: line.bonusLabel,
    bonusAmount: line.bonusAmount?.toString() ?? null,
    gross: line.gross.toString(),
    taxLines: line.taxLines.map(taxLine => ({
      id: taxLine.id,
      label: taxLine.label,
      amount: taxLine.amount.toString(),
      override: taxLine.override,
    })),
    deductions: line.deductions.toString(),
    net: line.net.toString(),
  }
}

/**
 * Read one run with its lines in the shape `payrollRunSchema` describes. Reading a run always
 * re-joins the lines (never a denormalised copy), so a run can never show a total its lines
 * don't actually sum to.
 */
function periodSnapshot(run: StoredPayrollRun) {
  return {
    periodStart: run.periodStart?.toISOString().slice(0, 10) ?? null,
    periodEnd: run.periodEnd?.toISOString().slice(0, 10) ?? null,
    payFrequency: run.payFrequency ?? null,
    periodsPerYear: run.periodsPerYear ?? null,
    salaryBasis: run.salaryBasis ?? null,
    prorationMethod: run.prorationMethod ?? null,
    currency: run.currency ?? null,
    paidAt: run.paidAt?.toISOString() ?? null,
    paidById: run.paidById ?? null,
  }
}

export async function getPayrollRun(prisma: PayrollClient, tenantId: string, runId: string): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')

  const [lines, totals] = await Promise.all([
    prisma.payrollLine.findMany({
      where: { payrollRunId: run.id, tenantId },
      orderBy: { employee: { name: 'asc' } },
      include: {
        employee: { select: { id: true, name: true, title: true } },
        taxLines: true,
      },
    }),
    prisma.payrollLine.aggregate({
      where: { payrollRunId: run.id, tenantId },
      _sum: { gross: true, deductions: true, net: true },
    }),
  ])

  const decoded = readTaxRates(run.taxRates)
  return {
    ...periodSnapshot(run),
    id: run.id,
    label: run.label,
    payDate: run.payDate ? run.payDate.toISOString().slice(0, 10) : null,
    status: run.status,
    voidedAt: run.voidedAt?.toISOString() ?? null,
    voidedById: run.voidedById,
    voidReason: run.voidReason,
    taxRates: decoded.map(rate => ({ label: rate.label, rate: String(rate.weight) })),
    lines: lines.map(mapLine),
    totals: {
      gross: totals._sum.gross?.toString() ?? '0',
      deductions: totals._sum.deductions?.toString() ?? '0',
      net: totals._sum.net?.toString() ?? '0',
    },
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

/**
 * Create a payroll run and price every line in a single transaction.
 *
 * The whole run is one `prisma.$transaction` so a failure mid-run (one employee deleted
 * concurrently, a salary missing) leaves no half-run behind — either every line is priced
 * and the run is PENDING, or nothing is. Each line is computed with `computePayrollLine`,
 * the one place gross → tax split → deductions → net is derived, so the run, its API
 * response, and the payslip PDF can never disagree about a number.
 */
export async function createPayrollRun(
  prisma: PayrollClient,
  tenantId: string,
  input: PayrollRunCreateInput,
): Promise<PayrollRun & { creationReplayed: boolean }> {
  if ('$transaction' in prisma) {
    return prisma.$transaction(tx => createPayrollRun(tx, tenantId, input), { maxWait: 5000 })
  }
  let periodInfo: ReturnType<typeof validatePayrollPeriod>
  try { periodInfo = validatePayrollPeriod(input) } catch (error) {
    throw new AppError(400, error instanceof Error ? error.message : 'Invalid earning period')
  }
  const currency = await (async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
    if (!tenant) throw new AppError(404, 'Tenant not found')
    return tenant.currency
  })()

  const employeeIds = [...new Set(input.employeeIds)].sort()
  // Serialize competing runs for shared employees, including retries; ordered locks avoid deadlocks.
  await prisma.$queryRaw`
    SELECT "id" FROM "Employee"
    WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(employeeIds)})
    ORDER BY "id" FOR UPDATE
  `
  const requestHash = createHash('sha256').update(JSON.stringify({ label: input.label, payDate: input.payDate ?? null, periodStart: input.periodStart, periodEnd: input.periodEnd, payFrequency: input.payFrequency, periodsPerYear: periodInfo.periodsPerYear, salaryBasis: input.salaryBasis, taxRates: input.taxRates, employeeIds })).digest('hex')
  const replay = await prisma.payrollRun.findFirst({ where: { tenantId, requestKey: input.requestKey } })
  if (replay) {
    if (replay.requestHash !== requestHash) throw new AppError(409, 'This request key was already used for a different payroll request')
    return { ...await getPayrollRun(prisma, tenantId, replay.id), creationReplayed: true }
  }
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, tenantId, status: { not: 'ARCHIVED' } },
    select: { id: true, name: true, salary: true, salaryBasis: true, hiredAt: true, currency: true },
  })

  // Reject any id the tenant does not own — tenant isolation for the run's inputs.
  const knownIds = new Set(employees.map(employee => employee.id))
  const unknown = employeeIds.filter(id => !knownIds.has(id))
  if (unknown.length > 0) throw new AppError(400, `Unknown, archived or cross-tenant employees: ${unknown.join(', ')}`)

  const differentCurrency = employees.filter(employee => employee.currency != null && employee.currency !== currency)
  if (differentCurrency.length > 0) throw new AppError(409, 'Selected salaries use a different currency; an explicit FX conversion is required before payroll can be priced')
  const missingSalary = employees.filter(employee => employee.salary === null).map(employee => employee.name)
  if (missingSalary.length > 0) {
    throw new AppError(
      400,
      `Cannot price a line without a base salary; set one first for: ${missingSalary.join(', ')}`,
    )
  }

  const rates: TaxRate[] = input.taxRates.map(rate => ({ label: rate.label, weight: rate.rate }))
  assertValidTaxRates(rates)

  const overlapping = await prisma.payrollLine.count({
    where: {
      tenantId, employeeId: { in: employeeIds },
      payrollRun: { tenantId, periodStart: { lte: new Date(input.periodEnd) }, periodEnd: { gte: new Date(input.periodStart) }, status: { in: ['DRAFT', 'PENDING', 'APPROVED', 'PAID'] } },
    },
  })
  if (overlapping) throw new AppError(409, 'Selected employees already have payroll covering this earning period; review or adjust the existing run')
  const run = await prisma.payrollRun.create({
    data: {
      tenantId,
      label: input.label,
      payDate: input.payDate ? new Date(input.payDate) : null,
      periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd),
      payFrequency: input.payFrequency, periodsPerYear: periodInfo.periodsPerYear,
      salaryBasis: input.salaryBasis, prorationMethod: 'CALENDAR_DAYS', currency,
      requestKey: input.requestKey, requestHash,
      status: 'PENDING',
      taxRates: input.taxRates,
    },
  })

  for (const employee of employees) {
    const salaryBasis = employee.salaryBasis ?? input.salaryBasis
    let periodPay: ReturnType<typeof computePeriodBaseSalary>
    try {
      periodPay = computePeriodBaseSalary(Money.fromDecimal(String(employee.salary), currency, 'HALF_UP'), salaryBasis, input, employee.hiredAt?.toISOString().slice(0, 10))
    } catch (error) {
      throw new AppError(400, error instanceof Error ? error.message : 'Cannot calculate period salary')
    }
    const { baseSalary, eligibleDays, periodDays } = periodPay
    const result = priceLine({ baseSalary }, rates)
    await prisma.payrollLine.create({
      data: {
        tenantId,
        payrollRunId: run.id,
        employeeId: employee.id,
        baseSalary: baseSalary.toDecimalString(),
        sourceSalary: employee.salary, salaryBasis, eligibleDays, periodDays,
        gross: result.gross.toDecimalString(),
        deductions: result.deductions.toDecimalString(),
        net: result.net.toDecimalString(),
        taxLines: {
          create: result.taxLines.map(taxLine => ({
            label: taxLine.label,
            amount: taxLine.amount.toDecimalString(),
          })),
        },
      },
    })
  }
  return { ...await getPayrollRun(prisma, tenantId, run.id), creationReplayed: false }
}

/**
 * List a tenant's payroll runs with a SQL-computed summary over the *whole* history (not the
 * page). `totalGross`/`totalNet` aggregate every line in the tenant, so the KPI cards stay
 * correct while the run list is paginated.
 */
export async function listPayrollRuns(
  prisma: PrismaClient,
  tenantId: string,
  query: PayrollRunListQuery,
): Promise<{ items: PayrollRunListItem[]; pagination: ReturnType<typeof buildPaginationMeta>; summary: PayrollRunListSummary }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true, timezone: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const periods = monthToDateComparisonPeriods(tenantToday(tenant.timezone))
  const currentStartDate = periods.current.startDate
  const currentEndDateExclusive = periods.current.endDateExclusive
  const previousStartDate = periods.previous.startDate
  const previousEndDateExclusive = periods.previous.endDateExclusive
  const where = query.status ? { tenantId, status: query.status } : { tenantId }
  const { skip, take } = toPrismaPage(query)

  const [runs, total, pendingCount, totals, paidThisMonth] = await Promise.all([
    prisma.payrollRun.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
    }),
    prisma.payrollRun.count({ where }),
    prisma.payrollRun.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.payrollLine.aggregate({
      where: { tenantId, payrollRun: { status: { not: 'VOID' } } },
      _sum: { gross: true, net: true },
      _count: { _all: true },
    }),
    payrollSettlementComparison(
      prisma, tenantId, tenant.currency, tenant.timezone,
      currentStartDate, currentEndDateExclusive, previousStartDate, previousEndDateExclusive,
    ),
  ])

  const items: PayrollRunListItem[] = runs.map(run => ({
    ...periodSnapshot(run),
    id: run.id,
    label: run.label,
    payDate: run.payDate ? run.payDate.toISOString().slice(0, 10) : null,
    status: run.status,
    lineCount: run._count.lines,
    createdAt: run.createdAt.toISOString(),
  }))

  return {
    items,
    pagination: buildPaginationMeta(query, total),
    summary: {
      totalRuns: total,
      pendingCount,
      lineCount: totals._count._all,
      totalGross: totals._sum.gross ? totals._sum.gross.toString() : '0',
      totalNet: totals._sum.net ? totals._sum.net.toString() : '0',
      paidThisMonthTotal: paidThisMonth.currentTotal,
      paidThisMonthComparison: {
        previousStartDate,
        previousEndDateExclusive,
        previousTotal: paidThisMonth.previousTotal,
      },
    },
  }
}

/**
 * Approve a run. Only a PENDING run can be approved (idempotency: an already-approved run is
 * 409, not a silent no-op, so a double-approval is loud). The approver's identity is recorded
 * by the *route* in the append-only audit log — the service does not take a user id, which
 * keeps it from being called outside an authenticated request.
 */
export async function approvePayrollRun(prisma: PayrollClient, tenantId: string, runId: string): Promise<PayrollRun> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => approvePayrollRun(tx, tenantId, runId))
  // Conditional write: the status check and the transition are one statement, so two
  // concurrent approvals cannot both succeed (the loser matches zero rows).
  const { count } = await prisma.payrollRun.updateMany({
    where: { id: runId, tenantId, status: 'PENDING' },
    data: { status: 'APPROVED' },
  })
  if (count === 0) {
    const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
    if (!run) throw new AppError(404, 'Payroll run not found')
    throw new AppError(409, `A ${run.status.toLowerCase()} run cannot be approved`)
  }
  return getPayrollRun(prisma, tenantId, runId)
}

/** Mark an approved payroll run as manually paid and post its net cash settlement atomically. */
export async function payPayrollRun(prisma: PayrollClient, tenantId: string, runId: string, actorId: string): Promise<PayrollRun> {
  if ('$transaction' in prisma) {
    return prisma.$transaction(tx => payPayrollRun(tx, tenantId, runId, actorId), { maxWait: 5000 })
  }
  const locked = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PayrollRun" WHERE "id" = ${runId} AND "tenantId" = ${tenantId} FOR UPDATE
  `
  if (!locked.length) throw new AppError(404, 'Payroll run not found')
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')
  if (run.status !== 'APPROVED') throw new AppError(409, `A ${run.status.toLowerCase()} run cannot be paid`)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const currency = run.currency ?? tenant.currency
  const totals = await prisma.payrollLine.aggregate({ where: { payrollRunId: runId, tenantId }, _sum: { net: true } })
  const amount = totals._sum.net?.toString() ?? '0'
  const paidAt = new Date()
  const updated = await prisma.payrollRun.updateMany({
    where: { id: runId, tenantId, status: 'APPROVED' },
    data: { status: 'PAID', paidAt, paidById: actorId },
  })
  if (updated.count !== 1) throw new AppError(409, 'The payroll run changed while payment was being recorded')
  await recordCashSettlement(prisma, {
    tenantId, sourceId: runId, sourceType: 'PAYROLL_PAYMENT', amount,
    documentCurrency: run.currency, workspaceCurrency: tenant.currency,
    postedAt: paidAt, actorId, description: `Payroll payment · ${run.label}`,
  })
  return getPayrollRun(prisma, tenantId, runId)
}

/** Void a payroll run; paid runs require an exact reversal before the terminal state is set. */
export async function voidPayrollRun(prisma: PayrollClient, tenantId: string, runId: string, reason: string, actorId: string): Promise<PayrollRun> {
  if ('$transaction' in prisma) {
    return prisma.$transaction(tx => voidPayrollRun(tx, tenantId, runId, reason, actorId), { maxWait: 5000 })
  }
  const locked = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PayrollRun" WHERE "id" = ${runId} AND "tenantId" = ${tenantId} FOR UPDATE
  `
  if (!locked.length) throw new AppError(404, 'Payroll run not found')
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')
  if (run.status === 'VOID') throw new AppError(409, 'This payroll run is already void')
  if (run.status === 'PAID') {
    await reverseCashSettlement(prisma, {
      tenantId, sourceId: runId, sourceType: 'PAYROLL_PAYMENT', reason, actorId, postedAt: new Date(),
    })
  }
  const changed = await prisma.payrollRun.updateMany({
    where: { id: runId, tenantId, status: run.status },
    data: { status: 'VOID', voidReason: reason.trim(), voidedAt: new Date(), voidedById: actorId },
  })
  if (changed.count !== 1) throw new AppError(409, 'The payroll run changed while it was being voided')
  return getPayrollRun(prisma, tenantId, runId)
}

/**
 * Assemble the document data for one payslip (one line of one run). This is the single place
 * that turns the *stored* run/line into the plain strings `renderPayslipPdf` draws — so the
 * PDF, the run's API response, and the domain math can never disagree: every number here is a
 * value the database already holds (the run's label/pay date, the line's priced money, its tax
 * split), never a re-derivation. Money is passed as the stored decimal strings; `pdf.ts`
 * formats them for display.
 *
 * The `rate` on each tax line is recovered from the run's stored `taxRates` (the split's
 * source), keyed by label, so the payslip shows *why* each deduction is its size. A label that
 * isn't in the run's rates (a manual/override line) gets no rate — absence, not a guess.
 */
export async function getPayslipDoc(
  prisma: PrismaClient,
  tenantId: string,
  runId: string,
  lineId: string,
): Promise<PayslipDoc> {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')

  const line = await prisma.payrollLine.findFirst({
    where: { id: lineId, payrollRunId: run.id, tenantId },
    include: {
      employee: { select: { name: true, title: true } },
      taxLines: true,
    },
  })
  if (!line) throw new AppError(404, 'Payroll line not found')

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')

  const rateByLabel = new Map(readTaxRates(run.taxRates).map(rate => [rate.label, rate.weight]))

  return {
    tenantName: tenant.name,
    runLabel: run.label,
    payDate: run.payDate ? run.payDate.toISOString().slice(0, 10) : null,
    status: run.status,
    currency: run.currency ?? tenant.currency,
    periodStart: run.periodStart?.toISOString().slice(0, 10) ?? null,
    periodEnd: run.periodEnd?.toISOString().slice(0, 10) ?? null,
    employeeName: line.employee.name,
    employeeTitle: line.employee.title,
    baseSalary: line.baseSalary?.toString() ?? null,
    bonusLabel: line.bonusLabel,
    bonusAmount: line.bonusAmount?.toString() ?? null,
    missedDaysCount: line.missedDaysCount,
    missedDaysAmount: line.missedDaysAmount?.toString() ?? null,
    gross: line.gross.toString(),
    taxLines: line.taxLines.map(taxLine => {
      const rate = rateByLabel.get(taxLine.label)
      return rate != null
        ? { label: taxLine.label, amount: taxLine.amount.toString(), rate: String(rate) }
        : { label: taxLine.label, amount: taxLine.amount.toString() }
    }),
    deductions: line.deductions.toString(),
    net: line.net.toString(),
  }
}

/**
 * Adjust one line's *inputs* (base, missed days, bonus) and recompute the money. The line's
 * stored tax rates come from the parent run, so the recomputation uses exactly the same rules
 * that priced the rest of the run. An APPROVED run rejects adjustments — pay the run, then
 * make a correction run; silently editing a run that has already been paid would rewrite the
 * books after the fact.
 */
export async function adjustPayrollLine(
  prisma: PayrollClient,
  tenantId: string,
  runId: string,
  lineId: string,
  input: PayrollLineAdjustInput,
): Promise<PayrollRun> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => adjustPayrollLine(tx, tenantId, runId, lineId, input))
  const lockedRuns = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PayrollRun" WHERE "id" = ${runId} AND "tenantId" = ${tenantId} FOR UPDATE
  `
  if (lockedRuns.length === 0) throw new AppError(404, 'Payroll run not found')
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')
  if (run.status === 'APPROVED' || run.status === 'PAID') {
    throw new AppError(409, 'An approved or paid run cannot be adjusted — make a correction run')
  }

  const line = await prisma.payrollLine.findFirst({
    where: { id: lineId, payrollRunId: run.id, tenantId },
  })
  if (!line) throw new AppError(404, 'Payroll line not found')

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const currency = run.currency ?? tenant.currency
  const rates = readTaxRates(run.taxRates)
  assertValidTaxRates(rates)

  // Merge the incoming adjustments over the stored line, then recompute from inputs.
  const nextBase =
    input.baseSalary !== undefined ? input.baseSalary : line.baseSalary?.toString() ?? null
  if (nextBase === null) {
    throw new AppError(400, 'A payroll line needs a base salary to recompute')
  }
  const baseSalary = Money.fromDecimal(nextBase, currency, 'HALF_UP')
  const missedDaysAmount =
    input.missedDaysAmount !== undefined
      ? input.missedDaysAmount
        ? Money.fromDecimal(input.missedDaysAmount, currency, 'HALF_UP')
        : undefined
      : line.missedDaysAmount !== null
        ? Money.fromDecimal(line.missedDaysAmount.toString(), currency, 'HALF_UP')
        : undefined
  const bonusAmount =
    input.bonusAmount !== undefined
      ? input.bonusAmount
        ? Money.fromDecimal(input.bonusAmount, currency, 'HALF_UP')
        : undefined
      : line.bonusAmount !== null
        ? Money.fromDecimal(line.bonusAmount.toString(), currency, 'HALF_UP')
        : undefined
  const missedDaysCount = input.missedDaysCount !== undefined ? input.missedDaysCount : line.missedDaysCount
  const bonusLabel = input.bonusLabel !== undefined ? input.bonusLabel : line.bonusLabel

  const result = priceLine(
    { baseSalary, ...(missedDaysAmount && { missedDaysAmount }), ...(bonusAmount && { bonusAmount }) },
    rates,
  )

  // Keep the conditional guard as well as the lock; the response and audit share this transaction.
  const { count } = await prisma.payrollRun.updateMany({
    where: { id: run.id, tenantId, status: { in: ['DRAFT', 'PENDING'] } },
    data: { updatedAt: new Date() },
  })
  if (count === 0) {
    throw new AppError(409, 'An approved or paid run cannot be adjusted — make a correction run')
  }
  await prisma.payrollLine.update({
    where: { id: line.id },
    data: {
      baseSalary: baseSalary.toDecimalString(),
      missedDaysCount,
      missedDaysAmount: missedDaysAmount ? missedDaysAmount.toDecimalString() : null,
      bonusLabel,
      bonusAmount: bonusAmount ? bonusAmount.toDecimalString() : null,
      gross: result.gross.toDecimalString(),
      deductions: result.deductions.toDecimalString(),
      net: result.net.toDecimalString(),
    },
  })
  // Replace the tax split: delete the old lines, write the freshly computed ones. The run's
  // stored rates are the single source, so this cannot drift from the other lines.
  await prisma.payrollTaxLine.deleteMany({ where: { payrollLineId: line.id } })
  await prisma.payrollTaxLine.createMany({
    data: result.taxLines.map(taxLine => ({
      payrollLineId: line.id,
      label: taxLine.label,
      amount: taxLine.amount.toDecimalString(),
    })),
  })

  return getPayrollRun(prisma, tenantId, run.id)
}
