import { Money } from '../money/money.js'
import { makeRational } from '../money/rational.js'
import { divideRounded } from '../money/rounding.js'

export type SalaryBasis = 'ANNUAL' | 'MONTHLY'
export type PayFrequency = 'MONTHLY' | 'SEMIMONTHLY' | 'BIWEEKLY' | 'WEEKLY'
export interface PayrollPeriod {
  periodStart: string
  periodEnd: string
  payFrequency: PayFrequency
  /** Explicit equal-pay-period divisor; 53-week/27-biweekly payroll calendars are supported. */
  periodsPerYear?: number | undefined
}

export interface SalaryRate {
  salary: Money
  salaryBasis: SalaryBasis | null
  effectiveFrom: string
}

export interface SalaryRateSegment {
  salary: Money
  salaryBasis: SalaryBasis
  effectiveFrom: string
  eligibleDays: number
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

/** Prorates dated rates over eligible employment days and rounds once at the currency quantum. */
export function computePeriodSalarySchedule(
  rates: readonly SalaryRate[],
  fallbackBasis: SalaryBasis,
  period: PayrollPeriod,
  hiredOn?: string | null,
  employedThrough?: string | null,
) {
  const { periodDays, periodsPerYear } = validatePayrollPeriod(period)
  if (!rates.length) throw new RangeError('No effective salary rate is recorded for this employee')
  if (fallbackBasis !== 'ANNUAL' && fallbackBasis !== 'MONTHLY') throw new RangeError('Choose an explicit salary basis')
  const start = calendarDay(period.periodStart)
  const end = calendarDay(period.periodEnd)
  const hire = hiredOn ? calendarDay(hiredOn) : start
  const lastEmploymentDay = employedThrough ? calendarDay(employedThrough) : end
  if (employedThrough && hiredOn && lastEmploymentDay < hire) throw new RangeError('Employment end date cannot be before the hire date')
  const eligibleStart = hire > start ? hire : start
  const eligibleEnd = lastEmploymentDay < end ? lastEmploymentDay : end
  const eligibleDays = eligibleEnd < eligibleStart ? 0 : (eligibleEnd.getTime() - eligibleStart.getTime()) / DAY_MS + 1
  const normalized = rates.map(rate => ({ ...rate, effective: calendarDay(rate.effectiveFrom) }))
    .sort((left, right) => left.effective.getTime() - right.effective.getTime())
  for (let index = 1; index < normalized.length; index++) {
    if (normalized[index]!.effective.getTime() === normalized[index - 1]!.effective.getTime()) throw new RangeError('Salary schedule has duplicate effective dates')
  }
  for (const rate of normalized) {
    if (rate.salary.isNegative()) throw new RangeError('A salary cannot be negative')
  }

  const segments: SalaryRateSegment[] = []
  if (eligibleDays > 0) {
    const first = normalized.findLastIndex(rate => rate.effective <= eligibleStart)
    if (first < 0) throw new RangeError(`No salary rate is effective on ${eligibleStart.toISOString().slice(0, 10)}`)
    for (let index = first; index < normalized.length; index++) {
      const rate = normalized[index]!
      if (rate.effective > eligibleEnd) break
      const segmentStart = rate.effective > eligibleStart ? rate.effective : eligibleStart
      const nextRateDate = normalized[index + 1]?.effective
      const inclusiveSegmentEnd = nextRateDate ? new Date(nextRateDate.getTime() - DAY_MS) : eligibleEnd
      const segmentEnd = inclusiveSegmentEnd < eligibleEnd ? inclusiveSegmentEnd : eligibleEnd
      if (segmentStart > segmentEnd) continue
      const basis = rate.salaryBasis ?? fallbackBasis
      const segmentDays = (segmentEnd.getTime() - segmentStart.getTime()) / DAY_MS + 1
      segments.push({ salary: rate.salary, salaryBasis: basis, effectiveFrom: rate.effectiveFrom, eligibleDays: segmentDays })
    }
  }
  const currency = segments[0]?.salary.currency ?? normalized[0]!.salary.currency
  if (segments.some(segment => segment.salary.currency !== currency)) throw new RangeError('Salary currency changes inside an earning period require explicit FX conversion')
  let amount = makeRational(0n, 1n)
  for (const segment of segments) {
    const factor = segment.salaryBasis === 'MONTHLY' ? 12n : 1n
    const contribution = makeRational(
      segment.salary.minorUnits * factor * BigInt(segment.eligibleDays),
      BigInt(periodsPerYear) * BigInt(periodDays),
    )
    amount = makeRational(
      amount.numerator * contribution.denominator + contribution.numerator * amount.denominator,
      amount.denominator * contribution.denominator,
    )
  }
  const baseSalary = Money.fromMinorUnits(divideRounded(amount.numerator, amount.denominator, 'HALF_UP'), currency)
  return { baseSalary, periodDays, eligibleDays, periodsPerYear, salarySegments: segments }
}

/** Single-rate convenience wrapper retained for payroll calculations without a salary schedule. */
export function computePeriodBaseSalary(salary: Money, salaryBasis: SalaryBasis, period: PayrollPeriod, hiredOn?: string | null, employedThrough?: string | null) {
  const result = computePeriodSalarySchedule(
    [{ salary, salaryBasis, effectiveFrom: period.periodStart }],
    salaryBasis,
    period,
    hiredOn,
    employedThrough,
  )
  return result
}
