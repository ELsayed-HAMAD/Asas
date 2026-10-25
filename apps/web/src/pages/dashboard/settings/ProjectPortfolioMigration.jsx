import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { downloadCsv, inferCsvColumnMapping, parseCsvImport } from '../../../lib/csv'
import { settingsApi } from '../../../lib/api/settings'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500
const STATUSES = ['PLANNING', 'ON_TRACK', 'DELAYED', 'AT_RISK', 'COMPLETED']
const FIELDS = [
  { key: 'sourceId', label: 'Source record ID', required: true, aliases: ['source id', 'source record id', 'external id', 'legacy id', 'project id', 'project number'] },
  { key: 'name', label: 'Project name', required: true, aliases: ['project', 'project name', 'name'] },
  { key: 'status', label: 'Asas project status', required: true, aliases: ['status', 'project status', 'asas project status'] },
  { key: 'budget', label: 'Budget (optional)', aliases: ['budget', 'project budget', 'budget (optional)'] },
  { key: 'currency', label: 'Budget currency (required with budget)', aliases: ['currency', 'budget currency', 'budget currency (required with budget)'] },
  { key: 'timeline', label: 'Timeline date (YYYY-MM-DD)', aliases: ['timeline', 'timeline date', 'due date', 'end date', 'timeline date (yyyy mm dd)'] },
  { key: 'sourceCreatedAt', label: 'Source creation date (optional)', aliases: ['source creation date (optional)', 'source created at', 'created date'] },
]

export default function ProjectPortfolioMigration({ projectId, onImported }) {
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

  const { projects, localIssues, mappingIssues } = useMemo(() => {
    if (!headers.length) return { projects: [], localIssues: [], mappingIssues: [] }
    const records = sourceRows.map(source => Object.fromEntries(FIELDS.map(field => [field.key, mapping[field.key] === '' || mapping[field.key] == null ? '' : String(source[Number(mapping[field.key])] ?? '').trim()])))
    const issues = []
    const ids = new Map()
    records.forEach((project, index) => {
      const rowNumber = index + 2
      if (!project.sourceId) issues.push({ rowNumber, field: 'sourceId', message: 'Source record ID is required.' })
      if (project.sourceId.length > 120) issues.push({ rowNumber, field: 'sourceId', message: 'Source IDs must be 120 characters or fewer.' })
      if (project.name.length < 2 || project.name.length > 200) issues.push({ rowNumber, field: 'name', message: 'Project names must contain 2 to 200 characters.' })
      if (!STATUSES.includes(project.status.toUpperCase())) issues.push({ rowNumber, field: 'status', message: `Use one of ${STATUSES.join(', ')}.` })
      if (project.budget && (!/^\d{1,15}(?:\.\d{1,4})?$/.test(project.budget) || Number(project.budget) < 0)) issues.push({ rowNumber, field: 'budget', message: 'Budget must be a non-negative decimal with up to 4 decimal places.' })
      if (project.budget && !project.currency) issues.push({ rowNumber, field: 'currency', message: 'Provide the source currency for every budget.' })
      if (project.currency && !/^[A-Za-z]{3}$/.test(project.currency)) issues.push({ rowNumber, field: 'currency', message: 'Currency must be a three-letter ISO code.' })
      if (project.sourceId) {
        const previous = ids.get(project.sourceId)
        if (previous) {
          issues.push({ rowNumber: previous, field: 'sourceId', message: `Source ID appears again on row ${rowNumber}.` })
          issues.push({ rowNumber, field: 'sourceId', message: `Source ID was already used on row ${previous}.` })
        } else ids.set(project.sourceId, rowNumber)
      }
    })
    const claimed = new Map()
    const mapIssues = []
    FIELDS.forEach(field => {
      const column = mapping[field.key]
      if (column === '' || column == null) return
      const previous = claimed.get(column)
      if (previous) mapIssues.push(`Map ${field.label} to a different source column than ${previous}.`)
      else claimed.set(column, field.label)
    })
    return { projects: records, localIssues: issues, mappingIssues: mapIssues }
  }, [headers, mapping, sourceRows])

  const fingerprint = JSON.stringify(projects)
  const locallyValid = headers.length > 0 && projects.length > 0 && !localIssues.length && !mappingIssues.length && FIELDS.filter(field => field.required).every(field => mapping[field.key] !== '')
  const allIssues = [...localIssues, ...(validation.fingerprint === fingerprint ? validation.result?.issues ?? [] : [])]
  const canImport = locallyValid && validation.fingerprint === fingerprint && validation.status === 'ready'

  useEffect(() => {
    if (!locallyValid) { setValidation({ fingerprint, status: 'idle', result: null, error: '' }); return undefined }
    let current = true
    setValidation({ fingerprint, status: 'checking', result: null, error: '' })
    settingsApi.validateProjectPortfolioMigration(projectId, projects).then(result => {
      if (current) setValidation({ fingerprint, status: result.issues.length ? 'invalid' : 'ready', result, error: '' })
    }).catch(error => { if (current) setValidation({ fingerprint, status: 'error', result: null, error: error?.message || 'Server validation failed.' }) })
    return () => { current = false }
  }, [fingerprint, locallyValid, projectId, projects])

  async function chooseFile(file) {
    setFileError(''); setImportError(''); setCompleted(null); setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { setFileError('Choose a CSV export. Excel files and direct project-system connections are not part of this importer.'); return }
    if (file.size > MAX_FILE_BYTES) { setFileError('CSV files must be 2 MB or smaller.'); return }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: 'projects' })
      setFileName(file.name); setHeaders(parsed.headers); setSourceRows(parsed.rows); setMapping(inferCsvColumnMapping(parsed.headers, FIELDS))
    } catch (error) { setFileError(error?.message || 'Could not read this project CSV.') }
  }

  async function importBatch() {
    if (!canImport || importing) return
    setImporting(true); setImportError('')
    try { const result = await settingsApi.importProjectPortfolioMigration(projectId, projects); setCompleted(result); await onImported?.() }
    catch (error) {
      setImportError(error?.message || 'Could not import projects.')
      if (Array.isArray(error?.details)) setValidation({ fingerprint, status: 'invalid', result: { issues: error.details }, error: '' })
    } finally { setImporting(false) }
  }

  return <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby="project-portfolio-import-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={19} /></span><div>
      <h2 id="project-portfolio-import-title" className="text-base font-semibold text-heading">Import project portfolio</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">This imports project master records, mapped statuses, workspace-currency budgets, and timeline dates. Spend remains zero until represented by actual Finance settlements. Sprints, issues, milestones, and assignments need separate linked imports.</p>
    </div></div><Button type="button" variant="outline" size="sm" onClick={() => downloadCsv([
      FIELDS.map(field => field.label), ['legacy-project-001', 'Warehouse modernization', 'ON_TRACK', '250000.00', 'USD', '2027-03-31', '2025-01-15'],
    ], 'asas-project-portfolio-import-template.csv', { bom: true })}><Download size={15} /> Template</Button></div>
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-heading">{fileName || 'Choose your project portfolio CSV'}</p><p className="mt-1 text-xs text-muted">CSV · up to 2 MB · maximum {MAX_ROWS} projects</p></div><input ref={inputRef} type="file" accept=".csv,text/csv" aria-label="Choose project portfolio CSV file" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={15} /> Choose CSV</Button></div>
    {fileError && <Alert variant="destructive"><AlertDescription>{fileError}</AlertDescription></Alert>}
    {headers.length > 0 && <div className="mt-5 space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELDS.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body"><span>{field.label}{field.required && <span className="text-danger"> *</span>}</span><select value={mapping[field.key] ?? ''} onChange={event => { setCompleted(null); setMapping(current => ({ ...current, [field.key]: event.target.value })) }} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent"><option value="">Skip this field</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}</select></label>)}</div>
      <div className="rounded-lg border border-border-subtle bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-heading">Import preview · {projects.length} projects</span><span className="text-muted">{mappingIssues.length ? `${mappingIssues.length} mapping issue${mappingIssues.length === 1 ? '' : 's'}` : allIssues.length ? `${allIssues.length} data issue${allIssues.length === 1 ? '' : 's'}` : validation.status === 'checking' ? 'Checking with Asas…' : validation.status === 'ready' ? 'All rows validated' : validation.error ? 'Server validation needs attention' : 'Map required columns'}</span></div>
        {(mappingIssues.length || allIssues.length || validation.error) ? <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{mappingIssues.map((issue, i) => <li key={`map-${i}`}>{issue}</li>)}{allIssues.slice(0, 15).map((issue, i) => <li key={`${issue.rowNumber}-${issue.field}-${i}`}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}{allIssues.length > 15 && <li>And {allIssues.length - 15} more issues.</li>}{validation.error && <li>{validation.error}</li>}</ul> : null}
        <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <th key={field.key} className="pb-2 pr-4 font-medium">{field.label}</th>)}</tr></thead><tbody>{projects.slice(0, 100).map((project, index) => <tr key={`${project.sourceId}-${index}`} className="border-t border-border-subtle text-body">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <td key={field.key} className="py-2 pr-4">{project[field.key] || '—'}</td>)}</tr>)}</tbody></table>{projects.length > 100 && <p className="pt-2 text-xs text-muted">Showing first 100 rows; all {projects.length} projects are validated before import.</p>}</div>
      </div>
    </div>}
    {completed && <Alert variant="success" className="mt-4"><AlertDescription>{completed.replayed ? 'This batch was already committed; no projects were added again.' : `${completed.imported} projects imported.`} Spend was not created or estimated.</AlertDescription></Alert>}
    {importError && <Alert variant="destructive" className="mt-4"><AlertDescription>{importError}</AlertDescription></Alert>}
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!canImport || importing} onClick={importBatch}>{importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Check size={15} /> Import {projects.length} projects</>}</Button><p className="text-xs text-muted">Project records, source links, import log, and audit event commit together.</p></div>
  </section>
}
