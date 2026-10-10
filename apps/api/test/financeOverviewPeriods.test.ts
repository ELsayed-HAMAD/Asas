import { describe, expect, it } from 'vitest'
import { financeCashFlowPeriods, monthToDateComparisonPeriods } from '../src/modules/finance/finance.service.js'

describe('finance cash-flow comparison periods', () => {
  it('uses full calendar years for completed selections', () => {
    expect(financeCashFlowPeriods(2024, new Date('2026-10-08T00:00:00Z'))).toEqual({
      current: { startDate: '2024-01-01', endDateExclusive: '2025-01-01' },
      previous: { startDate: '2023-01-01', endDateExclusive: '2024-01-01' },
    })
  })

  it('compares current year to the same tenant-local calendar day in the prior year, clamping leap day', () => {
    expect(financeCashFlowPeriods(2024, new Date('2024-02-29T00:00:00Z'))).toEqual({
      current: { startDate: '2024-01-01', endDateExclusive: '2024-03-01' },
      previous: { startDate: '2023-01-01', endDateExclusive: '2023-03-01' },
    })
  })

  it('returns empty windows for a future selected year', () => {
    expect(financeCashFlowPeriods(2027, new Date('2026-10-08T00:00:00Z'))).toEqual({
      current: { startDate: '2027-01-01', endDateExclusive: '2027-01-01' },
      previous: { startDate: '2026-01-01', endDateExclusive: '2026-01-01' },
    })
  })
})

describe('payable month-to-date comparison periods', () => {
  it('uses tenant-local calendar dates and clamps the prior month to its final day', () => {
    expect(monthToDateComparisonPeriods(new Date('2026-10-08T00:00:00Z'))).toEqual({
      current: { startDate: '2026-10-01', endDateExclusive: '2026-10-09' },
      previous: { startDate: '2026-09-01', endDateExclusive: '2026-09-09' },
    })
    expect(monthToDateComparisonPeriods(new Date('2026-03-31T00:00:00Z')).previous).toEqual({
      startDate: '2026-02-01', endDateExclusive: '2026-03-01',
    })
  })
})
