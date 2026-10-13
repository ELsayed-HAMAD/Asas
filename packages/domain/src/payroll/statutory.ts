import { Money } from '../money/money.js'
import { makeRational } from '../money/rational.js'
import type { TaxLine } from './payroll.js'

export type PayPeriodFrequency = 'ANNUAL' | 'MONTHLY' | 'TWICE_MONTHLY' | 'BIWEEKLY' | 'WEEKLY'

export function getPeriodsPerYear(frequency: PayPeriodFrequency): bigint {
  switch (frequency) {
    case 'ANNUAL':
      return 1n
    case 'MONTHLY':
      return 12n
    case 'TWICE_MONTHLY':
      return 24n
    case 'BIWEEKLY':
      return 26n
    case 'WEEKLY':
      return 52n
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNITED STATES (US) STATUTORY TAX ENGINE (FICA + IRS Form W-4 FIT)
// ─────────────────────────────────────────────────────────────────────────────

/** 2024-2026 US Social Security Wage Base Cap ($168,600.00 = 16,860,000 cents) */
export const US_FICA_SS_WAGE_BASE_CAP_CENTS = 16860000n
/** Additional Medicare Tax Threshold ($200,000.00 = 20,000,000 cents for Single) */
export const US_ADDITIONAL_MEDICARE_THRESHOLD_CENTS = 20000000n

export interface UsTaxInputs {
  gross: Money // USD
  frequency: PayPeriodFrequency
  filingStatus?: 'SINGLE' | 'MARRIED_FILING_JOINTLY'
  ytdGrossPrior?: Money
}

export interface UsTaxResult {
  taxLines: TaxLine[]
  totalDeductions: Money
}

/**
 * Calculates US Federal Taxes:
 * 1. FICA Social Security: 6.2% up to the annual cap ($168,600).
 * 2. FICA Medicare: 1.45% on all earnings.
 * 3. Additional Medicare: 0.9% on earnings exceeding $200,000 threshold.
 * 4. Federal Income Tax (FIT): Progressive annualized bracket percentage withholding method.
 */
export function computeUsFederalTaxes(inputs: UsTaxInputs): UsTaxResult {
  const { gross, frequency } = inputs
  if (gross.currency !== 'USD') {
    throw new Error(`US statutory taxes require USD currency, received ${gross.currency}`)
  }

  const periodsPerYear = getPeriodsPerYear(frequency)
  const priorCents = inputs.ytdGrossPrior ? inputs.ytdGrossPrior.minorUnits : 0n
  const currentGrossCents = gross.minorUnits
  const newYtdCents = priorCents + currentGrossCents

  const taxLines: TaxLine[] = []

  // 1. Social Security (6.2%, capped at $168,600)
  let ssTaxableCents = 0n
  if (priorCents < US_FICA_SS_WAGE_BASE_CAP_CENTS) {
    const remainingCap = US_FICA_SS_WAGE_BASE_CAP_CENTS - priorCents
    ssTaxableCents = currentGrossCents > remainingCap ? remainingCap : currentGrossCents
  }
  const ssTaxMoney = Money.fromMinorUnits(ssTaxableCents, 'USD').multiply(makeRational(62n, 1000n), 'HALF_UP')
  taxLines.push({ label: 'FICA Social Security (6.2%)', amount: ssTaxMoney })

  // 2. Standard Medicare (1.45%)
  const medicareTaxMoney = gross.multiply(makeRational(145n, 10000n), 'HALF_UP')
  taxLines.push({ label: 'FICA Medicare (1.45%)', amount: medicareTaxMoney })

  // 3. Additional Medicare (0.9% above $200,000)
  let addMedicareTaxableCents = 0n
  if (newYtdCents > US_ADDITIONAL_MEDICARE_THRESHOLD_CENTS) {
    if (priorCents >= US_ADDITIONAL_MEDICARE_THRESHOLD_CENTS) {
      addMedicareTaxableCents = currentGrossCents
    } else {
      addMedicareTaxableCents = newYtdCents - US_ADDITIONAL_MEDICARE_THRESHOLD_CENTS
    }
  }
  if (addMedicareTaxableCents > 0n) {
    const addMedicareMoney = Money.fromMinorUnits(addMedicareTaxableCents, 'USD').multiply(makeRational(9n, 1000n), 'HALF_UP')
    taxLines.push({ label: 'Additional Medicare (0.9%)', amount: addMedicareMoney })
  }

  // 4. Federal Income Tax (Annualized Progressive Percentage Method)
  // Annualized wage = gross * periodsPerYear
  const annualizedGrossCents = currentGrossCents * periodsPerYear
  const filingStatus = inputs.filingStatus ?? 'SINGLE'

  // IRS Annual Percentage Method Brackets (cents)
  // Single: Standard deduction $14,600
  const brackets = filingStatus === 'MARRIED_FILING_JOINTLY'
    ? [
        { max: 2920000n, rateNum: 0n, rateDen: 100n },
        { max: 5240000n, rateNum: 10n, rateDen: 100n },
        { max: 12350000n, rateNum: 12n, rateDen: 100n },
        { max: 23025000n, rateNum: 22n, rateDen: 100n },
        { max: 41310000n, rateNum: 24n, rateDen: 100n },
        { max: 51665000n, rateNum: 32n, rateDen: 100n },
        { max: 73120000n, rateNum: 35n, rateDen: 100n },
        { max: -1n, rateNum: 37n, rateDen: 100n },
      ]
    : [
        { max: 1460000n, rateNum: 0n, rateDen: 100n },
        { max: 2620000n, rateNum: 10n, rateDen: 100n },
        { max: 6175000n, rateNum: 12n, rateDen: 100n },
        { max: 11512500n, rateNum: 22n, rateDen: 100n },
        { max: 20655000n, rateNum: 24n, rateDen: 100n },
        { max: 25832500n, rateNum: 32n, rateDen: 100n },
        { max: 62395000n, rateNum: 35n, rateDen: 100n },
        { max: -1n, rateNum: 37n, rateDen: 100n },
      ]

  let annualFitTaxCents = 0n
  let previousLimit = 0n

  for (const bracket of brackets) {
    if (annualizedGrossCents <= previousLimit) break
    const currentLimit = bracket.max === -1n ? annualizedGrossCents : bracket.max
    const taxableInBracket = (annualizedGrossCents > currentLimit ? currentLimit : annualizedGrossCents) - previousLimit

    if (taxableInBracket > 0n && bracket.rateNum > 0n) {
      annualFitTaxCents += (taxableInBracket * bracket.rateNum) / bracket.rateDen
    }
    previousLimit = currentLimit
  }

  // Apportion back to the pay period: annualFitTaxCents / periodsPerYear
  const periodFitCents = (annualFitTaxCents + (periodsPerYear / 2n)) / periodsPerYear
  const fitMoney = Money.fromMinorUnits(periodFitCents, 'USD')
  taxLines.push({ label: `Federal Income Tax (${filingStatus === 'MARRIED_FILING_JOINTLY' ? 'MFJ' : 'Single'})`, amount: fitMoney })

  const totalDeductions = Money.sum(taxLines.map(l => l.amount), 'USD')
  return { taxLines, totalDeductions }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNITED KINGDOM (UK) STATUTORY ENGINE (HMRC PAYE + Class 1 NIC)
// ─────────────────────────────────────────────────────────────────────────────

export interface UkTaxInputs {
  gross: Money // GBP
  frequency: PayPeriodFrequency
  taxCode?: string // default: '1257L'
}

export interface UkTaxResult {
  taxLines: TaxLine[]
  totalDeductions: Money
}

/**
 * Calculates UK HMRC PAYE and Employee Class 1 National Insurance:
 * 1. Income Tax (PAYE) based on standard 1257L personal allowance (£12,570/yr) with personal allowance taper.
 *    - Basic rate: 20% (£12,571 - £50,270)
 *    - Higher rate: 40% (£50,271 - £125,140)
 *    - Additional rate: 45% (>£125,140)
 * 2. Class 1 National Insurance Contributions (NIC Category A):
 *    - Under Primary Threshold (£1,048/mo = £12,576/yr): 0%
 *    - Between Primary Threshold and Upper Earnings Limit (£4,189/mo = £50,270/yr): 8%
 *    - Above Upper Earnings Limit: 2%
 */
export function computeUkPayeTaxes(inputs: UkTaxInputs): UkTaxResult {
  const { gross, frequency } = inputs
  if (gross.currency !== 'GBP') {
    throw new Error(`UK statutory taxes require GBP currency, received ${gross.currency}`)
  }

  const periodsPerYear = getPeriodsPerYear(frequency)
  const annualizedGrossPence = gross.minorUnits * periodsPerYear

  const taxLines: TaxLine[] = []

  // 1. Personal Allowance Calculation (£12,570 = 1,257,000 pence)
  // Tapers £1 for every £2 earned above £100,000 (10,000,000 pence)
  let personalAllowancePence = 1257000n
  if (annualizedGrossPence > 10000000n) {
    const excess = annualizedGrossPence - 10000000n
    const reduction = excess / 2n
    personalAllowancePence = personalAllowancePence > reduction ? personalAllowancePence - reduction : 0n
  }

  // UK Income Tax Bands (annualized pence)
  const basicBandPence = 5027000n
  const higherBandPence = 12514000n

  let annualPayeTaxPence = 0n

  if (annualizedGrossPence > personalAllowancePence) {
    const taxableGross = annualizedGrossPence - personalAllowancePence
    const basicLimit = basicBandPence - 1257000n // £37,700 basic rate band

    if (taxableGross <= basicLimit) {
      annualPayeTaxPence = (taxableGross * 20n) / 100n
    } else {
      annualPayeTaxPence = (basicLimit * 20n) / 100n
      const taxableOverBasic = taxableGross - basicLimit
      const additionalThresholdGross = 12514000n

      if (annualizedGrossPence <= additionalThresholdGross) {
        annualPayeTaxPence += (taxableOverBasic * 40n) / 100n
      } else {
        const taxableAtAdditional = annualizedGrossPence - additionalThresholdGross
        const taxableAtHigher = taxableOverBasic - taxableAtAdditional
        annualPayeTaxPence += (taxableAtHigher * 40n) / 100n
        annualPayeTaxPence += (taxableAtAdditional * 45n) / 100n
      }
    }
  }

  const periodPayePence = (annualPayeTaxPence + (periodsPerYear / 2n)) / periodsPerYear
  taxLines.push({
    label: `Income Tax PAYE (${inputs.taxCode ?? '1257L'})`,
    amount: Money.fromMinorUnits(periodPayePence, 'GBP'),
  })

  // 2. Class 1 National Insurance Contributions (NIC)
  // Annual Primary Threshold = £12,570 (1,257,000 pence)
  // Annual Upper Earnings Limit = £50,270 (5,027,000 pence)
  const ptPence = 1257000n
  const uelPence = 5027000n

  let annualNicPence = 0n
  if (annualizedGrossPence > ptPence) {
    const mainBandGross = (annualizedGrossPence > uelPence ? uelPence : annualizedGrossPence) - ptPence
    annualNicPence += (mainBandGross * 8n) / 100n // 8% main rate

    if (annualizedGrossPence > uelPence) {
      const upperGross = annualizedGrossPence - uelPence
      annualNicPence += (upperGross * 2n) / 100n // 2% higher rate
    }
  }

  const periodNicPence = (annualNicPence + (periodsPerYear / 2n)) / periodsPerYear
  taxLines.push({
    label: 'National Insurance (Class 1 Employee)',
    amount: Money.fromMinorUnits(periodNicPence, 'GBP'),
  })

  const totalDeductions = Money.sum(taxLines.map(l => l.amount), 'GBP')
  return { taxLines, totalDeductions }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SAUDI ARABIA (SA) STATUTORY GOSI ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/** Saudi GOSI maximum contributory monthly wage cap: 45,000.00 SAR (4,500,000 halalas) */
export const SAUDI_GOSI_MONTHLY_CAP_HALALAS = 4500000n

export interface SaudiGosiInputs {
  gross: Money // SAR
  isSaudiNational: boolean
}

export interface SaudiGosiResult {
  taxLines: TaxLine[] // Employee deductions
  employerContributions: TaxLine[]
  totalEmployeeDeductions: Money
  totalEmployerContributions: Money
}

/**
 * Calculates Saudi Arabia General Organization for Social Insurance (GOSI):
 * - Monthly contributory wage capped at 45,000 SAR.
 * - Saudi Nationals:
 *   - Employee: 9.75% (Annuities branch)
 *   - Employer: 11.75% (Annuities 9.75% + SANED Unemployment 0.75% + Occupational Hazard 1.5%)
 * - Non-Saudi Nationals:
 *   - Employee: 0%
 *   - Employer: 2.0% (Occupational Hazards only)
 */
export function computeSaudiGosi(inputs: SaudiGosiInputs): SaudiGosiResult {
  const { gross, isSaudiNational } = inputs
  if (gross.currency !== 'SAR') {
    throw new Error(`Saudi GOSI requires SAR currency, received ${gross.currency}`)
  }

  const grossHalalas = gross.minorUnits
  const contributoryHalalas = grossHalalas > SAUDI_GOSI_MONTHLY_CAP_HALALAS ? SAUDI_GOSI_MONTHLY_CAP_HALALAS : grossHalalas
  const contributoryMoney = Money.fromMinorUnits(contributoryHalalas, 'SAR')

  const employeeLines: TaxLine[] = []
  const employerLines: TaxLine[] = []

  if (isSaudiNational) {
    // Employee deduction: 9.75%
    const employeeAnnuities = contributoryMoney.multiply(makeRational(975n, 10000n), 'HALF_UP')
    employeeLines.push({ label: 'GOSI Employee Annuities (9.75%)', amount: employeeAnnuities })

    // Employer contributions: 11.75% (Annuities 9.0% + SANED 0.75% + Hazards 2.0%)
    const employerAnnuities = contributoryMoney.multiply(makeRational(900n, 10000n), 'HALF_UP')
    const employerSaned = contributoryMoney.multiply(makeRational(75n, 10000n), 'HALF_UP')
    const employerHazard = contributoryMoney.multiply(makeRational(200n, 10000n), 'HALF_UP')
    employerLines.push({ label: 'GOSI Employer Annuities (9.0%)', amount: employerAnnuities })
    employerLines.push({ label: 'GOSI SANED Unemployment (0.75%)', amount: employerSaned })
    employerLines.push({ label: 'GOSI Occupational Hazards (2.0%)', amount: employerHazard })
  } else {
    // Non-Saudi (Expatriate):
    // Employee: 0%
    employeeLines.push({ label: 'GOSI Expat Deduction (0%)', amount: Money.zero('SAR') })

    // Employer: Occupational Hazards 2.0%
    const employerHazard = contributoryMoney.multiply(makeRational(200n, 10000n), 'HALF_UP')
    employerLines.push({ label: 'GOSI Occupational Hazards (2.0%)', amount: employerHazard })
  }

  const totalEmployeeDeductions = Money.sum(employeeLines.map(l => l.amount), 'SAR')
  const totalEmployerContributions = Money.sum(employerLines.map(l => l.amount), 'SAR')

  return {
    taxLines: employeeLines,
    employerContributions: employerLines,
    totalEmployeeDeductions,
    totalEmployerContributions,
  }
}
