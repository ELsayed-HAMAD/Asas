import { describe, expect, it } from 'vitest'
import { divideRounded, RoundingMode } from './rounding.js'

describe('divideRounded', () => {
  it('returns an exact quotient untouched by the rounding mode', () => {
    for (const mode of Object.values(RoundingMode)) {
      expect(divideRounded(10n, 5n, mode)).toBe(2n)
      expect(divideRounded(-10n, 5n, mode)).toBe(-2n)
      expect(divideRounded(0n, 5n, mode)).toBe(0n)
    }
  })

  // An exact half is the only case where all seven modes are distinguishable, so this table
  // is the specification. 5/2 = 2.5 and 7/2 = 3.5 straddle the even/odd branch of HALF_EVEN.
  const halves: [bigint, bigint, Record<RoundingMode, bigint>][] = [
    [
      5n,
      2n,
      { HALF_UP: 3n, HALF_DOWN: 2n, HALF_EVEN: 2n, UP: 3n, DOWN: 2n, CEILING: 3n, FLOOR: 2n },
    ],
    [
      7n,
      2n,
      { HALF_UP: 4n, HALF_DOWN: 3n, HALF_EVEN: 4n, UP: 4n, DOWN: 3n, CEILING: 4n, FLOOR: 3n },
    ],
    [
      -5n,
      2n,
      {
        HALF_UP: -3n, HALF_DOWN: -2n, HALF_EVEN: -2n, UP: -3n, DOWN: -2n, CEILING: -2n, FLOOR: -3n,
      },
    ],
    [
      -7n,
      2n,
      {
        HALF_UP: -4n, HALF_DOWN: -3n, HALF_EVEN: -4n, UP: -4n, DOWN: -3n, CEILING: -3n, FLOOR: -4n,
      },
    ],
  ]

  for (const [numerator, denominator, expected] of halves) {
    it(`rounds ${numerator}/${denominator} per mode`, () => {
      for (const [mode, want] of Object.entries(expected)) {
        expect(divideRounded(numerator, denominator, mode as RoundingMode)).toBe(want)
      }
    })
  }

  it('rounds a non-half remainder directionally', () => {
    // 7/3 = 2.333…
    expect(divideRounded(7n, 3n, 'HALF_UP')).toBe(2n)
    expect(divideRounded(7n, 3n, 'UP')).toBe(3n)
    expect(divideRounded(7n, 3n, 'DOWN')).toBe(2n)
    expect(divideRounded(7n, 3n, 'CEILING')).toBe(3n)
    expect(divideRounded(7n, 3n, 'FLOOR')).toBe(2n)

    // −7/3 = −2.333… — FLOOR and CEILING flip relative to UP and DOWN here.
    expect(divideRounded(-7n, 3n, 'UP')).toBe(-3n)
    expect(divideRounded(-7n, 3n, 'DOWN')).toBe(-2n)
    expect(divideRounded(-7n, 3n, 'CEILING')).toBe(-2n)
    expect(divideRounded(-7n, 3n, 'FLOOR')).toBe(-3n)
  })

  it('normalises a negative denominator onto the numerator', () => {
    expect(divideRounded(5n, -2n, 'HALF_UP')).toBe(-3n)
    expect(divideRounded(-5n, -2n, 'HALF_UP')).toBe(3n)
  })

  it('rejects division by zero', () => {
    expect(() => divideRounded(1n, 0n, 'HALF_UP')).toThrow(RangeError)
  })

  it('rejects an unrecognised mode rather than silently choosing one', () => {
    expect(() => divideRounded(5n, 2n, 'NEAREST' as RoundingMode)).toThrow(/Unsupported rounding/)
  })
})
