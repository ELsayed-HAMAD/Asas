import { useAuthStore } from '../store/authStore'

export function getTenantCurrency() {
  return useAuthStore.getState().user?.tenant?.currency || 'USD'
}

export function formatMoney(value, options = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const {
    compact = false,
    forcePlus = false,
    maximumFractionDigits,
    minimumFractionDigits,
  } = options
  const amount = Number(value)
  const currency = getTenantCurrency()
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: minimumFractionDigits ?? (compact ? 0 : undefined),
    maximumFractionDigits: maximumFractionDigits ?? (compact ? 1 : 2),
  }).format(amount)
  if (forcePlus && amount > 0) return `+${formatted}`
  return formatted
}
