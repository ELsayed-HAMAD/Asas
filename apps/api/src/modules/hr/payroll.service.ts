import type { Prisma, PrismaClient } from '@prisma/client'
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
import { computePayrollLine, Money, type TaxRate } from '@asas/domain'
import { AppError } from '../../utils/errors.js'
import type { PayslipDoc } from '../../services/pdf.js'

/** A `PayrollLine` row joined with its employee and tax lines, straight out of Prisma. */
type LineWithIncludes = {
  id: string
  employeeId: string
  baseSalary: Prisma.Decimal | null
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

function mapLine(line: LineWithIncludes): PayrollLine {
  return {
    id: line.id,
    employeeId: line.employeeId,
    employee: line.employee,
    baseSalary: line.baseSalary?.toString() ?? null,
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
export async function getPayrollRun(prisma: PrismaClient, tenantId: string, runId: string): Promise<PayrollRun> {
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
    id: run.id,
    label: run.label,
    payDate: run.payDate ? run.payDate.toISOString().slice(0, 10) : null,
    status: run.status,
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
  prisma: PrismaClient,
  tenantId: string,
  input: PayrollRunCreateInput,
): Promise<PayrollRun> {
  const currency = await (async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
    if (!tenant) throw new AppError(404, 'Tenant not found')
    return tenant.currency
  })()

  const employeeIds = [...new Set(input.employeeIds)]
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, tenantId },
    select: { id: true, name: true, salary: true },
  })

  // Reject any id the tenant does not own — tenant isolation for the run's inputs.
  const knownIds = new Set(employees.map(employee => employee.id))
  const unknown = employeeIds.filter(id => !knownIds.has(id))
  if (unknown.length > 0) throw new AppError(400, `Unknown or cross-tenant employees: ${unknown.join(', ')}`)

  const missingSalary = employees.filter(employee => employee.salary === null).map(employee => employee.name)
  if (missingSalary.length > 0) {
    throw new AppError(
      400,
      `Cannot price a line without a base salary; set one first for: ${missingSalary.join(', ')}`,
    )
  }

  const rates: TaxRate[] = input.taxRates.map(rate => ({ label: rate.label, weight: rate.rate }))

  const created = await prisma.$transaction(
    async tx => {
      const run = await tx.payrollRun.create({
        data: {
          tenantId,
          label: input.label,
          payDate: input.payDate ? new Date(input.payDate) : null,
          status: 'PENDING',
          taxRates: input.taxRates,
        },
      })

      for (const employee of employees) {
        const baseSalary = Money.fromDecimal(String(employee.salary), currency, 'HALF_UP')
        const result = computePayrollLine({ baseSalary }, rates)
        await tx.payrollLine.create({
          data: {
            tenantId,
            payrollRunId: run.id,
            employeeId: employee.id,
            baseSalary: baseSalary.toDecimalString(),
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
      return run
    },
    { maxWait: 5000 },
  )

  return getPayrollRun(prisma, tenantId, created.id)
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
  const where = query.status ? { tenantId, status: query.status } : { tenantId }
  const { skip, take } = toPrismaPage(query)

  const [runs, total, pendingCount, totals] = await Promise.all([
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
      where: { tenantId },
      _sum: { gross: true, net: true },
      _count: { _all: true },
    }),
  ])

  const items: PayrollRunListItem[] = runs.map(run => ({
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
    },
  }
}

/**
 * Approve a run. Only a PENDING run can be approved (idempotency: an already-approved run is
 * 409, not a silent no-op, so a double-approval is loud). The approver's identity is recorded
 * by the *route* in the append-only audit log — the service does not take a user id, which
 * keeps it from being called outside an authenticated request.
 */
export async function approvePayrollRun(prisma: PrismaClient, tenantId: string, runId: string): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')
  if (run.status !== 'PENDING') {
    throw new AppError(409, `A ${run.status.toLowerCase()} run cannot be approved`)
  }

  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'APPROVED' } })
  return getPayrollRun(prisma, tenantId, run.id)
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
    currency: tenant.currency,
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
  prisma: PrismaClient,
  tenantId: string,
  runId: string,
  lineId: string,
  input: PayrollLineAdjustInput,
): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')
  if (run.status === 'APPROVED' || run.status === 'PAID') {
    throw new AppError(409, 'An approved or paid run cannot be adjusted — make a correction run')
  }

  const line = await prisma.payrollLine.findFirst({
    where: { id: lineId, payrollRunId: run.id, tenantId },
  })
  if (!line) throw new AppError(404, 'Payroll line not found')

  const currency = (await prisma.tenant.findUnique({ where: { id: tenantId } }))?.currency ?? 'USD'
  const rates = readTaxRates(run.taxRates)

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

  const result = computePayrollLine(
    { baseSalary, ...(missedDaysAmount && { missedDaysAmount }), ...(bonusAmount && { bonusAmount }) },
    rates,
  )

  await prisma.$transaction(async tx => {
    await tx.payrollLine.update({
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
    await tx.payrollTaxLine.deleteMany({ where: { payrollLineId: line.id } })
    await tx.payrollTaxLine.createMany({
      data: result.taxLines.map(taxLine => ({
        payrollLineId: line.id,
        label: taxLine.label,
        amount: taxLine.amount.toDecimalString(),
      })),
    })
  })

  return getPayrollRun(prisma, tenantId, run.id)
}
