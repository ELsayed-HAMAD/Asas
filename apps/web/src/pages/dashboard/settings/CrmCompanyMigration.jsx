import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { downloadCsv, inferCsvColumnMapping, parseCsvImport } from '../../../lib/csv'
import { settingsApi } from '../../../lib/api/settings'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500
const FIELDS = [
  { key: 'sourceId', label: 'Source record ID', required: true, aliases: ['source id', 'source record id', 'external id', 'legacy id', 'account id', 'company id'] },
  { key: 'name', label: 'Company name', required: true, aliases: ['company', 'company name', 'account', 'account name', 'customer name'] },
  { key: 'tier', label: 'Customer tier', aliases: ['tier', 'customer tier', 'segment', 'account tier'] },
]

export default function CrmCompanyMigration({ projectId, onImported }) {
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

  const { companies, issues: localIssues, mappingIssues } = useMemo(() => {
    if (!headers.length) return { companies: [], issues: [], mappingIssues: [] }
    const rows = sourceRows.map(source => Object.fromEntries(FIELDS.map(field => {
      const column = mapping[field.key]
      return [field.key, column === '' || column == null ? '' : String(source[Number(column)] ?? '').trim()]
    })))
    const issues = []
    rows.forEach((company, index) => {
      const rowNumber = index + 2
      if (!company.sourceId) issues.push({ rowNumber, field: 'sourceId', message: 'Source record ID is required.' })
      if (company.sourceId.length > 120) issues.push({ rowNumber, field: 'sourceId', message: 'Source record IDs must be 120 characters or fewer.' })
      if (company.name.length < 2) issues.push({ rowNumber, field: 'name', message: 'Company name must contain at least 2 characters.' })
      if (company.name.length > 200) issues.push({ rowNumber, field: 'name', message: 'Company names must be 200 characters or fewer.' })
      if (company.tier.length > 80) issues.push({ rowNumber, field: 'tier', message: 'Customer tiers must be 80 characters or fewer.' })
    })
    const idRows = new Map()
    rows.forEach((company, index) => {
      const rowNumber = index + 2
      if (!company.sourceId) return
      const original = idRows.get(company.sourceId)
      if (original) {
        issues.push({ rowNumber: original, field: 'sourceId', message: `Source record ID is duplicated again on row ${rowNumber}.` })
        issues.push({ rowNumber, field: 'sourceId', message: `Source record ID was already used on row ${original}.` })
      } else idRows.set(company.sourceId, rowNumber)
    })
    const mappedColumns = new Map()
    const mappingIssues = []
    FIELDS.forEach(field => {
      const column = mapping[field.key]
      if (column === '' || column == null) return
      const prior = mappedColumns.get(column)
      if (prior) mappingIssues.push(`Map ${field.label} to a different source column than ${prior}.`)
      else mappedColumns.set(column, field.label)
    })
    return { companies: rows, issues, mappingIssues }
  }, [headers, mapping, sourceRows])

  const fingerprint = JSON.stringify(companies)
  const locallyValid = headers.length > 0 && companies.length > 0 && localIssues.length === 0 && mappingIssues.length === 0
    && FIELDS.filter(field => field.required).every(field => mapping[field.key] !== '')
  const allIssues = [...localIssues, ...(validation.fingerprint === fingerprint ? validation.result?.issues ?? [] : [])]
  const canImport = locallyValid && validation.fingerprint === fingerprint && validation.status === 'ready'

  useEffect(() => {
    if (!locallyValid) {
      setValidation({ fingerprint, status: 'idle', result: null, error: '' })
      return undefined
    }
    let current = true
    setValidation({ fingerprint, status: 'checking', result: null, error: '' })
    settingsApi.validateCrmCompanyMigration(projectId, companies).then(result => {
      if (!current) return
      setValidation({ fingerprint, status: result.issues.length ? 'invalid' : 'ready', result, error: '' })
    }).catch(error => {
      if (current) setValidation({ fingerprint, status: 'error', result: null, error: error?.message || 'Server validation failed.' })
    })
    return () => { current = false }
  }, [companies, fingerprint, locallyValid, projectId])

  async function chooseFile(file) {
    setFileError('')
    setImportError('')
    setCompleted(null)
    setFileName('')
    setHeaders([])
    setSourceRows([])
    setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setFileError('Choose a CSV export. Excel workbooks and live ERP connections are not supported in this import.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('CSV files must be 2 MB or smaller.')
      return
    }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: 'companies' })
      setFileName(file.name)
      setHeaders(parsed.headers)
      setSourceRows(parsed.rows)
      setMapping(inferCsvColumnMapping(parsed.headers, FIELDS))
    } catch (error) {
      setFileError(error?.message || 'Could not read this CSV file.')
    }
  }

  async function importCompanies() {
    if (!canImport || importing) return
    setImporting(true)
    setImportError('')
    try {
      const result = await settingsApi.importCrmCompanyMigration(projectId, companies)
      setCompleted(result)
      await onImported?.()
    } catch (error) {
      setImportError(error?.message || 'Could not import these CRM companies.')
      if (Array.isArray(error?.details)) setValidation({ fingerprint, status: 'invalid', result: { issues: error.details }, error: '' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby="crm-company-import-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={19} /></span>
          <div>
            <h2 id="crm-company-import-title" className="text-base font-semibold text-heading">Import CRM companies</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Import companies first so future deal batches can link to them by source record ID. This adds new records only and does not modify existing CRM companies.</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv([
          ['Source record ID', 'Company name', 'Customer tier'],
          ['legacy-company-001', 'Northstar Manufacturing', 'Enterprise'],
        ], 'asas-crm-company-import-template.csv', { bom: true })}>
          <Download size={15} /> Template
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-medium text-heading">{fileName || 'Choose your CRM company CSV'}</p><p className="mt-1 text-xs text-muted">CSV · up to 2 MB · maximum {MAX_ROWS} companies</p></div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" aria-label="Choose CRM company CSV file" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={15} /> Choose CSV</Button>
      </div>

      {fileError && <Alert variant="destructive"><AlertDescription>{fileError}</AlertDescription></Alert>}

      {headers.length > 0 && <div className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body">
            <span>{field.label}{field.required && <span className="text-danger"> *</span>}</span>
            <select value={mapping[field.key] ?? ''} onChange={event => { setCompleted(null); setMapping(current => ({ ...current, [field.key]: event.target.value })) }} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="">Skip this field</option>
              {headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}
            </select>
          </label>)}
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-heading">Import preview · {companies.length} companies</span>
            <span className={allIssues.length || mappingIssues.length || validation.status === 'error' ? 'text-danger' : validation.status === 'checking' ? 'text-caption' : validation.status === 'ready' ? 'text-success-text' : 'text-muted'}>
              {mappingIssues.length ? `${mappingIssues.length} mapping issue${mappingIssues.length === 1 ? '' : 's'}` : allIssues.length ? `${allIssues.length} data issue${allIssues.length === 1 ? '' : 's'}` : validation.status === 'checking' ? 'Checking with Asas…' : validation.status === 'error' ? 'Server validation needs attention' : validation.status === 'ready' && validation.result?.alreadyImported ? 'This exact batch was already imported' : validation.status === 'ready' ? 'All rows validated' : 'Map the required columns'}
            </span>
          </div>
          {(mappingIssues.length > 0 || allIssues.length > 0 || validation.error) && <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{mappingIssues.map((issue, index) => <li key={`mapping-${index}`}>{issue}</li>)}{allIssues.slice(0, 12).map((issue, index) => <li key={`${issue.rowNumber}-${issue.field}-${index}`}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}{allIssues.length > 12 && <li>And {allIssues.length - 12} more issues.</li>}{validation.error && <li>{validation.error}</li>}</ul>}
          {companies.length > 0 && <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <th key={field.key} className="pb-2 pr-4 font-medium">{field.label}</th>)}</tr></thead><tbody>{companies.map((company, index) => <tr key={`${company.sourceId}-${index}`} className="border-t border-border-subtle text-body">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <td key={field.key} className="py-2 pr-4">{company[field.key] || '—'}</td>)}</tr>)}</tbody></table></div>}
        </div>
      </div>}

      {completed && <Alert variant="success" className="mt-4"><AlertDescription>{completed.replayed ? 'This batch was already committed; no records were added again.' : `${completed.imported} CRM companies imported.`} Source IDs are linked in this migration project for dependent imports.</AlertDescription></Alert>}
      {importError && <Alert variant="destructive" className="mt-4"><AlertDescription>{importError}</AlertDescription></Alert>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!canImport || importing} onClick={importCompanies}>
          {importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Check size={15} /> {validation.result?.alreadyImported ? 'Confirm previous batch result' : `Import ${companies.length} CRM companies`}</>}
        </Button>
        <p className="text-xs text-muted">Validated first; then all company records, source links, project status, and the import log commit together.</p>
      </div>
    </section>
  )
}
