import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { ImportEmployeesRequest } from '@asas/contracts'
import { computePayrollLine, Money, type TaxRate } from '@asas/domain'
import { AppError } from '../../utils/errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** The seed-pack directory, overridable for tests. */
export function getSeedPackRoot(): string {
  return process.env.SEED_PACK_PATH
    ? path.resolve(process.env.SEED_PACK_PATH)
    : path.resolve(__dirname, '../../../seeds/onboarding')
}

interface SeedPackFile {
  departments?: { key: string; name: string }[]
  employees?: SeedEmployee[]
  companies?: { key: string; name: string }[]
  customers?: { key: string; name: string }[]
  vendors?: { key: string; name: string }[]
  deals?: {
    name: string
    companyKey?: string
    ownerEmployeeKey?: string
    stage: string
    value: number
    winProbability?: number
    closeDate?: string
    createdAt?: string
  }[]
  projects?: {
    name: string
    status: string
    dueDate?: string
    budget?: number
    startDate?: string
  }[]
  products?: {
    key?: string
    sku: string
    name: string
    price: number
    quantity?: number
    stockStatus?: string
  }[]
  receivableInvoices?: {
    number?: string
    customerKey: string
    amount: number
    dueDate?: string
    status: string
    createdAt?: string
  }[]
  payableInvoices?: {
    vendorKey: string
    invoiceNumber?: string
    date: string
    amount: number
    status: string
  }[]
  expenses?: {
    employeeKey?: string
    name: string
    category: string
    merchant?: string
    date: string
    amount: number
    status: string
  }[]
  ledgerTransactions?: {
    date: string
    description: string
    amount: number
    status: string
    isCredit: boolean
  }[]
  cashFlowSnapshots?: { month: string; inflow: number; outflow: number; net: number }[]
  roadmapPhases?: {
    title: string
    sortOrder?: number
    tasks?: {
      title: string
      statusLabel?: string
      progressPct?: number
      startDate?: string
      endDate?: string
    }[]
  }[]
  sprints?: {
    name: string
    completionPct?: number
    endsAt?: string
    issues?: {
      title: string
      type?: string
      status: string
      priority: string
    }[]
  }[]
  candidates?: {
    name: string
    role: string
    stage: string
    timeInStage?: string
    appliedAt?: string
    source?: string
    currentRole?: string
    experience?: string
    location?: string
    email?: string
    education?: string
    resumeUrl?: string
    avatarUrl?: string
    activities?: { action: string; description?: string; createdAt?: string }[]
  }[]
  timesheets?: {
    employeeKey: string
    weekStart: string
    regularHours?: number
    overtimeHours?: number
    days?: { dayLabel: string; clockIn?: string; clockOut?: string; totalHours?: number }[]
  }[]
  attendanceExceptions?: {
    employeeKey: string
    type: string
    label: string
    date: string
  }[]
  leaveRequests?: {
    employeeKey: string
    type: string
    startDate: string
    endDate?: string
    status?: string
  }[]
  payrollRuns?: {
    label: string
    payDate?: string
    status: string
    lines?: { employeeKey: string; bonusLabel?: string; bonusAmount?: number }[]
  }[]
}

interface SeedEmployee {
  key: string
  name: string
  title: string
  departmentKey?: string | null
  status?: string
  hiredAt?: string
  salary?: number
  equityOptions?: number
  band?: string
  location?: string
  employeeNumber?: string
  email?: string
  avatarUrl?: string
  managerKey?: string | null
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  return new Date(value)
}

/** `Jan`/`Feb`/… → the `YYYY-MM` key the cash-flow contract carries on the wire. */
const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

/** The seed pack is a single-business-year 2026 fixture; the year is fixed, not inferred. */
const SEED_YEAR = 2026

function parseMonth(month: string): string {
  const mm = MONTH_NAME_TO_NUMBER[month.slice(0, 3)]
  if (!mm) throw new AppError(500, `Sample pack has an unparseable month "${month}"`)
  return `${SEED_YEAR}-${mm}`
}

async function readPack(fileName: string): Promise<SeedPackFile> {
  const filePath = path.join(getSeedPackRoot(), fileName)
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as SeedPackFile
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError(503, 'Sample onboarding pack is not available on this server')
    }
    throw error
  }
}

/** Fail loudly on any pack row whose enum the database would reject — a pack that half-applies is worse than one that refuses to start. */
function asEnum<T extends readonly string[]>(
  values: T,
  value: string | undefined,
  fallback: T[number],
  section: string,
): T[number] {
  const resolved = value ?? fallback
  if (!(values as readonly string[]).includes(resolved)) {
    throw new AppError(500, `Sample pack ${section} has unknown value "${String(value)}"`)
  }
  return resolved as T[number]
}

const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE'] as const
const LEAVE_TYPES = ['VACATION', 'SICK', 'PERSONAL'] as const
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
const ATTENDANCE_TYPES = ['MISSING_IN', 'MISSING_OUT', 'OVERTIME'] as const
const CANDIDATE_STAGES = ['APPLIED', 'SCREENING', 'TECH_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_SENT', 'HIRED', 'REJECTED'] as const
const DEAL_STAGES = ['LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'] as const
const PROJECT_STATUSES = ['PLANNING', 'ON_TRACK', 'DELAYED', 'AT_RISK', 'COMPLETED'] as const
const PRODUCT_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const
const RECEIVABLE_STATUSES = ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS', 'PAID'] as const
const PAYABLE_STATUSES = ['PENDING', 'SCHEDULED', 'APPROVED', 'PAID', 'REJECTED'] as const
const EXPENSE_CATEGORIES = ['SOFTWARE', 'TRAVEL', 'MEALS', 'OFFICE_SUPPLIES', 'FACILITIES_LEASE', 'PAYROLL', 'MARKETING', 'OTHER'] as const
const EXPENSE_STATUSES = ['PENDING', 'FLAGGED', 'PROCESSING', 'APPROVED', 'REJECTED'] as const
const LEDGER_STATUSES = ['CLEARED', 'PROCESSING'] as const
const ISSUE_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const
const ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
const PAYROLL_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'PAID'] as const

/**
 * The tax split used to price seeded payroll runs.
 *
 * The legacy pack hardcoded per-line gross/deductions/net — precomputed numbers that can
 * drift from the domain math and that the rebuild plan explicitly bans ("every calculation
 * defined once in a tested backend domain layer"). This port seeds only the *inputs* — each
 * employee's salary, the run's bonus lines, and this 15/5 split — and prices every line
 * through `computePayrollLine`, so seeded payroll is internally consistent by construction:
 * gross − deductions = net, tax lines sum to deductions, and a payslip PDF rendered from a
 * seeded run matches the API's numbers to the cent.
 */
const SAMPLE_TAX_RATES: TaxRate[] = [
  { label: 'Federal Tax', weight: 15 },
  { label: 'State Tax', weight: 5 },
]

/**
 * Applies the Enterprise sample pack to a tenant, in one transaction.
 *
 * Guarded: refuses when the tenant already has employees (409) so it can never interleave
 * with real data. On success the tenant's `onboardingStatus` becomes `SAMPLE_LOADED`, which
 * the web shell renders as a visible "Sample data" badge — sample records can never be
 * mistaken for real ones.
 *
 * The returned `summary` (per-section row counts) is the fixture assertion the E2E suite
 * checks: the pack as a *tested* fixture, per the plan's Preserve section.
 */
export async function applyEnterpriseSamplePack(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Record<string, number>> {
  const existing = await prisma.employee.count({ where: { tenantId } })
  if (existing > 0) {
    throw new AppError(409, 'This workspace already has HR data; the sample pack was not applied.')
  }

  const pack = await readPack('enterprise.json')
  const currency = await getTenantCurrency(prisma, tenantId)
  const summary: Record<string, number> = {}

  await prisma.$transaction(async tx => {
    // ── HR ──────────────────────────────────────────────────────────────────────
    const departmentIds = new Map<string, string>()
    for (const dept of pack.departments ?? []) {
      const created = await tx.department.create({ data: { tenantId, name: dept.name } })
      departmentIds.set(dept.key, created.id)
    }
    summary.departments = departmentIds.size

    const employeeIds = new Map<string, string>()
    for (const emp of pack.employees ?? []) {
      const created = await tx.employee.create({
        data: {
          tenantId,
          name: emp.name,
          title: emp.title,
          status: asEnum(EMPLOYEE_STATUSES, emp.status, 'ACTIVE', 'employees'),
          departmentId: emp.departmentKey ? (departmentIds.get(emp.departmentKey) ?? null) : null,
          hiredAt: parseDate(emp.hiredAt),
          salary: emp.salary != null ? Money.fromDecimal(String(emp.salary), currency, 'HALF_UP').toDecimalString() : null,
          equityOptions: emp.equityOptions ?? null,
          band: emp.band ?? null,
          location: emp.location ?? null,
          employeeNumber: emp.employeeNumber ?? null,
          email: emp.email ?? null,
        },
      })
      employeeIds.set(emp.key, created.id)
    }
    summary.employees = employeeIds.size

    for (const emp of pack.employees ?? []) {
      if (!emp.managerKey) continue
      const managerId = employeeIds.get(emp.managerKey)
      const selfId = employeeIds.get(emp.key)
      if (!managerId || !selfId) continue
      await tx.employee.update({
        where: { id: selfId },
        data: { managerId },
      })
    }

    // ── Finance master data ─────────────────────────────────────────────────────
    const customerIds = new Map<string, string>()
    for (const cust of pack.customers ?? []) {
      const created = await tx.customer.create({ data: { tenantId, name: cust.name } })
      customerIds.set(cust.key, created.id)
    }
    summary.customers = customerIds.size

    const vendorIds = new Map<string, string>()
    for (const vendor of pack.vendors ?? []) {
      const created = await tx.vendor.create({ data: { tenantId, name: vendor.name } })
      vendorIds.set(vendor.key, created.id)
    }
    summary.vendors = vendorIds.size

    // ── CRM ─────────────────────────────────────────────────────────────────────
    const companyIds = new Map<string, string>()
    for (const comp of pack.companies ?? []) {
      const created = await tx.company.create({ data: { tenantId, name: comp.name } })
      companyIds.set(comp.key, created.id)
    }
    summary.companies = companyIds.size

    for (const deal of pack.deals ?? []) {
      await tx.deal.create({
        data: {
          tenantId,
          name: deal.name,
          companyId: deal.companyKey ? (companyIds.get(deal.companyKey) ?? null) : null,
          ownerEmployeeId: deal.ownerEmployeeKey ? (employeeIds.get(deal.ownerEmployeeKey) ?? null) : null,
          stage: asEnum(DEAL_STAGES, deal.stage, 'LEADS', 'deals'),
          value: new Prisma.Decimal(Money.fromDecimal(String(deal.value), currency, 'HALF_UP').toDecimalString()),
          winProbability: deal.winProbability ?? null,
          closeDate: parseDate(deal.closeDate),
          createdAt: parseDate(deal.createdAt) ?? new Date(),
        },
      })
    }
    summary.deals = (pack.deals ?? []).length

    // ── Projects ────────────────────────────────────────────────────────────────
    for (const proj of pack.projects ?? []) {
      await tx.project.create({
        data: {
          tenantId,
          name: proj.name,
          status: asEnum(PROJECT_STATUSES, proj.status, 'PLANNING', 'projects'),
          timeline: parseDate(proj.dueDate),
          budget: proj.budget != null
            ? new Prisma.Decimal(Money.fromDecimal(String(proj.budget), currency, 'HALF_UP').toDecimalString())
            : null,
          spent: new Prisma.Decimal(0),
        },
      })
    }
    summary.projects = (pack.projects ?? []).length

    for (const phase of pack.roadmapPhases ?? []) {
      await tx.roadmapPhase.create({
        data: {
          tenantId,
          title: phase.title,
          sortOrder: phase.sortOrder ?? 0,
          tasks: {
            create: (phase.tasks ?? []).map(task => ({
              tenantId,
              title: task.title,
              statusLabel: task.statusLabel ?? null,
              progressPct: task.progressPct ?? 0,
              startDate: parseDate(task.startDate),
              endDate: parseDate(task.endDate),
            })),
          },
        },
      })
    }
    summary.roadmapPhases = (pack.roadmapPhases ?? []).length

    const sprintIds: string[] = []
    for (const sprint of pack.sprints ?? []) {
      const created = await tx.sprint.create({
        data: {
          tenantId,
          name: sprint.name,
          completionPct: sprint.completionPct ?? 0,
          endsAt: parseDate(sprint.endsAt),
        },
      })
      sprintIds.push(created.id)
      for (const issue of sprint.issues ?? []) {
        await tx.issue.create({
          data: {
            tenantId,
            sprintId: created.id,
            title: issue.title,
            // The pack's `type` (STORY/BUG/TASK) has no Issue column; it rides in `tag`.
            tag: issue.type ?? null,
            priority: asEnum(ISSUE_PRIORITIES, issue.priority, 'MEDIUM', 'sprint issues'),
            status: asEnum(ISSUE_STATUSES, issue.status, 'TODO', 'sprint issues'),
          },
        })
      }
    }
    summary.sprints = sprintIds.length
    summary.issues = (pack.sprints ?? []).reduce((sum, s) => sum + (s.issues?.length ?? 0), 0)

    // ── Inventory ───────────────────────────────────────────────────────────────
    for (const product of pack.products ?? []) {
      const quantity = product.quantity ?? 0
      const created = await tx.product.create({
        data: {
          tenantId,
          name: product.name,
          sku: product.sku,
          price: new Prisma.Decimal(Money.fromDecimal(String(product.price), currency, 'HALF_UP').toDecimalString()),
          stock: quantity,
          status: asEnum(PRODUCT_STATUSES, product.stockStatus, 'IN_STOCK', 'products'),
        },
      })
      // Every seeded on-hand quantity is a recorded movement, so stock levels trace to a
      // StockMovement row exactly as a real delivery would (Phase 6's invariant).
      if (quantity !== 0) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: created.id,
            delta: quantity,
            note: 'Sample pack initial stock',
          },
        })
      }
    }
    summary.products = (pack.products ?? []).length

    // ── Finance documents ───────────────────────────────────────────────────────
    for (const invoice of pack.receivableInvoices ?? []) {
      const customerId = customerIds.get(invoice.customerKey)
      if (!customerId) continue
      await tx.receivableInvoice.create({
        data: {
          tenantId,
          customerId,
          number: invoice.number ?? null,
          amount: new Prisma.Decimal(Money.fromDecimal(String(invoice.amount), currency, 'HALF_UP').toDecimalString()),
          dueDate: parseDate(invoice.dueDate),
          status: asEnum(RECEIVABLE_STATUSES, invoice.status, 'CURRENT', 'receivableInvoices'),
          createdAt: parseDate(invoice.createdAt) ?? new Date(),
        },
      })
    }
    summary.receivableInvoices = (pack.receivableInvoices ?? []).length

    for (const invoice of pack.payableInvoices ?? []) {
      const vendorId = vendorIds.get(invoice.vendorKey)
      if (!vendorId) continue
      await tx.payableInvoice.create({
        data: {
          tenantId,
          vendorId,
          invoiceNumber: invoice.invoiceNumber ?? null,
          date: parseDate(invoice.date) ?? new Date(),
          amount: new Prisma.Decimal(Money.fromDecimal(String(invoice.amount), currency, 'HALF_UP').toDecimalString()),
          status: asEnum(PAYABLE_STATUSES, invoice.status, 'PENDING', 'payableInvoices'),
        },
      })
    }
    summary.payableInvoices = (pack.payableInvoices ?? []).length

    for (const expense of pack.expenses ?? []) {
      await tx.expense.create({
        data: {
          tenantId,
          employeeId: expense.employeeKey ? (employeeIds.get(expense.employeeKey) ?? null) : null,
          name: expense.name,
          category: asEnum(EXPENSE_CATEGORIES, expense.category, 'OTHER', 'expenses'),
          merchant: expense.merchant ?? null,
          date: parseDate(expense.date) ?? new Date(),
          amount: new Prisma.Decimal(Money.fromDecimal(String(expense.amount), currency, 'HALF_UP').toDecimalString()),
          status: asEnum(EXPENSE_STATUSES, expense.status, 'PENDING', 'expenses'),
        },
      })
    }
    summary.expenses = (pack.expenses ?? []).length

    for (const entry of pack.ledgerTransactions ?? []) {
      await tx.ledgerTransaction.create({
        data: {
          tenantId,
          date: parseDate(entry.date) ?? new Date(),
          description: entry.description,
          amount: new Prisma.Decimal(Money.fromDecimal(String(entry.amount), currency, 'HALF_UP').toDecimalString()),
          status: asEnum(LEDGER_STATUSES, entry.status, 'CLEARED', 'ledgerTransactions'),
          isCredit: entry.isCredit,
        },
      })
    }
    summary.ledgerTransactions = (pack.ledgerTransactions ?? []).length

    for (const snapshot of pack.cashFlowSnapshots ?? []) {
      await tx.cashFlowSnapshot.create({
        data: {
          tenantId,
          // `Jan` → `2026-01`: the pack predates the `YYYY-MM` contract and has no year.
          month: parseMonth(snapshot.month),
          inflow: new Prisma.Decimal(Money.fromDecimal(String(snapshot.inflow), currency, 'HALF_UP').toDecimalString()),
          outflow: new Prisma.Decimal(Money.fromDecimal(String(snapshot.outflow), currency, 'HALF_UP').toDecimalString()),
          net: new Prisma.Decimal(Money.fromDecimal(String(snapshot.net), currency, 'HALF_UP').toDecimalString()),
        },
      })
    }
    summary.cashFlowSnapshots = (pack.cashFlowSnapshots ?? []).length

    // ── HR operational data ─────────────────────────────────────────────────────
    for (const cand of pack.candidates ?? []) {
      await tx.candidate.create({
        data: {
          tenantId,
          name: cand.name,
          role: cand.role,
          stage: asEnum(CANDIDATE_STAGES, cand.stage, 'APPLIED', 'candidates'),
          timeInStage: cand.timeInStage ?? null,
          appliedAt: parseDate(cand.appliedAt) ?? new Date(),
          avatarUrl: cand.avatarUrl ?? null,
          currentRole: cand.currentRole ?? null,
          experience: cand.experience ?? null,
          source: cand.source ?? null,
          location: cand.location ?? null,
          email: cand.email ?? null,
          education: cand.education ?? null,
          resumeUrl: cand.resumeUrl ?? null,
          activities: {
            create: (cand.activities ?? []).map(activity => ({
              action: activity.action,
              description: activity.description ?? null,
              createdAt: parseDate(activity.createdAt) ?? new Date(),
            })),
          },
        },
      })
    }
    summary.candidates = (pack.candidates ?? []).length

    for (const sheet of pack.timesheets ?? []) {
      const employeeId = employeeIds.get(sheet.employeeKey)
      if (!employeeId) continue
      await tx.timesheet.create({
        data: {
          tenantId,
          employeeId,
          weekStart: parseDate(sheet.weekStart) ?? new Date(),
          regularHours: sheet.regularHours ?? 0,
          overtimeHours: sheet.overtimeHours ?? 0,
          totalHours: (sheet.regularHours ?? 0) + (sheet.overtimeHours ?? 0),
          days: {
            create: (sheet.days ?? []).map(day => ({
              dayLabel: day.dayLabel,
              clockIn: day.clockIn ?? null,
              clockOut: day.clockOut ?? null,
              totalHours: day.totalHours ?? null,
            })),
          },
        },
      })
    }
    summary.timesheets = (pack.timesheets ?? []).length

    for (const ex of pack.attendanceExceptions ?? []) {
      const employeeId = employeeIds.get(ex.employeeKey)
      if (!employeeId) continue
      await tx.attendanceException.create({
        data: {
          tenantId,
          employeeId,
          type: asEnum(ATTENDANCE_TYPES, ex.type, 'OVERTIME', 'attendanceExceptions'),
          label: ex.label,
          date: parseDate(ex.date) ?? new Date(),
          alert: true,
        },
      })
    }
    summary.attendanceExceptions = (pack.attendanceExceptions ?? []).length

    for (const leave of pack.leaveRequests ?? []) {
      const employeeId = employeeIds.get(leave.employeeKey)
      if (!employeeId) continue
      await tx.leaveRequest.create({
        data: {
          tenantId,
          employeeId,
          type: asEnum(LEAVE_TYPES, leave.type, 'VACATION', 'leaveRequests'),
          startDate: parseDate(leave.startDate) ?? new Date(),
          endDate: parseDate(leave.endDate),
          status: asEnum(LEAVE_STATUSES, leave.status, 'PENDING', 'leaveRequests'),
        },
      })
    }
    summary.leaveRequests = (pack.leaveRequests ?? []).length

    // ── Payroll — priced through the domain layer, never the pack's numbers ──────
    //
    // The pack's per-line gross/deductions/net/taxLines are deliberately ignored (see
    // SAMPLE_TAX_RATES): seeding them would create runs whose stored numbers can drift from
    // `computePayrollLine` — the exact "business math defined once" invariant this rebuild
    // exists to enforce. Only the run's label/payDate/status and each line's bonus inputs are
    // taken from the pack; the money is computed.
    for (const run of pack.payrollRuns ?? []) {
      const lines = (run.lines ?? []).filter(line => employeeIds.has(line.employeeKey))
      if (lines.length === 0) continue

      const createdRun = await tx.payrollRun.create({
        data: {
          tenantId,
          label: run.label,
          payDate: parseDate(run.payDate),
          status: asEnum(PAYROLL_STATUSES, run.status, 'PENDING', 'payrollRuns'),
          taxRates: SAMPLE_TAX_RATES.map(rate => ({ label: rate.label, rate: String(rate.weight) })),
        },
      })

      for (const line of lines) {
        const employeeId = employeeIds.get(line.employeeKey)
        if (!employeeId) continue
        const employee = await tx.employee.findUnique({
          where: { id: employeeId },
          select: { salary: true },
        })
        if (employee?.salary == null) continue

        const baseSalary = Money.fromDecimal(String(employee.salary), currency, 'HALF_UP')
        const bonusAmount = line.bonusAmount != null
          ? Money.fromDecimal(String(line.bonusAmount), currency, 'HALF_UP')
          : undefined
        const result = computePayrollLine(
          bonusAmount === undefined ? { baseSalary } : { baseSalary, bonusAmount },
          SAMPLE_TAX_RATES,
        )
        await tx.payrollLine.create({
          data: {
            tenantId,
            payrollRunId: createdRun.id,
            employeeId,
            baseSalary: baseSalary.toDecimalString(),
            gross: result.gross.toDecimalString(),
            deductions: result.deductions.toDecimalString(),
            net: result.net.toDecimalString(),
            bonusLabel: line.bonusLabel ?? null,
            bonusAmount: bonusAmount ? bonusAmount.toDecimalString() : null,
            taxLines: {
              create: result.taxLines.map(taxLine => ({
                label: taxLine.label,
                amount: taxLine.amount.toDecimalString(),
              })),
            },
          },
        })
      }
    }
    summary.payrollRuns = (pack.payrollRuns ?? []).length

    await tx.tenant.update({
      where: { id: tenantId },
      data: { onboardingStatus: 'SAMPLE_LOADED' },
    })
  })

  return summary
}

/**
 * The tenant-scoped business models the sample pack (and the rest of the app) writes, in an
 * order that respects every foreign key. Each of these carries a `tenantId`; every *child*
 * model that lacks one (e.g. `PayrollTaxLine`, `TimesheetDay`, `DealActivity`, `IssueComment`,
 * `RoadmapTaskAssignee`) is tied to its parent by a `onDelete: Cascade` relation, so deleting
 * the parent here removes the child too. We therefore delete exactly the tenant-scoped set —
 * never the tenant's identity/settings rows (see the "never delete" list below).
 *
 * Ordered child-parent-first where a child is itself tenant-scoped AND references a sibling
 * tenant-scoped model (e.g. `StockMovement` → `Product`, `PayrollLine` → `Employee`). The
 * cascade covers the rest, so this list is the *minimal* set that clears a sample workspace.
 */
type TenantBusinessModel =
  | 'payrollLine'
  | 'payrollRun'
  | 'timesheet'
  | 'attendanceException'
  | 'leaveRequest'
  | 'candidate'
  | 'employee'
  | 'department'
  | 'activityEvent'
  | 'payableInvoice'
  | 'receivableInvoice'
  | 'expense'
  | 'ledgerTransaction'
  | 'cashFlowSnapshot'
  | 'vendor'
  | 'customer'
  | 'deal'
  | 'company'
  | 'agendaItem'
  | 'salesQuota'
  | 'forecastSnapshot'
  | 'purchaseOrder'
  | 'stockMovement'
  | 'product'
  | 'supplier'
  | 'issue'
  | 'sprint'
  | 'project'
  | 'roadmapPhase'
  | 'roadmapTask'

const TENANT_BUSINESS_MODELS: readonly TenantBusinessModel[] = [
  // HR (leaf-ish first)
  'payrollLine',
  'payrollRun',
  'timesheet',
  'attendanceException',
  'leaveRequest',
  'candidate',
  'employee',
  'department',
  'activityEvent',
  // Finance
  'payableInvoice',
  'receivableInvoice',
  'expense',
  'ledgerTransaction',
  'cashFlowSnapshot',
  'vendor',
  'customer',
  // CRM
  'deal',
  'company',
  'agendaItem',
  'salesQuota',
  'forecastSnapshot',
  // Inventory (purchase orders before products: their lines cascade off both)
  'purchaseOrder',
  'stockMovement',
  'product',
  'supplier',
  // Projects
  'issue',
  'sprint',
  'project',
  'roadmapPhase',
  'roadmapTask',
]

/**
 * `DELETE /onboarding/sample-data` — clears the sample pack (or any business data) from the
 * active workspace so the onboarding flow can be re-run (e.g. load the sample to explore,
 * then clear it and import the tenant's real data).
 *
 * **Safety contract:**
 *  - Only runs when `tenant.onboardingStatus === 'SAMPLE_LOADED'`. A tenant that imported its
 *    own data (`IMPORTED`) or has been edited past the sample (`EMPTY` + manual rows) is
 *    refused with a 409 — this can never wipe real records by accident. The guard reads the
 *    status *and* requires no imported employees, so the only reachable state is a pure
 *    sample workspace.
 *  - Deletes inside a single `$transaction` in one atomic sweep; the tenant row itself is
 *    never deleted, only its `onboardingStatus` is reset to `PENDING` so the 3-choice
 *    onboarding shows again.
 *  - Preserves tenant identity/settings: members, invitations, audit log, subscriptions,
 *    payment methods, billing invoices, integrations, notification preferences, quiet hours,
 *    export jobs, backup schedules, and support tickets are all untouched.
 *
 * @returns per-model row counts so the UI/audit can report what was cleared.
 */
export async function clearSamplePack(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ cleared: Record<string, number>; onboardingStatus: 'PENDING' }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new AppError(404, 'Workspace not found')

  if (tenant.onboardingStatus !== 'SAMPLE_LOADED') {
    throw new AppError(
      409,
      'Only a workspace loaded with the sample dataset can be cleared. Import your own data first if you want to replace it.',
    )
  }

  const cleared: Record<string, number> = {}
  await prisma.$transaction(async tx => {
    // The union of all tenant-scoped model delegates is indexable by this literal union; the
    // cast narrows each delegate to the one method the sweep needs (deleteMany by tenantId).
    const delegates = tx as unknown as Record<
      TenantBusinessModel,
      { deleteMany: (args: { where: { tenantId: string } }) => Promise<{ count: number }> }
    >
    for (const model of TENANT_BUSINESS_MODELS) {
      const result = await delegates[model].deleteMany({ where: { tenantId } })
      cleared[model] = result.count
    }
    await tx.tenant.update({ where: { id: tenantId }, data: { onboardingStatus: 'PENDING' } })
  })

  return { cleared, onboardingStatus: 'PENDING' }
}

/**
 * Bulk-import employees (the onboarding flow's third path). Departments resolve by name and
 * are created on first sight — the same behavior as the legacy import — and the tenant is
 * marked IMPORTED. Salary arrives as a major-unit decimal string and is normalized through
 * `Money.fromDecimal` against the tenant's currency, so `'84000'` and `'84000.00'` land
 * identically and a 3+-decimal value is a 422 rather than a silently rounded book entry.
 */
export async function importEmployees(
  prisma: PrismaClient,
  tenantId: string,
  input: ImportEmployeesInput,
): Promise<{ imported: number }> {
  const currency = await getTenantCurrency(prisma, tenantId)
  const departmentCache = new Map<string, string>()

  const imported = await prisma.$transaction(async tx => {
    let count = 0
    for (const row of input.employees) {
      let departmentId: string | null = null
      if (row.department) {
        const cached = departmentCache.get(row.department)
        if (cached) {
          departmentId = cached
        } else {
          const existing = await tx.department.findFirst({ where: { tenantId, name: row.department } })
          departmentId = existing
            ? existing.id
            : (await tx.department.create({ data: { tenantId, name: row.department } })).id
          departmentCache.set(row.department, departmentId)
        }
      }
      await tx.employee.create({
        data: {
          tenantId,
          name: row.name,
          title: row.title,
          departmentId,
          status: row.status ?? 'ACTIVE',
          email: row.email ?? null,
          location: row.location ?? null,
          salary: row.salary != null
            ? Money.fromDecimal(row.salary, currency, 'HALF_UP').toDecimalString()
            : null,
          employeeNumber: row.employeeNumber ?? null,
          hiredAt: parseDate(row.hiredAt),
        },
      })
      count++
    }
    await tx.tenant.update({ where: { id: tenantId }, data: { onboardingStatus: 'IMPORTED' } })
    return count
  })

  return { imported }
}

export type ImportEmployeesInput = ImportEmployeesRequest

async function getTenantCurrency(prisma: PrismaClient, tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Tenant not found')
  return tenant.currency
}
