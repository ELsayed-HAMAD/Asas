import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { downloadCsv, inferCsvColumnMapping, parseCsvImport } from '../../../lib/csv'
import { settingsApi } from '../../../lib/api/settings'
import { EMPTY } from '../../../lib/emptyText'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500
const FIELDS = [
  { key: 'sourceProductId', label: 'Source product ID', required: true, aliases: ['source product id', 'source id', 'legacy product id', 'legacy item id', 'product id', 'item id'] },
  { key: 'quantity', label: 'Opening quantity', required: true, aliases: ['opening quantity', 'on hand', 'on hand quantity', 'stock quantity', 'quantity'] },
  { key: 'unitCost', label: 'Source unit cost', required: false, aliases: ['source unit cost', 'unit cost', 'cost per unit', 'purchase cost', 'acquisition cost', 'landed unit cost'] },
  { key: 'asOf', label: 'Stock count as of (YYYY-MM-DD)', required: true, aliases: ['stock count as of', 'stock count as of (yyyy mm dd)', 'as of', 'effective date', 'count date', 'snapshot date'] },
]

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export default function InventoryOpeningStockMigration({ projectId, onImported }) {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [sourceRows, setSourceRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [fileError, setFileError] = useState('')
  const [validation, setValidation] = useState({ fingerprint: '', status: 'idle', result: null, error: '' })
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [completed, setCompleted] = useState(null)

  const { stock, localIssues, mappingIssues } = useMemo(() => {
    if (!headers.length) return { stock: [], localIssues: [], mappingIssues: [] }
    const rows = sourceRows.map(source => {
      const row = {}
      FIELDS.forEach(field => {
        const value = mapping[field.key] === '' || mapping[field.key] == null ? '' : String(source[Number(mapping[field.key])] ?? '').trim()
        if (field.required || value) row[field.key] = value
      })
      return row
    })
    const issues = []
    const seen = new Map()
    rows.forEach((row, index) => {
      const rowNumber = index + 2
      if (!row.sourceProductId || row.sourceProductId.length > 120) issues.push({ rowNumber, field: 'sourceProductId', message: 'Enter a source product ID of 1 to 120 characters.' })
      if (!/^(?:0|[1-9]\d*)$/.test(row.quantity) || row.quantity.length > 10 || Number(row.quantity) > 2_147_483_647) issues.push({ rowNumber, field: 'quantity', message: 'Opening quantity must be a whole number from 0 to 2,147,483,647.' })
      if (!validDate(row.asOf)) issues.push({ rowNumber, field: 'asOf', message: 'Enter a valid calendar date as YYYY-MM-DD.' })
      if (row.unitCost) {
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(row.unitCost) || Number(row.unitCost) <= 0) issues.push({ rowNumber, field: 'unitCost', message: 'Enter a positive source unit cost with at most 4 decimal places.' })
        if (row.quantity === '0') issues.push({ rowNumber, field: 'unitCost', message: 'A zero opening quantity cannot carry a source unit cost.' })
      }
      if (row.sourceProductId) {
        const prior = seen.get(row.sourceProductId)
        if (prior) {
          issues.push({ rowNumber: prior, field: 'sourceProductId', message: `This source product is repeated on row ${rowNumber}.` })
          issues.push({ rowNumber, field: 'sourceProductId', message: `This source product already appeared on row ${prior}.` })
        } else seen.set(row.sourceProductId, rowNumber)
      }
    })
    const used = new Map()
    const mapIssues = []
    FIELDS.forEach(field => {
      const column = mapping[field.key]
      if (column === '' || column == null) return
      if (used.has(column)) mapIssues.push(`Map ${field.label} to a different source column than ${used.get(column)}.`)
      else used.set(column, field.label)
    })
    return { stock: rows, localIssues: issues, mappingIssues: mapIssues }
  }, [headers, mapping, sourceRows])

  const fingerprint = JSON.stringify(stock)
  const locallyValid = headers.length > 0 && stock.length > 0 && !localIssues.length && !mappingIssues.length && FIELDS.every(field => !field.required || (mapping[field.key] !== '' && mapping[field.key] != null))

  useEffect(() => {
    if (!locallyValid) { setValidation({ fingerprint, status: 'idle', result: null, error: '' }); return undefined }
    let current = true
    setValidation({ fingerprint, status: 'checking', result: null, error: '' })
    settingsApi.validateInventoryOpeningStockMigration(projectId, stock).then(result => {
      if (current) setValidation({ fingerprint, status: result.issues.length ? 'invalid' : 'ready', result, error: '' })
    }).catch(error => { if (current) setValidation({ fingerprint, status: 'error', result: null, error: error?.message || 'Server validation failed.' }) })
    return () => { current = false }
  }, [fingerprint, locallyValid, projectId, stock])

  async function chooseFile(file) {
    setFileError(''); setImportError(''); setCompleted(null); setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { setFileError('Choose a CSV export. Excel files and direct ERP connections are not part of this importer.'); return }
    if (file.size > MAX_FILE_BYTES) { setFileError('CSV files must be 2 MB or smaller.'); return }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: 'opening stock rows' })
      setFileName(file.name); setHeaders(parsed.headers); setSourceRows(parsed.rows); setMapping(inferCsvColumnMapping(parsed.headers, FIELDS))
    } catch (error) { setFileError(error?.message || 'Could not read this CSV file.') }
  }

  async function importBatch() {
    if (!canImport || importing) return
    setImporting(true); setImportError('')
    try { const result = await settingsApi.importInventoryOpeningStockMigration(projectId, stock); setCompleted(result); await onImported?.() }
    catch (error) {
      setImportError(error?.message || 'Could not import opening stock.')
      if (Array.isArray(error?.details)) setValidation({ fingerprint, status: 'invalid', result: { issues: error.details }, error: '' })
    } finally { setImporting(false) }
  }

  const allIssues = [...localIssues, ...(validation.fingerprint === fingerprint ? validation.result?.issues ?? [] : [])]
  const canImport = locallyValid && validation.fingerprint === fingerprint && validation.status === 'ready'
  const positiveRows = stock.filter(row => Number(row.quantity) > 0).length
  const completedValuedRows = stock.filter(row => row.unitCost && Number(row.quantity) > 0).length
  const completedUnvaluedRows = stock.filter(row => !row.unitCost && Number(row.quantity) > 0).length

  return <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby="inventory-opening-stock-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={19} /></span><div>
        <h2 id="inventory-opening-stock-title" className="text-base font-semibold text-heading">Import Inventory opening stock</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Import after the product catalog. Each source product ID must match a product imported in this migration, and products with existing stock or movements are blocked for reconciliation. When inventory valuation is configured, every positive row requires an exact source unit cost in the product&apos;s valuation currency and a ledger mapping for that currency; the row posts Dr inventory / Cr opening equity in the same transaction. Leave cost blank only on zero-quantity rows or while valuation is not configured: those positive quantities remain unvalued for later review. Cost is never derived from selling price; map an actual source cost.</p>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-warning-text">A posted Finance opening balance blocks positive opening stock. A valued import posts journals immediately, so it also blocks Finance&apos;s opening trial-balance cutover, which requires an unused ledger. Inventory opening stock and Finance cutover are therefore mutually exclusive; a coordinated Inventory/Finance opening is not implemented yet. Quantity-only rows cannot be valued through opening equity after Finance&apos;s opening balance posts, and valuing them before cutover still consumes the ledger. Do not stage both an inventory opening and a Finance opening for the same company.</p>
      </div></div>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv([FIELDS.map(field => field.label), ['legacy-item-001', '240', '', '2026-09-30']], 'asas-inventory-opening-stock-template.csv', { bom: true })}><Download size={15} /> Template</Button>
    </div>
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-heading">{fileName || 'Choose an opening stock CSV'}</p><p className="mt-1 text-xs text-muted">CSV · up to 2 MB · maximum {MAX_ROWS} products</p></div><input ref={inputRef} type="file" accept=".csv,text/csv" aria-label="Choose inventory opening stock CSV file" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={15} /> Choose CSV</Button></div>
    {fileError && <Alert variant="destructive"><AlertDescription>{fileError}</AlertDescription></Alert>}
    {headers.length > 0 && <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{FIELDS.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body"><span>{field.label}{field.required ? ' *' : ' (optional)'}</span><select value={mapping[field.key] ?? ''} onChange={event => { setCompleted(null); setMapping(current => ({ ...current, [field.key]: event.target.value })) }} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent"><option value="">{field.required ? 'Choose a source column' : 'No source cost column'}</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}</select></label>)}</div>
      <div className="rounded-lg border border-border-subtle bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-heading">Import preview · {stock.length} rows</span><span className="text-muted">{mappingIssues.length ? `${mappingIssues.length} mapping issue${mappingIssues.length === 1 ? '' : 's'}` : allIssues.length ? `${allIssues.length} data issue${allIssues.length === 1 ? '' : 's'}` : validation.status === 'checking' ? 'Checking with Asas…' : validation.status === 'ready' ? 'All rows validated' : validation.error ? 'Server validation needs attention' : 'Map all columns'}</span></div>
        {(mappingIssues.length || allIssues.length || validation.error) ? <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{mappingIssues.map((issue, i) => <li key={`map-${i}`}>{issue}</li>)}{allIssues.slice(0, 15).map((issue, i) => <li key={`${issue.rowNumber}-${issue.field}-${i}`}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}{allIssues.length > 15 && <li>And {allIssues.length - 15} more issues.</li>}{validation.error && <li>{validation.error}</li>}</ul> : null}
        <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted">{FIELDS.map(field => <th key={field.key} className="pb-2 pr-4 font-medium">{field.label}</th>)}</tr></thead><tbody>{stock.slice(0, 100).map((row, index) => <tr key={`${row.sourceProductId}-${index}`} className="border-t border-border-subtle text-body">{FIELDS.map(field => <td key={field.key} className="py-2 pr-4">{row[field.key] || EMPTY.provided}</td>)}</tr>)}</tbody></table>{stock.length > 100 && <p className="pt-2 text-xs text-muted">Showing first 100 rows; all {stock.length} rows are validated before import.</p>}</div>
      </div>
    </div>}
    {completed && <Alert variant="success" className="mt-4"><AlertDescription>{completed.replayed ? 'This batch was already committed; stock was not added again.' : `${completed.imported} opening stock row${completed.imported === 1 ? '' : 's'} imported.`}{' '}{completedValuedRows > 0 ? `${completedValuedRows} valued row${completedValuedRows === 1 ? '' : 's'} posted inventory against opening equity with the source cost. These journals make the ledger non-empty; Finance's opening trial-balance cutover requires an unused ledger and cannot follow this import without a coordinated opening that is not implemented yet.` : ''}{' '}{completedUnvaluedRows > 0 ? `${completedUnvaluedRows} positive row${completedUnvaluedRows === 1 ? '' : 's'} remain${completedUnvaluedRows === 1 ? 's' : ''} quantity-only and must be valued on the Inventory Valuation page before issue or reconciliation. Valuing them posts inventory journals, so Finance's unused-ledger cutover cannot follow without a coordinated opening that is not implemented.` : ''}{' '}{positiveRows > 0 ? 'Dated stock movements and source links were recorded.' : 'Zero-quantity source links were recorded; no stock movements were created.'}</AlertDescription></Alert>}
    {importError && <Alert variant="destructive" className="mt-4"><AlertDescription>{importError}</AlertDescription></Alert>}
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!canImport || importing} onClick={importBatch}>{importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Check size={15} /> Import {stock.length} row{stock.length === 1 ? '' : 's'}</>}</Button><p className="text-xs text-muted">Stock movements, valuation and ledger postings when cost is supplied, source links, import log, and audit event commit together.</p></div>
  </section>
}
