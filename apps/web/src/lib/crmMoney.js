import { moneyToMajor } from './format.js';

/**
 * Formats a currency amount compactly for CRM stage switcher cards:
 * - 1,000,000 and above -> "$" + value in millions, max 2 decimals, trailing zeros trimmed, then "M"
 * - 1,000 to 999,999 -> "$" + value in thousands, 0 decimals, then "K"
 * - below 1,000 -> full number
 */
export function formatCompactMoney(value) {
  if (value == null) return '$0';
  const numeric = typeof value === 'object' && value !== null && 'amount' in value
    ? moneyToMajor(value)
    : Number(value);
  if (!Number.isFinite(numeric)) return '$0';
  const abs = Math.abs(numeric);
  const sign = numeric < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    // max 2 decimals, trailing zeros trimmed
    const str = parseFloat(val.toFixed(2)).toString();
    return `${sign}$${str}M`;
  }
  if (abs >= 1_000) {
    // 0 decimals, rounded to nearest thousand, then "K"
    const val = Math.round(abs / 1_000);
    if (val >= 1_000) {
      return `${sign}$1M`;
    }
    return `${sign}$${val}K`;
  }
  // below 1,000 -> full number
  return `${sign}$${Math.round(abs)}`;
}

