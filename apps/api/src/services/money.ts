import { Money, type CurrencyCode } from '@asas/domain'

/**
 * Display formatting for the document generators (PDF payslips/invoices, Excel exports).
 *
 * The API's wire layer carries raw decimal strings and never formats — but a PDF or an
 * Excel sheet is a *document*, and that is the one place where `1,234.50` belongs. Kept in
 * `services/` (not the modules) because both the hr and finance export paths render documents
 * and both need the exact same rendering: the same money, the same grouping, the same dashes.
 */

/** The placeholder for an absent amount in a document, matching the web app's `—` convention. */
export const MONEY_DASH = '—'

/**
 * Render a major-unit decimal string as a fixed-scale, grouped display string:
 * `'1234.5'`/`'1234.5000'` (USD) → `'1,234.50'`. Null/empty/`'0'`-scale quirks all land on
 * the same deterministic output; an unparseable value (a data bug) falls back to the raw
 * string rather than throwing into the middle of a document render.
 *
 * The grouping is hand-rolled (not `Intl`) on purpose: `Intl.NumberFormat` output can differ
 * across ICU data versions, and payslip PDFs must be byte-stable for the same data.
 */
export function formatMoneyDisplay(value: string | null | undefined, currency: string): string {
  if (value == null || value.trim() === '') return MONEY_DASH
  try {
    const normalized = Money.fromDecimal(value, currency as CurrencyCode, 'HALF_UP').toDecimalString()
    return groupThousands(normalized)
  } catch {
    return value
  }
}

function groupThousands(decimal: string): string {
  const negative = decimal.startsWith('-')
  const body = negative ? decimal.slice(1) : decimal
  const dot = body.indexOf('.')
  const integer = dot === -1 ? body : body.slice(0, dot)
  const fraction = dot === -1 ? null : body.slice(dot)
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${fraction ?? ''}`
}

/**
 * Render a date as the document's fixed `YYYY-MM-DD` form (UTC). A `null` date is the dash,
 * not a blank, so a missing pay date is visibly absent rather than silently empty.
 */
export function formatDateDisplay(date: Date | string | null | undefined): string {
  if (!date) return MONEY_DASH
  const parsed = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(parsed.getTime())) return MONEY_DASH
  return parsed.toISOString().slice(0, 10)
}
