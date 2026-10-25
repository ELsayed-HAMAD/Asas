import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Link2, Upload } from 'lucide-react'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { downloadCsv, parseCsvImport } from '../../lib/csv'
import { http } from '../../lib/api/http'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500
const FIELDS = [
  { key: 'name', label: 'Employee name', required: true, aliases: ['name', 'employee name', 'full name'] },
  { key: 'title', label: 'Job title', required: true, aliases: ['title', 'job title', 'position'] },
  { key: 'department', label: 'Department', aliases: ['department', 'team'] },
  { key: 'email', label: 'Work email', aliases: ['email', 'work email', 'email address'] },
  { key: 'employeeNumber', label: 'Employee number', aliases: ['employee number', 'employee id', 'staff id'] },
  { key: 'location', label: 'Location', aliases: ['location', 'office'] },
  { key: 'hiredAt', label: 'Hire date (YYYY-MM-DD)', aliases: ['hire date', 'hired at', 'start date'] },
  { key: 'salary', label: 'Monthly salary', aliases: ['monthly salary'] },
]
const normalize = value => String(value ?? '').trim().toLowerCase().replaceAll(/[_-]+/g, ' ').replaceAll(/\s+/g, ' ')
const isValidDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function initialMapping(headers) {
  return Object.fromEntries(FIELDS.map(field => {
    const index = headers.findIndex(header => field.aliases.includes(normalize(header)))
    return [field.key, index < 0 ? '' : String(index)]
  }))
}

export default function EmployeeMigration({ onRowsChange, disabled = false }) {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [sourceRows, setSourceRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [error, setError] = useState('')
  const [serverValidation, setServerValidation] = useState({ fingerprint: '', status: 'idle', error: '' })

  const { employees, issues } = useMemo(() => {
    if (!headers.length) return { employees: [], issues: [] }
    const mapped = sourceRows.map((source, rowIndex) => {
      const employee = {}
      for (const field of FIELDS) {
        const column = mapping[field.key]
        const value = column === '' || column == null ? '' : String(source[Number(column)] ?? '').trim()
        if (value) employee[field.key] = value
      }
      return { employee, rowNumber: rowIndex + 2 }
    })
    const foundIssues = []
    const usedColumns = new Map()
    for (const field of FIELDS) {
      const column = mapping[field.key]
      if (column !== '' && column != null) {
        if (usedColumns.has(column)) foundIssues.push(`Map ${field.label} to a different source column than ${usedColumns.get(column)}.`)
        else usedColumns.set(column, field.label)
      }
    }
    for (const { employee, rowNumber } of mapped) {
      if (!employee.name) foundIssues.push(`Row ${rowNumber}: employee name is required.`)
      if (!employee.title) foundIssues.push(`Row ${rowNumber}: job title is required.`)
      if (employee.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) foundIssues.push(`Row ${rowNumber}: work email is not valid.`)
      if (employee.hiredAt && !isValidDate(employee.hiredAt)) foundIssues.push(`Row ${rowNumber}: hire date must be a real date in YYYY-MM-DD format.`)
      if (employee.salary && !/^\d+(?:\.\d{1,2})?$/.test(employee.salary)) foundIssues.push(`Row ${rowNumber}: salary must be a non-negative amount with up to two decimals.`)
    }
    return { employees: mapped.map(item => item.employee), issues: foundIssues }
  }, [headers, mapping, sourceRows])

  function changeMapping(field, value) {
    setMapping(current => ({ ...current, [field]: value }))
  }

  async function chooseFile(file) {
    setError('')
    onRowsChange([])
    setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setError('Upload a CSV export. Excel workbooks and direct ERP connections are not supported in this onboarding import yet.')
      return
    }
    if (file.size > MAX_FILE_BYTES) { setError('CSV files must be 2 MB or smaller.'); return }
    try {
      const parsed = parseCsvImport(await file.text(), { maxRows: MAX_ROWS, recordLabel: 'employees', limitPrefix: 'This onboarding import' })
      const nextMapping = initialMapping(parsed.headers)
      setFileName(file.name)
      setHeaders(parsed.headers)
      setSourceRows(parsed.rows)
      setMapping(nextMapping)
    } catch (cause) {
      setFileName(''); setHeaders([]); setSourceRows([]); setMapping({})
      setError(cause instanceof Error ? cause.message : 'Could not read this CSV file.')
    }
  }

  const missingRequired = FIELDS.some(field => field.required && mapping[field.key] === '')
  const locallyValid = headers.length > 0 && employees.length > 0 && !issues.length && !missingRequired
  const fingerprint = JSON.stringify(employees)
  useEffect(() => {
    if (!locallyValid) {
      setServerValidation({ fingerprint, status: 'idle', error: '' })
      return undefined
    }
    let current = true
    setServerValidation({ fingerprint, status: 'checking', error: '' })
    http.post('/onboarding/import/validate', { body: { employees } }).then(result => {
      if (current) setServerValidation({ fingerprint, status: result?.validRows === employees.length ? 'ready' : 'error', error: result?.validRows === employees.length ? '' : 'Asas did not validate every row.' })
    }).catch(cause => {
      if (current) setServerValidation({ fingerprint, status: 'error', error: cause?.message || 'Asas could not validate this import.' })
    })
    return () => { current = false }
  }, [employees, fingerprint, locallyValid])
  const canImport = locallyValid && serverValidation.fingerprint === fingerprint && serverValidation.status === 'ready' && !disabled
  useEffect(() => {
    if (!disabled) onRowsChange(canImport ? employees : [])
  }, [canImport, disabled, employees, onRowsChange])

  return (
    <section className="space-y-4 rounded-card-sm border border-border-default bg-surface-raised/80 p-4 sm:p-5" aria-labelledby="migration-title">
      <div className="flex items-start gap-3">
        <span className="rounded-card-sm bg-accent-light p-2.5 text-accent"><FileSpreadsheet className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 id="migration-title" className="text-sm font-semibold text-heading">Guided employee data migration</h3>
          <p className="mt-1 text-xs leading-relaxed text-body-light">Start with a CSV export from your current system. Map columns, review the records, then import them together. This first migration supports employee master data.</p>
        </div>
        <Button type="button" variant="outline" className="shrink-0" onClick={() => downloadCsv([FIELDS.map(field => field.label.replace(/ \(.+\)$/, ''))], 'asas-employee-import-template.csv', { bom: true })}>
          <Download className="mr-2 h-4 w-4" />Template
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-button border border-dashed border-border-strong bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-heading">{fileName || 'Choose your employee CSV'}</p>
          <p className="mt-1 text-xs text-caption">CSV · up to 2 MB · maximum {MAX_ROWS} employees</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose employee CSV file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file) }} />
        <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Choose CSV</Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {headers.length > 0 && <>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(field => <label key={field.key} className="space-y-1.5 text-xs font-medium text-body">
            <span>{field.label}{field.required && <span className="text-danger"> *</span>}</span>
            <select value={mapping[field.key] ?? ''} onChange={event => changeMapping(field.key, event.target.value)} disabled={disabled} className="h-10 w-full rounded-button border border-border-default bg-surface px-3 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="">Skip this field</option>
              {headers.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}
            </select>
          </label>)}
        </div>

        <div className="rounded-button border border-border-subtle bg-surface p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-heading">Import preview</span>
            <span className={issues.length || serverValidation.status === 'error' ? 'text-danger' : serverValidation.status === 'ready' && serverValidation.fingerprint === fingerprint ? 'text-success-text' : 'text-caption'}>{issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'} to fix` : serverValidation.status === 'checking' ? 'Validating with Asas…' : serverValidation.status === 'error' ? 'Server validation needs attention' : serverValidation.status === 'ready' && serverValidation.fingerprint === fingerprint ? `${employees.length} records validated` : `${employees.length} records to review`}</span>
          </div>
          {(issues.length > 0 || serverValidation.status === 'error') && <ul className="mt-2 max-h-24 space-y-1 overflow-auto text-xs text-danger" aria-live="polite">{issues.slice(0, 8).map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}{issues.length > 8 && <li>And {issues.length - 8} more issues.</li>}{serverValidation.status === 'error' && <li>{serverValidation.error}</li>}</ul>}
          {employees.length > 0 && <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-surface"><tr className="text-caption">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <th key={field.key} className="pb-2 pr-3 font-medium">{field.label.replace(/ \(.+\)$/, '')}</th>)}</tr></thead><tbody>{employees.map((employee, index) => <tr key={index} className="border-t border-border-subtle text-body">{FIELDS.filter(field => mapping[field.key] !== '').map(field => <td key={field.key} className="py-2 pr-3">{employee[field.key] || '—'}</td>)}</tr>)}</tbody></table></div>}
        </div>
      </>}

      <div className="flex items-start gap-2 rounded-button bg-surface-muted/70 p-3 text-xs leading-relaxed text-caption">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Direct connections to external ERP systems are not configured in Asas yet. Export a CSV from your source system and use this reviewed import path; no live source account or sync is implied.</p>
      </div>
      <p className="text-[11px] leading-relaxed text-caption">Sensitive bank account fields are not included. Salary is imported as a monthly amount; leave the field unmapped if your source stores annual compensation. This adds employee records and does not update existing records. The source file stays in this browser; mapped rows are sent to Asas for server validation, and records are written only when you complete setup.</p>
      {headers.length > 0 && <span className="sr-only" aria-live="polite">{canImport ? `${employees.length} employee rows validated and ready to import` : 'Resolve mapping or data issues before importing'}</span>}
    </section>
  )
}
