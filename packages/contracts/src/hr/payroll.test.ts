import { describe, expect, it } from 'vitest'
import { payrollRunCreateSchema, payrollTaxRateSchema, payrollRoundingReconciliationQuerySchema, payrollRoundingReconciliationSchema } from './payroll.js'

const employeeId = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const input = { periodStart: '2026-10-01', periodEnd: '2026-10-31', payFrequency: 'MONTHLY', salaryBasis: 'ANNUAL', requestKey: 'cc35b4e1-07ec-4656-a3d3-8b4e71c67251', label: 'Payroll', employeeIds: [employeeId], taxRates: [{ label: 'Tax', rate: '10' }] }

describe('payroll period validation', () => {
  it.each(['periodStart', 'periodEnd', 'payFrequency', 'salaryBasis', 'requestKey'])('requires explicit %s', field => {
    const incomplete: Record<string, unknown> = { ...input }
    delete incomplete[field]
    expect(payrollRunCreateSchema.safeParse(incomplete).success).toBe(false)
  })
  it.each([
    { periodStart: '2026-02-31' },
    { periodEnd: '2026-09-30' },
    { periodStart: '2026-10-02' },
    { payFrequency: 'WEEKLY' },
    { periodsPerYear: 53 },
    { salaryBasis: 'UNKNOWN' },
    { requestKey: 'not-a-uuid' },
    { employeeIds: [employeeId, employeeId] },
  ])('rejects inconsistent or unsafe creation input %j', patch => {
    expect(payrollRunCreateSchema.safeParse({ ...input, ...patch }).success).toBe(false)
  })
  it('accepts an explicit 53-week calendar independently of pay date', () => {
    expect(payrollRunCreateSchema.safeParse({ ...input, periodStart: '2026-12-28', periodEnd: '2027-01-03', payDate: '2027-01-08', payFrequency: 'WEEKLY', periodsPerYear: 53 }).success).toBe(true)
  })
})

describe('payroll rate validation', () => {
  it.each(['-1', '100.000000000000000001', 'NaN', 'Infinity', 'bad-rate', '1e5', '9'.repeat(1000)])('rejects invalid tax rate %s without throwing', rate => {
    expect(payrollTaxRateSchema.safeParse({ label: 'Tax', rate }).success).toBe(false)
    expect(payrollRunCreateSchema.safeParse({ ...input, taxRates: [{ label: 'Tax', rate }] }).success).toBe(false)
  })
  it('accepts exactly 100% expressed by decimal components', () => {
    expect(payrollRunCreateSchema.safeParse({ ...input, taxRates: ['33.33', '33.33', '33.34'].map((rate, index) => ({ label: `Tax ${index}`, rate })) }).success).toBe(true)
  })
  it('rejects any combined excess, even below double precision', () => {
    expect(payrollRunCreateSchema.safeParse({ ...input, taxRates: [{ label: 'A', rate: '100' }, { label: 'B', rate: '0.000000000000000001' }] }).success).toBe(false)
  })
  it('accepts zero deductions without fabricated tax', () => {
    expect(payrollRunCreateSchema.safeParse({ ...input, taxRates: [{ label: 'Tax', rate: '0' }] }).success).toBe(true)
  })
  it('bounds the tax split size', () => {
    expect(payrollRunCreateSchema.safeParse({ ...input, taxRates: Array.from({ length: 101 }, () => ({ label: 'Tax', rate: '0' })) }).success).toBe(false)
  })
})

describe('payroll rounding reconciliation contract', () => {
  it('accepts an earning-year query and rejects out-of-range years', () => {
    expect(payrollRoundingReconciliationQuerySchema.safeParse({ year: '2026' }).success).toBe(true)
    expect(payrollRoundingReconciliationQuerySchema.safeParse({ year: '1999' }).success).toBe(false)
  })

  it('keeps annual rounding comparisons currency-specific and decimal-string based', () => {
    expect(payrollRoundingReconciliationSchema.safeParse({
      year: 2026, excludedManualOverrideLines: 0, excludedUnknownCurrencyLines: 0,
      groups: [{
        employeeId, employeeName: 'Ada', currency: 'USD', taxRates: [{ label: 'Tax', rate: '0.9' }],
        paidLineCount: 2, grossTotal: '10.00', recordedDeductions: '0.10', aggregateRoundedDeductions: '0.09', variance: '0.01',
        taxLines: [{ label: 'Tax', recorded: '0.10', aggregateRounded: '0.09', variance: '0.01' }],
      }],
    }).success).toBe(true)
  })
})

describe('self-service my payslips contract', () => {
  it('validates a valid payslip item and list response', async () => {
    const { myPayslipItemSchema, myPayslipsResponseSchema } = await import('./payroll.js')
    const item = {
      id: 'cly0000000000000000000001',
      payrollRunId: 'cly0000000000000000000002',
      runLabel: 'October 2026',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      payDate: '2026-11-01',
      status: 'APPROVED',
      currency: 'USD',
      baseSalary: '5000.00',
      gross: '5000.00',
      deductions: '500.00',
      net: '4500.00',
      createdAt: '2026-10-15T12:00:00.000Z',
    }
    expect(myPayslipItemSchema.parse(item)).toEqual(item)
    expect(myPayslipsResponseSchema.parse([item])).toHaveLength(1)
  })
})
