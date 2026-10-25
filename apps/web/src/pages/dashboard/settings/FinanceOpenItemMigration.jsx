import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { downloadCsv, inferCsvColumnMapping, parseCsvImport } from '../../../lib/csv'
import { settingsApi } from '../../../lib/api/settings'
import { queryKeys } from '../../../lib/queryKeys'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500

const CONFIG = {
  ap: {
    noun: 'payables', label: 'Accounts payable open items', endpoint: 'ap-open-items', key: 'items',
    fields: [
      { key: 'sourceId', label: 'Source invoice ID', required: true, aliases: ['source id', 'source invoice id', 'invoice id', 'legacy id'] },
      { key: 'vendorSourceId', label: 'Vendor source ID', required: true, aliases: ['vendor id', 'vendor source id', 'supplier id'] },
      { key: 'invoiceNumber', label: 'Invoice number', aliases: ['invoice number', 'invoice no', 'document number'] },
      { key: 'invoiceDate', label: 'Invoice date', required: true, aliases: ['invoice date', 'document date', 'date'] },
      { key: 'dueDate', label: 'Due date', aliases: ['due date', 'payment due date'] },
      { key: 'currency', label: 'Currency', required: true, aliases: ['currency', 'currency code'] },
      { key: 'openAmount', label: 'Open balance', required: true, aliases: ['open amount', 'open balance', 'remaining balance'] },
      { key: 'originalAmount', label: 'Original amount', aliases: ['original amount', 'gross amount', 'invoice amount'] },
      { key: 'paidAmount', label: 'Paid to date', aliases: ['paid amount', 'paid to date', 'settled amount'] },
      { key: 'status', label: 'Source AP status', required: true, aliases: ['status', 'invoice status', 'source ap status'] },
    ],
    example: ['legacy-ap-001', 'legacy-vendor-001', 'AP-1042', '2026-08-01', '2026-08-31', 'USD', '800.00', '1000.00', '200.00', 'APPROVED'],
  },
  ar: {
    noun: 'receivables', label: 'Accounts receivable open items', endpoint: 'ar-open-items', key: 'items',
    fields: [
      { key: 'sourceId', label: 'Source invoice ID', required: true, aliases: ['source id', 'source invoice id', 'invoice id', 'legacy id'] },
      { key: 'customerSourceId', label: 'Customer source ID', required: true, aliases: ['customer id', 'customer source id', 'account id'] },
      { key: 'invoiceNumber', label: 'Invoice number', aliases: ['invoice number', 'invoice no', 'document number'] },
      { key: 'invoiceDate', label: 'Invoice date', required: true, aliases: ['invoice date', 'document date', 'date'] },
      { key: 'dueDate', label: 'Due date', aliases: ['due date', 'payment due date'] },
      { key: 'currency', label: 'Currency', required: true, aliases: ['currency', 'currency code'] },
      { key: 'openAmount', label: 'Open balance', required: true, aliases: ['open amount', 'open balance', 'remaining balance'] },
      { key: 'originalAmount', label: 'Original amount', aliases: ['original amount', 'gross amount', 'invoice amount'] },
      { key: 'paidAmount', label: 'Paid to date', aliases: ['paid amount', 'paid to date', 'settled amount'] },
      { key: 'status', label: 'Source AR status', required: true, aliases: ['status', 'invoice status', 'source ar status'] },
    ],
    example: ['legacy-ar-001', 'legacy-customer-001', 'AR-2107', '2026-08-01', '2026-08-31', 'USD', '800.00', '1000.00', '200.00', 'CURRENT'],
  },
  opening: {
    noun: 'trial balance lines', label: 'Opening trial balance', endpoint: 'opening-balance', key: 'lines',
    fields: [
      { key: 'code', label: 'Asas account code', required: true, aliases: ['account code', 'asas account code', 'code', 'target account'] },
      { key: 'name', label: 'Account name', required: true, aliases: ['account name', 'name', 'description'] },
      { key: 'kind', label: 'Account type', required: true, aliases: ['account type', 'kind', 'type'] },
      { key: 'side', label: 'Balance side', required: true, aliases: ['balance side', 'side', 'debit or credit'] },
      { key: 'amount', label: 'Balance amount', required: true, aliases: ['amount', 'balance', 'balance amount', 'ending balance'] },
    ],
    example: ['CASH', 'Operating cash', 'ASSET', 'DEBIT', '12500.00'],
  },
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_PATTERN = /^\d+(?:\.\d{1,4})?$/

function toIsoDate(value) {
  const text = String(value ?? '').trim()
  if (DATE_PATTERN.test(text)) return text
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10)
}

export default function FinanceOpenItemMigration({ projectId, targetCutoverAt, kind, onStaged }) {
  const queryClient = useQueryClient()
  const config = CONFIG[kind]
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [sourceRows, setSourceRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [asOf, setAsOf] = useState(targetCutoverAt?.slice(0, 10) ?? '')
  const [accountsReceivableControlTotal, setAccountsReceivableControlTotal] = useState('')
  const [accountsPayableControlTotal, setAccountsPayableControlTotal] = useState('')
  const [fileError, setFileError] = useState('')
  const [validation, setValidation] = useState({ fingerprint: '', status: 'idle', result: null, error: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [staged, setStaged] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewPage, setReviewPage] = useState(1)
  const entity = kind === 'ap' ? 'FINANCE_AP_OPEN_ITEMS' : kind === 'ar' ? 'FINANCE_AR_OPEN_ITEMS' : 'FINANCE_OPENING_BALANCE'
  const stagedRecords = useQuery({
    queryKey: queryKeys.settings.dataMigrationFinanceStageRecords(projectId, entity, reviewPage),
    queryFn: () => settingsApi.listFinanceMigrationStageRecords(projectId, entity, reviewPage),
    enabled: reviewOpen,
  })

  useEffect(() => { setAsOf(targetCutoverAt?.slice(0, 10) ?? '') }, [targetCutoverAt])

  const { records, localIssues, mappingIssues } = useMemo(() => {
    if (!headers.length) return { records: [], localIssues: [], mappingIssues: [] }
    const rows = sourceRows.map(source => Object.fromEntries(config.fields.map(field => {
      let value = mapping[field.key] === '' || mapping[field.key] == null ? '' : String(source[Number(mapping[field.key])] ?? '').trim()
      if (['invoiceDate', 'dueDate'].includes(field.key) && value) value = toIsoDate(value)
      if (['currency', 'status', 'kind', 'side'].includes(field.key)) value = value.toUpperCase()
      return [field.key, value]
    })))
    const issues = []
    const seen = new Map()
    rows.forEach((record, index) => {
      const row = index + 2
      const identity = record.sourceId || record.code
      if (!identity) issues.push({ rowNumber: row, field: 'sourceId/code', message: 'A stable invoice ID or account code is required.' })
      if (identity && seen.has(identity)) issues.push({ rowNumber: row, field: 'sourceId/code', message: `This source ID or account code is repeated from row ${seen.get(identity)}.` })
      else if (identity) seen.set(identity, row)
      for (const field of config.fields.filter(field => field.required)) if (!record[field.key]) issues.push({ rowNumber: row, field: field.key, message: `${field.label} is required.` })
      if (kind !== 'opening') {
        for (const field of ['openAmount', 'originalAmount', 'paidAmount']) if (record[field] && !DECIMAL_PATTERN.test(record[field])) issues.push({ rowNumber: row, field, message: 'Enter a non-negative amount with up to four decimal places.' })
        if (record.currency && !/^[A-Z]{3}$/.test(record.currency.toUpperCase())) issues.push({ rowNumber: row, field: 'currency', message: 'Use a three-letter currency code.' })
        const statuses = kind === 'ap' ? ['PENDING', 'APPROVED', 'SCHEDULED'] : ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS']
        if (record.status && !statuses.includes(record.status)) issues.push({ rowNumber: row, field: 'status', message: `Choose one of: ${statuses.join(', ')}.` })
        if (record.invoiceDate && !DATE_PATTERN.test(record.invoiceDate)) issues.push({ rowNumber: row, field: 'invoiceDate', message: 'Use a real YYYY-MM-DD invoice date.' })
        if (record.dueDate && !DATE_PATTERN.test(record.dueDate)) issues.push({ rowNumber: row, field: 'dueDate', message: 'Use a real YYYY-MM-DD due date.' })
      } else if (record.amount && !DECIMAL_PATTERN.test(record.amount)) issues.push({ rowNumber: row, field: 'amount', message: 'Enter a positive amount with up to four decimal places.' })
    })
    const used = new Map()
    const mapIssues = []
    config.fields.forEach(field => {
      const column = mapping[field.key]
      if (column === '' || column == null) return
      if (used.has(column)) mapIssues.push(`Map ${field.label} to a different source column than ${used.get(column)}.`)
      else used.set(column, field.label)
    })
    return { records: rows, localIssues: issues, mappingIssues: mapIssues }
  }, [config.fields, headers, kind, mapping, sourceRows])

  const fingerprint = `${JSON.stringify(records)}:${kind === 'opening' ? `${asOf}:${accountsReceivableControlTotal}:${accountsPayableControlTotal}` : ''}`
  const locallyValid = headers.length > 0 && records.length > 0 && !localIssues.length && !mappingIssues.length
    && config.fields.filter(field => field.required).every(field => mapping[field.key] !== '')
    && (kind !== 'opening' || (DATE_PATTERN.test(asOf) && DECIMAL_PATTERN.test(accountsReceivableControlTotal) && DECIMAL_PATTERN.test(accountsPayableControlTotal)))
  const allIssues = [...localIssues, ...(validation.fingerprint === fingerprint ? validation.result?.issues ?? [] : [])]
  const canStage = locallyValid && validation.fingerprint === fingerprint && validation.status === 'ready'

  useEffect(() => {
    if (!locallyValid) { setValidation({ fingerprint, status: 'idle', result: null, error: '' }); return undefined }
    let current = true
    setValidation({ fingerprint, status: 'checking', result: null, error: '' })
    const body = kind === 'opening' ? { asOf, accountsReceivableControlTotal, accountsPayableControlTotal, lines: records } : { items: records }
    settingsApi.validateFinanceMigrationStage(projectId, config.endpoint, body).then(result => {
      if (current) setValidation({ fingerprint, status: result.issues.length ? 'invalid' : 'ready', result, error: '' })
    }).catch(error => { if (current) setValidation({ fingerprint, status: 'error', result: null, error: error?.message || 'Server validation failed.' }) })
    return () => { current = false }
  }, [accountsPayableControlTotal, accountsReceivableControlTotal, asOf, config.endpoint, fingerprint, kind, locallyValid, projectId, records])

  async function chooseFile(file) {
    setFileError(''); setSaveError(''); setStaged(null); setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { setFileError('Choose a CSV export. Excel files and direct ERP connections are not part of this import.'); return }
    if (file.size > MAX_FILE_BYTES) { setFileError('CSV files must be 2 MB or smaller.'); return }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: config.noun })
      setFileName(file.name); setHeaders(parsed.headers); setSourceRows(parsed.rows); setMapping(inferCsvColumnMapping(parsed.headers, config.fields))
    } catch (error) { setFileError(error?.message || `Could not read ${config.noun} CSV.`) }
  }

  async function saveBatch() {
    if (!canStage || saving) return
    setSaving(true); setSaveError('')
    const body = kind === 'opening' ? { asOf, accountsReceivableControlTotal, accountsPayableControlTotal, lines: records } : { items: records }
    try {
      const result = await settingsApi.stageFinanceMigrationBatch(projectId, config.endpoint, body)
      setStaged(result)
      setReviewOpen(true)
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationFinanceStageRecords(projectId, entity) })
      await onStaged?.()
    } catch (error) {
      setSaveError(error?.message || 'Could not save the staged batch.')
      if (Array.isArray(error?.details)) setValidation({ fingerprint, status: 'invalid', result: { issues: error.details }, error: '' })
    } finally { setSaving(false) }
  }

  return <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby={`finance-${kind}-stage-title`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={19} /></span><div>
      <h2 id={`finance-${kind}-stage-title`} className="text-base font-semibold text-heading">Stage {config.label.toLocaleLowerCase()}</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Upload, map, and validate source rows. They remain in migration staging and are not live invoices or ledger entries until a reconciled cutover is implemented and approved.</p>
    </div></div><Button type="button" variant="outline" size="sm" onClick={() => downloadCsv([config.fields.map(field => field.label), config.example], `asas-finance-${kind}-template.csv`, { bom: true })}><Download size={15} /> Template</Button></div>
    {kind === 'opening' && <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-3">
      <label className="space-y-1.5 text-xs font-medium text-body">Trial balance as-of date<Input type="date" value={asOf} onChange={event => { setAsOf(event.target.value); setStaged(null) }} /></label>
      <label className="space-y-1.5 text-xs font-medium text-body">Source AR control balance (workspace currency)<Input inputMode="decimal" value={accountsReceivableControlTotal} onChange={event => { setAccountsReceivableControlTotal(event.target.value.trim()); setStaged(null) }} placeholder="0.00" /></label>
      <label className="space-y-1.5 text-xs font-medium text-body">Source AP control balance (workspace currency)<Input inputMode="decimal" value={accountsPayableControlTotal} onChange={event => { setAccountsPayableControlTotal(event.target.value.trim()); setStaged(null) }} placeholder="0.00" /></label>
      <p className="text-xs leading-5 text-muted sm:col-span-3">Enter the source trial balance control totals separately. The uploaded residual lines must reconcile against these figures; the later cutover compares them with FX-valued open AP and AR.</p>
    </div>}
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-heading">{fileName || `Choose your ${config.noun} CSV`}</p><p className="mt-1 text-xs text-muted">CSV · up to 2 MB · maximum {MAX_ROWS} rows</p></div><input ref={inputRef} type="file" accept=".csv,text/csv" aria-label={`Choose Finance ${config.noun} CSV file`} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={15} /> Choose CSV</Button></div>
    {fileError && <Alert variant="destructive" className="mt-3"><AlertDescription>{fileError}</AlertDescription></Alert>}
    {headers.length > 0 && <div className="mt-5 space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{config.fields.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body"><span>{field.label}{field.required && <span className="text-danger"> *</span>}</span><select value={mapping[field.key] ?? ''} onChange={event => { setStaged(null); setMapping(current => ({ ...current, [field.key]: event.target.value })) }} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent"><option value="">Skip this field</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}</select></label>)}</div>
      <div className="rounded-lg border border-border-subtle bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-heading">Preview · {records.length} {config.noun}</span><span className="text-muted">{mappingIssues.length ? `${mappingIssues.length} mapping issue${mappingIssues.length === 1 ? '' : 's'}` : allIssues.length ? `${allIssues.length} data issue${allIssues.length === 1 ? '' : 's'}` : validation.status === 'checking' ? 'Checking with Asas…' : validation.status === 'ready' ? 'All rows validated' : validation.error ? 'Server validation needs attention' : 'Map required columns'}</span></div>
        {(mappingIssues.length || allIssues.length || validation.error) ? <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{mappingIssues.map((issue, i) => <li key={`map-${i}`}>{issue}</li>)}{allIssues.slice(0, 15).map((issue, i) => <li key={`${issue.rowNumber}-${issue.field}-${i}`}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}{allIssues.length > 15 && <li>And {allIssues.length - 15} more issues.</li>}{validation.error && <li>{validation.error}</li>}</ul> : null}
        <div className="mt-3 max-h-56 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted">{config.fields.filter(field => mapping[field.key] !== '').map(field => <th key={field.key} className="pb-2 pr-4 font-medium">{field.label}</th>)}</tr></thead><tbody>{records.slice(0, 100).map((record, index) => <tr key={`${record.sourceId || record.code}-${index}`} className="border-t border-border-subtle text-body">{config.fields.filter(field => mapping[field.key] !== '').map(field => <td key={field.key} className="py-2 pr-4">{record[field.key] || '—'}</td>)}</tr>)}</tbody></table>{records.length > 100 && <p className="pt-2 text-xs text-muted">Showing first 100 rows; all {records.length} rows are validated before staging.</p>}</div>
      </div>
    </div>}
    {staged && <Alert variant="success" className="mt-4"><AlertDescription>{staged.replayed ? 'This exact batch is already staged; no duplicate records were created.' : `${staged.batch.stagedRows} ${config.noun} saved to migration staging.`} No invoice or journal has been posted.</AlertDescription></Alert>}
    {saveError && <Alert variant="destructive" className="mt-4"><AlertDescription>{saveError}</AlertDescription></Alert>}
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!canStage || saving} onClick={saveBatch}>{saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save staged batch</>}</Button><p className="text-xs text-muted">Stored rows can be reconciled and continued later. Re-staging a corrected source ID saves a new revision and preserves the earlier row for audit.</p></div>
    <div className="mt-4 border-t border-border-subtle pt-4">
      <Button type="button" variant="outline" size="sm" onClick={() => setReviewOpen(value => !value)}><Eye size={15} />{reviewOpen ? 'Hide staged rows' : 'Review saved rows'}</Button>
      {reviewOpen && <div className="mt-3 rounded-lg border border-border-subtle bg-surface p-3">
        {stagedRecords.isLoading ? <p className="flex items-center gap-2 text-xs text-muted"><Loader2 size={14} className="animate-spin" />Loading staged rows…</p>
          : stagedRecords.isError ? <p className="text-xs text-danger">Could not load staged rows. Try again.</p>
            : stagedRecords.data?.items.length ? <>
              <div className="max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-muted"><th className="pb-2 pr-4 font-medium">Source ID</th><th className="pb-2 pr-4 font-medium">Revision</th><th className="pb-2 pr-4 font-medium">Cutover row</th>{Object.keys(stagedRecords.data.items[0].payload).map(key => <th key={key} className="pb-2 pr-4 font-medium">{key}</th>)}</tr></thead><tbody>{stagedRecords.data.items.map(record => <tr key={record.id} className="border-t border-border-subtle text-body"><td className="py-2 pr-4 font-medium">{record.sourceId}</td><td className="py-2 pr-4">{record.revision}</td><td className="py-2 pr-4">{record.isCurrent ? 'Current' : 'Superseded'}</td>{Object.keys(stagedRecords.data.items[0].payload).map(key => <td key={key} className="py-2 pr-4">{String(record.payload[key] ?? '—')}</td>)}</tr>)}</tbody></table></div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted"><span>Showing {(stagedRecords.data.pagination.page - 1) * stagedRecords.data.pagination.limit + 1}–{Math.min(stagedRecords.data.pagination.page * stagedRecords.data.pagination.limit, stagedRecords.data.pagination.total)} of {stagedRecords.data.pagination.total} saved rows</span><span className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={stagedRecords.data.pagination.page <= 1} onClick={() => setReviewPage(page => page - 1)} aria-label="Previous staged rows page"><ChevronLeft size={14} /></Button><Button type="button" variant="outline" size="sm" disabled={stagedRecords.data.pagination.page >= stagedRecords.data.pagination.pages} onClick={() => setReviewPage(page => page + 1)} aria-label="Next staged rows page"><ChevronRight size={14} /></Button></span></div>
            </> : <p className="text-xs text-muted">No rows have been staged for this data set yet.</p>}
      </div>}
    </div>
  </section>
}
