// pdfkit@0.17 ships no type declarations of its own; the API surface used here is small and
// exercised end-to-end, so the missing types are suppressed rather than a hand-written module
// declaration is maintained against it.
// @ts-expect-error pdfkit has no bundled type declarations
import PDFDocument from 'pdfkit'
import { formatDateDisplay, formatMoneyDisplay, MONEY_DASH } from './money.js'

/**
 * Deterministic PDF documents — payslips (hr) and payables invoices (finance).
 *
 * "Deterministic" is a load-bearing property here, not an aesthetic one: the rebuild plan's
 * E2E suite asserts that a payslip is **byte-identical on re-fetch**, which is how a payslip
 * that was sent to an accountant last week can still be matched to what the API says now.
 * Two rules make that possible:
 *
 *  1. **Only the data flows into the document.** No "generated at" timestamps, no request
 *     ids, no random page ids — the input to a render is the run/line/invoice data and the
 *     tenant's name, so the same data always renders the same bytes.
 *  2. **Base-14 fonts and a pinned metadata date.** Helvetica via the built-in AFM metrics is
 *     never embedded, so the font stream does not exist. pdfkit *does* embed a wall-clock
 *     `/CreationDate` and derive the trailer's `/ID` from it (`PDFSecurity.generateFileID`
 *     is an MD5 over the info dict, so the date leaks into both objects) — pinning
 *     `CreationDate` to the epoch in the constructor's `info` option freezes both, leaving
 *     the file a pure function of its text (on a fixed machine/timezone, like the Excel
 *     exporter's fixed date).
 *
 * The functions here take plain strings (money already in decimal-string form, dates as ISO)
 * and return a Buffer. Data assembly — which run/line/invoice, joined how, tenant-scoped —
 * belongs to the module service that calls them.
 */

const PAGE_WIDTH = 612 // US Letter
const PAGE_BOTTOM = 792
const MARGIN = 48
const LEFT_COL = MARGIN
const RIGHT_EDGE = PAGE_WIDTH - MARGIN

/**
 * The document's one and only metadata date. pdfkit defaults it to `new Date()` and hashes it
 * into the trailer's `/ID`, so a wall clock here would make re-fetches differ. The epoch is
 * arbitrary but stable — what matters is that it never moves.
 */
const FIXED_CREATION_DATE = new Date(0)

/** A single payslip line, as the document needs it. */
export interface PayslipDoc {
  tenantName: string
  runLabel: string
  /** ISO `YYYY-MM-DD`, or null when the run has no pay date. */
  payDate: string | null
  status: string
  currency: string
  employeeName: string
  employeeTitle: string
  baseSalary: string | null
  bonusLabel: string | null
  bonusAmount: string | null
  missedDaysCount: number | null
  missedDaysAmount: string | null
  gross: string
  /** The tax/deduction split; `rate` is the run's percentage for that label (may be absent). */
  taxLines: { label: string; amount: string; rate?: string }[]
  deductions: string
  net: string
}

/** A payables invoice, as the document needs it. */
export interface InvoiceDoc {
  tenantName: string
  vendorName: string
  invoiceNumber: string | null
  /** ISO date of the invoice. */
  date: string
  currency: string
  status: string
  lineItems: { description: string; periodOrUsage: string | null; amount: string }[]
  total: string
}

type PdfStyle = { size?: number; font?: string; color?: string }

/** Collect the stream into a single Buffer; the document is built by `build(pdf)`. */
function renderToBuffer(build: (pdf: PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // `info.CreationDate` is the only wall clock in the output: pdfkit defaults it to
    // `new Date()` and hashes it into the trailer's `/ID`, so pin it (the constructor's
    // `info` option is merged over the defaults *before* the `_id` is derived, which is why
    // this one option freezes both objects).
    const pdf = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true, info: { CreationDate: FIXED_CREATION_DATE } })
    const chunks: Buffer[] = []
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
    build(pdf)
    pdf.end()
  })
}

function drawLabel(pdf: PDFDocument, y: number, text: string, style: PdfStyle = {}): void {
  pdf
    .font(style.font ?? 'Helvetica')
    .fontSize(style.size ?? 9)
    .fillColor(style.color ?? '#333333')
    .text(text, LEFT_COL, y, { lineBreak: false })
}

function drawValue(pdf: PDFDocument, y: number, text: string, style: PdfStyle = {}): void {
  pdf
    .font(style.font ?? 'Helvetica')
    .fontSize(style.size ?? 9)
    .fillColor(style.color ?? '#111111')
    .text(text, LEFT_COL, y, { width: RIGHT_EDGE - LEFT_COL, align: 'right', lineBreak: false })
}

/**
 * Render one payslip (one line of one run). The content is bounded by construction (one
 * employee, a handful of deduction lines), so it always fits one page and there is no
 * pagination logic to get wrong.
 */
export function renderPayslipPdf(doc: PayslipDoc): Promise<Buffer> {
  return renderToBuffer(pdf => {
    // ── Header ─────────────────────────────────────────────────────────────────
    pdf.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(doc.tenantName, LEFT_COL, MARGIN, { lineBreak: false })
    pdf.font('Helvetica').fontSize(10).fillColor('#666666').text('Payslip', LEFT_COL, MARGIN + 24, { lineBreak: false })

    // ── Run ────────────────────────────────────────────────────────────────────
    pdf.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(doc.runLabel, LEFT_COL, MARGIN + 52, { lineBreak: false })
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text(`Pay date: ${formatDateDisplay(doc.payDate)}    Status: ${doc.status}`, LEFT_COL, MARGIN + 70, {
        lineBreak: false,
      })

    // ── Employee ───────────────────────────────────────────────────────────────
    let y = MARGIN + 100
    pdf.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(doc.employeeName, LEFT_COL, y, { lineBreak: false })
    pdf.font('Helvetica').fontSize(9).fillColor('#666666').text(doc.employeeTitle, 300, y + 2, { lineBreak: false })

    // ── Earnings ───────────────────────────────────────────────────────────────
    y += 34
    drawLabel(pdf, y, 'EARNINGS', { size: 8, color: '#888888' })
    y += 18
    drawLabel(pdf, y, 'Base salary')
    drawValue(pdf, y, formatMoneyDisplay(doc.baseSalary, doc.currency))
    y += 16

    if (doc.bonusAmount != null && doc.bonusAmount !== '') {
      drawLabel(pdf, y, `Bonus${doc.bonusLabel ? ` (${doc.bonusLabel})` : ''}`)
      drawValue(pdf, y, formatMoneyDisplay(doc.bonusAmount, doc.currency))
      y += 16
    }

    if (doc.missedDaysAmount != null && doc.missedDaysAmount !== '') {
      drawLabel(pdf, y, `Missed days${doc.missedDaysCount != null ? ` (${doc.missedDaysCount})` : ''}`)
      drawValue(pdf, y, `(${formatMoneyDisplay(doc.missedDaysAmount, doc.currency)})`)
      y += 16
    }

    drawLabel(pdf, y, 'Gross pay', { font: 'Helvetica-Bold' })
    drawValue(pdf, y, formatMoneyDisplay(doc.gross, doc.currency), { font: 'Helvetica-Bold' })
    y += 24

    // ── Deductions ─────────────────────────────────────────────────────────────
    drawLabel(pdf, y, 'DEDUCTIONS', { size: 8, color: '#888888' })
    y += 18
    for (const taxLine of doc.taxLines) {
      const suffix = taxLine.rate != null && taxLine.rate !== '' ? ` (${taxLine.rate}%)` : ''
      drawLabel(pdf, y, taxLine.label + suffix)
      drawValue(pdf, y, `(${formatMoneyDisplay(taxLine.amount, doc.currency)})`)
      y += 16
    }
    drawLabel(pdf, y, 'Total deductions', { font: 'Helvetica-Bold' })
    drawValue(pdf, y, `(${formatMoneyDisplay(doc.deductions, doc.currency)})`, { font: 'Helvetica-Bold' })
    y += 24

    // ── Net pay ────────────────────────────────────────────────────────────────
    pdf.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text('NET PAY', LEFT_COL, y, { lineBreak: false })
    pdf
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#111111')
      .text(formatMoneyDisplay(doc.net, doc.currency), LEFT_COL, y, {
        width: RIGHT_EDGE - LEFT_COL,
        align: 'right',
        lineBreak: false,
      })
    y += 36

    // ── Footer ─────────────────────────────────────────────────────────────────
    pdf.font('Helvetica').fontSize(8).fillColor('#999999').text('Asas', LEFT_COL, PAGE_BOTTOM - 36, { lineBreak: false })
    void y
  })
}

/**
 * Render a payables invoice. Multi-page when the line items overflow one page — the only
 * paginated document we generate, so the page-break check lives here and nowhere else.
 */
export function renderInvoicePdf(doc: InvoiceDoc): Promise<Buffer> {
  return renderToBuffer(pdf => {
    pdf.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(doc.tenantName, LEFT_COL, MARGIN, { lineBreak: false })
    pdf.font('Helvetica').fontSize(10).fillColor('#666666').text('Invoice', LEFT_COL, MARGIN + 24, { lineBreak: false })

    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(doc.vendorName, LEFT_COL, MARGIN + 52, { lineBreak: false })
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text(
        `Invoice: ${doc.invoiceNumber ?? MONEY_DASH}    Date: ${formatDateDisplay(doc.date)}    Status: ${doc.status}`,
        LEFT_COL,
        MARGIN + 70,
        { lineBreak: false },
      )

    let y = MARGIN + 104
    pdf.font('Helvetica-Bold').fontSize(8).fillColor('#888888')
    pdf.text('DESCRIPTION', LEFT_COL, y, { lineBreak: false })
    pdf.text('PERIOD', 300, y, { lineBreak: false })
    pdf.text('AMOUNT', LEFT_COL, y, { width: RIGHT_EDGE - LEFT_COL, align: 'right', lineBreak: false })
    y += 18

    for (const item of doc.lineItems) {
      if (y > PAGE_BOTTOM - 90) {
        pdf.addPage()
        y = MARGIN
      }
      pdf.font('Helvetica').fontSize(9).fillColor('#111111')
      pdf.text(item.description, LEFT_COL, y, { width: 240, lineBreak: false, ellipsis: true })
      pdf.text(item.periodOrUsage ?? '', 300, y, { lineBreak: false })
      pdf.text(formatMoneyDisplay(item.amount, doc.currency), LEFT_COL, y, {
        width: RIGHT_EDGE - LEFT_COL,
        align: 'right',
        lineBreak: false,
      })
      y += 16
    }

    y += 8
    pdf.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Total', LEFT_COL, y, { lineBreak: false })
    pdf
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111111')
      .text(formatMoneyDisplay(doc.total, doc.currency), LEFT_COL, y, {
        width: RIGHT_EDGE - LEFT_COL,
        align: 'right',
        lineBreak: false,
      })

    pdf.font('Helvetica').fontSize(8).fillColor('#999999').text('Asas', LEFT_COL, PAGE_BOTTOM - 36, { lineBreak: false })
  })
}
