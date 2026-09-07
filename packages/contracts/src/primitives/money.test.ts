import { Money } from '@asas/domain'
import { describe, expect, it } from 'vitest'
import {
  currencyCodeSchema,
  decimalStringSchema,
  moneyAsDomainSchema,
  moneySchema,
} from './money.js'

describe('currencyCodeSchema', () => {
  it('validates and normalizes ISO 4217 codes', () => {
    expect(currencyCodeSchema.parse('usd')).toBe('USD')
    expect(currencyCodeSchema.parse(' EUR ')).toBe('EUR')
    expect(currencyCodeSchema.parse('KWD')).toBe('KWD')
    expect(currencyCodeSchema.parse('JPY')).toBe('JPY')
  })

  it('rejects unknown or invalid currency codes', () => {
    expect(() => currencyCodeSchema.parse('ZZZ')).toThrow(/Unknown currency/)
    expect(() => currencyCodeSchema.parse('US')).toThrow(/three letters/)
    expect(() => currencyCodeSchema.parse('USDD')).toThrow(/three letters/)
  })
})

describe('moneySchema', () => {
  it('accepts integer minor units and valid currency', () => {
    const wire = moneySchema.parse({ amount: 123456, currency: 'usd' })
    expect(wire).toEqual({ amount: 123456, currency: 'USD' })
  })

  it('rejects floating point amounts on the wire', () => {
    expect(() => moneySchema.parse({ amount: 1234.56, currency: 'USD' })).toThrow()
  })

  it('rejects unsafe integer amounts', () => {
    expect(() =>
      moneySchema.parse({ amount: Number.MAX_SAFE_INTEGER + 1, currency: 'USD' }),
    ).toThrow()
  })
})

describe('moneyAsDomainSchema', () => {
  it('transforms wire format to Money domain instance', () => {
    const money = moneyAsDomainSchema.parse({ amount: 500, currency: 'USD' })
    expect(money).toBeInstanceOf(Money)
    expect(money.toDecimalString()).toBe('5.00')
    expect(money.currency).toBe('USD')
  })
})

describe('decimalStringSchema', () => {
  it('accepts valid decimal strings', () => {
    expect(decimalStringSchema.parse('1234.56')).toBe('1234.56')
    expect(decimalStringSchema.parse('-0.50')).toBe('-0.50')
    expect(decimalStringSchema.parse('0')).toBe('0')
    expect(decimalStringSchema.parse(' 100 ')).toBe('100')
  })

  it('rejects non-decimal strings or invalid formats', () => {
    expect(() => decimalStringSchema.parse('abc')).toThrow()
    expect(() => decimalStringSchema.parse('12.34.56')).toThrow()
    expect(() => decimalStringSchema.parse('')).toThrow()
  })
})
