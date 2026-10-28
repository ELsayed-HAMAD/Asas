import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { downloadCsv, inferCsvColumnMapping, parseCsvImport } from '../../../lib/csv'
import { settingsApi } from '../../../lib/api/settings'
import { EMPTY } from '../../../lib/emptyText'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500

const SUPPLIER_FIELDS = [
  { key: 'sourceId', label: 'Source supplier ID', required: true, aliases: ['source supplier id', 'source id', 'supplier id', 'legacy supplier id', 'vendor id'] },
  { key: 'name', label: 'Supplier name', required: true, aliases: ['supplier name', 'supplier', 'name'] },
  { key: 'sourceCreatedAt', label: 'Source creation date (optional)', aliases: ['source creation date (optional)', 'source created at', 'created date'] },
]
const RELATION_FIELDS = [
  { key: 'sourceProductId', label: 'Source product ID', required: true, aliases: ['source product id', 'product source id', 'product id', 'item id'] },
  { key: 'sourceSupplierId', label: 'Source supplier ID', required: true, aliases: ['source supplier id', 'supplier source id', 'supplier id', 'vendor id'] },
]

function validDate(value) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function validateLocal(rows, kind) {
  const issues = []
  const seen = new Map()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (kind === 'suppliers') {
      if (!row.sourceId || row.sourceId.length > 120) issues.push({ rowNumber, field: 'sourceId', message: 'Enter a source supplier ID of 1 to 120 characters.' })
      if (!row.name || row.name.length > 200) issues.push({ rowNumber, field: 'name', message: 'Supplier name must contain 1 to 200 characters.' })
      if (!validDate(row.sourceCreatedAt)) issues.push({ rowNumber, field: 'sourceCreatedAt', message: 'Source creation date must be a valid YYYY-MM-DD date.' })
      const key = row.sourceId
      if (key) {
        const prior = seen.get(key)
        if (prior) {
          issues.push({ rowNumber: prior, field: 'sourceId', message: `This source supplier ID appears again on row ${rowNumber}.` })
          issues.push({ rowNumber, field: 'sourceId', message: `This source supplier ID was already used on row ${prior}.` })
        } else seen.set(key, rowNumber)
      }
    } else {
      for (const field of ['sourceProductId', 'sourceSupplierId']) if (!row[field] || row[field].length > 120) issues.push({ rowNumber, field, message: 'Enter a source ID of 1 to 120 characters.' })
      const key = JSON.stringify([row.sourceProductId, row.sourceSupplierId])
      const prior = seen.get(key)
      if (prior) {
        issues.push({ rowNumber: prior, field: 'sourceProductId', message: `This product-supplier association appears again on row ${rowNumber}.` })
        issues.push({ rowNumber, field: 'sourceProductId', message: `This association was already included on row ${prior}.` })
      } else seen.set(key, rowNumber)
    }
  })
  return issues
}

function CsvMigrationCard({ projectId, kind, onImported }) {
  const isSupplier = kind === 'suppliers'
  const fields = isSupplier ? SUPPLIER_FIELDS : RELATION_FIELDS
  const label = isSupplier ? 'Inventory suppliers' : 'product–supplier associations'
  const title = isSupplier ? 'Import Inventory suppliers' : 'Link suppliers to products'
  const description = isSupplier
    ? 'Import Inventory suppliers as their own records. These remain separate from Finance vendors; importing a supplier does not create a Finance vendor or payable.'
    : 'Import source product–supplier pairs after both product and supplier master records. Each pair resolves through the source-ID crosswalks from this migration project. Existing product–supplier relationships are safely reused.'
  const templateRows = isSupplier
    ? [fields.map(field => field.label), ['legacy-supplier-17', 'Northstar Industrial Supply', '2025-04-12']]
    : [fields.map(field => field.label), ['legacy-item-001', 'legacy-supplier-17']]
  const templateName = isSupplier ? 'asas-inventory-supplier-import-template.csv' : 'asas-inventory-product-supplier-links-template.csv'
  const validate = isSupplier ? settingsApi.validateInventorySupplierMigration : settingsApi.validateInventoryProductSupplierMigration
  const commit = isSupplier ? settingsApi.importInventorySupplierMigration : settingsApi.importInventoryProductSupplierMigration

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

  const { rows, localIssues, mappingIssues } = useMemo(() => {
    if (!headers.length) return { rows: [], localIssues: [], mappingIssues: [] }
    const records = sourceRows.map(source => Object.fromEntries(fields.map(field => [field.key, mapping[field.key] === '' || mapping[field.key] == null ? '' : String(source[Number(mapping[field.key])] ?? '').trim()])))
    const used = new Map()
    const mapIssues = []
    fields.forEach(field => {
      const column = mapping[field.key]
      if (column === '' || column == null) return
      if (used.has(column)) mapIssues.push(`Map ${field.label} to a different source column than ${used.get(column)}.`)
      else used.set(column, field.label)
    })
    return { rows: records, localIssues: validateLocal(records, kind), mappingIssues: mapIssues }
  }, [fields, headers, kind, mapping, sourceRows])

  const fingerprint = JSON.stringify(rows)
  const locallyValid = headers.length > 0 && rows.length > 0 && !localIssues.length && !mappingIssues.length && fields.filter(field => field.required).every(field => mapping[field.key] !== '' && mapping[field.key] != null)
  const canImport = locallyValid && validation.fingerprint === fingerprint && validation.status === 'ready'
  const allIssues = [...localIssues, ...(validation.fingerprint === fingerprint ? validation.result?.issues ?? [] : [])]

  useEffect(() => {
    if (!locallyValid) { setValidation({ fingerprint, status: 'idle', result: null, error: '' }); return undefined }
    let current = true
    setValidation({ fingerprint, status: 'checking', result: null, error: '' })
    validate(projectId, rows).then(result => {
      if (current) setValidation({ fingerprint, status: result.issues.length ? 'invalid' : 'ready', result, error: '' })
    }).catch(error => { if (current) setValidation({ fingerprint, status: 'error', result: null, error: error?.message || 'Server validation failed.' }) })
    return () => { current = false }
  }, [fingerprint, locallyValid, projectId, rows, validate])

  async function chooseFile(file) {
    setFileError(''); setImportError(''); setCompleted(null); setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { setFileError('Choose a CSV export. Excel files and direct ERP connections are not part of this importer.'); return }
    if (file.size > MAX_FILE_BYTES) { setFileError('CSV files must be 2 MB or smaller.'); return }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: label })
      setFileName(file.name); setHeaders(parsed.headers); setSourceRows(parsed.rows); setMapping(inferCsvColumnMapping(parsed.headers, fields))
    } catch (error) { setFileError(error?.message || 'Could not read this CSV file.') }
  }

  async function importBatch() {
    if (!canImport || importing) return
    setImporting(true); setImportError('')
    try { const result = await commit(projectId, rows); setCompleted(result); await onImported?.() }
    catch (error) {
      setImportError(error?.message || `Could not import ${label}.`)
      if (Array.isArray(error?.details)) setValidation({ fingerprint, status: 'invalid', result: { issues: error.details }, error: '' })
    } finally { setImporting(false) }
  }

  return <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby={`inventory-${kind}-migration-title`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={19} /></span><div>
        <h2 id={`inventory-${kind}-migration-title`} className="text-base font-semibold text-heading">{title}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{description}</p>
      </div></div>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv(templateRows, templateName, { bom: true })}><Download size={15} /> Template</Button>
    </div>
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-heading">{fileName || `Choose a ${label} CSV`}</p><p className="mt-1 text-xs text-muted">CSV · up to 2 MB · maximum {MAX_ROWS} rows</p></div><input ref={inputRef} type="file" accept=".csv,text/csv" aria-label={`Choose ${kind === 'suppliers' ? 'inventory supplier' : 'product supplier link'} CSV file`} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={15} /> Choose CSV</Button></div>
    {fileError && <Alert variant="destructive"><AlertDescription>{fileError}</AlertDescription></Alert>}
    {headers.length > 0 && <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">{fields.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body"><span>{field.label}{field.required && <span className="text-danger"> *</span>}</span><select value={mapping[field.key] ?? ''} onChange={event => { setCompleted(null); setMapping(current => ({ ...current, [field.key]: event.target.value })) }} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent"><option value="">{field.required ? 'Choose a source column' : 'Skip this field'}</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}</select></label>)}</div>
      <div className="rounded-lg border border-border-subtle bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-heading">Import preview · {rows.length} rows</span><span className="text-muted">{mappingIssues.length ? `${mappingIssues.length} mapping issue${mappingIssues.length === 1 ? '' : 's'}` : allIssues.length ? `${allIssues.length} data issue${allIssues.length === 1 ? '' : 's'}` : validation.status === 'checking' ? 'Checking with Asas…' : validation.status === 'ready' ? 'All rows validated' : validation.error ? 'Server validation needs attention' : 'Map required columns'}</span></div>
        {(mappingIssues.length || allIssues.length || validation.error) ? <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{mappingIssues.map((issue, i) => <li key={`map-${i}`}>{issue}</li>)}{allIssues.slice(0, 15).map((issue, i) => <li key={`${issue.rowNumber}-${issue.field}-${i}`}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}{allIssues.length > 15 && <li>And {allIssues.length - 15} more issues.</li>}{validation.error && <li>{validation.error}</li>}</ul> : null}
        <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted">{fields.map(field => <th key={field.key} className="pb-2 pr-4 font-medium">{field.label}</th>)}</tr></thead><tbody>{rows.slice(0, 100).map((row, index) => <tr key={`${index}-${JSON.stringify(row)}`} className="border-t border-border-subtle text-body">{fields.map(field => <td key={field.key} className="py-2 pr-4">{row[field.key] || EMPTY.provided}</td>)}</tr>)}</tbody></table>{rows.length > 100 && <p className="pt-2 text-xs text-muted">Showing first 100 rows; all {rows.length} rows are validated before import.</p>}</div>
      </div>
    </div>}
    {completed && <Alert variant="success" className="mt-4"><AlertDescription>{completed.replayed ? 'This batch was already committed; no duplicate suppliers or product links were created.' : isSupplier ? `${completed.imported} Inventory suppliers imported.` : `${completed.imported} product–supplier links imported.`} Source mappings and the audit record were saved with the batch.</AlertDescription></Alert>}
    {importError && <Alert variant="destructive" className="mt-4"><AlertDescription>{importError}</AlertDescription></Alert>}
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!canImport || importing} onClick={importBatch}>{importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Check size={15} /> Import {rows.length} {isSupplier ? 'suppliers' : 'links'}</>}</Button><p className="text-xs text-muted">Rows are validated on the server before any records are committed.</p></div>
  </section>
}

export default function InventorySupplierMigration({ projectId, onImported }) {
  return <>
    <CsvMigrationCard key={`${projectId}-suppliers`} projectId={projectId} kind="suppliers" onImported={onImported} />
    <CsvMigrationCard key={`${projectId}-product-supplier-links`} projectId={projectId} kind="relationships" onImported={onImported} />
  </>
}
