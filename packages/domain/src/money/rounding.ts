/**
 * Integer division with an explicit, exact rounding policy.
 *
 * Every rounding decision in the money layer funnels through {@link divideRounded}. There is
 * no default mode anywhere in the public API: the caller states the policy, because the
 * correct one is a business rule and not a technical detail. Sales tax is conventionally
 * HALF_UP, statutory financial reporting is frequently HALF_EVEN, and a supplier discount
 * that must never favour us rounds FLOOR.
 */

export const RoundingMode = {
  /** Toward the nearest neighbour; exact halves go away from zero. 2.5 → 3, −2.5 → −3. */
  HALF_UP: 'HALF_UP',
  /** Toward the nearest neighbour; exact halves go toward zero. 2.5 → 2, −2.5 → −2. */
  HALF_DOWN: 'HALF_DOWN',
  /** Banker's rounding: exact halves go to the even neighbour. 2.5 → 2, 3.5 → 4. */
  HALF_EVEN: 'HALF_EVEN',
  /** Always away from zero. 2.1 → 3, −2.1 → −3. */
  UP: 'UP',
  /** Always toward zero (truncation). 2.9 → 2, −2.9 → −2. */
  DOWN: 'DOWN',
  /** Toward positive infinity. 2.1 → 3, −2.9 → −2. */
  CEILING: 'CEILING',
  /** Toward negative infinity. 2.9 → 2, −2.1 → −3. */
  FLOOR: 'FLOOR',
} as const

export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode]

/**
 * Divide `numerator` by `denominator` and round the quotient to an integer.
 *
 * Both arguments are exact, so the result is fully determined by `mode` — there is no
 * accumulated float error to reason about. Negative numerators are handled by rounding the
 * magnitude and re-applying the sign, which is why FLOOR and CEILING are asymmetric while
 * UP, DOWN and the HALF_* family are symmetric about zero.
 */
export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero')

  // Normalise so the remainder comparison below is sign-free.
  let n = numerator
  let d = denominator
  if (d < 0n) {
    n = -n
    d = -d
  }

  const isNegative = n < 0n
  const magnitude = isNegative ? -n : n
  const quotient = magnitude / d
  const remainder = magnitude % d

  if (remainder === 0n) return isNegative ? -quotient : quotient

  const twiceRemainder = remainder * 2n
  let rounded = quotient

  switch (mode) {
    case RoundingMode.DOWN:
      break
    case RoundingMode.UP:
      rounded += 1n
      break
    case RoundingMode.FLOOR:
      if (isNegative) rounded += 1n
      break
    case RoundingMode.CEILING:
      if (!isNegative) rounded += 1n
      break
    case RoundingMode.HALF_UP:
      if (twiceRemainder >= d) rounded += 1n
      break
    case RoundingMode.HALF_DOWN:
      if (twiceRemainder > d) rounded += 1n
      break
    case RoundingMode.HALF_EVEN:
      if (twiceRemainder > d) rounded += 1n
      else if (twiceRemainder === d && quotient % 2n !== 0n) rounded += 1n
      break
    default: {
      // Reachable only from untyped callers; a silent fallback here would pick a rounding
      // policy on the caller's behalf, which is the one thing this module refuses to do.
      const exhaustive: never = mode
      throw new RangeError(`Unsupported rounding mode: ${String(exhaustive)}`)
    }
  }

  return isNegative ? -rounded : rounded
}
