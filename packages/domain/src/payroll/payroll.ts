import { Money } from '../money/money.js'
import { makeRational, rationalFromDecimal, type Rational } from '../money/rational.js'

export interface PayrollLineInputs {
  /** The employee's base pay for the period, before any adjustment. */
  baseSalary: Money
  /** Deducted from `baseSalary` for unpaid missed time. */
  missedDaysAmount?: Money
  /** Added on top of `baseSalary` (commission, spot bonus, ...). */
  bonusAmount?: Money
}

export interface TaxRate {
  label: string
  /** Percentage of gross, e.g. `15` and `5` mean a 20% deduction split 3:1. */
  weight: number | string
}

export interface TaxLine {
  label: string
  amount: Money
}

export interface PayrollLineResult {
  gross: Money
  taxLines: TaxLine[]
  deductions: Money
  net: Money
}

/**
 * `gross = baseSalary - missedDaysAmount + bonusAmount`.
 *
 * Deliberately does not reject a zero or negative result \u2014 that is a legitimate (if
 * unusual) outcome for the caller to decide how to handle, not this function's job.
 */
export function computeGrossPay(inputs: PayrollLineInputs): Money {
  let gross = inputs.baseSalary
  if (inputs.missedDaysAmount) gross = gross.subtract(inputs.missedDaysAmount)
  if (inputs.bonusAmount) gross = gross.add(inputs.bonusAmount)
  return gross
}

/** Exact combined percentage; invalid rates must never silently become zero deductions. */
export function sumPayrollTaxRates(rates: readonly TaxRate[]): Rational {
  let total = makeRational(0n, 1n)
  for (const rate of rates) {
    const value = rationalFromDecimal(rate.weight)
    if (value.numerator < 0n) throw new RangeError(`Tax rate '${rate.label}' must be non-negative`)
    total = makeRational(total.numerator * value.denominator + value.numerator * total.denominator, total.denominator * value.denominator)
  }
  if (total.numerator > 100n * total.denominator) throw new RangeError('Tax rates cannot add up to more than 100%')
  return total
}

/**
 * Combine percentages exactly, round the total deduction once, then allocate by weight.
 * Independent rounding can leak a minor unit; floating-point summation can move an exact
 * HALF_UP boundary down. The named tax lines must sum back to the rounded total in all cases.
 */
export function computeTaxLines(gross: Money, rates: readonly TaxRate[]): TaxLine[] {
  if (rates.length === 0) return []

  const totalRate = sumPayrollTaxRates(rates)
  if (totalRate.numerator === 0n) {
    return rates.map(rate => ({ label: rate.label, amount: Money.zero(gross.currency) }))
  }
  const totalDeduction = gross.multiply(makeRational(totalRate.numerator, totalRate.denominator * 100n), 'HALF_UP')
  const amounts = totalDeduction.allocate(rates.map(rate => rate.weight))

  return rates.map((rate, index) => ({
    label: rate.label,
    amount: amounts[index] as Money,
  }))
}

/** Sum of the tax lines. Requires at least one line, since an empty list carries no currency. */
export function computeDeductions(taxLines: readonly TaxLine[]): Money {
  if (taxLines.length === 0) {
    throw new TypeError('computeDeductions() requires at least one tax line to infer a currency')
  }
  return Money.sum(taxLines.map(line => line.amount))
}

export function computeNetPay(gross: Money, deductions: Money): Money {
  return gross.subtract(deductions)
}

/**
 * Composes the four steps above into one payroll line. This is the one place gross,
 * deductions, tax lines, and net are computed \u2014 a payroll run, a payslip PDF, and a
 * dashboard KPI all call this instead of each re-deriving the numbers their own way.
 */
export function computePayrollLine(inputs: PayrollLineInputs, rates: readonly TaxRate[]): PayrollLineResult {
  const gross = computeGrossPay(inputs)
  const taxLines = computeTaxLines(gross, rates)
  const deductions = computeDeductions(taxLines)
  const net = computeNetPay(gross, deductions)
  return { gross, taxLines, deductions, net }
}
