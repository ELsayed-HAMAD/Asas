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

function currencyDigits(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  } catch {
    return 2
  }
}

export function moneyToMajor(value) {
  if (!isMoneyWire(value)) return Number(value) || 0
  const currency = value.currency || defaultCurrency
  return value.amount / (10 ** currencyDigits(currency))
}

export function formatCompactMoney(value, currency = defaultCurrency, locale = defaultLocale) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
  }).format(number)
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
    // Wire amount is expressed in the ISO currency's minor units (JPY has none;
    // KWD has three), not always cents.
    numericValue = value.amount / (10 ** currencyDigits(currencyCode))
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
      maximumFractionDigits: maximumFractionDigits ?? (compact ? 1 : currencyDigits(currencyCode)),
    }).format(numericValue)

    if (forcePlus && numericValue > 0) return `+${formatted}`
    return formatted
  } catch {
    // Fallback if locale or currency throws in exotic browser environments
    return `${numericValue.toFixed(currencyDigits(currencyCode))} ${currencyCode}`
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
