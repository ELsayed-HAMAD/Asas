import { describe, expect, it } from 'vitest'
import { salesQuotaPeriodSchema, salesQuotaUpdateSchema, salesQuotaWriteSchema } from './forecast.js'

describe('sales quota contracts', () => {
  it.each(['2026', '2026-Q1', '2026-Q4', '2026-01', '2026-12'])('accepts period %s', period => {
    expect(salesQuotaPeriodSchema.safeParse(period).success).toBe(true)
  })

  it.each(['2026-Q0', '2026-Q5', '2026-00', '2026-13', 'FY2026', '2026-Q1-extra'])('rejects invalid period %s', period => {
    expect(salesQuotaPeriodSchema.safeParse(period).success).toBe(false)
  })

  it('requires a nonnegative decimal quota and a nonempty update', () => {
    expect(salesQuotaWriteSchema.safeParse({ repName: 'Rep', period: '2026', quota: '100.00' }).success).toBe(true)
    expect(salesQuotaWriteSchema.safeParse({ repName: 'Rep', period: '2026', quota: '-1' }).success).toBe(false)
    expect(salesQuotaUpdateSchema.safeParse({}).success).toBe(false)
  })
})
