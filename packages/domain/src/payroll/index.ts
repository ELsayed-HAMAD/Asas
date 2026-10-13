export {
  computeDeductions,
  computeGrossPay,
  computeNetPay,
  computePayrollLine,
  computeTaxLines,
  sumPayrollTaxRates,
  type PayrollLineInputs,
  type PayrollLineResult,
  type TaxLine,
  type TaxRate,
} from './payroll.js'

export { computePeriodBaseSalary, computePeriodSalarySchedule, validatePayrollPeriod, type PayrollPeriod, type SalaryBasis, type SalaryRate, type SalaryRateSegment, type PayFrequency } from './period.js'

export {
  computeUsFederalTaxes,
  computeUkPayeTaxes,
  computeSaudiGosi,
  getPeriodsPerYear,
  US_FICA_SS_WAGE_BASE_CAP_CENTS,
  US_ADDITIONAL_MEDICARE_THRESHOLD_CENTS,
  SAUDI_GOSI_MONTHLY_CAP_HALALAS,
  type PayPeriodFrequency,
  type UsTaxInputs,
  type UsTaxResult,
  type UkTaxInputs,
  type UkTaxResult,
  type SaudiGosiInputs,
  type SaudiGosiResult,
} from './statutory.js'
