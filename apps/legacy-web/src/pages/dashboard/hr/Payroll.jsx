import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  ChevronDown,
  MoreHorizontal,
  Loader2,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import FormDialog from '../../../components/common/FormDialog'
import { hrApi } from '../../../lib/api/hr'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney, formatDate } from '../../../lib/format'
import { useActiveMemberRole } from '../../../lib/authClient'

// The old page rendered deductions/taxes as a leading-minus negative; the minus only appears
// for a positive amount (a zero rendered plain), so mirror that instead of an unconditional '-'.
function formatNegativeDeduction(value) {
  return Number(value) > 0 ? `-${formatMoney(value)}` : formatMoney(value)
}

// Shared input style for the New Payroll Run dialog — the page's existing token classes.
const DIALOG_INPUT =
  'w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body placeholder:text-caption focus:outline-none focus:ring-1 focus:ring-accent'

// One payslip download for a single payroll line (rendered in a row / the detail panel).
// Streams the deterministic PDF bytes, opens them in a new tab, and revokes the object URL
// once the tab has long since loaded it.
function PayslipButton({ runId, lineId, onSelect, onNotifyError }) {
  const [pending, setPending] = useState(false)

  async function handleDownload(event) {
    event.stopPropagation()
    if (pending) return
    onSelect?.()
    onNotifyError?.(null)
    setPending(true)
    try {
      const blob = await hrApi.getPayslip(runId, lineId)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (error) {
      onNotifyError?.(error?.message || 'Unable to download the payslip.')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={pending}
      className="flex items-center gap-1.5 border border-border-default text-body px-2.5 py-1 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card disabled:opacity-60"
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
      Payslip
    </button>
  )
}

export default function Payroll() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data: listData, isLoading: isLoadingList, isError, error } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.list(),
    queryFn: () => hrApi.listPayrollRuns(),
  })

  const activeRun = listData?.items?.[0] || null
  const activeRunId = activeRun?.id || null

  // The full run (its lines + per-line tax split) drives the table and the breakdown panel.
  const { data: run, isLoading: isLoadingRun } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.detail(activeRunId),
    queryFn: () => hrApi.getPayrollRun(activeRunId),
    enabled: !!activeRunId,
  })

  const isLoading = isLoadingList || (!!activeRunId && isLoadingRun)

  const records = run?.lines ?? []

  // The active run's KPI totals — summed from that run's lines, exactly as the old page
  // derived `activeRun.totals`. Money arrives as major-unit decimal strings, so coerce to
  // Number for display aggregation only.
  const totals = records.reduce(
    (acc, line) => {
      acc.totalGross += Number(line.gross)
      acc.taxes += Number(line.deductions)
      acc.totalNet += Number(line.net)
      return acc
    },
    { totalGross: 0, taxes: 0, totalNet: 0 },
  )

  useEffect(() => {
    if (!records.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !records.some(r => r.id === selectedId)) {
      setSelectedId(records[0].id)
    }
  }, [records, selectedId])

  const selectedRecord = records.find(r => r.id === selectedId)

  const approveMutation = useMutation({
    mutationFn: () => hrApi.approvePayrollRun(activeRun.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })

  // ── New payroll run (ADMIN write — employee.write) ──────────────────────────────
  const { data: activeMemberRole } = useActiveMemberRole()
  // `employee.write` is ADMIN-gated server-side; while the role is still loading the
  // control renders enabled rather than flashing a disabled state.
  const isAdmin = ['OWNER', 'ADMIN'].includes(activeMemberRole ?? 'ADMIN')

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [payDate, setPayDate] = useState('')
  const [taxRates, setTaxRates] = useState([{ label: 'Tax', rate: '10' }])
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => new Set())
  const [dialogError, setDialogError] = useState(null)
  const [payslipError, setPayslipError] = useState(null)

  // The employee picker fetches only while the dialog is open.
  const {
    data: employeeData,
    isLoading: isLoadingEmployees,
    isError: isEmployeeError,
    error: employeeError,
  } = useQuery({
    queryKey: queryKeys.hr.employees.list({ limit: 100 }),
    queryFn: () => hrApi.listEmployees({ limit: 100 }),
    enabled: isDialogOpen,
  })
  const employees = employeeData?.items ?? []

  function resetDialogState() {
    setLabel('')
    setPayDate(new Date().toISOString().slice(0, 10))
    setTaxRates([{ label: 'Tax', rate: '10' }])
    setSelectedEmployeeIds(new Set())
    setDialogError(null)
  }

  function openNewRunDialog() {
    if (!isAdmin) return
    resetDialogState()
    setIsDialogOpen(true)
  }

  const createRunMutation = useMutation({
    mutationFn: payload => hrApi.createPayrollRun(payload),
    onSuccess: () => {
      // Invalidate the whole hr module so the run list (the newest run becomes the
      // active one) and any open employee tab refresh; SSE covers other tabs.
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() })
      setIsDialogOpen(false)
    },
    onError: err => setDialogError(err?.message || 'Unable to create the payroll run.'),
  })

  function addTaxRate() {
    setTaxRates(prev => [...prev, { label: '', rate: '' }])
  }

  function updateTaxRate(index, field, value) {
    setTaxRates(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function removeTaxRate(index) {
    setTaxRates(prev => prev.filter((_, i) => i !== index))
  }

  function toggleEmployee(id) {
    setSelectedEmployeeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function submitNewRun() {
    if (!isAdmin || createRunMutation.isPending) return
    const trimmedLabel = label.trim()
    // Drop all-empty rows; at least one rate with both fields is required (schema min 1).
    const rates = taxRates
      .filter(row => row.label.trim() !== '' || row.rate.trim() !== '')
      .map(row => ({ label: row.label.trim(), rate: row.rate.trim() }))
    if (!trimmedLabel) {
      setDialogError('Give the run a label, e.g. "September 2026 payroll".')
      return
    }
    if (rates.length === 0) {
      setDialogError('Add at least one tax rate.')
      return
    }
    if (rates.some(row => row.label === '' || row.rate === '')) {
      setDialogError('Every tax rate needs a label and a rate (a decimal string like 15.5).')
      return
    }
    const employeeIds = employees.filter(e => selectedEmployeeIds.has(e.id)).map(e => e.id)
    if (employeeIds.length === 0) {
      setDialogError('Select at least one employee to pay.')
      return
    }
    setDialogError(null)
    createRunMutation.mutate({
      label: trimmedLabel,
      payDate: payDate || null,
      taxRates: rates,
      employeeIds,
    })
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[900px]">
      <TopBarActions>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={openNewRunDialog}
            disabled={!isAdmin}
            title={isAdmin ? undefined : 'Requires the ADMIN role'}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> New Payroll Run
          </button>
          <button type="button" disabled className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card disabled:opacity-60">
            <Download size={16} /> Download ACH
          </button>
          {activeRun?.status === 'PAID' ? (
            <button
              type="button"
              disabled
              className="bg-surface-strong text-heading px-5 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors shadow-card disabled:opacity-60"
            >
              Export Ledger
            </button>
          ) : (
            <button
              type="button"
              disabled={!activeRun || activeRun.status === 'APPROVED' || approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
              className="bg-primary text-white px-5 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {activeRun?.status === 'APPROVED' ? 'Pay Run Approved' : 'Approve Pay Run'}
            </button>
          )}
        </div>
      </TopBarActions>

      <div className="px-6 py-5 flex-shrink-0 border-b border-border-subtle shadow-card z-10 relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-6">
            <div className="flex gap-3">
              <button type="button" disabled className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card disabled:opacity-60">
                Filter: All Depts <ChevronDown size={14} className="text-caption" />
              </button>
              <button type="button" disabled className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card disabled:opacity-60">
                Status: {activeRun?.status || 'None'} <ChevronDown size={14} className="text-caption" />
              </button>
            </div>
            <div className="h-4 w-px bg-border-default" />
            <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input type="checkbox" className="rounded border-border-strong text-accent focus:ring-accent" defaultChecked readOnly />
              Auto-Calculate
            </label>
          </div>
          <div className="text-sm text-muted">
            {activeRun?.label || 'No payroll run'} · Pay date{' '}
            {activeRun?.payDate ? formatDate(activeRun.payDate) : '—'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Gross</p>
            <p className="text-2xl font-bold text-heading">{formatMoney(totals.totalGross)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Taxes / Deductions</p>
            <p className="text-2xl font-bold text-heading">{formatMoney(totals.taxes)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Net</p>
            <p className="text-2xl font-bold text-heading">{formatMoney(totals.totalNet)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading payroll…
            </div>
          )}
          {isError && (
            <div className="p-6 text-sm text-danger">
              {error?.message || 'Unable to load payroll.'}
            </div>
          )}
          {!isLoading && !isError && records.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-base font-semibold text-heading mb-1">No payroll lines</p>
              <p className="text-sm text-muted">Load the sample pack or create a payroll run to see data here.</p>
            </div>
          )}
          {!isLoading && records.length > 0 && (
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Employee</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Gross</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Deductions</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Net</th>
                  <th className="px-6 py-3 border-b border-border-default w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {records.map(record => {
                  const isSelected = selectedId === record.id
                  return (
                    <tr
                      key={record.id}
                      onClick={() => {
                        setSelectedId(record.id)
                        setPayslipError(null)
                      }}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-accent-light/50' : 'hover:bg-surface-muted'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-bold text-heading">
                            {(record.employee?.name || '?').charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-heading">{record.employee?.name}</p>
                            <p className="text-[11px] text-muted">{record.employee?.title || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-body">{formatMoney(record.gross)}</td>
                      <td className="px-6 py-4 text-sm text-body">{formatNegativeDeduction(record.deductions)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-heading">{formatMoney(record.net)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <PayslipButton
                            runId={activeRunId}
                            lineId={record.id}
                            onSelect={() => setSelectedId(record.id)}
                            onNotifyError={setPayslipError}
                          />
                          <MoreHorizontal size={16} className="text-caption" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="w-[380px] border-l border-border-default p-6 overflow-y-auto flex-shrink-0">
          {!selectedRecord ? (
            <p className="text-sm text-muted">Select a payroll line to inspect breakdown.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Selected</p>
                <h2 className="text-xl font-bold text-heading">{selectedRecord.employee?.name}</h2>
                <p className="text-sm text-muted">{selectedRecord.employee?.title || '—'}</p>
                <div className="mt-3">
                  <PayslipButton
                    runId={activeRunId}
                    lineId={selectedRecord.id}
                    onNotifyError={setPayslipError}
                  />
                  {payslipError && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                      {payslipError}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-3 border border-border-default rounded-button p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Base salary</span>
                  <span className="font-medium text-heading">{formatMoney(selectedRecord.baseSalary || selectedRecord.gross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Missed days ({selectedRecord.missedDaysCount || 0})</span>
                  <span className="font-medium text-heading">{formatNegativeDeduction(selectedRecord.missedDaysAmount || '0')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Bonus {selectedRecord.bonusLabel ? `(${selectedRecord.bonusLabel})` : ''}</span>
                  <span className="font-medium text-heading">{formatMoney(selectedRecord.bonusAmount || '0')}</span>
                </div>
                {(selectedRecord.taxLines || []).map(tax => (
                  <div key={tax.id} className="flex justify-between text-sm">
                    <span className="text-muted flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted" />
                      {tax.label}
                    </span>
                    <span className="font-medium text-heading">{formatNegativeDeduction(tax.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <FormDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="New payroll run"
        subtitle="Price a run for the selected employees from their stored base salary."
        confirmLabel="Create run"
        busy={createRunMutation.isPending}
        onConfirm={submitNewRun}
        width="max-w-xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="payroll-run-label" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                Label
              </label>
              <input
                id="payroll-run-label"
                type="text"
                value={label}
                onChange={event => setLabel(event.target.value)}
                placeholder="e.g. September 2026 payroll"
                maxLength={200}
                className={DIALOG_INPUT}
              />
            </div>
            <div>
              <label htmlFor="payroll-run-pay-date" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                Pay date <span className="normal-case text-caption font-medium">(optional)</span>
              </label>
              <input
                id="payroll-run-pay-date"
                type="date"
                value={payDate}
                onChange={event => setPayDate(event.target.value)}
                className={DIALOG_INPUT}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Tax rates</p>
            <div className="space-y-2">
              {taxRates.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.label}
                    onChange={event => updateTaxRate(index, 'label', event.target.value)}
                    placeholder="Label"
                    maxLength={200}
                    aria-label={`Tax rate ${index + 1} label`}
                    className={`${DIALOG_INPUT} flex-1`}
                  />
                  <div className="relative flex-1 max-w-[140px]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.rate}
                      onChange={event => updateTaxRate(index, 'rate', event.target.value)}
                      placeholder="0"
                      aria-label={`Tax rate ${index + 1} rate percentage`}
                      className={`${DIALOG_INPUT} pr-6`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-caption pointer-events-none">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTaxRate(index)}
                    disabled={taxRates.length === 1}
                    aria-label={`Remove tax rate ${index + 1}`}
                    title={taxRates.length === 1 ? 'At least one rate is required' : 'Remove rate'}
                    className="text-caption hover:text-danger transition-colors p-1 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addTaxRate}
                className="flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
              >
                <Plus size={14} /> Add rate
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
              Employees{' '}
              <span className="normal-case text-caption font-medium">({selectedEmployeeIds.size} selected)</span>
            </p>
            <div className="max-h-56 overflow-y-auto border border-border-default rounded-button divide-y divide-border-subtle">
              {isLoadingEmployees ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" /> Loading employees…
                </div>
              ) : isEmployeeError ? (
                <p className="px-3 py-3 text-xs text-danger">{employeeError?.message || 'Unable to load employees.'}</p>
              ) : employees.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted">No employees to pay — add employees first.</p>
              ) : (
                employees.map(emp => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-body cursor-pointer hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-border-strong text-accent focus:ring-accent"
                      checked={selectedEmployeeIds.has(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                    />
                    <span className="font-medium text-heading">{emp.name}</span>
                    <span className="text-xs text-muted truncate">{emp.title}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {dialogError && (
            <p className="flex items-start gap-1.5 text-sm text-danger">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              {dialogError}
            </p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}
