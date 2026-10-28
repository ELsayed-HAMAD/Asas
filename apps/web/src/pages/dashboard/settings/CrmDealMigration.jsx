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
  { key: 'sourceId', label: 'Source record ID', required: true, aliases: ['source id', 'source record id', 'external id', 'legacy id', 'deal id', 'opportunity id'] },
  { key: 'name', label: 'Deal name', required: true, aliases: ['deal', 'deal name', 'opportunity', 'opportunity name'] },
  { key: 'stage', label: 'Asas deal stage', required: true, aliases: ['stage', 'deal stage', 'asas deal stage', 'status'] },
  { key: 'value', label: 'Value in workspace currency', required: true, aliases: ['value', 'value in workspace currency', 'amount', 'deal value', 'opportunity amount'] },
  { key: 'companySourceId', label: 'Company source record ID', aliases: ['company source id', 'company source record id', 'account source id', 'company id', 'account id'] },
  { key: 'ownerEmail', label: 'Owner employee email', aliases: ['owner email', 'owner employee email', 'sales rep email', 'employee email'] },
  { key: 'winProbability', label: 'Win probability (0–100)', aliases: ['win probability', 'win probability (0–100)', 'probability', 'probability percent'] },
  { key: 'closeDate', label: 'Expected close date (YYYY-MM-DD)', aliases: ['close date', 'expected close date', 'expected close date (yyyy mm dd)'] },
  { key: 'actualCloseDate', label: 'Actual close date (closed deals)', aliases: ['actual close date', 'actual close date (closed deals)', 'closed date', 'won date', 'lost date'] },
  { key: 'sourceCreatedAt', label: 'Source creation date (optional)', aliases: ['source creation date (optional)', 'source created at', 'created at', 'created date'] },
  { key: 'productLine', label: 'Product line', aliases: ['product line', 'product', 'service'] },
  { key: 'forecastBucket', label: 'Forecast bucket', aliases: ['forecast bucket', 'forecast category'] },
]
const STAGES = ['LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']

export default function CrmDealMigration({ projectId, onImported }) {
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

  const { deals, localIssues, mappingIssues } = useMemo(() => {
    if (!headers.length) return { deals: [], localIssues: [], mappingIssues: [] }
    const records = sourceRows.map(source => Object.fromEntries(FIELDS.map(field => [field.key, mapping[field.key] === '' || mapping[field.key] == null ? '' : String(source[Number(mapping[field.key])] ?? '').trim()])))
    const issues = []
    records.forEach((deal, index) => {
      const rowNumber = index + 2
      if (!deal.sourceId) issues.push({ rowNumber, field: 'sourceId', message: 'Source record ID is required.' })
      if (deal.sourceId.length > 120) issues.push({ rowNumber, field: 'sourceId', message: 'Source record IDs must be 120 characters or fewer.' })
      if (deal.name.length < 2 || deal.name.length > 200) issues.push({ rowNumber, field: 'name', message: 'Deal names must contain 2 to 200 characters.' })
      if (!STAGES.includes(deal.stage.toUpperCase())) issues.push({ rowNumber, field: 'stage', message: `Use one of: ${STAGES.join(', ')}.` })
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(deal.value) || Number(deal.value) < 0) issues.push({ rowNumber, field: 'value', message: 'Value must be a non-negative decimal amount; use 0 when the source value is zero.' })
      if (deal.winProbability && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(deal.winProbability) || Number(deal.winProbability) > 100)) issues.push({ rowNumber, field: 'winProbability', message: 'Probability must be a number from 0 to 100.' })
    })
    const ids = new Map()
    records.forEach((deal, index) => {
      if (!deal.sourceId) return
      const current = index + 2
      const previous = ids.get(deal.sourceId)
      if (previous) {
        issues.push({ rowNumber: previous, field: 'sourceId', message: `Source ID appears again on row ${current}.` })
        issues.push({ rowNumber: current, field: 'sourceId', message: `Source ID was already used on row ${previous}.` })
      } else ids.set(deal.sourceId, current)
    })
    const claimed = new Map()
    const mapIssues = []
    FIELDS.forEach(field => {
      const column = mapping[field.key]
      if (column === '' || column == null) return
      const prior = claimed.get(column)
      if (prior) mapIssues.push(`Map ${field.label} to a different source column than ${prior}.`)
      else claimed.set(column, field.label)
    })
    return { deals: records, localIssues: issues, mappingIssues: mapIssues }
  }, [headers, mapping, sourceRows])

  const fingerprint = JSON.stringify(deals)
  const locallyValid = headers.length > 0 && deals.length > 0 && !localIssues.length && !mappingIssues.length && FIELDS.filter(field => field.required).every(field => mapping[field.key] !== '')
  const allIssues = [...localIssues, ...(validation.fingerprint === fingerprint ? validation.result?.issues ?? [] : [])]
  const canImport = locallyValid && validation.fingerprint === fingerprint && validation.status === 'ready'

  useEffect(() => {
    if (!locallyValid) { setValidation({ fingerprint, status: 'idle', result: null, error: '' }); return undefined }
    let current = true
    setValidation({ fingerprint, status: 'checking', result: null, error: '' })
    settingsApi.validateCrmDealMigration(projectId, deals).then(result => {
      if (current) setValidation({ fingerprint, status: result.issues.length ? 'invalid' : 'ready', result, error: '' })
    }).catch(error => { if (current) setValidation({ fingerprint, status: 'error', result: null, error: error?.message || 'Server validation failed.' }) })
    return () => { current = false }
  }, [deals, fingerprint, locallyValid, projectId])

  async function chooseFile(file) {
    setFileError(''); setImportError(''); setCompleted(null); setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { setFileError('Choose a CSV export. Live ERP connections and Excel workbooks are not supported in this import.'); return }
    if (file.size > MAX_FILE_BYTES) { setFileError('CSV files must be 2 MB or smaller.'); return }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: 'deals' })
      setFileName(file.name); setHeaders(parsed.headers); setSourceRows(parsed.rows); setMapping(inferCsvColumnMapping(parsed.headers, FIELDS))
    } catch (error) { setFileError(error?.message || 'Could not read this CSV file.') }
  }

  async function importBatch() {
    if (!canImport || importing) return
    setImporting(true); setImportError('')
    try { const result = await settingsApi.importCrmDealMigration(projectId, deals); setCompleted(result); await onImported?.() }
    catch (error) {
      setImportError(error?.message || 'Could not import CRM deals.')
      if (Array.isArray(error?.details)) setValidation({ fingerprint, status: 'invalid', result: { issues: error.details }, error: '' })
    } finally { setImporting(false) }
  }

  return <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby="crm-deal-import-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={19} /></span><div>
        <h2 id="crm-deal-import-title" className="text-base font-semibold text-heading">Import CRM deals</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Import after companies and employees. Deal links resolve by imported company source ID and an unambiguous workspace employee email. Stage history starts with an imported baseline; earlier transitions are not fabricated.</p>
      </div></div>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv([FIELDS.map(field => field.label), ['legacy-deal-001', 'Northstar renewal', 'NEGOTIATION', '25000.00', 'legacy-company-001', 'rep@example.com', '65', '2026-12-15', '', '2025-02-01', 'Enterprise support', 'BEST_CASE']], 'asas-crm-deal-import-template.csv', { bom: true })}><Download size={15} /> Template</Button>
    </div>
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-medium text-heading">{fileName || 'Choose your CRM deal CSV'}</p><p className="mt-1 text-xs text-muted">CSV · up to 2 MB · maximum {MAX_ROWS} deals</p></div>
      <input ref={inputRef} type="file" accept=".csv,text/csv" aria-label="Choose CRM deal CSV file" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} />
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={15} /> Choose CSV</Button>
    </div>
    {fileError && <Alert variant="destructive"><AlertDescription>{fileError}</AlertDescription></Alert>}
    {headers.length > 0 && <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELDS.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body"><span>{field.label}{field.required && <span className="text-danger"> *</span>}</span><select value={mapping[field.key] ?? ''} onChange={event => { setCompleted(null); setMapping(current => ({ ...current, [field.key]: event.target.value })) }} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent"><option value="">Skip this field</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}</select></label>)}</div>
      <div className="rounded-lg border border-border-subtle bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-heading">Import preview · {deals.length} deals</span><span className="text-muted">{mappingIssues.length ? `${mappingIssues.length} mapping issue${mappingIssues.length === 1 ? '' : 's'}` : allIssues.length ? `${allIssues.length} data issue${allIssues.length === 1 ? '' : 's'}` : validation.status === 'checking' ? 'Checking with Asas…' : validation.status === 'ready' ? 'All rows validated' : validation.error ? 'Server validation needs attention' : 'Map required columns'}</span></div>
        {(mappingIssues.length || allIssues.length || validation.error) ? <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{mappingIssues.map((issue, i) => <li key={`map-${i}`}>{issue}</li>)}{allIssues.slice(0, 15).map((issue, i) => <li key={`${issue.rowNumber}-${issue.field}-${i}`}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}{allIssues.length > 15 && <li>And {allIssues.length - 15} more issues.</li>}{validation.error && <li>{validation.error}</li>}</ul> : null}
        <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <th key={field.key} className="pb-2 pr-4 font-medium">{field.label}</th>)}</tr></thead><tbody>{deals.slice(0, 100).map((deal, index) => <tr key={`${deal.sourceId}-${index}`} className="border-t border-border-subtle text-body">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <td key={field.key} className="py-2 pr-4">{deal[field.key] || EMPTY.provided}</td>)}</tr>)}</tbody></table>{deals.length > 100 && <p className="pt-2 text-xs text-muted">Showing first 100 rows in the preview; all {deals.length} rows are validated before import.</p>}</div>
      </div>
    </div>}
    {completed && <Alert variant="success" className="mt-4"><AlertDescription>{completed.replayed ? 'This batch was already committed; no records were added again.' : `${completed.imported} CRM deals imported.`} Company and owner links were resolved and imported stage snapshots recorded.</AlertDescription></Alert>}
    {importError && <Alert variant="destructive" className="mt-4"><AlertDescription>{importError}</AlertDescription></Alert>}
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!canImport || importing} onClick={importBatch}>{importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Check size={15} /> Import {deals.length} CRM deals</>}</Button><p className="text-xs text-muted">Rows, links, baseline stage history, import log, and audit record commit together.</p></div>
  </section>
}
