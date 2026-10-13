import { describe, expect, it } from 'vitest'
import { Money } from '../money/money.js'
import {
  computeSaudiGosi,
  computeUkPayeTaxes,
  computeUsFederalTaxes,
  US_FICA_SS_WAGE_BASE_CAP_CENTS,
} from './statutory.js'

describe('US Statutory Taxes (FICA + IRS FIT)', () => {
  it('calculates exact FICA Social Security and Medicare on typical monthly pay', () => {
    // $5,000.00 monthly gross = $60,000.00 annualized
    const gross = Money.fromDecimal('5000.00', 'USD')
    const result = computeUsFederalTaxes({
      gross,
      frequency: 'MONTHLY',
      filingStatus: 'SINGLE',
    })

    const ssLine = result.taxLines.find(l => l.label.includes('Social Security'))
    const medLine = result.taxLines.find(l => l.label.includes('Medicare (1.45%)'))
    const fitLine = result.taxLines.find(l => l.label.includes('Federal Income Tax'))

    // 6.2% of $5,000.00 = $310.00
    expect(ssLine?.amount.toDecimalString()).toBe('310.00')
    // 1.45% of $5,000.00 = $72.50
    expect(medLine?.amount.toDecimalString()).toBe('72.50')
    // Progressive FIT on $60,000 annualized:
    // $14,600 @ 0% = $0
    // $11,600 ($14.6k - $26.2k) @ 10% = $1,160.00
    // $33,800 ($26.2k - $60k) @ 12% = $4,056.00
    // Annual FIT = $5,216.00 / 12 = $434.67 (43467 cents)
    expect(fitLine?.amount.toDecimalString()).toBe('434.67')

    // Total deductions = $310.00 + $72.50 + $434.67 = $817.17
    expect(result.totalDeductions.toDecimalString()).toBe('817.17')
  })

  it('respects the Social Security wage base cap of $168,600', () => {
    // Employee who already earned $165,000 prior YTD earning $10,000 this month
    const priorGross = Money.fromDecimal('165000.00', 'USD')
    const currentGross = Money.fromDecimal('10000.00', 'USD')

    const result = computeUsFederalTaxes({
      gross: currentGross,
      frequency: 'MONTHLY',
      filingStatus: 'SINGLE',
      ytdGrossPrior: priorGross,
    })

    const ssLine = result.taxLines.find(l => l.label.includes('Social Security'))
    // Only $3,600 of the $10,000 is taxable before hitting $168,600 cap
    // 6.2% of $3,600 = $223.20
    expect(ssLine?.amount.toDecimalString()).toBe('223.20')

    // Next paycheck where prior gross is already over the cap ($175,000)
    const overCapResult = computeUsFederalTaxes({
      gross: currentGross,
      frequency: 'MONTHLY',
      filingStatus: 'SINGLE',
      ytdGrossPrior: Money.fromDecimal('175000.00', 'USD'),
    })
    const overCapSsLine = overCapResult.taxLines.find(l => l.label.includes('Social Security'))
    expect(overCapSsLine?.amount.toDecimalString()).toBe('0.00')
  })

  it('triggers 0.9% Additional Medicare when earnings exceed $200,000 threshold', () => {
    // Prior earnings $195,000; current paycheck $10,000 -> YTD $205,000 ($5,000 subject to Additional Medicare)
    const result = computeUsFederalTaxes({
      gross: Money.fromDecimal('10000.00', 'USD'),
      frequency: 'MONTHLY',
      filingStatus: 'SINGLE',
      ytdGrossPrior: Money.fromDecimal('195000.00', 'USD'),
    })

    const addMedLine = result.taxLines.find(l => l.label.includes('Additional Medicare'))
    // 0.9% of $5,000 = $45.00
    expect(addMedLine?.amount.toDecimalString()).toBe('45.00')
  })

  it('rejects non-USD currency for US tax calculations', () => {
    expect(() => {
      computeUsFederalTaxes({
        gross: Money.fromDecimal('5000.00', 'EUR'),
        frequency: 'MONTHLY',
      })
    }).toThrow(/require USD/)
  })
})

describe('UK Statutory Taxes (HMRC PAYE + Class 1 NIC)', () => {
  it('calculates PAYE and NIC on standard monthly UK salary', () => {
    // £3,500.00 monthly = £42,000.00 annualized
    const gross = Money.fromDecimal('3500.00', 'GBP')
    const result = computeUkPayeTaxes({
      gross,
      frequency: 'MONTHLY',
      taxCode: '1257L',
    })

    const payeLine = result.taxLines.find(l => l.label.includes('PAYE'))
    const nicLine = result.taxLines.find(l => l.label.includes('National Insurance'))

    // Annualized taxable: £42,000 - £12,570 = £29,430
    // 20% basic rate on £29,430 = £5,886.00 / 12 = £490.50
    expect(payeLine?.amount.toDecimalString()).toBe('490.50')

    // NIC on £42,000:
    // Primary threshold £12,570. Taxable in main band: £42,000 - £12,570 = £29,430
    // 8% of £29,430 = £2,354.40 / 12 = £196.20
    expect(nicLine?.amount.toDecimalString()).toBe('196.20')

    expect(result.totalDeductions.toDecimalString()).toBe('686.70')
  })

  it('applies higher rate 40% and personal allowance taper on high earners', () => {
    // £10,000.00 monthly = £120,000.00 annualized
    const gross = Money.fromDecimal('10000.00', 'GBP')
    const result = computeUkPayeTaxes({
      gross,
      frequency: 'MONTHLY',
    })

    const payeLine = result.taxLines.find(l => l.label.includes('PAYE'))
    // At £120,000, personal allowance tapers by (£120,000 - £100,000) / 2 = £10,000
    // Remaining personal allowance = £12,570 - £10,000 = £2,570
    // Taxable gross = £120,000 - £2,570 = £117,430
    // £37,700 @ 20% = £7,540
    // (£117,430 - £37,700) = £79,730 @ 40% = £31,892
    // Total annual PAYE = £39,432 / 12 = £3,286.00
    expect(payeLine?.amount.toDecimalString()).toBe('3286.00')
  })

  it('rejects non-GBP currency for UK tax calculations', () => {
    expect(() => {
      computeUkPayeTaxes({
        gross: Money.fromDecimal('3000.00', 'USD'),
        frequency: 'MONTHLY',
      })
    }).toThrow(/require GBP/)
  })
})

describe('Saudi Arabia GOSI Engine', () => {
  it('calculates 9.75% employee deduction and 11.75% employer contribution for Saudi Nationals', () => {
    // 20,000.00 SAR monthly salary
    const gross = Money.fromDecimal('20000.00', 'SAR')
    const result = computeSaudiGosi({
      gross,
      isSaudiNational: true,
    })

    // Employee Annuities 9.75% of 20,000 = 1,950.00 SAR
    expect(result.taxLines[0]?.amount.toDecimalString()).toBe('1950.00')
    expect(result.totalEmployeeDeductions.toDecimalString()).toBe('1950.00')

    // Employer Annuities 9.0% = 1,800.00 SAR
    // Employer SANED 0.75% = 150.00 SAR
    // Employer Hazards 2.0% = 400.00 SAR
    // Total Employer: 1,800 + 150 + 400 = 2,350.00 SAR (11.75%)
    expect(result.totalEmployerContributions.toDecimalString()).toBe('2350.00')
  })

  it('caps GOSI contributions at 45,000 SAR monthly ceiling', () => {
    // 60,000.00 SAR executive salary
    const gross = Money.fromDecimal('60000.00', 'SAR')
    const result = computeSaudiGosi({
      gross,
      isSaudiNational: true,
    })

    // 9.75% of 45,000.00 SAR = 4,387.50 SAR
    expect(result.totalEmployeeDeductions.toDecimalString()).toBe('4387.50')
    // 11.75% of 45,000.00 SAR = 5,287.50 SAR
    expect(result.totalEmployerContributions.toDecimalString()).toBe('5287.50')
  })

  it('charges 0% employee and 2.0% employer hazards for Non-Saudi expatriates', () => {
    // 25,000.00 SAR expat salary
    const gross = Money.fromDecimal('25000.00', 'SAR')
    const result = computeSaudiGosi({
      gross,
      isSaudiNational: false,
    })

    expect(result.totalEmployeeDeductions.toDecimalString()).toBe('0.00')
    // 2.0% of 25,000.00 SAR = 500.00 SAR
    expect(result.totalEmployerContributions.toDecimalString()).toBe('500.00')
  })

  it('rejects non-SAR currency for Saudi GOSI calculations', () => {
    expect(() => {
      computeSaudiGosi({
        gross: Money.fromDecimal('10000.00', 'USD'),
        isSaudiNational: true,
      })
    }).toThrow(/requires SAR/)
  })
})
