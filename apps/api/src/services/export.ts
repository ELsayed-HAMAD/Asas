import ExcelJS from 'exceljs'
import { Money, type CurrencyCode } from '@asas/domain'
import { formatMoneyDisplay } from './money.js'

/**
 * Deterministic Excel workbooks — the bulk exports (employee directory, general ledger) that
 * run through the queue in `services/queue.ts`.
 *
 * Same determinism rules as `pdf.ts` (the plan's E2E asserts byte-identical re-fetch on the
 * payslip, and the same invariant is what makes any document export trustworthy): no
 * "generated at" stamp, no creator/company metadata, fixed column order, rows in the exact
 * order the service passed them. The workbook is a pure function of its rows.
 */

export interface EmployeeDirectoryRow {
  name: string
  title: string
  status: string
  department: string | null
  location: string | null
  email: string | null
  hiredAt: string | null
  salary: string | null
  currency: string
}

export interface LedgerRow {
  date: string
  description: string
  status: string
  /** Signed major-unit decimal string as stored (credits already negative). */
  amount: string
  currency: string
}

/** A fixed timestamp so the workbook is deterministic — never `new Date()`, which would stamp it. */
const FIXED_DATE = new Date(0)

function buildWorkbook(build: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = ''
  workbook.lastModifiedBy = ''
  workbook.created = FIXED_DATE
  workbook.modified = FIXED_DATE
  build(workbook)
  // ExcelJS's `Buffer` is the pre-generic lib type; re-anchor to node's `Buffer` via `unknown`.
  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>
}

function applyHeader(sheet: ExcelJS.Worksheet, headers: string[], widths: number[]): void {
  sheet.columns = headers.map((header, index) => ({ header, key: `col${index}`, width: widths[index] ?? 20 }))
  const row = sheet.getRow(1)
  row.font = { bold: true }
  row.height = 18
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

/**
 * The HR directory export: one row per employee, every column the directory page shows, with
 * salary rendered in the tenant's currency (already redacted-or-not by the caller — the
 * service passes what the caller is allowed to see, the same rule as the list endpoint).
 */
export function renderEmployeeDirectoryXlsx(rows: EmployeeDirectoryRow[]): Promise<Buffer> {
  return buildWorkbook(workbook => {
    const sheet = workbook.addWorksheet('Employees')
    applyHeader(
      sheet,
      ['Name', 'Title', 'Status', 'Department', 'Location', 'Email', 'Hired', 'Salary'],
      [28, 28, 12, 20, 18, 32, 12, 16],
    )
    for (const row of rows) {
      sheet.addRow({
        col0: row.name,
        col1: row.title,
        col2: row.status,
        col3: row.department ?? '',
        col4: row.location ?? '',
        col5: row.email ?? '',
        col6: row.hiredAt ?? '',
        col7: formatMoneyDisplay(row.salary, row.currency),
      })
    }
  })
}

/**
 * The general-ledger export: one row per `LedgerTransaction` in date order (the service sorts
 * before calling), credits negative exactly as stored, plus a totals row computed from the
 * *rows* — which are the full tenant set, not a page, so the total is honest.
 */
export function renderLedgerXlsx(rows: LedgerRow[]): Promise<Buffer> {
  return buildWorkbook(workbook => {
    const sheet = workbook.addWorksheet('Ledger')
    applyHeader(sheet, ['Date', 'Description', 'Status', 'Amount'], [12, 60, 12, 18])
    for (const row of rows) {
      sheet.addRow({
        col0: row.date,
        col1: row.description,
        col2: row.status,
        col3: formatMoneyDisplay(row.amount, row.currency),
      })
    }

    // Totals row, derived from the full row set (never a page). Summed in integer minor units
    // via `Money.sum` — a float `Number()` sum would lose precision on large books.
    const currency: CurrencyCode = (rows[0]?.currency ?? 'USD') as CurrencyCode
    const total =
      rows.length === 0
        ? '0'
        : Money.sum(
            rows.map(row => Money.fromDecimal(row.amount, currency, 'HALF_UP')),
            currency,
          ).toDecimalString()
    const totalsRow = sheet.addRow({
      col0: '',
      col1: 'Total',
      col2: '',
      col3: formatMoneyDisplay(total, rows[0]?.currency ?? 'USD'),
    })
    totalsRow.font = { bold: true }
  })
}
