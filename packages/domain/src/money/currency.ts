/**
 * ISO 4217 currency registry.
 *
 * The only thing Money needs from a currency is its number of minor-unit digits — the
 * exponent that converts between the major unit people type and the integer we store.
 * Most currencies use 2, but the exceptions are not rare enough to hardcode around:
 * JPY has 0, so ¥100 is 100 minor units and not 10 000; KWD has 3.
 *
 * `Tenant.currency` is a free-form `String @default("USD")` in the Prisma schema, so codes
 * arrive from user data and must be validated at runtime rather than trusted.
 */

/** Uppercase ISO 4217 alpha-3 code, e.g. `'USD'`. Validated by {@link getCurrency}. */
export type CurrencyCode = string

export interface Currency {
  readonly code: CurrencyCode
  /** Number of decimal places in the currency's standard subdivision. */
  readonly minorUnitDigits: number
}

// Digits are the ISO 4217 minor-unit exponents. Grouped by exponent rather than
// alphabetically so an incorrect entry is obvious on sight.
const ZERO_DIGIT_CURRENCIES = [
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG',
  'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
] as const

const THREE_DIGIT_CURRENCIES = [
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
] as const

const TWO_DIGIT_CURRENCIES = [
  'AED', 'ARS', 'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'COP', 'CZK', 'DKK',
  'EGP', 'EUR', 'GBP', 'HKD', 'HRK', 'HUF', 'IDR', 'ILS', 'INR', 'KES', 'MAD',
  'MXN', 'MYR', 'NGN', 'NOK', 'NZD', 'PEN', 'PHP', 'PKR', 'PLN', 'QAR', 'RON',
  'RSD', 'RUB', 'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'UAH', 'USD', 'VES',
  'ZAR',
] as const

const registry = new Map<CurrencyCode, Currency>()

function seed(codes: readonly string[], minorUnitDigits: number): void {
  for (const code of codes) registry.set(code, Object.freeze({ code, minorUnitDigits }))
}

seed(ZERO_DIGIT_CURRENCIES, 0)
seed(TWO_DIGIT_CURRENCIES, 2)
seed(THREE_DIGIT_CURRENCIES, 3)

export class UnknownCurrencyError extends Error {
  constructor(readonly code: string) {
    super(
      `Unknown currency code '${code}'. Register it with registerCurrency() before use — ` +
        'guessing a minor-unit exponent would silently corrupt every amount in that currency.',
    )
    this.name = 'UnknownCurrencyError'
  }
}

/**
 * Look up a currency, throwing rather than defaulting.
 *
 * Defaulting an unknown code to 2 digits is the failure mode this guards against: it would
 * turn ¥1 000 into ¥10.00 with no error anywhere.
 */
export function getCurrency(code: CurrencyCode): Currency {
  const normalized = code.trim().toUpperCase()
  const currency = registry.get(normalized)
  if (!currency) throw new UnknownCurrencyError(code)
  return currency
}

export function isKnownCurrency(code: CurrencyCode): boolean {
  return registry.has(code.trim().toUpperCase())
}

/**
 * Add or override a currency. Intended for tests and for deployments that trade in a
 * currency missing from the table above.
 */
export function registerCurrency(code: CurrencyCode, minorUnitDigits: number): Currency {
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new RangeError(`Currency code must be three letters, received '${code}'`)
  }
  if (!Number.isInteger(minorUnitDigits) || minorUnitDigits < 0 || minorUnitDigits > 8) {
    throw new RangeError(`minorUnitDigits must be an integer in 0..8, received ${minorUnitDigits}`)
  }
  const currency = Object.freeze({ code: normalized, minorUnitDigits })
  registry.set(normalized, currency)
  return currency
}

export function listCurrencies(): readonly Currency[] {
  return [...registry.values()].sort((a, b) => a.code.localeCompare(b.code))
}
