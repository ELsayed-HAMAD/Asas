import { Money } from '../money/money.js'
import { makeRational } from '../money/rational.js'

export type SalaryBasis = 'ANNUAL' | 'MONTHLY'
export type PayFrequency = 'MONTHLY' | 'SEMIMONTHLY' | 'BIWEEKLY' | 'WEEKLY'
export interface PayrollPeriod {
  periodStart: string
  periodEnd: string
  payFrequency: PayFrequency
  /** Explicit equal-pay-period divisor; 53-week/27-biweekly payroll calendars are supported. */
  periodsPerYear?: number | undefined
}

const DAY_MS = 86_400_000
const PERIODS = { MONTHLY: [12], SEMIMONTHLY: [24], BIWEEKLY: [26, 27], WEEKLY: [52, 53] } as const

function calendarDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Expected a YYYY-MM-DD earning date')
  const day = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) throw new RangeError('Expected a real calendar date')
  return day
}

export function validatePayrollPeriod(input: PayrollPeriod): { periodDays: number; periodsPerYear: number } {
  const start = calendarDay(input.periodStart)
  const end = calendarDay(input.periodEnd)
  const periodDays = (end.getTime() - start.getTime()) / DAY_MS + 1
  if (periodDays <= 0) throw new RangeError('The earning period ends before it starts')
  const choices: readonly number[] | undefined = PERIODS[input.payFrequency]
  if (!choices) throw new RangeError('Unknown pay frequency')
  const periodsPerYear = input.periodsPerYear ?? choices[0]!
  if (!choices.includes(periodsPerYear)) throw new RangeError('The annual period count does not match the pay frequency')
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  if (input.payFrequency === 'MONTHLY' && !(sameMonth && start.getUTCDate() === 1 && end.getUTCDate() === lastDay)) {
    throw new RangeError('Monthly payroll must cover a complete calendar month')
  }
  if (input.payFrequency === 'SEMIMONTHLY' && !(sameMonth && ((start.getUTCDate() === 1 && end.getUTCDate() === 15) || (start.getUTCDate() === 16 && end.getUTCDate() === lastDay)))) {
    throw new RangeError('Twice-monthly payroll must cover days 1–15 or 16–month end')
  }
  if (input.payFrequency === 'WEEKLY' && periodDays !== 7) throw new RangeError('Weekly payroll must cover exactly seven days')
  if (input.payFrequency === 'BIWEEKLY' && periodDays !== 14) throw new RangeError('Biweekly payroll must cover exactly fourteen days')
  return { periodDays, periodsPerYear }
}

/** Equal-period salary, calendar-day hire proration, one HALF_UP currency-quantum rounding. */
export function computePeriodBaseSalary(salary: Money, salaryBasis: SalaryBasis, period: PayrollPeriod, hiredOn?: string | null) {
  const { periodDays, periodsPerYear } = validatePayrollPeriod(period)
  if (salary.isNegative()) throw new RangeError('A salary cannot be negative')
  if (salaryBasis !== 'ANNUAL' && salaryBasis !== 'MONTHLY') throw new RangeError('Choose an explicit salary basis')
  let eligibleDays = periodDays
  if (hiredOn) {
    const hire = calendarDay(hiredOn)
    const start = calendarDay(period.periodStart)
    const end = calendarDay(period.periodEnd)
    if (hire > start) eligibleDays = Math.max(0, (end.getTime() - hire.getTime()) / DAY_MS + 1)
  }
  const factor = salaryBasis === 'MONTHLY' ? 12n : 1n
  const baseSalary = salary.multiply(makeRational(factor * BigInt(eligibleDays), BigInt(periodsPerYear) * BigInt(periodDays)), 'HALF_UP')
  return { baseSalary, periodDays, eligibleDays, periodsPerYear }
}
