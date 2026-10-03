import {
  getCurrency,
  type Currency,
  type CurrencyCode,
} from './currency.js'
import {
  makeRational,
  rationalFromDecimal,
  scaleToCommonDenominator,
  type Rational,
} from './rational.js'
import { divideRounded, type RoundingMode } from './rounding.js'

/**
 * An immutable monetary amount held as integer minor units.
 *
 * The invariant is that a `Money` never stores a fractional value. `$1,234.56` is 123456
 * minor units of USD, and every operation either stays exact or takes an explicit
 * {@link RoundingMode}. That makes the class total: there is no input for which it silently
 * produces an amount that is a fraction of a cent off.
 *
 * Two consequences worth knowing before using it:
 *
 * - **Rounding happens once, where you ask for it.** `multiply` and `divide` require a mode;
 *   they do not have a default. Chained arithmetic should therefore stay in whole minor
 *   units for as long as possible and round at the final step, not at each intermediate one.
 * - **Currencies never mix implicitly.** `add`/`subtract`/`compare` throw on mismatch rather
 *   than coercing, because an ERP that silently adds EUR to USD produces numbers that look
 *   plausible and are wrong.
 */
export class Money {
  readonly #minorUnits: bigint
  readonly #currency: Currency

  private constructor(minorUnits: bigint, currency: Currency) {
    this.#minorUnits = minorUnits
    this.#currency = currency
    Object.freeze(this)
  }

  // ── Construction ──────────────────────────────────────────────────────────

  /**
   * Build from integer minor units — the canonical constructor.
   *
   * A `number` must be a safe integer. Passing `12.5` is rejected rather than rounded,
   * since a fractional minor unit means the caller has already lost precision upstream and
   * silently absorbing it would hide the real bug.
   */
  static fromMinorUnits(minorUnits: bigint | number, currency: CurrencyCode): Money {
    const resolved = getCurrency(currency)

    if (typeof minorUnits === 'number') {
      if (!Number.isInteger(minorUnits)) {
        throw new RangeError(
          `Minor units must be a whole number, received ${minorUnits}. Use Money.fromDecimal() ` +
            'for major-unit values such as 12.50.',
        )
      }
      if (!Number.isSafeInteger(minorUnits)) {
        throw new RangeError(
          `Minor units ${minorUnits} exceeds Number.MAX_SAFE_INTEGER; pass a bigint instead.`,
        )
      }
      return new Money(BigInt(minorUnits), resolved)
    }

    return new Money(minorUnits, resolved)
  }

  /**
   * Alias of {@link fromMinorUnits} restricted to two-decimal currencies.
   *
   * Kept because "cents" is how the wire format is described elsewhere, but it throws for
   * JPY or KWD — where "cent" has no meaning — so the name can never be misleading.
   */
  static fromCents(cents: bigint | number, currency: CurrencyCode): Money {
    const resolved = getCurrency(currency)
    if (resolved.minorUnitDigits !== 2) {
      throw new RangeError(
        `${resolved.code} has ${resolved.minorUnitDigits} minor-unit digits, not 2. ` +
          'Use Money.fromMinorUnits() to be explicit about the scale.',
      )
    }
    return Money.fromMinorUnits(cents, resolved.code)
  }

  /**
   * Build from a major-unit decimal such as `'1234.56'` or the string Prisma returns for a
   * `Decimal` column.
   *
   * Excess precision is an error unless `rounding` is supplied. Reading `'10.005'` as USD
   * without a stated policy throws, because both 10.00 and 10.01 are defensible and the
   * library must not pick for you. Trailing zeros are not excess precision — `'1234.5600'`
   * from a `Decimal(19,4)` column converts exactly.
   */
  static fromDecimal(
    value: string | number | bigint,
    currency: CurrencyCode,
    rounding?: RoundingMode,
  ): Money {
    const resolved = getCurrency(currency)
    const rational = rationalFromDecimal(value)
    const factor = 10n ** BigInt(resolved.minorUnitDigits)

    const numerator = rational.numerator * factor
    const denominator = rational.denominator

    if (rounding === undefined && numerator % denominator !== 0n) {
      throw new RangeError(
        `${String(value)} carries more precision than ${resolved.code} can represent ` +
          `(${resolved.minorUnitDigits} decimal places). Pass an explicit RoundingMode to ` +
          'accept the loss.',
      )
    }

    return new Money(divideRounded(numerator, denominator, rounding ?? 'DOWN'), resolved)
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, getCurrency(currency))
  }

  /**
   * Total a list of amounts exactly.
   *
   * `currency` is required for an empty list, since there is no amount to infer it from.
   */
  static sum(values: readonly Money[], currency?: CurrencyCode): Money {
    if (values.length === 0) {
      if (currency === undefined) {
        throw new TypeError('Money.sum() of an empty list requires an explicit currency')
      }
      return Money.zero(currency)
    }

    const first = values[0] as Money
    const resolved = currency === undefined ? first.#currency : getCurrency(currency)

    let total = 0n
    for (const value of values) {
      assertSameCurrency(resolved, value.#currency)
      total += value.#minorUnits
    }
    return new Money(total, resolved)
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get currency(): CurrencyCode {
    return this.#currency.code
  }

  /** Number of decimal places this amount's currency subdivides into. */
  get scale(): number {
    return this.#currency.minorUnitDigits
  }

  get minorUnits(): bigint {
    return this.#minorUnits
  }

  // ── Arithmetic ────────────────────────────────────────────────────────────

  add(other: Money): Money {
    assertSameCurrency(this.#currency, other.#currency)
    return new Money(this.#minorUnits + other.#minorUnits, this.#currency)
  }

  subtract(other: Money): Money {
    assertSameCurrency(this.#currency, other.#currency)
    return new Money(this.#minorUnits - other.#minorUnits, this.#currency)
  }

  negate(): Money {
    return new Money(-this.#minorUnits, this.#currency)
  }

  abs(): Money {
    return this.#minorUnits < 0n ? this.negate() : this
  }

  /**
   * Multiply by an exact factor, rounding once to whole minor units.
   *
   * The factor is parsed from its decimal notation, so `multiply(0.0825, 'HALF_UP')` applies
   * exactly 825/10000 rather than the binary float nearest to 8.25%.
   */
  multiply(factor: string | number | bigint | Rational, rounding: RoundingMode): Money {
    const rational = isRational(factor) ? factor : rationalFromDecimal(factor)
    return new Money(
      divideRounded(this.#minorUnits * rational.numerator, rational.denominator, rounding),
      this.#currency,
    )
  }

  divide(divisor: string | number | bigint | Rational, rounding: RoundingMode): Money {
    const rational = isRational(divisor) ? divisor : rationalFromDecimal(divisor)
    if (rational.numerator === 0n) throw new RangeError('Division by zero')
    return new Money(
      divideRounded(this.#minorUnits * rational.denominator, rational.numerator, rounding),
      this.#currency,
    )
  }

  /** Convenience for rate-as-percentage: `percentage(8.25, …)` applies 8.25%. */
  percentage(rate: string | number | bigint, rounding: RoundingMode): Money {
    const rational = rationalFromDecimal(rate)
    return this.multiply(makeRational(rational.numerator, rational.denominator * 100n), rounding)
  }

  /**
   * Split into parts proportional to `weights`, losing nothing.
   *
   * Rounding each share independently would leak minor units — `$100 / 3` as three rounded
   * thirds is `$99.99`. This uses the largest-remainder method instead: every share is
   * floored, then the leftover units are handed out one at a time to the shares with the
   * largest truncated remainder (earliest index winning a tie). **The parts always sum back
   * to the original amount exactly**, which is the property that makes it safe for payroll
   * splits, invoice line allocation and tax apportionment.
   *
   * Weights may be fractional (`[0.5, 0.25, 0.25]`) and are handled exactly. Negative
   * weights are rejected.
   */
  allocate(weights: readonly (number | bigint | string)[]): Money[] {
    if (weights.length === 0) throw new TypeError('Money.allocate() requires at least one weight')

    const rationals = weights.map(weight => {
      const rational = rationalFromDecimal(weight)
      if (rational.numerator < 0n) {
        throw new RangeError(`Allocation weights must be non-negative, received ${String(weight)}`)
      }
      return rational
    })

    const scaled = scaleToCommonDenominator(rationals)
    const totalWeight = scaled.reduce((sum, weight) => sum + weight, 0n)
    if (totalWeight === 0n) {
      throw new RangeError('Money.allocate() requires at least one weight greater than zero')
    }

    // Work on the magnitude so the floor division below never rounds toward negative
    // infinity, then re-apply the sign. This keeps a −$100 split behaving as the mirror
    // image of a +$100 split rather than distributing the leftover unit differently.
    const isNegative = this.#minorUnits < 0n
    const magnitude = isNegative ? -this.#minorUnits : this.#minorUnits

    const shares: bigint[] = []
    const remainders: { index: number; remainder: bigint }[] = []
    let distributed = 0n

    for (const [index, weight] of scaled.entries()) {
      const numerator = magnitude * weight
      const share = numerator / totalWeight
      shares.push(share)
      remainders.push({ index, remainder: numerator % totalWeight })
      distributed += share
    }

    let leftover = magnitude - distributed
    remainders.sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index
      return a.remainder > b.remainder ? -1 : 1
    })

    for (const { index } of remainders) {
      if (leftover <= 0n) break
      shares[index] = (shares[index] as bigint) + 1n
      leftover -= 1n
    }

    return shares.map(share => new Money(isNegative ? -share : share, this.#currency))
  }

  // ── Comparison ────────────────────────────────────────────────────────────

  compare(other: Money): -1 | 0 | 1 {
    assertSameCurrency(this.#currency, other.#currency)
    if (this.#minorUnits < other.#minorUnits) return -1
    if (this.#minorUnits > other.#minorUnits) return 1
    return 0
  }

  equals(other: Money): boolean {
    return this.#currency.code === other.#currency.code && this.#minorUnits === other.#minorUnits
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0
  }

  isZero(): boolean {
    return this.#minorUnits === 0n
  }

  isNegative(): boolean {
    return this.#minorUnits < 0n
  }

  isPositive(): boolean {
    return this.#minorUnits > 0n
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  /**
   * Render as a fixed-scale decimal string, e.g. `'1234.56'`.
   *
   * This is the form to hand Prisma for a `Decimal` column: it is exact, locale-free, and
   * round-trips through {@link fromDecimal} without rounding.
   */
  toDecimalString(): string {
    const isNegative = this.#minorUnits < 0n
    const digits = (isNegative ? -this.#minorUnits : this.#minorUnits).toString()
    const scale = this.#currency.minorUnitDigits

    if (scale === 0) return isNegative ? `-${digits}` : digits

    const padded = digits.padStart(scale + 1, '0')
    const integerPart = padded.slice(0, padded.length - scale)
    const fractionPart = padded.slice(padded.length - scale)
    return `${isNegative ? '-' : ''}${integerPart}.${fractionPart}`
  }

  /**
   * Return the decimal representation as a string.
   * Alias for toDecimalString() for API consistency.
   */
  toDecimal(): string {
    return this.toDecimalString()
  }

  /**
   * The wire representation: integer minor units plus the currency code.
   *
   * Scale is deliberately absent — it is a property of the currency, and carrying it
   * separately would create a second source of truth that can disagree with the registry.
   */
  toWire(): { amount: number; currency: CurrencyCode } {
    const amount = Number(this.#minorUnits)
    if (!Number.isSafeInteger(amount)) {
      throw new RangeError(
        `${this.toDecimalString()} ${this.#currency.code} exceeds Number.MAX_SAFE_INTEGER in ` +
          'minor units and cannot be sent as a JSON number.',
      )
    }
    return { amount, currency: this.#currency.code }
  }

  static fromWire(wire: { amount: number | bigint; currency: CurrencyCode }): Money {
    return Money.fromMinorUnits(wire.amount, wire.currency)
  }

  /** Same shape as {@link toWire}, so `JSON.stringify` on a Money is safe by default. */
  toJSON(): { amount: number; currency: CurrencyCode } {
    return this.toWire()
  }

  /**
   * Major units as a float. **Lossy** — for chart axes and display only. Never feed the
   * result back into a calculation; use the Money arithmetic methods instead.
   */
  toNumber(): number {
    return Number(this.toDecimalString())
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.#currency.code}`
  }
}

export class CurrencyMismatchError extends Error {
  constructor(
    readonly expected: CurrencyCode,
    readonly received: CurrencyCode,
  ) {
    super(
      `Cannot combine ${received} with ${expected}. Convert one side explicitly with a dated ` +
        'FX rate — implicit coercion would produce a plausible-looking wrong number.',
    )
    this.name = 'CurrencyMismatchError'
  }
}

function assertSameCurrency(expected: Currency, received: Currency): void {
  if (expected.code !== received.code) {
    throw new CurrencyMismatchError(expected.code, received.code)
  }
}

function isRational(value: unknown): value is Rational {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Rational).numerator === 'bigint' &&
    typeof (value as Rational).denominator === 'bigint'
  )
}
