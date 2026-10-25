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
  recordType: 'JOURNAL_LINE' | 'LEGACY_TRANSACTION'
  journalId: string | null
  description: string
  sourceType: string
  accountCode: string | null
  accountName: string | null
  side: 'DEBIT' | 'CREDIT'
  /** Positive major-unit amount; `side` determines debit versus credit. */
  amount: string
  currency: string
  baseAmount: string | null
  baseCurrency: string | null
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
 * General-ledger detail: one row per posted journal line. Legacy sample ledger records are
 * explicitly marked. Workbook totals are grouped by record type, currency, and amount basis.
 */
export function renderLedgerXlsx(rows: LedgerRow[]): Promise<Buffer> {
  return buildWorkbook(workbook => {
    const sheet = workbook.addWorksheet('Ledger')
    applyHeader(sheet, ['Date', 'Record Type', 'Journal ID', 'Description', 'Source', 'Account Code', 'Account Name', 'Side', 'Amount', 'Currency', 'Base Amount', 'Base Currency'], [12, 18, 26, 48, 24, 16, 26, 10, 18, 12, 18, 12])
    for (const row of rows) {
      sheet.addRow({
        col0: row.date,
        col1: row.recordType,
        col2: row.journalId ?? '',
        col3: row.description,
        col4: row.sourceType,
        col5: row.accountCode ?? '',
        col6: row.accountName ?? '',
        col7: row.side,
        col8: row.amount,
        col9: row.currency,
        col10: row.baseAmount ?? '',
        col11: row.baseCurrency ?? '',
      })
    }

    // Keep totals separated by document/base denomination and journal/legacy record type.
    // Money.sum works in exact minor units, avoiding floating-point errors on large books.
    const groups = new Map<string, { recordType: string; basis: string; currency: CurrencyCode; debit: string[]; credit: string[] }>()
    const addToGroup = (recordType: string, basis: string, currencyCode: string, side: 'DEBIT' | 'CREDIT', amount: string) => {
      const currency = currencyCode as CurrencyCode
      const key = `${recordType}\0${basis}\0${currency}`
      let group = groups.get(key)
      if (!group) {
        group = { recordType, basis, currency, debit: [], credit: [] }
        groups.set(key, group)
      }
      group[side === 'DEBIT' ? 'debit' : 'credit'].push(amount)
    }
    for (const row of rows) {
      addToGroup(row.recordType, 'DOCUMENT', row.currency, row.side, row.amount)
      if (row.baseAmount !== null && row.baseCurrency !== null) addToGroup(row.recordType, 'BASE', row.baseCurrency, row.side, row.baseAmount)
    }
    const totals = workbook.addWorksheet('Totals')
    applyHeader(totals, ['Record Type', 'Basis', 'Currency', 'Debits', 'Credits'], [24, 14, 14, 20, 20])
    for (const group of groups.values()) {
      const debit = group.debit.length ? Money.sum(group.debit.map(value => Money.fromDecimal(value, group.currency, 'HALF_UP')), group.currency).toDecimalString() : '0'
      const credit = group.credit.length ? Money.sum(group.credit.map(value => Money.fromDecimal(value, group.currency, 'HALF_UP')), group.currency).toDecimalString() : '0'
      totals.addRow({ col0: group.recordType, col1: group.basis, col2: group.currency, col3: formatMoneyDisplay(debit, group.currency), col4: formatMoneyDisplay(credit, group.currency) })
    }
  })
}

export interface ProjectExportRow {
  name: string
  status: string
  department: string | null
  budget: string | null
  spent: string | null
  currency: string
  sprintsCount: number
}

/** RFC 4180 encoding with spreadsheet-formula neutralization for tenant-controlled strings. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function renderCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): Buffer {
  const content = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  return Buffer.from(`\uFEFF${content}`, 'utf8')
}

export function renderEmployeeDirectoryCsv(rows: EmployeeDirectoryRow[]): Buffer {
  return renderCsv(
    ['Name', 'Title', 'Status', 'Department', 'Location', 'Email', 'Hired', 'Salary', 'Currency'],
    rows.map(row => [row.name, row.title, row.status, row.department, row.location, row.email, row.hiredAt, row.salary, row.currency]),
  )
}

export function renderLedgerCsv(rows: LedgerRow[]): Buffer {
  return renderCsv(
    ['Date', 'Record Type', 'Journal ID', 'Description', 'Source', 'Account Code', 'Account Name', 'Side', 'Amount', 'Currency', 'Base Amount', 'Base Currency'],
    rows.map(row => [row.date, row.recordType, row.journalId, row.description, row.sourceType, row.accountCode, row.accountName, row.side, row.amount, row.currency, row.baseAmount, row.baseCurrency]),
  )
}

export function renderProjectsCsv(rows: ProjectExportRow[]): Buffer {
  return renderCsv(
    ['Project Name', 'Status', 'Department', 'Budget', 'Settled Spend', 'Currency', 'Sprints'],
    rows.map(row => [row.name, row.status, row.department, row.budget, row.spent, row.currency, row.sprintsCount]),
  )
}

export function renderProjectsXlsx(rows: ProjectExportRow[]): Promise<Buffer> {
  return buildWorkbook(workbook => {
    const sheet = workbook.addWorksheet('Projects')
    applyHeader(
      sheet,
      ['Project Name', 'Status', 'Department', 'Budget', 'Settled Spend', 'Sprints'],
      [30, 15, 20, 18, 18, 12],
    )
    for (const row of rows) {
      sheet.addRow({
        col0: row.name,
        col1: row.status,
        col2: row.department ?? '',
        col3: formatMoneyDisplay(row.budget, row.currency),
        col4: formatMoneyDisplay(row.spent, row.currency),
        col5: row.sprintsCount,
      })
    }
  })
}

