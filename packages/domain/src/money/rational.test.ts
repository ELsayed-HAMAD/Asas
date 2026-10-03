import { describe, expect, it } from 'vitest'
import {
  lcm,
  makeRational,
  multiplyRational,
  rationalFromDecimal,
  scaleToCommonDenominator,
} from './rational.js'

describe('rationalFromDecimal', () => {
  it('parses plain decimal notation exactly', () => {
    expect(rationalFromDecimal('1')).toEqual({ numerator: 1n, denominator: 1n })
    expect(rationalFromDecimal('1.5')).toEqual({ numerator: 3n, denominator: 2n })
    expect(rationalFromDecimal('-2.25')).toEqual({ numerator: -9n, denominator: 4n })
    expect(rationalFromDecimal('0.5')).toEqual({ numerator: 1n, denominator: 2n })
  })

  it('accepts an omitted integer or fractional part', () => {
    expect(rationalFromDecimal('.5')).toEqual({ numerator: 1n, denominator: 2n })
    expect(rationalFromDecimal('5.')).toEqual({ numerator: 5n, denominator: 1n })
  })

  it('applies exponent notation', () => {
    expect(rationalFromDecimal('1e3')).toEqual({ numerator: 1000n, denominator: 1n })
    expect(rationalFromDecimal('1.5e-2')).toEqual({ numerator: 3n, denominator: 200n })
    expect(rationalFromDecimal('-2E2')).toEqual({ numerator: -200n, denominator: 1n })
  })

  // The reason this module exists: a tax rate written as 8.25% must become exactly 825/10000,
  // not the binary float that happens to sit nearest to it.
  it('converts a number via its shortest round-trip decimal form', () => {
    expect(rationalFromDecimal(0.0825)).toEqual({ numerator: 33n, denominator: 400n })
    expect(rationalFromDecimal(0.1)).toEqual({ numerator: 1n, denominator: 10n })
    expect(rationalFromDecimal(0.3)).toEqual({ numerator: 3n, denominator: 10n })
  })

  it('accepts bigint', () => {
    expect(rationalFromDecimal(42n)).toEqual({ numerator: 42n, denominator: 1n })
  })

  it('reduces to lowest terms', () => {
    expect(rationalFromDecimal('0.50')).toEqual({ numerator: 1n, denominator: 2n })
    expect(rationalFromDecimal('2.000')).toEqual({ numerator: 2n, denominator: 1n })
  })

  it('rejects anything it cannot represent exactly', () => {
    expect(() => rationalFromDecimal('abc')).toThrow(RangeError)
    expect(() => rationalFromDecimal('')).toThrow(RangeError)
    expect(() => rationalFromDecimal('.')).toThrow(RangeError)
    expect(() => rationalFromDecimal('1.2.3')).toThrow(RangeError)
    expect(() => rationalFromDecimal(Number.NaN)).toThrow(RangeError)
    expect(() => rationalFromDecimal(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('makeRational', () => {
  it('moves the sign to the numerator', () => {
    expect(makeRational(1n, -2n)).toEqual({ numerator: -1n, denominator: 2n })
    expect(makeRational(-1n, -2n)).toEqual({ numerator: 1n, denominator: 2n })
  })

  it('rejects a zero denominator', () => {
    expect(() => makeRational(1n, 0n)).toThrow(RangeError)
  })
})

describe('multiplyRational', () => {
  it('multiplies and reduces', () => {
    const twoThirds = makeRational(2n, 3n)
    const threeQuarters = makeRational(3n, 4n)
    expect(multiplyRational(twoThirds, threeQuarters)).toEqual({ numerator: 1n, denominator: 2n })
  })
})

describe('scaleToCommonDenominator', () => {
  it('leaves integer weights as-is', () => {
    const weights = [1n, 2n, 3n].map(n => makeRational(n, 1n))
    expect(scaleToCommonDenominator(weights)).toEqual([1n, 2n, 3n])
  })

  it('turns fractional weights into exact integer ratios', () => {
    const weights = ['0.5', '0.25', '0.25'].map(rationalFromDecimal)
    // Denominators 2, 4, 4 → common denominator 4 → numerators 2, 1, 1.
    expect(scaleToCommonDenominator(weights)).toEqual([2n, 1n, 1n])
  })

  it('handles thirds without loss', () => {
    const weights = [makeRational(1n, 3n), makeRational(2n, 3n)]
    expect(scaleToCommonDenominator(weights)).toEqual([1n, 2n])
  })
})

describe('lcm', () => {
  it('computes the least common multiple', () => {
    expect(lcm(4n, 6n)).toBe(12n)
    expect(lcm(1n, 7n)).toBe(7n)
    expect(lcm(0n, 5n)).toBe(0n)
  })
})
