import { describe, expect, it } from 'vitest'
import {
  getCurrency,
  isKnownCurrency,
  listCurrencies,
  registerCurrency,
  UnknownCurrencyError,
} from './currency.js'

describe('getCurrency', () => {
  it('returns the ISO minor-unit exponent', () => {
    expect(getCurrency('USD').minorUnitDigits).toBe(2)
    expect(getCurrency('EUR').minorUnitDigits).toBe(2)
    expect(getCurrency('EGP').minorUnitDigits).toBe(2)
    expect(getCurrency('SAR').minorUnitDigits).toBe(2)
  })

  // The two exponents that break the "money is always cents" assumption.
  it('knows the non-two-digit currencies', () => {
    expect(getCurrency('JPY').minorUnitDigits).toBe(0)
    expect(getCurrency('KRW').minorUnitDigits).toBe(0)
    expect(getCurrency('ISK').minorUnitDigits).toBe(0)
    expect(getCurrency('KWD').minorUnitDigits).toBe(3)
    expect(getCurrency('BHD').minorUnitDigits).toBe(3)
    expect(getCurrency('TND').minorUnitDigits).toBe(3)
  })

  it('normalises case and surrounding whitespace', () => {
    expect(getCurrency('usd').code).toBe('USD')
    expect(getCurrency(' Eur ').code).toBe('EUR')
  })

  // `Tenant.currency` is a free-form String column, so a typo reaches this function. Throwing
  // is the whole point: defaulting to 2 digits would turn ¥1000 into ¥10.00 silently.
  it('throws on an unknown code instead of assuming two decimals', () => {
    expect(() => getCurrency('ZZZ')).toThrow(UnknownCurrencyError)
    expect(() => getCurrency('')).toThrow(UnknownCurrencyError)
    expect(() => getCurrency('DOLLARS')).toThrow(UnknownCurrencyError)
  })

  it('names the offending code in the error', () => {
    expect(() => getCurrency('ZZZ')).toThrow(/'ZZZ'/)
  })

  it('returns frozen records so callers cannot mutate the registry', () => {
    expect(Object.isFrozen(getCurrency('USD'))).toBe(true)
  })
})

describe('isKnownCurrency', () => {
  it('reports membership without throwing', () => {
    expect(isKnownCurrency('USD')).toBe(true)
    expect(isKnownCurrency('jpy')).toBe(true)
    expect(isKnownCurrency('ZZZ')).toBe(false)
  })
})

describe('registerCurrency', () => {
  it('adds a currency that Money can then use', () => {
    // XTS is the ISO 4217 code reserved for testing.
    registerCurrency('XTS', 4)
    expect(getCurrency('XTS').minorUnitDigits).toBe(4)
    expect(isKnownCurrency('XTS')).toBe(true)
  })

  it('rejects a code that is not three letters', () => {
    expect(() => registerCurrency('US', 2)).toThrow(RangeError)
    expect(() => registerCurrency('USDX', 2)).toThrow(RangeError)
    expect(() => registerCurrency('US1', 2)).toThrow(RangeError)
  })

  it('rejects an implausible exponent', () => {
    expect(() => registerCurrency('XTS', -1)).toThrow(RangeError)
    expect(() => registerCurrency('XTS', 9)).toThrow(RangeError)
    expect(() => registerCurrency('XTS', 2.5)).toThrow(RangeError)
  })
})

describe('listCurrencies', () => {
  it('returns every currency sorted by code', () => {
    const codes = listCurrencies().map(currency => currency.code)
    expect(codes).toContain('USD')
    expect(codes).toContain('KWD')
    expect(codes.length).toBeGreaterThan(60)
    expect([...codes].sort((a, b) => a.localeCompare(b))).toEqual(codes)
  })

  it('has no duplicate codes', () => {
    const codes = listCurrencies().map(currency => currency.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
