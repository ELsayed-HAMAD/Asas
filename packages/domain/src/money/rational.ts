/**
 * Exact rational arithmetic over bigint.
 *
 * Money multiplication takes rates — tax percentages, pro-rata fractions, FX quotes — and
 * a rate expressed as a float cannot be multiplied exactly. `0.1 + 0.2 !== 0.3` is the
 * familiar symptom; the dangerous one is a payroll deduction that is off by a cent for one
 * employee in ten thousand and reconciles differently every quarter.
 *
 * So rates are parsed from their decimal *notation* into an exact numerator/denominator
 * pair. `'8.25'` becomes 825/100 with no float ever involved, and the single rounding step
 * happens later, deliberately, in {@link divideRounded}.
 */

export interface Rational {
  readonly numerator: bigint
  /** Always strictly positive; sign lives on the numerator. */
  readonly denominator: bigint
}

// Sign, integer part, fractional part, exponent. Either the integer or the fractional part
// may be empty ('.5', '5.') but not both.
const DECIMAL_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

export function makeRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) throw new RangeError('Rational denominator must not be zero')

  // Normalise the sign onto the numerator, then reduce. Reducing keeps intermediate
  // magnitudes small across chained multiplications.
  let n = numerator
  let d = denominator
  if (d < 0n) {
    n = -n
    d = -d
  }
  const divisor = gcd(n, d)
  if (divisor > 1n) {
    n /= divisor
    d /= divisor
  }
  return Object.freeze({ numerator: n, denominator: d })
}

/**
 * Parse an exact rational from decimal notation.
 *
 * A `number` argument is converted via its shortest round-trip string form, which is what
 * `String(value)` produces. That makes `0.0825` exactly 825/10000 — the decimal the caller
 * wrote, not the binary float nearest to it. Values that cannot round-trip cleanly
 * (`NaN`, `Infinity`, or a non-integer beyond `Number.MAX_SAFE_INTEGER`) are rejected.
 */
export function rationalFromDecimal(value: string | number | bigint): Rational {
  if (typeof value === 'bigint') return makeRational(value, 1n)

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Cannot build an exact rational from ${value}`)
    }
    return rationalFromDecimal(String(value))
  }

  const text = value.trim()
  const match = DECIMAL_PATTERN.exec(text)
  if (!match) throw new RangeError(`Invalid decimal notation: '${value}'`)

  const [, sign = '', intPart = '', fracPart = '', expPart] = match
  if (intPart === '' && fracPart === '') {
    throw new RangeError(`Invalid decimal notation: '${value}'`)
  }

  let numerator = BigInt(`${intPart || '0'}${fracPart}`)
  if (sign === '-') numerator = -numerator
  let denominator = 10n ** BigInt(fracPart.length)

  if (expPart !== undefined) {
    const exponent = Number(expPart)
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10_000) {
      throw new RangeError(`Exponent out of supported range in '${value}'`)
    }
    if (exponent > 0) numerator *= 10n ** BigInt(exponent)
    else if (exponent < 0) denominator *= 10n ** BigInt(-exponent)
  }

  return makeRational(numerator, denominator)
}

export function multiplyRational(a: Rational, b: Rational): Rational {
  return makeRational(a.numerator * b.numerator, a.denominator * b.denominator)
}

export function invertRational(a: Rational): Rational {
  if (a.numerator === 0n) throw new RangeError('Cannot invert a zero rational')
  return makeRational(a.denominator, a.numerator)
}

export function isIntegerRational(a: Rational): boolean {
  return a.numerator % a.denominator === 0n
}

/**
 * Re-express a list of rationals over one shared denominator and return just the numerators.
 *
 * This is what lets `Money.allocate` treat `[1, 2, 3]`, `[0.5, 0.25, 0.25]` and `[1/3, 2/3]`
 * with the same integer largest-remainder logic: scaling to the least common denominator
 * turns any mix of fractional weights into exact integer weights, and only their *ratios*
 * matter to the caller, so the shared denominator itself can be discarded.
 */
export function scaleToCommonDenominator(rationals: readonly Rational[]): bigint[] {
  let common = 1n
  for (const rational of rationals) {
    common = lcm(common, rational.denominator)
  }
  return rationals.map(rational => rational.numerator * (common / rational.denominator))
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n
  const product = a * b
  const absolute = product < 0n ? -product : product
  return absolute / gcd(a, b)
}

