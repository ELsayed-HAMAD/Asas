import { isKnownCurrency, Money } from '@asas/domain'

export interface MoneyFormatOptions {
  currency?: string
  locale?: string
  compact?: boolean
  forcePlus?: boolean
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

let defaultCurrency = 'USD'
let defaultLocale = 'en-US'

export function setFormatDefaults(settings: { currency?: string; locale?: string }) {
  if (settings.currency && isKnownCurrency(settings.currency)) {
    defaultCurrency = settings.currency.trim().toUpperCase()
  }
  if (settings.locale) {
    defaultLocale = settings.locale
  }
}

export function getFormatDefaults() {
  return { currency: defaultCurrency, locale: defaultLocale }
}

/**
 * Format money values safely.
 * Accepts a `Money` instance, a wire object, a major-unit number, or a decimal string.
 */
export function formatMoney(
  value: Money | number | string | { amount: number; currency: string } | null | undefined,
  options: MoneyFormatOptions = {},
): string {
  if (value == null) return '—'

  let numericValue: number
  let currencyCode = options.currency || defaultCurrency

  if (value instanceof Money) {
    numericValue = value.toNumber()
    currencyCode = value.currency
  } else if (typeof value === 'object' && 'amount' in value && 'currency' in value) {
    const money = Money.fromWire(value)
    numericValue = money.toNumber()
    currencyCode = money.currency
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

export function formatCompactNumber(
  value: number | bigint | null | undefined,
  locale = defaultLocale,
): string {
  if (value == null) return '—'
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return '—'
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    numeric,
  )
}

export function formatPercent(
  value: number | null | undefined,
  options: { locale?: string; minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const { locale = defaultLocale, minimumFractionDigits = 0, maximumFractionDigits = 1 } = options
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value) / 100)
}

export function formatDate(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  locale = defaultLocale,
): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, options).format(date)
}
