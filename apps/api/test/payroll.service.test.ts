import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/utils/errors.js'
import {
  adjustPayrollLine,
  approvePayrollRun,
  createPayrollRun,
  getPayrollRun,
  getPayslipDoc,
  listPayrollRuns,
} from '../src/modules/hr/payroll.service.js'

const now = new Date('2026-08-01T00:00:00.000Z')
const TENANT = 'tenant_1'
const RUN_ID = 'run_1'
const PERIOD = { periodStart: '2026-08-01', periodEnd: '2026-08-31', payFrequency: 'MONTHLY' as const, salaryBasis: 'ANNUAL' as const, requestKey: 'cc35b4e1-07ec-4656-a3d3-8b4e71c67251' }

type Row = Record<string, unknown>

/** A decimal standing in for Prisma.Decimal — payroll only ever calls `.toString()` on it. */
const dec = (s: string) => ({ toString: () => s } as unknown as Prisma.Decimal)

/** A run row in the shape `getPayrollRun` maps. `taxRates` is the stored `Json` value. */
function runRow(status: string, taxRates?: unknown): Row {
  return {
    id: RUN_ID,
    tenantId: TENANT,
    label: 'August pay',
    payDate: null,
    status,
    taxRates: taxRates ?? [{ label: 'Pension', rate: '10' }],
    createdAt: now,
    updatedAt: now,
  }
}

/** A fully-mapped payroll line row (what the service's `mapLine` consumes). */
function lineRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'line_1',
    employeeId: 'emp_1',
    baseSalary: dec('100000.00'),
    missedDaysCount: null,
    missedDaysAmount: null,
    bonusLabel: null,
    bonusAmount: null,
    gross: dec('100000.00'),
    deductions: dec('10000.00'),
    net: dec('90000.00'),
    employee: { id: 'emp_1', name: 'Ada Lovelace', title: 'Engineer' },
    taxLines: [{ id: 'tax_1', label: 'Pension', amount: dec('10000.00'), override: false }],
    ...overrides,
  }
}

interface StubOptions {
  employees?: Row[]
  lines?: Row[]
  payrollRunFindFirst?: Row | null
  grossSum?: Prisma.Decimal
  deductionsSum?: Prisma.Decimal
  netSum?: Prisma.Decimal
  lineCount?: number
  currency?: string
}

/**
 * A stub Prisma client. `createPayrollRun`/`adjustPayrollLine`/`approvePayrollRun` all end with a
 * `getPayrollRun` re-read, so the rows a test asserts on come from `options.lines` (the read side).
 * The transaction client omits `$transaction` and supports reads as well as writes.
 */
function stubPrisma(options: StubOptions = {}) {
  const employees: Row[] =
    options.employees ?? [
      { id: 'emp_1', name: 'Ada Lovelace', salary: dec('100000') },
      { id: 'emp_2', name: 'Grace Hopper', salary: dec('120000') },
    ]
  const lines: Row[] = options.lines ?? [lineRow()]
  // Mutable so `approvePayrollRun`'s `update` (a real write) is visible on the re-read that
  // follows it — the same way a real row reflects its update.
  let currentRun: Row | null = options.payrollRunFindFirst === null
    ? null
    : { ...(options.payrollRunFindFirst ?? runRow('PENDING')) }

  const prisma = {
    tenant: { findUnique: async () => ({ name: 'Asas', currency: options.currency ?? 'USD', timezone: 'UTC' }) },
    employee: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        employees.filter(e => (args.where.id.in as string[]).includes(e.id as string)),
    },
    payrollRun: {
      findFirst: async ({ where }: { where: Row }) => where.requestKey ? (currentRun?.requestKey === where.requestKey ? currentRun : null) : currentRun,
      updateMany: async ({ data }: { data: Row }) => {
        if (!currentRun || !['DRAFT', 'PENDING'].includes(String(currentRun.status))) return { count: 0 }
        currentRun = { ...currentRun, ...data }
        return { count: 1 }
      },
      create: async ({ data }: { data: Row }) => {
        currentRun = { ...runRow('PENDING'), ...data }
        return { id: RUN_ID, ...data }
      },
      count: async () => 1,
      findMany: async () => [
        { id: RUN_ID, label: 'August pay', payDate: null, status: 'PENDING', createdAt: now, _count: { lines: 2 } },
      ],
    },
    payrollLine: {
      count: async () => 0,
      create: async (args: { data: Row }) => ({ id: 'line_1', ...args.data }),
      findMany: async () => lines,
      findFirst: async () => lineRow(),
      update: async () => {},
      aggregate: async () => ({
        _count: { _all: options.lineCount ?? 2 },
        _sum: { gross: options.grossSum ?? dec('220000'), deductions: options.deductionsSum ?? dec('22000'), net: options.netSum ?? dec('198000') },
      }),
    },
    payrollTaxLine: { deleteMany: async () => {}, createMany: async () => {} },
    $queryRaw: async (strings: TemplateStringsArray) => {
      if (strings.join('').includes('SettlementHistoryCoverage')) return [{ currentTotal: null, previousTotal: null }]
      return currentRun ? [{ id: RUN_ID }] : []
    },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
      const { $transaction: _transaction, ...tx } = prisma
      return cb(tx)
    },
  }
  return prisma as never
}

describe('payroll.service', () => {
  it('preserves legacy amounts without inventing their earning policy', async () => {
    const run = await getPayrollRun(stubPrisma(), TENANT, RUN_ID)
    expect(run).toMatchObject({ periodStart: null, periodEnd: null, payFrequency: null, periodsPerYear: null, salaryBasis: null, currency: null })
    expect(run.lines[0]).toMatchObject({ baseSalary: '100000.00', sourceSalary: null, salaryBasis: null, eligibleDays: null, periodDays: null })
  })
  it('uses recorded currency and earning dates on payslips after workspace settings change', async () => {
    const doc = await getPayslipDoc(stubPrisma({ currency: 'JPY', payrollRunFindFirst: {
      ...runRow('PENDING'), currency: 'KWD', periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31'),
    } }), TENANT, RUN_ID, 'line_1')
    expect(doc).toMatchObject({ currency: 'KWD', periodStart: '2026-08-01', periodEnd: '2026-08-31', gross: '100000.00' })
  })
  it('prices every line from the employee salary through the domain math', async () => {
    // Two employees, one 10% pension rate. The returned lines are the stored rows; the money is
    // what the domain layer computed and the service wrote — decimal strings, no float.
    const created = await createPayrollRun(
      stubPrisma({
        lines: [
          lineRow({ baseSalary: dec('8333.33'), gross: dec('8333.33'), deductions: dec('833.33'), net: dec('7500.00'), taxLines: [{ id: 'tax_1', label: 'Pension', amount: dec('833.33'), override: false }] }),
          lineRow({
            id: 'line_2',
            employeeId: 'emp_2',
            employee: { id: 'emp_2', name: 'Grace Hopper', title: 'Engineer' },
            baseSalary: dec('10000.00'),
            gross: dec('10000.00'),
            deductions: dec('1000.00'),
            net: dec('9000.00'),
            taxLines: [{ id: 'tax_2', label: 'Pension', amount: dec('1000.00'), override: false }],
          }),
        ],
      }),
      TENANT,
      { ...PERIOD, label: 'August pay', taxRates: [{ label: 'Pension', rate: '10' }], employeeIds: ['emp_1', 'emp_2'] },
    )

    expect(created.status).toBe('PENDING')
    expect(created.taxRates).toEqual([{ label: 'Pension', rate: '10' }])
    expect(created.lines).toHaveLength(2)

    const ada = created.lines.find(line => line.employee.id === 'emp_1')!
    expect(ada.baseSalary).toBe('8333.33')
    expect(ada.gross).toBe('8333.33')
    expect(ada.deductions).toBe('833.33')
    expect(ada.net).toBe('7500.00')
    expect(ada.taxLines).toEqual([
      { id: 'tax_1', label: 'Pension', amount: '833.33', override: false },
    ])
  })

  it('rejects an employee the tenant does not own (tenant isolation on the run inputs)', async () => {
    await expect(
      createPayrollRun(stubPrisma(), TENANT, {
        ...PERIOD, label: 'x',
        taxRates: [{ label: 'Pension', rate: '10' }],
        employeeIds: ['emp_1', 'other_tenant_emp'],
      }),
    ).rejects.toThrow(AppError)
  })

  it('refuses to price a line whose employee has no salary', async () => {
    const prisma = stubPrisma({ employees: [{ id: 'emp_1', name: 'Ada Lovelace', salary: null }] })
    await expect(
      createPayrollRun(prisma, TENANT, {
        ...PERIOD, label: 'x',
        taxRates: [{ label: 'Pension', rate: '10' }],
        employeeIds: ['emp_1'],
      }),
    ).rejects.toThrow(/base salary/)
  })

  it('approves a PENDING run, and is 409-loud (not a silent no-op) when already approved', async () => {
    const approved = await approvePayrollRun(stubPrisma(), TENANT, RUN_ID)
    expect(approved.status).toBe('APPROVED')

    const already = stubPrisma({ payrollRunFindFirst: runRow('APPROVED') })
    await expect(approvePayrollRun(already, TENANT, RUN_ID)).rejects.toThrow(/cannot be approved/)
  })

  it('refuses to adjust a line on an approved run', async () => {
    const prisma = stubPrisma({ payrollRunFindFirst: runRow('APPROVED') })
    await expect(
      adjustPayrollLine(prisma, TENANT, RUN_ID, 'line_1', { bonusAmount: '5000' }),
    ).rejects.toThrow(/cannot be adjusted/)
  })

  it('recomputes a line from the run stored rates when an admin adjusts it', async () => {
    // PENDING run, 10% pension stored; adjust Ada base 100000 → 120000. The stored rates drive
    // the split: gross 120000, pension 12000, net 108000.
    const prisma = stubPrisma({
      payrollRunFindFirst: runRow('PENDING'),
      lines: [
        lineRow({
          baseSalary: dec('120000.00'),
          gross: dec('120000.00'),
          deductions: dec('12000.00'),
          net: dec('108000.00'),
        }),
      ],
    })
    const result = await adjustPayrollLine(prisma, TENANT, RUN_ID, 'line_1', { baseSalary: '120000' })
    const ada = result.lines.find(line => line.employee.id === 'emp_1')!
    expect(ada.gross).toBe('120000.00')
    expect(ada.deductions).toBe('12000.00')
    expect(ada.net).toBe('108000.00')
  })

  it('lists runs with a SQL-computed summary over the whole history', async () => {
    const result = await listPayrollRuns(stubPrisma(), TENANT, { page: 1, limit: 25 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].lineCount).toBe(2)
    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1, pages: 1 })
    expect(result.summary.totalGross).toBe('220000')
    expect(result.summary.totalNet).toBe('198000')
    expect(result.summary.lineCount).toBe(2)
    expect(result.summary.paidThisMonthTotal).toBeNull()
    expect(result.summary.paidThisMonthComparison.previousTotal).toBeNull()
  })

  it('404s a run the tenant does not own', async () => {
    const prisma = stubPrisma({ payrollRunFindFirst: null })
    await expect(getPayrollRun(prisma, TENANT, 'nope')).rejects.toThrow(/not found/)
  })

  it('returns exact per-run SQL totals alongside its lines', async () => {
    const result = await getPayrollRun(stubPrisma({
      lines: [lineRow(), lineRow({ id: 'line_2', gross: dec('200000.00'), deductions: dec('20000.00'), net: dec('180000.00') })],
      grossSum: dec('300000.00'), deductionsSum: dec('30000.00'), netSum: dec('270000.00'),
    }), TENANT, RUN_ID)
    expect(result.totals).toEqual({ gross: '300000.00', deductions: '30000.00', net: '270000.00' })
  })
})
