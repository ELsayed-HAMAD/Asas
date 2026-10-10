import { describe, expect, it } from 'vitest'
import { Money } from '../money/money.js'
import { computeDeductions, computeGrossPay, computeNetPay, computePayrollLine, computeTaxLines, sumPayrollTaxRates } from './payroll.js'

const STANDARD_RATES = [
  { label: 'Federal Tax', weight: 15 },
  { label: 'State Tax', weight: 5 },
]

describe('computeGrossPay', () => {
  it('is just baseSalary when there are no adjustments', () => {
    const gross = computeGrossPay({ baseSalary: Money.fromDecimal('5000', 'USD') })
    expect(gross.toDecimalString()).toBe('5000.00')
  })

  it('subtracts missed days and adds a bonus', () => {
    const gross = computeGrossPay({
      baseSalary: Money.fromDecimal('5000', 'USD'),
      missedDaysAmount: Money.fromDecimal('200', 'USD'),
      bonusAmount: Money.fromDecimal('500', 'USD'),
    })
    expect(gross.toDecimalString()).toBe('5300.00')
  })
})

describe('computeTaxLines / computeDeductions / computeNetPay', () => {
  // Golden values straight from api/seeds/onboarding/enterprise.json's seeded payroll run,
  // for salaries that divide evenly \u2014 no rounding ambiguity, so they prove the happy path
  // exactly rather than merely "close enough".
  it.each([
    { gross: '29166.67', federal: '4375.00', state: '1458.33', deductions: '5833.33', net: '23333.34' },
    { gross: '23333.33', federal: '3500.00', state: '1166.67', deductions: '4666.67', net: '18666.66' },
    { gross: '21666.67', federal: '3250.00', state: '1083.33', deductions: '4333.33', net: '17333.34' },
    { gross: '22500.00', federal: '3375.00', state: '1125.00', deductions: '4500.00', net: '18000.00' },
  ])('reproduces the seeded payroll run for gross $gross', ({ gross, federal, state, deductions, net }) => {
    const grossMoney = Money.fromDecimal(gross, 'USD')
    const taxLines = computeTaxLines(grossMoney, STANDARD_RATES)
    expect(taxLines.map(line => [line.label, line.amount.toDecimalString()])).toEqual([
      ['Federal Tax', federal],
      ['State Tax', state],
    ])
    expect(computeDeductions(taxLines).toDecimalString()).toBe(deductions)
    expect(computeNetPay(grossMoney, computeDeductions(taxLines)).toDecimalString()).toBe(net)
  })

  it('never leaks a cent, unlike rounding each tax line independently', () => {
    // The seed pack actually stores $2,378.91 for this gross (rounding 15% and 5% separately:
    // $1,784.18 + $594.73). Allocating from a single rounded total instead gives the number
    // that is actually correct \u2014 20% of $11,894.50 is $2,378.90, not $2,378.91.
    const gross = Money.fromDecimal('11894.50', 'USD')
    const taxLines = computeTaxLines(gross, STANDARD_RATES)
    const deductions = computeDeductions(taxLines)

    expect(deductions.toDecimalString()).toBe('2378.90')
    expect(
      taxLines.reduce((sum, line) => sum.add(line.amount), Money.zero('USD')).toDecimalString(),
    ).toBe(deductions.toDecimalString())
  })

  it('returns no tax lines and zero deductions is an error without at least one rate', () => {
    const gross = Money.fromDecimal('1000', 'USD')
    expect(computeTaxLines(gross, [])).toEqual([])
    expect(() => computeDeductions([])).toThrow(/at least one tax line/)
  })

  it('treats an all-zero weight set as zero deductions (no RangeError)', () => {
    const gross = Money.fromDecimal('5000', 'USD')
    const lines = computeTaxLines(gross, [
      { label: 'Federal Tax', weight: 0 },
      { label: 'State Tax', weight: 0 },
    ])
    expect(lines.map((line) => line.amount.toDecimalString())).toEqual(['0.00', '0.00'])
    expect(computeDeductions(lines).toDecimalString()).toBe('0.00')
  })

  it('rejects negative rates even when they cancel out positive rates', () => {
    const gross = Money.fromDecimal('5000', 'USD')
    expect(() => computeTaxLines(gross, [
      { label: 'Federal Tax', weight: 15 },
      { label: 'Credit', weight: -15 },
    ])).toThrow(/non-negative/)
  })

  it('sums decimal percentages as an exact rational', () => {
    expect(sumPayrollTaxRates([{ label: 'A', weight: '0.1' }, { label: 'B', weight: '0.2' }])).toEqual({ numerator: 3n, denominator: 10n })
    expect(sumPayrollTaxRates([{ label: 'A', weight: '33.33' }, { label: 'B', weight: '33.33' }, { label: 'C', weight: '33.34' }])).toEqual({ numerator: 100n, denominator: 1n })
  })

  it('rejects any excess above 100%, without a float epsilon', () => {
    expect(() => sumPayrollTaxRates([{ label: 'A', weight: '100' }, { label: 'B', weight: '0.000000000000000001' }])).toThrow(/100%/)
  })

  it.each(['NaN', 'Infinity', 'not-a-rate'])('rejects malformed rate %s', weight => {
    expect(() => computeTaxLines(Money.fromDecimal('100', 'USD'), [{ label: 'Tax', weight }])).toThrow(RangeError)
  })

  it('rounds an exact half-cent boundary correctly despite decimal float summation', () => {
    // Number('0.2') + Number('0.7') is 0.8999999999999999; exact 0.9% of 500 minor units is 4.5.
    const rates = [{ label: 'A', weight: '0.2' }, { label: 'B', weight: '0.7' }]
    const lines = computeTaxLines(Money.fromDecimal('0.500', 'KWD'), rates)
    expect(computeDeductions(lines).toDecimalString()).toBe('0.005')
    const usd = computeTaxLines(Money.fromDecimal('5.00', 'USD'), rates)
    expect(computeDeductions(usd).toDecimalString()).toBe('0.05')
  })
})

describe('computePayrollLine', () => {
  it('composes gross, tax lines, deductions, and net into one result', () => {
    const result = computePayrollLine(
      {
        baseSalary: Money.fromDecimal('12000', 'USD'),
        bonusAmount: Money.fromDecimal('500', 'USD'),
        missedDaysAmount: Money.fromDecimal('0', 'USD'),
      },
      STANDARD_RATES,
    )

    expect(result.gross.toDecimalString()).toBe('12500.00')
    expect(result.deductions.toDecimalString()).toBe('2500.00')
    expect(result.net.toDecimalString()).toBe('10000.00')
    expect(result.net.add(result.deductions).toDecimalString()).toBe(result.gross.toDecimalString())
  })

  it('always satisfies gross = deductions + net, across arbitrary weights', () => {
    const weightSets = [
      [{ label: 'A', weight: 15 }, { label: 'B', weight: 5 }],
      [{ label: 'A', weight: 1 }, { label: 'B', weight: 1 }, { label: 'C', weight: 1 }],
      [{ label: 'A', weight: 7.5 }],
    ]
    const grosses = ['100.01', '9999.99', '1.23', '50000.00']

    for (const rates of weightSets) {
      for (const gross of grosses) {
        const result = computePayrollLine({ baseSalary: Money.fromDecimal(gross, 'USD') }, rates)
        expect(result.net.add(result.deductions).toDecimalString()).toBe(result.gross.toDecimalString())
      }
    }
  })
})
