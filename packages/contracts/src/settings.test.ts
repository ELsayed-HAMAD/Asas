import { describe, expect, it } from 'vitest'
import {
  exchangeRateListQuerySchema,
  exchangeRateWriteSchema,
  generalSettingsUpdateSchema,
  integrationUpdateSchema,
  integrationWriteSchema,
  notificationSettingsUpdateSchema,
  quietHoursSchema,
} from './settings/index.js'

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

describe('workspace timezone settings', () => {
  it('accepts supported IANA timezone identifiers and rejects invalid values', () => {
    expect(generalSettingsUpdateSchema.parse({ timezone: 'Africa/Cairo' })).toEqual({ timezone: 'Africa/Cairo' })
    expect(generalSettingsUpdateSchema.parse({ timezone: 'UTC' })).toEqual({ timezone: 'UTC' })
    expect(generalSettingsUpdateSchema.safeParse({ timezone: 'Mars/Olympus_Mons' }).success).toBe(false)
    expect(generalSettingsUpdateSchema.safeParse({ timezone: '   ' }).success).toBe(false)
  })
})

describe('notification quiet-hours settings', () => {
  it('accepts valid windows and rejects impossible times or a full-day mute', () => {
    expect(quietHoursSchema.safeParse({ start: '22:00', end: '07:00' }).success).toBe(true)
    expect(quietHoursSchema.safeParse({ start: '13:00', end: '15:00' }).success).toBe(true)
    expect(quietHoursSchema.safeParse({ start: '25:00', end: '07:00' }).success).toBe(false)
    expect(quietHoursSchema.safeParse({ start: '22:00', end: '22:00' }).success).toBe(false)
    expect(notificationSettingsUpdateSchema.safeParse({ quietHours: { start: '22:00', end: '22:00' } }).success).toBe(false)
    expect(notificationSettingsUpdateSchema.safeParse({ quietHours: { start: '21:30' } }).success).toBe(true)
  })
})

describe('integration endpoint settings', () => {
  it('does not let callers fake provider sync or endpoint health status', () => {
    expect(integrationWriteSchema.safeParse({ name: 'GitHub', status: 'CONNECTED', syncPullRequests: true }).success).toBe(false)
    expect(integrationUpdateSchema.safeParse({ status: 'CONNECTED' }).success).toBe(false)
    expect(integrationUpdateSchema.safeParse({ syncCiCdStatus: true }).success).toBe(false)
  })

  it('requires an actual endpoint update or explicit clear operation', () => {
    expect(integrationUpdateSchema.safeParse({ credential: {} }).success).toBe(false)
    expect(integrationUpdateSchema.safeParse({ credential: { clear: true } }).success).toBe(true)
    expect(integrationUpdateSchema.safeParse({ credential: { value: 'https://hooks.example.com/asas' } }).success).toBe(true)
  })
})
