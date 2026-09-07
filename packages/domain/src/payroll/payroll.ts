import { Money } from '../money/money.js'

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
  /** Relative weight within the split \u2014 e.g. `15` and `5` split a 20% total 3:1. */
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

/**
 * Splits gross pay into named tax lines that always sum to exactly the combined rate's share
 * of gross \u2014 the total is rounded once, then apportioned by weight with
 * {@link Money.allocate}, rather than rounding each line independently.
 *
 * Rounding each line independently is the bug this replaces: two lines rounded on their own
 * (e.g. 15% and 5% of $11,894.50, HALF_UP) land on $1,784.18 and $594.73 \u2014 summing to
 * $2,378.91, one cent more than the correct $2,378.90 (20% of gross). `allocate` guarantees the
 * parts always sum back to the rounded whole instead.
 */
export function computeTaxLines(gross: Money, rates: readonly TaxRate[]): TaxLine[] {
  if (rates.length === 0) return []

  const totalWeight = rates.reduce((sum, rate) => sum + Number(rate.weight), 0)
  const totalDeduction = gross.percentage(totalWeight, 'HALF_UP')
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
