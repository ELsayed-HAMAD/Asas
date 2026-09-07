import { describe, expect, it } from 'vitest'
import { UnknownCurrencyError } from './currency.js'
import { CurrencyMismatchError, Money } from './money.js'

const usd = (minorUnits: bigint | number) => Money.fromMinorUnits(minorUnits, 'USD')

describe('Money construction', () => {
  it('builds from integer minor units', () => {
    expect(usd(123456).toDecimalString()).toBe('1234.56')
    expect(usd(123456n).minorUnits).toBe(123456n)
    expect(Money.zero('USD').toDecimalString()).toBe('0.00')
  })

  it('rejects a fractional minor unit instead of rounding it away', () => {
    expect(() => usd(12.5)).toThrow(/whole number/)
  })

  it('rejects a minor-unit count beyond Number.MAX_SAFE_INTEGER', () => {
    expect(() => usd(9007199254740992)).toThrow(/MAX_SAFE_INTEGER/)
    // The same magnitude is fine as a bigint, where it is exact.
    expect(Money.fromMinorUnits(9007199254740992n, 'USD').minorUnits).toBe(9007199254740992n)
  })

  it('rejects an unknown currency rather than assuming two decimal places', () => {
    expect(() => usd(1).add(Money.fromMinorUnits(1, 'ZZZ'))).toThrow(UnknownCurrencyError)
  })

  it('normalises currency codes', () => {
    expect(Money.fromMinorUnits(1, 'usd').currency).toBe('USD')
    expect(Money.fromMinorUnits(1, ' eur ').currency).toBe('EUR')
  })

  describe('fromCents', () => {
    it('builds a two-decimal amount from cents', () => {
      expect(Money.fromCents(123456, 'USD').minorUnits).toBe(123456n)
      expect(Money.fromCents(123456n, 'USD').minorUnits).toBe(123456n)
      expect(Money.fromCents(-5, 'EUR').toDecimalString()).toBe('-0.05')
      expect(Money.fromCents(0, 'GBP').isZero()).toBe(true)
      expect(Money.fromCents(1, 'USD').toDecimalString()).toBe('0.01')
    })

    it('is equivalent to fromMinorUnits for two-decimal currencies', () => {
      expect(Money.fromCents(4321, 'CAD').equals(Money.fromMinorUnits(4321, 'CAD'))).toBe(true)
    })

    it('rejects zero-decimal currencies where "cents" is meaningless', () => {
      expect(() => Money.fromCents(100, 'JPY')).toThrow(/not 2/)
    })

    it('rejects three-decimal currencies where "cents" is ambiguous', () => {
      expect(() => Money.fromCents(123, 'KWD')).toThrow(/not 2/)
    })
  })

  describe('fromDecimal', () => {
    it('parses major units exactly', () => {
      expect(Money.fromDecimal('1234.56', 'USD').minorUnits).toBe(123456n)
      expect(Money.fromDecimal('-0.05', 'USD').minorUnits).toBe(-5n)
      expect(Money.fromDecimal('0', 'USD').minorUnits).toBe(0n)
      expect(Money.fromDecimal(1234.56, 'USD').minorUnits).toBe(123456n)
    })

    // Postgres returns a Decimal(19,4) column as '1234.5600'. Trailing zeros are not excess
    // precision, so this must not require a rounding mode.
    it('round-trips a Decimal(19,4) column value without rounding', () => {
      expect(Money.fromDecimal('1234.5600', 'USD').toDecimalString()).toBe('1234.56')
      expect(Money.fromDecimal('0.0000', 'USD').isZero()).toBe(true)
    })

    it('refuses excess precision unless a rounding mode is stated', () => {
      expect(() => Money.fromDecimal('10.005', 'USD')).toThrow(/more precision/)
      expect(Money.fromDecimal('10.005', 'USD', 'HALF_UP').toDecimalString()).toBe('10.01')
      expect(Money.fromDecimal('10.005', 'USD', 'HALF_EVEN').toDecimalString()).toBe('10.00')
      expect(Money.fromDecimal('10.005', 'USD', 'DOWN').toDecimalString()).toBe('10.00')
    })
  })

  describe('toDecimal', () => {
    it('returns the decimal representation as a string', () => {
      expect(usd(123456).toDecimal()).toBe('1234.56')
      expect(usd(-500).toDecimal()).toBe('-5.00')
      expect(usd(0).toDecimal()).toBe('0.00')
      expect(usd(1).toDecimal()).toBe('0.01')
      expect(usd(99).toDecimal()).toBe('0.99')
      expect(usd(100).toDecimal()).toBe('1.00')
    })

    it('handles different currency scales', () => {
      expect(Money.fromMinorUnits(1234, 'JPY').toDecimal()).toBe('1234')
      // KWD subdivides into three decimal places, so 1,234,567 minor units is 1234.567,
      // not the two-decimal-looking 1.234567.
      expect(Money.fromMinorUnits(1234567, 'KWD').toDecimal()).toBe('1234.567')
      expect(Money.fromMinorUnits(1, 'KWD').toDecimal()).toBe('0.001')
    })

    it('pads with leading zeros for small amounts', () => {
      expect(usd(5).toDecimal()).toBe('0.05')
      expect(usd(-5).toDecimal()).toBe('-0.05')
    })
  })
})

describe('Money arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(usd(123456).add(usd(1)).toDecimalString()).toBe('1234.57')
    expect(usd(123456).subtract(usd(123457)).toDecimalString()).toBe('-0.01')
  })

  // The canonical float failure, which this class exists to make impossible.
  it('survives 0.1 + 0.2 === 0.3', () => {
    const sum = Money.fromDecimal(0.1, 'USD').add(Money.fromDecimal(0.2, 'USD'))
    expect(sum.equals(Money.fromDecimal(0.3, 'USD'))).toBe(true)
    expect(sum.toDecimalString()).toBe('0.30')
  })

  it('accumulates a long series without drift', () => {
    let total = Money.zero('USD')
    for (let i = 0; i < 10_000; i += 1) total = total.add(Money.fromDecimal('0.01', 'USD'))
    expect(total.toDecimalString()).toBe('100.00')
  })

  it('negates and takes absolute value', () => {
    expect(usd(-500).negate().toDecimalString()).toBe('5.00')
    expect(usd(-500).abs().toDecimalString()).toBe('5.00')
    expect(usd(500).abs().toDecimalString()).toBe('5.00')
  })

  it('refuses to mix currencies', () => {
    const dollars = usd(100)
    const euros = Money.fromMinorUnits(100, 'EUR')
    expect(() => dollars.add(euros)).toThrow(CurrencyMismatchError)
    expect(() => dollars.subtract(euros)).toThrow(CurrencyMismatchError)
    expect(() => dollars.compare(euros)).toThrow(CurrencyMismatchError)
    expect(dollars.equals(euros)).toBe(false)
  })

  describe('sum', () => {
    it('totals a list', () => {
      expect(Money.sum([usd(100), usd(250), usd(-50)]).toDecimalString()).toBe('3.00')
    })

    it('needs an explicit currency for an empty list', () => {
      expect(Money.sum([], 'USD').isZero()).toBe(true)
      expect(() => Money.sum([])).toThrow(TypeError)
    })

    it('rejects a mixed list', () => {
      expect(() => Money.sum([usd(1), Money.fromMinorUnits(1, 'EUR')])).toThrow(
        CurrencyMismatchError,
      )
    })
  })

  describe('multiply', () => {
    it('applies a rate exactly and rounds once', () => {
      // 1999 × 8.25% = 164.9175 minor units.
      expect(Money.fromCents(1999, 'USD').multiply(0.0825, 'HALF_UP').minorUnits).toBe(165n)
      expect(Money.fromCents(1999, 'USD').multiply(0.0825, 'DOWN').minorUnits).toBe(164n)
      expect(Money.fromCents(1999, 'USD').multiply('0.0825', 'HALF_UP').minorUnits).toBe(165n)
    })

    it('multiplies by whole numbers without rounding concerns', () => {
      expect(usd(1999).multiply(3, 'HALF_UP').minorUnits).toBe(5997n)
      expect(usd(1999).multiply(3n, 'HALF_UP').minorUnits).toBe(5997n)
    })
  })

  describe('divide', () => {
    it('divides with an explicit rounding policy', () => {
      expect(usd(10000).divide(3, 'HALF_UP').minorUnits).toBe(3333n)
      expect(usd(10000).divide(3, 'UP').minorUnits).toBe(3334n)
    })

    it('rejects division by zero', () => {
      expect(() => usd(100).divide(0, 'HALF_UP')).toThrow(RangeError)
    })
  })

  describe('percentage', () => {
    it('treats the argument as a percentage, not a fraction', () => {
      expect(usd(10000).percentage(10, 'HALF_UP').toDecimalString()).toBe('10.00')
      expect(usd(618182).percentage(12, 'HALF_UP').minorUnits).toBe(74182n)
      expect(usd(618182).percentage(6.2, 'HALF_UP').minorUnits).toBe(38327n)
      expect(usd(618182).percentage(1.45, 'HALF_UP').minorUnits).toBe(8964n)
    })
  })
})

describe('Money.allocate', () => {
  it('splits $100 three ways without losing a cent', () => {
    const parts = usd(10000).allocate([1, 1, 1])
    expect(parts.map(part => part.toDecimalString())).toEqual(['33.34', '33.33', '33.33'])
    expect(Money.sum(parts).toDecimalString()).toBe('100.00')
  })

  it('distributes the leftover by largest remainder, earliest index winning a tie', () => {
    // 5 minor units split 30/70: both shares have an identical remainder, so index 0 wins.
    const parts = Money.fromCents(5, 'USD').allocate([3, 7])
    expect(parts.map(part => part.minorUnits)).toEqual([2n, 3n])
    expect(Money.sum(parts).minorUnits).toBe(5n)
  })

  it('accepts fractional weights exactly', () => {
    const parts = usd(10000).allocate([0.5, 0.25, 0.25])
    expect(parts.map(part => part.toDecimalString())).toEqual(['50.00', '25.00', '25.00'])
  })

  it('mirrors a negative amount', () => {
    const parts = usd(-10000).allocate([1, 1, 1])
    expect(parts.map(part => part.toDecimalString())).toEqual(['-33.34', '-33.33', '-33.33'])
    expect(Money.sum(parts).toDecimalString()).toBe('-100.00')
  })

  it('handles a single weight and zero amounts', () => {
    expect(usd(777).allocate([1]).map(p => p.minorUnits)).toEqual([777n])
    expect(usd(0).allocate([1, 2]).map(p => p.minorUnits)).toEqual([0n, 0n])
  })

  it('tolerates a zero weight alongside positive ones', () => {
    const parts = usd(100).allocate([0, 1])
    expect(parts.map(part => part.minorUnits)).toEqual([0n, 100n])
  })

  it('rejects weights that cannot describe a split', () => {
    expect(() => usd(100).allocate([])).toThrow(TypeError)
    expect(() => usd(100).allocate([0, 0])).toThrow(/greater than zero/)
    expect(() => usd(100).allocate([-1, 2])).toThrow(/non-negative/)
  })

  // The invariant that makes allocate safe for money: parts always sum back to the whole,
  // for every amount and every weight set.
  it('always sums back to the original amount', () => {
    const weightSets = [[1, 1, 1], [3, 5, 7, 11], [1], [0.5, 0.5], [99, 1], [2, 2, 2, 2, 2]]
    for (const weights of weightSets) {
      for (let amount = -250; amount <= 250; amount += 1) {
        const original = usd(amount)
        const parts = original.allocate(weights)
        expect(parts).toHaveLength(weights.length)
        expect(Money.sum(parts, 'USD').minorUnits).toBe(original.minorUnits)
      }
    }
  })
})

describe('Money currency scales', () => {
  it('treats JPY as a zero-decimal currency', () => {
    const yen = Money.fromDecimal('1000', 'JPY')
    expect(yen.scale).toBe(0)
    expect(yen.minorUnits).toBe(1000n)
    expect(yen.toDecimalString()).toBe('1000')
    expect(() => Money.fromDecimal('1000.5', 'JPY')).toThrow(/more precision/)
  })

  it('treats KWD as a three-decimal currency', () => {
    const dinar = Money.fromDecimal('1.234', 'KWD')
    expect(dinar.scale).toBe(3)
    expect(dinar.minorUnits).toBe(1234n)
    expect(dinar.toDecimalString()).toBe('1.234')
    expect(() => Money.fromDecimal('1.2345', 'KWD')).toThrow(/more precision/)
  })
})

describe('Money serialisation', () => {
  it('pads sub-unit amounts in toDecimalString', () => {
    expect(usd(5).toDecimalString()).toBe('0.05')
    expect(usd(-5).toDecimalString()).toBe('-0.05')
    expect(usd(0).toDecimalString()).toBe('0.00')
    expect(usd(-1).toDecimalString()).toBe('-0.01')
  })

  it('round-trips through the wire format', () => {
    const original = usd(-123456)
    const wire = original.toWire()
    expect(wire).toEqual({ amount: -123456, currency: 'USD' })
    expect(Money.fromWire(wire).equals(original)).toBe(true)
  })

  it('refuses to emit a wire amount that JSON cannot hold exactly', () => {
    expect(() => Money.fromMinorUnits(9007199254740992n, 'USD').toWire()).toThrow(
      /MAX_SAFE_INTEGER/,
    )
  })

  it('serialises safely through JSON.stringify', () => {
    expect(JSON.stringify({ total: usd(123456) })).toBe(
      '{"total":{"amount":123456,"currency":"USD"}}',
    )
  })

  it('renders a debuggable string', () => {
    expect(usd(123456).toString()).toBe('1234.56 USD')
  })

  it('exposes a lossy float only for display', () => {
    expect(usd(123456).toNumber()).toBe(1234.56)
  })
})

describe('Money immutability', () => {
  it('never mutates the receiver', () => {
    const original = usd(10000)
    original.add(usd(1))
    original.multiply(2, 'HALF_UP')
    original.allocate([1, 1])
    expect(original.minorUnits).toBe(10000n)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(usd(1))).toBe(true)
  })
})

// End-to-end fixture asserting to the cent. This is the shape `packages/domain/payroll` will
// build on, and the reason the primitive has to be exact: gross, every tax line and net are
// derived independently, and net must still reconcile precisely.
describe('payroll reconciliation fixture', () => {
  const baseSalary = Money.fromDecimal('6250.00', 'USD')
  const workingDays = 22
  const missedDays = 2
  const bonus = Money.fromDecimal('500.00', 'USD')

  const missedDayDeduction = baseSalary.multiply(
    `${missedDays}`,
    'HALF_UP',
  ).divide(`${workingDays}`, 'HALF_UP')

  const gross = baseSalary.subtract(missedDayDeduction).add(bonus)

  const taxLines = [
    { label: 'Federal income tax', rate: 12 },
    { label: 'Social security', rate: 6.2 },
    { label: 'Medicare', rate: 1.45 },
  ].map(line => ({ ...line, amount: gross.percentage(line.rate, 'HALF_UP') }))

  const totalTax = Money.sum(taxLines.map(line => line.amount))
  const net = gross.subtract(totalTax)

  it('computes the deduction, gross and net exactly', () => {
    expect(missedDayDeduction.toDecimalString()).toBe('568.18')
    expect(gross.toDecimalString()).toBe('6181.82')
    expect(net.toDecimalString()).toBe('4967.09')
  })

  it('itemises every tax line to the cent', () => {
    expect(taxLines.map(line => line.amount.toDecimalString())).toEqual([
      '741.82',
      '383.27',
      '89.64',
    ])
    expect(totalTax.toDecimalString()).toBe('1214.73')
  })

  it('reconciles: gross − deductions === net', () => {
    expect(gross.subtract(totalTax).equals(net)).toBe(true)
    expect(net.add(totalTax).equals(gross)).toBe(true)
  })

  it('apportions employer tax across cost centres without losing a cent', () => {
    const byHeadcount = totalTax.allocate([5, 3, 2])
    expect(byHeadcount.map(part => part.toDecimalString())).toEqual(['607.36', '364.42', '242.95'])
    expect(Money.sum(byHeadcount).equals(totalTax)).toBe(true)
  })
})
