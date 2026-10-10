import { describe, expect, it } from 'vitest'
import { payrollRunCreateSchema, payrollTaxRateSchema } from './payroll.js'

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
