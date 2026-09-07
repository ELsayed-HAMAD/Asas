import { Money } from '@asas/domain'
import { describe, expect, it } from 'vitest'
import {
  formatCompactNumber,
  formatDate,
  formatMoney,
  formatPercent,
  setFormatDefaults,
} from './format.js'

describe('formatMoney', () => {
  it('formats Money instances according to their currency and scale', () => {
    const usd = Money.fromDecimal('1234.56', 'USD')
    expect(formatMoney(usd, { locale: 'en-US' })).toBe('$1,234.56')

    const jpy = Money.fromDecimal('1000', 'JPY')
    expect(formatMoney(jpy, { locale: 'en-US' })).toBe('¥1,000')
  })

  it('formats wire objects and raw numbers', () => {
    expect(formatMoney({ amount: 50000, currency: 'USD' }, { locale: 'en-US' })).toBe('$500.00')
    expect(formatMoney(1234.56, { currency: 'USD', locale: 'en-US' })).toBe('$1,234.56')
  })

  it('supports compact notation and plus prefix', () => {
    expect(formatMoney(1240000, { currency: 'USD', compact: true, locale: 'en-US' })).toBe(
      '$1.2M',
    )
    expect(formatMoney(500, { currency: 'USD', forcePlus: true, locale: 'en-US' })).toBe('+$500.00')
  })

  it('returns em dash for null or undefined or invalid', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney('invalid')).toBe('—')
  })
})

describe('formatCompactNumber', () => {
  it('formats large numbers into compact strings', () => {
    expect(formatCompactNumber(1250000, 'en-US')).toBe('1.3M')
    expect(formatCompactNumber(4500, 'en-US')).toBe('4.5K')
    expect(formatCompactNumber(null)).toBe('—')
  })
})

describe('formatPercent', () => {
  it('formats percentages', () => {
    expect(formatPercent(75, { locale: 'en-US' })).toBe('75%')
    expect(formatPercent(24.8, { locale: 'en-US' })).toBe('24.8%')
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatDate', () => {
  it('formats dates consistently', () => {
    const date = new Date('2026-08-29T12:00:00Z')
    expect(formatDate(date, { dateStyle: 'medium' }, 'en-US')).toBe('Aug 29, 2026')
    expect(formatDate('invalid')).toBe('—')
    expect(formatDate(null)).toBe('—')
  })
})
