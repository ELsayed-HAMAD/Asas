/**
 * Formatting helpers for the web app.
 *
 * The frontend stays standalone of `@asas/domain`: wire formats are handled inline instead of
 * through the `Money` class.
 *
 * Two money wire forms exist in the API:
 *   - `{ amount: <integer minor units, e.g. cents>, currency: 'USD' }` — finance / CRM / projects
 *   - a major-unit decimal string like `"1250.00"` — HR (salary, payroll), inventory prices
 * Both render through `formatMoney` below; no other client-side money math is permitted.
 */

let defaultCurrency = 'USD'
let defaultLocale = 'en-US'

export function setFormatDefaults(settings = {}) {
  if (settings.currency && /^[A-Z]{3}$/i.test(String(settings.currency))) {
    defaultCurrency = settings.currency.trim().toUpperCase()
  }
  if (settings.locale) {
    defaultLocale = settings.locale
  }
}

export function getFormatDefaults() {
  return { currency: defaultCurrency, locale: defaultLocale }
}

const ZERO_DECIMAL_CURRENCIES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

function getMinorUnitDivisor(currency) {
  const code = String(currency || '').toUpperCase()
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 1
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 1000
  return 100
}

/** True when `value` is a `{ amount, currency }` wire object (minor units). */
function isMoneyWire(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    'amount' in value &&
    'currency' in value &&
    typeof value.amount === 'number'
  )
}

/**
 * Format money values safely.
 * Accepts a wire object ({ amount: minor units, currency }), a major-unit number, or a
 * major-unit decimal string. Returns '—' for null/undefined/NaN.
 */
export function formatMoney(value, options = {}) {
  if (value == null) return '—'

  let numericValue
  let currencyCode = options.currency || defaultCurrency

  if (isMoneyWire(value)) {
    currencyCode = value.currency || currencyCode
    numericValue = value.amount / getMinorUnitDivisor(currencyCode)
  } else {
    numericValue = Number(value)
    if (Number.isNaN(numericValue)) return '—'
  }

  const {
    compact = false,
    forcePlus = false,
    locale = defaultLocale,
    minimumFractionDigits,
    maximumFractionDigits,
  } = options

  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: minimumFractionDigits ?? (compact ? 0 : undefined),
      maximumFractionDigits: maximumFractionDigits ?? (compact ? 1 : 2),
    }).format(numericValue)

    if (forcePlus && numericValue > 0) return `+${formatted}`
    return formatted
  } catch {
    // Fallback if locale or currency throws in exotic browser environments
    return `${numericValue.toFixed(2)} ${currencyCode}`
  }
}

export function formatCompactNumber(value, locale = defaultLocale) {
  if (value == null) return '—'
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return '—'
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(numeric)
}

/** `value` is a 0–100 percentage (the API's `percentageSchema` scale). */
export function formatPercent(value, options = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const { locale = defaultLocale, minimumFractionDigits = 0, maximumFractionDigits = 1 } = options
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value) / 100)
}

export function formatDate(value, options = { dateStyle: 'medium' }, locale = defaultLocale) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, options).format(date)
}
