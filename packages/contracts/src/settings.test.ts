import { describe, expect, it } from 'vitest'
import { exchangeRateListQuerySchema, exchangeRateWriteSchema, generalSettingsUpdateSchema } from './settings/index.js'

describe('workspace FX contracts', () => {
  it('requires a positive decimal quote with bounded currency precision and timestamp', () => {
    expect(exchangeRateWriteSchema.parse({ currency: 'EUR', rateToBase: '1.087654321012', effectiveAt: '2026-10-07T10:00:00.000Z' }))
      .toMatchObject({ currency: 'EUR', rateToBase: '1.087654321012' })
    for (const rateToBase of ['0', '-1', '1.1234567890123', '1234567890123']) {
      expect(exchangeRateWriteSchema.safeParse({ currency: 'EUR', rateToBase, effectiveAt: '2026-10-07T10:00:00.000Z' }).success).toBe(false)
    }
    expect(exchangeRateWriteSchema.safeParse({ currency: 'EUR', rateToBase: '1.1', effectiveAt: 'not-a-date' }).success).toBe(false)
  })

  it('validates paginated history filters', () => {
    expect(exchangeRateListQuerySchema.parse({ currency: 'EUR', page: '2', limit: '50' }))
      .toEqual({ currency: 'EUR', page: 2, limit: 50 })
    expect(exchangeRateListQuerySchema.safeParse({ currency: 'ZZZ' }).success).toBe(false)
  })
})

describe('workspace overtime settings', () => {
  it('accepts thresholds from 1 to 24 hours and rejects values outside the supported range', () => {
    expect(generalSettingsUpdateSchema.parse({ overtimeThresholdHours: 8.5 })).toEqual({ overtimeThresholdHours: 8.5 })
    for (const overtimeThresholdHours of [0, 24.1, -1, '8']) {
      expect(generalSettingsUpdateSchema.safeParse({ overtimeThresholdHours }).success).toBe(false)
    }
  })
})
