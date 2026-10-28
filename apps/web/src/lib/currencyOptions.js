import { listCurrencies } from '@asas/domain/money'

const COMMON_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'AED', 'SAR', 'EGP',
  'IQD', 'KWD', 'JOD', 'CNY', 'JPY', 'INR',
]

const displayNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(undefined, { type: 'currency' })
  : null

function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts
      .filter(part => part.type === 'currency')
      .map(part => part.value)
      .join('') || code
  } catch {
    return code
  }
}

/**
 * Builds currency choices with the ISO code, full name, and symbol. A short common list
 * keeps the frequent choices near the top while search still reaches the full registry.
 */
export function buildCurrencyOptions(currencies = listCurrencies()) {
  return currencies
    .map(({ code }) => {
      const name = displayNames?.of(code) || code
      const symbol = currencySymbol(code)
      return {
        value: code,
        label: code,
        description: name,
        meta: symbol,
        group: COMMON_CURRENCIES.includes(code) ? 'Common currencies' : 'All currencies',
        keywords: `${code} ${name} ${symbol}`,
      }
    })
    .sort((a, b) => {
      const groupOrder = { 'Common currencies': 0, 'All currencies': 1 }
      const byGroup = groupOrder[a.group] - groupOrder[b.group]
      if (byGroup !== 0) return byGroup
      if (a.group === 'Common currencies') {
        return COMMON_CURRENCIES.indexOf(a.value) - COMMON_CURRENCIES.indexOf(b.value)
      }
      return a.value.localeCompare(b.value)
    })
}
