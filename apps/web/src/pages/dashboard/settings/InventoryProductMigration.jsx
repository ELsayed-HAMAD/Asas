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
  { key: 'sourceId', label: 'Source record ID', required: true, aliases: ['source id', 'source record id', 'external id', 'legacy id', 'product id', 'item id'] },
  { key: 'sku', label: 'SKU', required: true, aliases: ['sku', 'product sku', 'item number', 'item code', 'product code'] },
  { key: 'name', label: 'Product name', required: true, aliases: ['product', 'product name', 'item name', 'name', 'description'] },
  { key: 'salePrice', label: 'Sale price (workspace currency)', required: true, aliases: ['sale price', 'price', 'unit price', 'sales price', 'sale price (workspace currency)'] },
  { key: 'minThreshold', label: 'Minimum stock threshold', aliases: ['minimum stock', 'minimum stock threshold', 'min threshold', 'reorder point'] },
  { key: 'avgMonthlyUsage', label: 'Average monthly usage', aliases: ['average monthly usage', 'avg monthly usage', 'monthly usage'] },
  { key: 'leadTimeDays', label: 'Lead time in days', aliases: ['lead time days', 'lead time in days', 'lead time'] },
  { key: 'warehouse', label: 'Warehouse', aliases: ['warehouse', 'warehouse name'] },
  { key: 'aisle', label: 'Aisle', aliases: ['aisle'] },
  { key: 'bin', label: 'Bin', aliases: ['bin', 'bin location'] },
  { key: 'sourceCreatedAt', label: 'Source creation date (optional)', aliases: ['source creation date (optional)', 'source created at', 'created date'] },
]

export default function InventoryProductMigration({ projectId, onImported }) {
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

  const { products, localIssues, mappingIssues } = useMemo(() => {
    if (!headers.length) return { products: [], localIssues: [], mappingIssues: [] }
    const rows = sourceRows.map(source => Object.fromEntries(FIELDS.map(field => [field.key, mapping[field.key] === '' || mapping[field.key] == null ? '' : String(source[Number(mapping[field.key])] ?? '').trim()])))
    const issues = []
    const sourceIds = new Map()
    const skus = new Map()
    rows.forEach((product, index) => {
      const rowNumber = index + 2
      if (!product.sourceId) issues.push({ rowNumber, field: 'sourceId', message: 'Source record ID is required.' })
      if (product.sourceId.length > 120) issues.push({ rowNumber, field: 'sourceId', message: 'Source record IDs must be 120 characters or fewer.' })
      if (!product.sku || product.sku.length > 64) issues.push({ rowNumber, field: 'sku', message: 'SKU is required and must be 64 characters or fewer.' })
      if (product.name.length < 1 || product.name.length > 200) issues.push({ rowNumber, field: 'name', message: 'Product name must contain 1 to 200 characters.' })
      if (!/^\d+(?:\.\d{1,4})?$/.test(product.salePrice) || product.salePrice.length > 19) issues.push({ rowNumber, field: 'salePrice', message: 'Sale price must be a non-negative decimal with up to 4 decimal places.' })
      if (product.minThreshold && !/^\d+$/.test(product.minThreshold)) issues.push({ rowNumber, field: 'minThreshold', message: 'Minimum stock threshold must be a whole number.' })
      if (product.avgMonthlyUsage && (!/^\d+(?:\.\d{1,4})?$/.test(product.avgMonthlyUsage) || Number(product.avgMonthlyUsage) > 1_000_000_000)) issues.push({ rowNumber, field: 'avgMonthlyUsage', message: 'Monthly usage must be a non-negative number.' })
      if (product.leadTimeDays && !/^\d+$/.test(product.leadTimeDays)) issues.push({ rowNumber, field: 'leadTimeDays', message: 'Lead time must be a whole number of days.' })
      for (const [key, value, seen] of [['sourceId', product.sourceId, sourceIds], ['sku', product.sku.toLocaleLowerCase('en-US'), skus]]) {
        if (!value) continue
        const prior = seen.get(value)
        if (prior) {
          issues.push({ rowNumber: prior, field: key, message: `This ${key === 'sku' ? 'SKU' : 'source ID'} appears again on row ${rowNumber}.` })
          issues.push({ rowNumber, field: key, message: `This ${key === 'sku' ? 'SKU' : 'source ID'} was already used on row ${prior}.` })
        } else seen.set(value, rowNumber)
      }
    })
    const mapped = new Map()
    const mapIssues = []
    FIELDS.forEach(field => {
      const column = mapping[field.key]
      if (column === '' || column == null) return
      const previous = mapped.get(column)
      if (previous) mapIssues.push(`Map ${field.label} to a different source column than ${previous}.`)
      else mapped.set(column, field.label)
    })
    return { products: rows, localIssues: issues, mappingIssues: mapIssues }
  }, [headers, mapping, sourceRows])

  const fingerprint = JSON.stringify(products)
  const locallyValid = headers.length > 0 && products.length > 0 && !localIssues.length && !mappingIssues.length && FIELDS.filter(field => field.required).every(field => mapping[field.key] !== '')
  const allIssues = [...localIssues, ...(validation.fingerprint === fingerprint ? validation.result?.issues ?? [] : [])]
  const canImport = locallyValid && validation.fingerprint === fingerprint && validation.status === 'ready'

  useEffect(() => {
    if (!locallyValid) { setValidation({ fingerprint, status: 'idle', result: null, error: '' }); return undefined }
    let current = true
    setValidation({ fingerprint, status: 'checking', result: null, error: '' })
    settingsApi.validateInventoryProductMigration(projectId, products).then(result => {
      if (current) setValidation({ fingerprint, status: result.issues.length ? 'invalid' : 'ready', result, error: '' })
    }).catch(error => { if (current) setValidation({ fingerprint, status: 'error', result: null, error: error?.message || 'Server validation failed.' }) })
    return () => { current = false }
  }, [fingerprint, locallyValid, products, projectId])

  async function chooseFile(file) {
    setFileError(''); setImportError(''); setCompleted(null); setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { setFileError('Choose a CSV export. Excel files and direct ERP connections are not part of this importer.'); return }
    if (file.size > MAX_FILE_BYTES) { setFileError('CSV files must be 2 MB or smaller.'); return }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: 'products' })
      setFileName(file.name); setHeaders(parsed.headers); setSourceRows(parsed.rows); setMapping(inferCsvColumnMapping(parsed.headers, FIELDS))
    } catch (error) { setFileError(error?.message || 'Could not read this CSV file.') }
  }

  async function importBatch() {
    if (!canImport || importing) return
    setImporting(true); setImportError('')
    try { const result = await settingsApi.importInventoryProductMigration(projectId, products); setCompleted(result); await onImported?.() }
    catch (error) {
      setImportError(error?.message || 'Could not import inventory products.')
      if (Array.isArray(error?.details)) setValidation({ fingerprint, status: 'invalid', result: { issues: error.details }, error: '' })
    } finally { setImporting(false) }
  }

  return <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby="inventory-product-import-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={19} /></span><div>
        <h2 id="inventory-product-import-title" className="text-base font-semibold text-heading">Import Inventory product catalog</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">This imports SKU master records, sale prices, replenishment settings, and location labels. It deliberately starts quantities at zero: on-hand stock requires a separate movement import and valuation reconciliation, and Asas product price is not inventory cost.</p>
      </div></div>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv([
        FIELDS.map(field => field.label), ['legacy-item-001', 'SKU-1001', 'Industrial filter', '49.95', '12', '25', '14', 'Main warehouse', 'A-04', 'BIN-12', '2025-02-01'],
      ], 'asas-inventory-product-import-template.csv', { bom: true })}><Download size={15} /> Template</Button>
    </div>
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-heading">{fileName || 'Choose your product catalog CSV'}</p><p className="mt-1 text-xs text-muted">CSV · up to 2 MB · maximum {MAX_ROWS} products</p></div><input ref={inputRef} type="file" accept=".csv,text/csv" aria-label="Choose inventory product CSV file" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={15} /> Choose CSV</Button></div>
    {fileError && <Alert variant="destructive"><AlertDescription>{fileError}</AlertDescription></Alert>}
    {headers.length > 0 && <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELDS.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body"><span>{field.label}{field.required && <span className="text-danger"> *</span>}</span><select value={mapping[field.key] ?? ''} onChange={event => { setCompleted(null); setMapping(current => ({ ...current, [field.key]: event.target.value })) }} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent"><option value="">Skip this field</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}</select></label>)}</div>
      <div className="rounded-lg border border-border-subtle bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-heading">Import preview · {products.length} products</span><span className="text-muted">{mappingIssues.length ? `${mappingIssues.length} mapping issue${mappingIssues.length === 1 ? '' : 's'}` : allIssues.length ? `${allIssues.length} data issue${allIssues.length === 1 ? '' : 's'}` : validation.status === 'checking' ? 'Checking with Asas…' : validation.status === 'ready' ? 'All rows validated' : validation.error ? 'Server validation needs attention' : 'Map required columns'}</span></div>
        {(mappingIssues.length || allIssues.length || validation.error) ? <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{mappingIssues.map((issue, i) => <li key={`map-${i}`}>{issue}</li>)}{allIssues.slice(0, 15).map((issue, i) => <li key={`${issue.rowNumber}-${issue.field}-${i}`}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}{allIssues.length > 15 && <li>And {allIssues.length - 15} more issues.</li>}{validation.error && <li>{validation.error}</li>}</ul> : null}
        <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <th key={field.key} className="pb-2 pr-4 font-medium">{field.label}</th>)}</tr></thead><tbody>{products.slice(0, 100).map((product, index) => <tr key={`${product.sourceId}-${index}`} className="border-t border-border-subtle text-body">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <td key={field.key} className="py-2 pr-4">{product[field.key] || EMPTY.provided}</td>)}</tr>)}</tbody></table>{products.length > 100 && <p className="pt-2 text-xs text-muted">Showing first 100 rows; all {products.length} products are validated before import.</p>}</div>
      </div>
    </div>}
    {completed && <Alert variant="success" className="mt-4"><AlertDescription>{completed.replayed ? 'This batch was already committed; no products were added again.' : `${completed.imported} inventory products imported.`} Product source IDs are linked. No stock quantity or inventory valuation was created.</AlertDescription></Alert>}
    {importError && <Alert variant="destructive" className="mt-4"><AlertDescription>{importError}</AlertDescription></Alert>}
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!canImport || importing} onClick={importBatch}>{importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Check size={15} /> Import {products.length} products</>}</Button><p className="text-xs text-muted">Catalog records, source links, import log, and audit event commit together.</p></div>
  </section>
}
