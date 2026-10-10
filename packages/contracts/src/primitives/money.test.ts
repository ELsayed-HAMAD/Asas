import { Money } from '@asas/domain'
import { describe, expect, it } from 'vitest'
import {
  compareDecimalStrings,
  currencyCodeSchema,
  decimalStringSchema,
  moneyAsDomainSchema,
  moneySchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
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

describe('positiveDecimalStringSchema', () => {
  it('accepts amounts greater than zero', () => {
    expect(positiveDecimalStringSchema.parse('0.01')).toBe('0.01')
    expect(positiveDecimalStringSchema.parse(' 1250.00 ')).toBe('1250.00')
  })

  it('rejects zero, negative, and malformed amounts', () => {
    expect(positiveDecimalStringSchema.safeParse('0').success).toBe(false)
    expect(positiveDecimalStringSchema.safeParse('0.00').success).toBe(false)
    expect(positiveDecimalStringSchema.safeParse('-5').success).toBe(false)
    expect(positiveDecimalStringSchema.safeParse('-0.01').success).toBe(false)
    expect(positiveDecimalStringSchema.safeParse('abc').success).toBe(false)
  })
})

describe('nonNegativeDecimalStringSchema', () => {
  it('accepts zero and positive amounts', () => {
    expect(nonNegativeDecimalStringSchema.parse('0')).toBe('0')
    expect(nonNegativeDecimalStringSchema.parse('0.00')).toBe('0.00')
    expect(nonNegativeDecimalStringSchema.parse('12.5')).toBe('12.5')
  })

  it('rejects negative amounts', () => {
    expect(nonNegativeDecimalStringSchema.safeParse('-0.01').success).toBe(false)
    expect(nonNegativeDecimalStringSchema.safeParse('-3').success).toBe(false)
  })
})

describe('compareDecimalStrings', () => {
  it('compares exactly across differing scales and signs', () => {
    expect(compareDecimalStrings('10.5', '10.50')).toBe(0)
    expect(compareDecimalStrings('10.05', '10.5')).toBe(-1)
    expect(compareDecimalStrings('100', '99.9999')).toBe(1)
    expect(compareDecimalStrings('-1', '0')).toBe(-1)
    expect(compareDecimalStrings('0.1', '0.10000000000000001')).toBe(-1)
  })
})
