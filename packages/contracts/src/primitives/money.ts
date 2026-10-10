/**
 * Money on the wire.
 *
 * The transport form is integer minor units plus an ISO 4217 code — the exact shape
 * {@link Money.toWire} emits. Two properties matter and are enforced here rather than trusted:
 *
 * - **`amount` is an integer.** A fractional amount means a float leaked into the pipeline
 *   somewhere upstream, and accepting it would bake the error in. It is rejected.
 * - **`currency` is one the domain layer knows.** The registry decides how many decimal places
 *   a code has, so a code it cannot resolve has no defined meaning. `Tenant.currency` is a
 *   free-form `String` column, which is exactly why this is validated at the boundary.
 *
 * Scale is deliberately not on the wire: it is a property of the currency, and sending it
 * separately would create a second source of truth that can disagree with the registry.
 */
import { isKnownCurrency, Money } from '@asas/domain'
import { z } from 'zod'

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3, 'A currency code must be three letters, e.g. USD')
  .superRefine((code, ctx) => {
    if (!isKnownCurrency(code)) {
      ctx.addIssue({
        code: 'custom',
        message:
          `Unknown currency '${code}'. Register it in @asas/domain before use — guessing its ` +
          'minor-unit exponent would silently corrupt every amount in that currency.',
      })
    }
  })

export const moneySchema = z.object({
  /** Integer minor units. 123456 is $1,234.56, but ¥123,456 — the currency sets the scale. */
  amount: z
    .int('Money amounts are integer minor units (cents), not a decimal major-unit value')
    .safe(),
  currency: currencyCodeSchema,
})

export type MoneyWire = z.infer<typeof moneySchema>

/**
 * Parse straight to a {@link Money}, so a handler never holds a loose `{ amount, currency }`
 * that could be arithmetic'd on as a plain number.
 */
export const moneyAsDomainSchema = moneySchema.transform(wire => Money.fromWire(wire))

/**
 * A major-unit decimal string, e.g. `'1234.56'` — the form Prisma returns for a `Decimal`
 * column and the form a currency input field produces.
 *
 * This accepts a *string only*. A JSON number cannot hold `0.1` exactly, so allowing one here
 * would reintroduce the float problem at the boundary the rest of the stack exists to protect.
 */
export const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Expected a decimal string such as '1234.56'")

/** A {@link decimalStringSchema} strictly greater than zero — a document amount (invoice, expense). */
export const positiveDecimalStringSchema = decimalStringSchema.refine(
  value => !value.startsWith('-') && /[1-9]/.test(value),
  'Expected an amount greater than zero',
)

/** A {@link decimalStringSchema} greater than or equal to zero — e.g. a tax component. */
export const nonNegativeDecimalStringSchema = decimalStringSchema.refine(
  value => !value.startsWith('-') || !/[1-9]/.test(value),
  'Expected an amount of zero or more',
)

/**
 * Compare two decimal strings exactly (no float conversion): negative when `a < b`, zero when
 * equal, positive when `a > b`. Both inputs must already match {@link decimalStringSchema}.
 */
export function compareDecimalStrings(a: string, b: string): number {
  const parse = (value: string) => {
    const trimmed = value.trim()
    const negative = trimmed.startsWith('-')
    const [whole = '0', fraction = ''] = trimmed.replace(/^-/, '').split('.')
    return { negative, whole, fraction }
  }
  const left = parse(a)
  const right = parse(b)
  const scale = Math.max(left.fraction.length, right.fraction.length)
  const toBigInt = (part: ReturnType<typeof parse>) => {
    const digits = BigInt(part.whole + part.fraction.padEnd(scale, '0'))
    return part.negative ? -digits : digits
  }
  const diff = toBigInt(left) - toBigInt(right)
  return diff < 0n ? -1 : diff > 0n ? 1 : 0
}

/**
 * Build the parser for a decimal-string amount in a known currency.
 *
 * Excess precision throws — `'10.005'` as USD is rejected rather than rounded, because both
 * 10.00 and 10.01 are defensible and the boundary must not pick for the caller. Where a lossy
 * conversion is genuinely wanted, round explicitly before serialising.
 */
export function decimalAmountSchema(currencyOf: (input: unknown) => string) {
  return decimalStringSchema.superRefine((value, ctx) => {
    try {
      Money.fromDecimal(value, currencyOf(value))
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid monetary amount',
      })
    }
  })
}
