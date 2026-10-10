/**
 * Formatting helpers for the web app.
 *
 * Currency scales come from `@asas/domain`, the same registry that defines API minor units.
 * Intl supplies locale formatting only; it must not choose the wire amount's exponent.
 *
 * Two money wire forms exist in the API:
 *   - `{ amount: <integer minor units, e.g. cents>, currency: 'USD' }` — finance / CRM / projects
 *   - a major-unit decimal string like `"1250.00"` — HR (salary, payroll), inventory prices
 * Both render through `formatMoney` below; no other client-side money math is permitted.
 */

import { getCurrency } from '@asas/domain/money'

let defaultCurrency = 'USD'
let defaultLocale = 'en-US'
let defaultTimeZone = 'UTC'
let defaultDateFormat = 'MMM d, yyyy'

export function setFormatDefaults(settings = {}) {
  if (settings.currency && /^[A-Z]{3}$/i.test(String(settings.currency))) {
    defaultCurrency = settings.currency.trim().toUpperCase()
  }
  if (settings.locale) {
    defaultLocale = settings.locale
  }
  if (settings.timezone) {
    try {
      new Intl.DateTimeFormat(defaultLocale, { timeZone: settings.timezone })
      defaultTimeZone = settings.timezone
    } catch { /* Keep the last valid workspace timezone. */ }
  }
  if (['MMM d, yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy'].includes(settings.dateFormat)) {
    defaultDateFormat = settings.dateFormat
  }
}

export function getFormatDefaults() {
  return { currency: defaultCurrency, locale: defaultLocale, timeZone: defaultTimeZone, dateFormat: defaultDateFormat }
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
  return getCurrency(currency).minorUnitDigits
}

export function moneyToMajor(value) {
  if (!isMoneyWire(value)) return Number(value) || 0
  const currency = value.currency || defaultCurrency
  try {
    if (!Number.isSafeInteger(value.amount)) return NaN
    return value.amount / (10 ** currencyDigits(currency))
  } catch {
    return NaN
  }
}

export function formatCompactMoney(value, currency = defaultCurrency, locale = defaultLocale) {
  if (value == null) return '—'
  try {
    const code = getCurrency(isMoneyWire(value) ? value.currency : currency).code
    const number = isMoneyWire(value) ? moneyToMajor(value) : Number(value)
    if (!Number.isFinite(number)) return '—'
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: code, notation: 'compact', maximumFractionDigits: 1,
    }).format(number)
  } catch {
    return '—'
  }
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
    numericValue = moneyToMajor(value)
  } else {
    numericValue = Number(value)
  }
  if (!Number.isFinite(numericValue)) return '—'
  try {
    currencyCode = getCurrency(currencyCode).code
  } catch {
    return '—'
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
      minimumFractionDigits: minimumFractionDigits ?? (compact ? 0 : Math.min(currencyDigits(currencyCode), maximumFractionDigits ?? currencyDigits(currencyCode))),
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

function formatDatePattern(date, pattern, locale, timeZone) {
  const month = pattern.includes('MMM') ? 'short' : '2-digit'
  const parts = new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month, day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  const tokens = { yyyy: values.year, MMM: values.month, MM: values.month, M: String(Number(values.month)), dd: values.day, d: String(Number(values.day)) }
  return pattern.replace(/yyyy|MMM|MM|dd|M|d/g, token => tokens[token])
}

export function formatDate(value, options, locale = defaultLocale, timeZone = defaultTimeZone) {
  if (!value) return '—'
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = dateOnly ? new Date(`${value}T00:00:00.000Z`) : typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime()) || (dateOnly && date.toISOString().slice(0, 10) !== value)) return '—'
  const effectiveTimeZone = dateOnly ? 'UTC' : timeZone
  if (options === undefined) return formatDatePattern(date, defaultDateFormat, locale, effectiveTimeZone)
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: options.timeZone ?? effectiveTimeZone }).format(date)
}
