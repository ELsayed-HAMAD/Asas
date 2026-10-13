import { describe, expect, it } from 'vitest'
import { Money } from '../money/money.js'
import { computePeriodBaseSalary, computePeriodSalarySchedule, validatePayrollPeriod } from './period.js'

const monthly = { periodStart: '2026-10-01', periodEnd: '2026-10-31', payFrequency: 'MONTHLY' as const }

describe('explicit payroll periods', () => {
  it('does not pay a whole annual salary for one monthly run', () => {
    expect(computePeriodBaseSalary(Money.fromDecimal('120000', 'USD'), 'ANNUAL', monthly).baseSalary.toDecimalString()).toBe('10000.00')
    expect(computePeriodBaseSalary(Money.fromDecimal('10000', 'USD'), 'MONTHLY', monthly).baseSalary.toDecimalString()).toBe('10000.00')
  })
  it.each([
    ['SEMIMONTHLY', '2026-10-01', '2026-10-15', '5000.00'],
    ['SEMIMONTHLY', '2026-10-16', '2026-10-31', '5000.00'],
    ['BIWEEKLY', '2026-10-01', '2026-10-14', '4615.38'],
    ['WEEKLY', '2026-10-01', '2026-10-07', '2307.69'],
  ] as const)('calculates %s period base pay', (payFrequency, periodStart, periodEnd, expected) => {
    expect(computePeriodBaseSalary(Money.fromDecimal('120000', 'USD'), 'ANNUAL', { payFrequency, periodStart, periodEnd }).baseSalary.toDecimalString()).toBe(expected)
    expect(computePeriodBaseSalary(Money.fromDecimal('10000', 'USD'), 'MONTHLY', { payFrequency, periodStart, periodEnd }).baseSalary.toDecimalString()).toBe(expected)
  })
  it('supports explicitly selected 53-week and 27-biweekly calendars', () => {
    expect(computePeriodBaseSalary(Money.fromDecimal('53000', 'USD'), 'ANNUAL', { payFrequency: 'WEEKLY', periodsPerYear: 53, periodStart: '2026-12-28', periodEnd: '2027-01-03' }).baseSalary.toDecimalString()).toBe('1000.00')
    expect(computePeriodBaseSalary(Money.fromDecimal('54000', 'USD'), 'ANNUAL', { payFrequency: 'BIWEEKLY', periodsPerYear: 27, periodStart: '2026-12-28', periodEnd: '2027-01-10' }).baseSalary.toDecimalString()).toBe('2000.00')
  })
  it('prorates an October 16 hire over inclusive calendar days', () => {
    const pay = computePeriodBaseSalary(Money.fromDecimal('120000', 'USD'), 'ANNUAL', monthly, '2026-10-16')
    expect(pay).toMatchObject({ eligibleDays: 16, periodDays: 31 })
    expect(pay.baseSalary.toDecimalString()).toBe('5161.29')
  })
  it('prorates through the inclusive employment end date', () => {
    const pay = computePeriodBaseSalary(Money.fromDecimal('120000', 'USD'), 'ANNUAL', monthly, '2025-01-01', '2026-10-16')
    expect(pay).toMatchObject({ eligibleDays: 16, periodDays: 31 })
    expect(pay.baseSalary.toDecimalString()).toBe('5161.29')
  })
  it('combines hire and employment end dates and pays zero outside the eligible range', () => {
    const salary = Money.fromDecimal('120000', 'USD')
    expect(computePeriodBaseSalary(salary, 'ANNUAL', monthly, '2026-10-10', '2026-10-20')).toMatchObject({ eligibleDays: 11, periodDays: 31 })
    expect(computePeriodBaseSalary(salary, 'ANNUAL', monthly, '2026-11-01', '2026-11-02')).toMatchObject({ eligibleDays: 0, periodDays: 31 })
  })
  it('rejects an employment end date before the hire date', () => {
    expect(() => computePeriodBaseSalary(Money.fromDecimal('120000', 'USD'), 'ANNUAL', monthly, '2026-10-17', '2026-10-16')).toThrow(/before the hire date/)
  })
  it('splits an earning period across effective salary changes and rounds only the final total', () => {
    const result = computePeriodSalarySchedule([
      { salary: Money.fromDecimal('120000', 'USD'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-01' },
      { salary: Money.fromDecimal('240000', 'USD'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-16' },
    ], 'MONTHLY', monthly)
    expect(result.baseSalary.toDecimalString()).toBe('15161.29')
    expect(result.eligibleDays).toBe(31)
    expect(result.salarySegments.map(segment => segment.eligibleDays)).toEqual([15, 16])
  })
  it('requires a known rate at the first eligible day and rejects overlapping effective dates', () => {
    expect(() => computePeriodSalarySchedule([
      { salary: Money.fromDecimal('120000', 'USD'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-02' },
    ], 'ANNUAL', monthly)).toThrow(/No salary rate is effective/)
    expect(() => computePeriodSalarySchedule([
      { salary: Money.fromDecimal('120000', 'USD'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-01' },
      { salary: Money.fromDecimal('130000', 'USD'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-01' },
    ], 'ANNUAL', monthly)).toThrow(/duplicate effective dates/)
  })
  it('rejects mixed currencies only when both rates are used in the earning period', () => {
    expect(() => computePeriodSalarySchedule([
      { salary: Money.fromDecimal('120000', 'USD'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-01' },
      { salary: Money.fromDecimal('120000', 'EUR'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-16' },
    ], 'ANNUAL', monthly)).toThrow(/currency changes inside an earning period/)
    const currentOnly = computePeriodSalarySchedule([
      { salary: Money.fromDecimal('120000', 'EUR'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-09-01' },
      { salary: Money.fromDecimal('120000', 'USD'), salaryBasis: 'ANNUAL', effectiveFrom: '2026-10-01' },
    ], 'ANNUAL', monthly)
    expect(currentOnly.baseSalary.currency).toBe('USD')
  })
  it('handles hires before, at, and after period boundaries', () => {
    const salary = Money.fromDecimal('120000', 'USD')
    expect(computePeriodBaseSalary(salary, 'ANNUAL', monthly, '2025-01-01').eligibleDays).toBe(31)
    expect(computePeriodBaseSalary(salary, 'ANNUAL', monthly, '2026-10-01').baseSalary.toDecimalString()).toBe('10000.00')
    expect(computePeriodBaseSalary(salary, 'ANNUAL', monthly, '2026-10-31').eligibleDays).toBe(1)
    expect(computePeriodBaseSalary(salary, 'ANNUAL', monthly, '2026-11-01').baseSalary.toDecimalString()).toBe('0.00')
  })
  it('uses leap-year calendar days rather than a static 30-day divisor', () => {
    const pay = computePeriodBaseSalary(Money.fromDecimal('120000', 'USD'), 'ANNUAL', { payFrequency: 'MONTHLY', periodStart: '2024-02-01', periodEnd: '2024-02-29' }, '2024-02-15')
    expect(pay).toMatchObject({ eligibleDays: 15, periodDays: 29 })
    expect(pay.baseSalary.toDecimalString()).toBe('5172.41')
  })
  it('rounds once after division and proration, not at each intermediate step', () => {
    const salary = Money.fromDecimal('0.11', 'USD')
    const pay = computePeriodBaseSalary(salary, 'ANNUAL', monthly, '2026-10-16')
    expect(pay.baseSalary.toDecimalString()).toBe('0.00')
    const prematurelyRounded = computePeriodBaseSalary(salary, 'ANNUAL', monthly).baseSalary
    expect(computePeriodBaseSalary(prematurelyRounded, 'MONTHLY', monthly, '2026-10-16').baseSalary.toDecimalString()).toBe('0.01')
  })
  it('respects zero- and three-decimal currency quantum', () => {
    expect(computePeriodBaseSalary(Money.fromDecimal('12001', 'JPY'), 'ANNUAL', monthly).baseSalary.toDecimalString()).toBe('1000')
    expect(computePeriodBaseSalary(Money.fromDecimal('12000.012', 'KWD'), 'ANNUAL', monthly).baseSalary.toDecimalString()).toBe('1000.001')
  })
  it.each([
    { ...monthly, periodStart: '2026-02-31' },
    { ...monthly, periodEnd: '2026-09-30' },
    { ...monthly, periodStart: '2026-10-02' },
    { ...monthly, periodsPerYear: 52 },
    { ...monthly, payFrequency: 'SEMIMONTHLY' as const },
    { ...monthly, payFrequency: 'WEEKLY' as const },
    { ...monthly, payFrequency: 'BIWEEKLY' as const },
  ])('rejects invalid or frequency-inconsistent dates %j', period => {
    expect(() => validatePayrollPeriod(period)).toThrow(RangeError)
  })
  it('rejects negative salaries instead of creating negative base pay', () => {
    expect(() => computePeriodBaseSalary(Money.fromDecimal('-1', 'USD'), 'ANNUAL', monthly)).toThrow(/negative/)
  })
})
