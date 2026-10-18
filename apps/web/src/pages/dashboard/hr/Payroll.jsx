import React, { useEffect, useState, useRef } from 'react'
import { validatePayrollPeriod } from '@asas/domain/payroll'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  Loader2,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  Calculator,
  ChevronDown,
  FileSpreadsheet,
  Landmark,
  Scale,
  X,
} from 'lucide-react'
import FormDialog from '../../../components/common/FormDialog'
import { hrApi } from '../../../lib/api/hr'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney, formatCompactTableMoney, formatDate } from '../../../lib/format'
import { downloadCsv } from '../../../lib/csv'
import {
  downloadFile,
  generateNachaForRun,
  generateSepaForRun,
  payrollNachaFilename,
  payrollPaymentSummaryFilename,
  payrollPaymentSummaryRows,
  payrollSepaFilename,
} from '../../../lib/payrollExport'
import { clearPayrollRunDraft, payrollRunDraftStorageKey, readPayrollRunDraft, savePayrollRunDraft } from '../../../lib/payrollRunDraft'
import { useActiveMemberRole, useActiveOrganization, useSession } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import StatutoryTaxCalculator from './StatutoryTaxCalculator.jsx'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { Checkbox } from '../../../components/ui/checkbox'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'

// The old page rendered deductions/taxes as a leading-minus negative; the minus only appears
// for a positive amount (a zero rendered plain), so mirror that instead of an unconditional '-'.
function formatNegativeDeduction(value, currency, options = {}) {
  const opt = { ...(currency ? { currency } : {}), ...options }
  return Number(value) > 0 ? `-${formatMoney(value, opt)}` : formatMoney(value, opt)
}

function formatCompactNegativeDeduction(value, currency, options = {}) {
  const opt = { ...(currency ? { currency } : {}), ...options }
  return Number(value) > 0 ? `-${formatCompactTableMoney(value, opt)}` : formatCompactTableMoney(value, opt)
}

function payrollDraftStorage() {
  try { return window.sessionStorage } catch { return null }
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
    <Button
      variant="outline"
      size="sm"
      type="button"
      onClick={handleDownload}
      disabled={pending}
      className="h-7 px-2 text-xs font-medium gap-1 shadow-sm whitespace-nowrap shrink-0"
    >
      {pending ? <Loader2 size={12} className="animate-spin shrink-0" /> : <FileText size={12} className="shrink-0" />}
      <span>Payslip</span>
    </Button>
  )
}

export default function Payroll() {
  const queryClient = useQueryClient()
  const { data: activeMemberRole } = useActiveMemberRole()
  const { data: activeOrganization } = useActiveOrganization()
  const { data: sessionData } = useSession()
  const draftStorageKey = payrollRunDraftStorageKey(activeOrganization?.id, sessionData?.user?.id)
  // Read the role object returned by Better Auth; unresolved roles do not grant write access.
  const isAdmin = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole))
  const [roundingReviewOpen, setRoundingReviewOpen] = useState(false)
  const [roundingYear, setRoundingYear] = useState(String(new Date().getFullYear()))
  const [statutoryCalculatorOpen, setStatutoryCalculatorOpen] = useState(false)

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const exportMenuRef = useRef(null)
  const toolsMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setExportMenuOpen(false)
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target)) {
        setToolsMenuOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setExportMenuOpen(false)
        setToolsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const [selectedId, setSelectedId] = useState(null)
  const [selectedRunId, setSelectedRunId] = useState('')
  const [payrollRunPage, setPayrollRunPage] = useState(1)
  const [payrollActionError, setPayrollActionError] = useState(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [savedRetryAvailable, setSavedRetryAvailable] = useState(false)
  const requestRef = useRef(null)

  useEffect(() => {
    setExportMenuOpen(false)
    setToolsMenuOpen(false)
  }, [selectedRunId])

  useEffect(() => {
    setIsDialogOpen(false)
    if (!draftStorageKey) {
      requestRef.current = null
      setSavedRetryAvailable(false)
      return
    }
    const draft = readPayrollRunDraft(payrollDraftStorage(), draftStorageKey)
    requestRef.current = draft
    setSavedRetryAvailable(Boolean(draft))
  }, [draftStorageKey])

  const { data: listData, isLoading: isLoadingList, isError, error } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.list({ page: payrollRunPage, limit: 25 }),
    queryFn: () => hrApi.listPayrollRuns({ page: payrollRunPage, limit: 25 }),
    enabled: isAdmin,
  })
  useEffect(() => {
    const pages = listData?.pagination?.pages
    if (pages === undefined) return
    if (pages === 0 && payrollRunPage !== 1) setPayrollRunPage(1)
    else if (pages > 0 && payrollRunPage > pages) setPayrollRunPage(pages)
  }, [listData?.pagination?.pages, payrollRunPage])

  const roundingYearNumber = Number(roundingYear)
  const { data: roundingReview, isLoading: isLoadingRoundingReview, isError: isRoundingReviewError, error: roundingReviewError } = useQuery({
    queryKey: ['hr', 'payroll', 'rounding-reconciliation', roundingYear],
    queryFn: () => hrApi.getPayrollRoundingReconciliation(roundingYearNumber),
    enabled: isAdmin && roundingReviewOpen && Number.isInteger(roundingYearNumber) && roundingYearNumber >= 2000 && roundingYearNumber <= 2100,
  })

  const { data: myPayslips = [], isLoading: isLoadingMyPayslips, isError: isMyPayslipsError, error: myPayslipsError } = useQuery({
    queryKey: ['hr', 'payroll', 'my-payslips'],
    queryFn: () => hrApi.listMyPayslips(),
    enabled: !isAdmin,
  })

  const runs = listData?.items ?? []
  const activeRun = runs.find(item => item.id === selectedRunId) || runs[0] || null
  const activeRunId = activeRun?.id || null

  // The full run (its lines + per-line tax split) drives the table and the breakdown panel.
  const { data: run, isLoading: isLoadingRun } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.detail(activeRunId),
    queryFn: () => hrApi.getPayrollRun(activeRunId),
    enabled: isAdmin && !!activeRunId,
  })

  const isLoading = isLoadingList || (!!activeRunId && isLoadingRun)

  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const { data: deptData } = useQuery({
    queryKey: queryKeys.hr.departments.all(),
    queryFn: hrApi.getDepartments,
  })
  const departments = deptData?.items || []

  const allRecords = run?.lines ?? []
  const records = departmentFilter === 'ALL'
    ? allRecords
    : allRecords.filter(r => (r.employee?.title || '').toLowerCase().includes(departmentFilter.toLowerCase()))
  const money = value => formatMoney(value, run?.currency ? { currency: run.currency } : {})
  const compactMoney = value => formatCompactTableMoney(value, run?.currency ? { currency: run.currency } : {})
  const metricFontSize = value => {
    const label = money(value)
    return `clamp(0.75rem, ${Math.min(14, 130 / Math.max(1, label.length))}cqw, 1.5rem)`
  }

  // Exact aggregates over every stored line in this run, returned by the API as decimal strings.
  const totals = run?.totals ?? { gross: '0', deductions: '0', net: '0' }

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


  const [isLineDialogOpen, setIsLineDialogOpen] = useState(false)
  const [lineForm, setLineForm] = useState({ baseSalary: '', missedDaysCount: '', missedDaysAmount: '', bonusLabel: '', bonusAmount: '' })

  function exportLedger() {
    if (activeRun?.status !== 'PAID' || !run) return
    const rows = [
      ['Payroll Run', 'Pay Date', 'Employee', 'Base Salary', 'Gross', 'Deductions', 'Net', 'Tax Detail'],
      ...records.map(line => [activeRun.label, activeRun.payDate || '', line.employee?.name, line.baseSalary || '', line.gross, line.deductions, line.net, line.taxLines.map(tax => `${tax.label}: ${tax.amount}`).join('; ')]),
    ]
    downloadCsv(rows, `${activeRun.label.trim().replace(/[^a-z0-9-_]+/gi, '-') || 'payroll'}-ledger.csv`)
  }

  function exportPaymentSummary() {
    if (!activeRun || !run) return
    downloadCsv(payrollPaymentSummaryRows(activeRun, records), payrollPaymentSummaryFilename(activeRun.label))
  }

  function exportNacha() {
    if (!activeRun || !run || !records.length) return
    try {
      setPayrollActionError(null)
      const nacha = generateNachaForRun(activeRun, records, {
        name: activeOrganization?.name || 'ASAS WORKSPACE',
      })
      downloadFile(nacha.fileContent, payrollNachaFilename(activeRun.label), 'text/plain')
    } catch (err) {
      setPayrollActionError(err?.message || 'Failed to generate NACHA ACH file')
    }
  }

  function exportSepa() {
    if (!activeRun || !run || !records.length) return
    try {
      setPayrollActionError(null)
      const sepa = generateSepaForRun(activeRun, records, {
        name: activeOrganization?.name || 'ASAS WORKSPACE',
      })
      downloadFile(sepa.xmlContent, payrollSepaFilename(activeRun.label), 'application/xml')
    } catch (err) {
      setPayrollActionError(err?.message || 'Failed to generate SEPA XML file')
    }
  }

  const approveMutation = useMutation({
    mutationFn: () => hrApi.approvePayrollRun(activeRun.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() }),
    onError: err => setPayrollActionError(err?.message || 'Unable to approve the payroll run.'),
  })
  const payMutation = useMutation({
    mutationFn: () => hrApi.payPayrollRun(activeRun.id),
    onSuccess: () => {
      setPayrollActionError(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() })
    },
    onError: err => setPayrollActionError(err?.message || 'Unable to record payroll payment.'),
  })
  const voidMutation = useMutation({
    mutationFn: (reason) => hrApi.voidPayrollRun(activeRun.id, reason),
    onSuccess: () => {
      setPayrollActionError(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() })
    },
    onError: err => setPayrollActionError(err?.message || 'Unable to void the payroll run.'),
  })

  const adjustLineMutation = useMutation({
    mutationFn: ({ lineId, patch }) => hrApi.patchPayrollLine(activeRun.id, lineId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.payrollRuns.detail(activeRunId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.payrollRuns.list() })
      setIsLineDialogOpen(false)
    },
  })

  function openLineEditor() {
    if (!selectedRecord || !isAdmin || !activeRun || ['APPROVED', 'PAID'].includes(activeRun.status)) return
    setLineForm({
      baseSalary: selectedRecord.baseSalary || '',
      missedDaysCount: selectedRecord.missedDaysCount == null ? '' : String(selectedRecord.missedDaysCount),
      missedDaysAmount: selectedRecord.missedDaysAmount || '',
      bonusLabel: selectedRecord.bonusLabel || '',
      bonusAmount: selectedRecord.bonusAmount || '',
    })
    adjustLineMutation.reset()
    setIsLineDialogOpen(true)
  }

  function submitLineAdjustment() {
    if (!selectedRecord || !activeRun) return
    if (!lineForm.baseSalary.trim()) return
    const patch = {
      baseSalary: lineForm.baseSalary.trim() || null,
      missedDaysCount: lineForm.missedDaysCount.trim() === '' ? null : Number(lineForm.missedDaysCount),
      missedDaysAmount: lineForm.missedDaysAmount.trim() || null,
      bonusLabel: lineForm.bonusLabel.trim() || null,
      bonusAmount: lineForm.bonusAmount.trim() || null,
    }
    if (patch.missedDaysCount !== null && (!Number.isInteger(patch.missedDaysCount) || patch.missedDaysCount < 0)) return
    adjustLineMutation.mutate({ lineId: selectedRecord.id, patch })
  }

  // ── New payroll run (ADMIN write — employee.write) ──────────────────────────────
  const [label, setLabel] = useState('')
  const [payDate, setPayDate] = useState('')
  const emptyPeriod = () => ({ salaryBasis: '', payFrequency: 'MONTHLY', periodsPerYear: 12, periodStart: '', periodEnd: '' })
  const [periodForm, setPeriodForm] = useState(emptyPeriod)
  const [taxRates, setTaxRates] = useState([{ label: 'Tax', rate: '10' }])
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => new Set())
  const [employeeSearch, setEmployeeSearch] = useState('')
  const debouncedEmployeeSearch = useDebouncedValue(employeeSearch)
  const [employeePage, setEmployeePage] = useState(1)
  const employeeLimit = 25
  const [dialogError, setDialogError] = useState(null)
  const [payslipError, setPayslipError] = useState(null)

  // The employee picker fetches only while the dialog is open.
  const {
    data: employeeData,
    isLoading: isLoadingEmployees,
    isError: isEmployeeError,
    error: employeeError,
  } = useQuery({
    queryKey: queryKeys.hr.employees.list({ page: employeePage, limit: employeeLimit, search: debouncedEmployeeSearch || undefined }),
    queryFn: () => hrApi.listEmployees({ page: employeePage, limit: employeeLimit, search: debouncedEmployeeSearch || undefined }),
    enabled: isDialogOpen,
  })
  const employees = employeeData?.items ?? []
  const employeePages = employeeData?.pagination?.pages ?? 0

  useEffect(() => {
    if (employeePages > 0 && employeePage > employeePages) setEmployeePage(employeePages)
  }, [employeePages, employeePage])

  function resetDialogState() {
    setLabel('')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPeriodForm(emptyPeriod())
    requestRef.current = null
    setSavedRetryAvailable(false)
    setTaxRates([{ label: 'Tax', rate: '10' }])
    setSelectedEmployeeIds(new Set())
    setDialogError(null)
  }

  function openNewRunDialog() {
    if (!isAdmin) return
    const draft = requestRef.current?.payload
      ? requestRef.current
      : readPayrollRunDraft(payrollDraftStorage(), draftStorageKey)
    if (draft) {
      requestRef.current = draft
      setLabel(draft.payload.label)
      setPayDate(draft.payload.payDate ?? '')
      setPeriodForm({
        salaryBasis: draft.payload.salaryBasis,
        payFrequency: draft.payload.payFrequency,
        periodsPerYear: draft.payload.periodsPerYear,
        periodStart: draft.payload.periodStart,
        periodEnd: draft.payload.periodEnd,
      })
      setTaxRates(draft.payload.taxRates.map(rate => ({ ...rate })))
      setSelectedEmployeeIds(new Set(draft.payload.employeeIds))
      setDialogError(null)
      setSavedRetryAvailable(true)
    } else {
      resetDialogState()
    }
    setIsDialogOpen(true)
  }

  function discardSavedRetry() {
    clearPayrollRunDraft(payrollDraftStorage(), draftStorageKey)
    requestRef.current = null
    setSavedRetryAvailable(false)
    resetDialogState()
  }

  const createRunMutation = useMutation({
    mutationFn: payload => hrApi.createPayrollRun(payload),
    onSuccess: () => {
      // Invalidate the whole hr module so the run list (the newest run becomes the
      // active one) and any open employee tab refresh; SSE covers other tabs.
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() })
      setPayrollRunPage(1)
      clearPayrollRunDraft(payrollDraftStorage(), draftStorageKey)
      requestRef.current = null
      setSavedRetryAvailable(false)
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
    const employeeIds = [...selectedEmployeeIds].sort()
    if (employeeIds.length === 0) {
      setDialogError('Select at least one employee to pay.')
      return
    }
    if (!periodForm.salaryBasis) {
      setDialogError('Confirm whether salaries without a stored basis are annual or monthly.')
      return
    }
    try { validatePayrollPeriod(periodForm) } catch (error) {
      setDialogError(error.message)
      return
    }
    const payload = { label: trimmedLabel, payDate: payDate || null, ...periodForm, taxRates: rates, employeeIds }
    const signature = JSON.stringify(payload)
    if (requestRef.current?.signature !== signature) requestRef.current = { signature, requestKey: crypto.randomUUID(), payload }
    else requestRef.current.payload = payload
    const persisted = savePayrollRunDraft(payrollDraftStorage(), draftStorageKey, payload, requestRef.current.requestKey)
    setSavedRetryAvailable(persisted)
    setDialogError(null)
    createRunMutation.mutate({ ...payload, requestKey: requestRef.current.requestKey })
  }

  if (!isAdmin) {
    if (isLoadingMyPayslips) {
      return (
        <div className="flex h-full items-center justify-center bg-surface-raised">
          <Loader2 className="animate-spin text-muted" size={24} />
        </div>
      )
    }

    if (isMyPayslipsError) {
      return (
        <div className="flex h-full items-center justify-center bg-surface-raised text-danger px-6 text-center">
          {myPayslipsError?.message || 'Failed to load your payslips.'}
        </div>
      )
    }

    const payslipsList = Array.isArray(myPayslips) ? myPayslips : (myPayslips?.data ?? [])
    const totalPaid = payslipsList
      .filter(p => p.status === 'PAID')
      .reduce((sum, p) => sum + Number(p.net || 0), 0)
    const latestPayDate = payslipsList[0]?.payDate || payslipsList[0]?.periodEnd || null
    const currency = payslipsList[0]?.currency || 'USD'

    return (
      <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">
        {/* Header KPI cards */}
        <div className="border-b border-border-default px-8 py-6 bg-surface-raised">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-heading">My Payslips</h1>
            <p className="text-xs text-muted">View your salary statements and download official PDF payslips.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="border border-border-default rounded-card-sm p-5 bg-surface-raised shadow-card">
              <p className="text-[11px] font-semibold text-muted tracking-wide mb-2">Total Net Received</p>
              <p className="text-3xl font-bold text-heading">{formatMoney(totalPaid.toFixed(2), { currency })}</p>
              <p className="mt-2 text-xs text-muted">Across all paid payroll periods</p>
            </div>
            <div className="border border-border-default rounded-card-sm p-5 bg-surface-raised shadow-card">
              <p className="text-[11px] font-semibold text-muted tracking-wide mb-2">Latest Pay Date</p>
              <p className="text-3xl font-bold text-heading">{latestPayDate ? formatDate(latestPayDate) : '—'}</p>
              <p className="mt-2 text-xs text-muted">Most recent statement processed</p>
            </div>
            <div className="border border-border-default rounded-card-sm p-5 bg-surface-raised shadow-card">
              <p className="text-[11px] font-semibold text-muted tracking-wide mb-2">Available Statements</p>
              <p className="text-3xl font-bold text-heading">{payslipsList.length}</p>
              <p className="mt-2 text-xs text-muted">Ready for inspection and PDF export</p>
            </div>
          </div>
        </div>

        {/* Payslips Table */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="border border-border-default rounded-card-sm overflow-x-auto bg-surface-raised shadow-card">
            <Table className="w-full min-w-[900px] text-left border-collapse">
              <TableHeader className="bg-surface-muted border-b border-border-default">
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">Payroll Period</TableHead>
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">Pay Date</TableHead>
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Base Salary</TableHead>
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Gross Pay</TableHead>
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Deductions</TableHead>
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Net Pay</TableHead>
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-center">Status</TableHead>
                  <TableHead className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border-subtle">
                {payslipsList.map(item => (
                  <TableRow key={item.id} className="hover:bg-surface-muted transition-colors border-0">
                    <TableCell className="px-6 py-4 font-semibold text-sm text-heading">{item.runLabel}</TableCell>
                    <TableCell className="px-6 py-4 text-sm text-body">{item.payDate ? formatDate(item.payDate) : (item.periodEnd ? formatDate(item.periodEnd) : '—')}</TableCell>
                    <TableCell className="px-6 py-4 text-sm text-heading text-right rtl:text-left tabular-nums" title={formatMoney(item.baseSalary, { currency: item.currency })}>{formatCompactTableMoney(item.baseSalary, { currency: item.currency })}</TableCell>
                    <TableCell className="px-6 py-4 text-sm text-heading text-right rtl:text-left tabular-nums" title={formatMoney(item.gross, { currency: item.currency })}>{formatCompactTableMoney(item.gross, { currency: item.currency })}</TableCell>
                    <TableCell className="px-6 py-4 text-sm text-body text-right rtl:text-left tabular-nums" title={`-${formatMoney(item.deductions, { currency: item.currency })}`}>-{formatCompactTableMoney(item.deductions, { currency: item.currency })}</TableCell>
                    <TableCell className="px-6 py-4 text-sm font-bold text-heading text-right rtl:text-left tabular-nums" title={formatMoney(item.net, { currency: item.currency })}>{formatCompactTableMoney(item.net, { currency: item.currency })}</TableCell>
                    <TableCell className="px-6 py-4 text-center">
                      <Badge variant={
                        item.status === 'PAID' ? 'success' :
                        item.status === 'APPROVED' ? 'warning' :
                        'secondary'
                      }>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right rtl:text-left">
                      <PayslipButton runId={item.payrollRunId} lineId={item.id} />
                    </TableCell>
                  </TableRow>
                ))}
                {payslipsList.length === 0 && (
                  <TableRow className="hover:bg-transparent border-0">
                    <TableCell colSpan={8} className="px-6 py-12 text-center text-muted text-sm">
                      No payslips available yet for your account.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5 space-y-5">
      {/* ── Fixed Top Controls (Single Toolbar Row) ── */}
      <div className="flex-shrink-0">
        <div className="w-full flex flex-wrap lg:flex-nowrap items-start justify-between gap-2.5 min-w-0">
          {/* Left: All Depts ⌄ + July 2026 · PAID ⌄ + < 1/1 > + Auto-Calculate + Subtitle */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger aria-label="Department" className="h-8 text-xs shrink-0 w-auto min-w-[100px]">
                  <SelectValue placeholder="All Depts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Depts</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center border border-border-default rounded-input text-xs bg-surface-raised shadow-card shrink-0 px-1 py-0.5">
                <Select
                  value={activeRun?.id || undefined}
                  onValueChange={val => { setSelectedRunId(val); setSelectedId(null) }}
                >
                  <SelectTrigger aria-label="Payroll run" className="h-7 border-0 bg-transparent text-xs font-normal text-heading shadow-none focus:ring-0 max-w-40 sm:max-w-48">
                    <SelectValue placeholder="Select payroll run" />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label.replace(/\s*Payroll\s*/i, ' ').trim()} · {item.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 border-l border-border-default pl-1.5 ml-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-label="Previous payroll run page"
                    disabled={payrollRunPage <= 1}
                    onClick={() => setPayrollRunPage(current => current - 1)}
                    className="h-6 w-6 p-0 text-xs"
                  >
                    ‹
                  </Button>
                  <span className="text-[11px] text-muted">{listData?.pagination?.pages ? `${payrollRunPage}/${listData.pagination.pages}` : '0/0'}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-label="Next payroll run page"
                    disabled={payrollRunPage >= (listData?.pagination?.pages ?? 0)}
                    onClick={() => setPayrollRunPage(current => current + 1)}
                    className="h-6 w-6 p-0 text-xs"
                  >
                    ›
                  </Button>
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted cursor-pointer hover:text-body transition-colors shrink-0">
                <Checkbox defaultChecked disabled className="opacity-100" />
                <span>Auto-Calculate</span>
              </label>
            </div>
            <p className="mt-1 text-[11px] text-muted flex items-center gap-1.5 truncate">
              <span className="shrink-0 font-medium text-heading">Pay date {activeRun?.payDate ? formatDate(activeRun.payDate) : '—'}</span>
              <span>·</span>
              <span className="truncate">Earning period {run?.periodStart && run?.periodEnd ? `${run.periodStart} – ${run.periodEnd}` : 'not recorded (legacy run)'}</span>
            </p>
          </div>

          {/* Right: Calculators ⌄ + Export ⌄ + Void run + + New Payroll Run */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            {/* Calculators dropdown */}
            <div className="relative shrink-0" ref={toolsMenuRef}>
              <Button
                variant="outline"
                size="sm"
                type="button"
                aria-expanded={toolsMenuOpen}
                aria-haspopup="true"
                onClick={() => setToolsMenuOpen(prev => !prev)}
                className="h-8 gap-1.5 text-xs font-medium bg-surface-raised shadow-card shrink-0"
              >
                <Calculator size={13} />
                <span>Calculators</span>
                {roundingReviewOpen && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" title="Rounding review open" />
                )}
                <ChevronDown size={12} className={`text-muted transition-transform duration-150 ${toolsMenuOpen ? 'rotate-180' : ''}`} />
              </Button>

              {toolsMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-60 bg-surface-raised border border-border-default rounded-card shadow-xl z-50 py-1 divide-y divide-border-subtle"
                >
                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setToolsMenuOpen(false)
                        setStatutoryCalculatorOpen(true)
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-muted transition-colors flex items-start gap-2.5 cursor-pointer"
                    >
                      <Calculator size={15} className="text-accent shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold text-heading leading-tight">Statutory Tax Calculator</p>
                        <p className="text-[11px] text-muted leading-tight mt-0.5">Withholdings & deduction preview</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      aria-expanded={roundingReviewOpen}
                      onClick={() => {
                        setToolsMenuOpen(false)
                        setRoundingReviewOpen(open => !open)
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-muted transition-colors flex items-start gap-2.5 cursor-pointer"
                    >
                      <Scale size={15} className="text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-heading leading-tight">Year-end rounding review</p>
                          {roundingReviewOpen && (
                            <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.2 rounded font-medium">Active</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted leading-tight mt-0.5">
                          {roundingReviewOpen ? 'Hide rounding review drawer' : 'Audit cent rounding across runs'}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Export dropdown */}
            <div className="relative shrink-0" ref={exportMenuRef}>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!run || records.length === 0}
                aria-expanded={exportMenuOpen}
                aria-haspopup="true"
                onClick={() => setExportMenuOpen(prev => !prev)}
                title={run ? 'Export payroll files' : 'No payroll run loaded'}
                className="h-8 gap-1.5 text-xs font-medium bg-surface-raised shadow-card disabled:opacity-60 shrink-0"
              >
                <Download size={13} />
                <span>Export</span>
                <ChevronDown size={12} className={`text-muted transition-transform duration-150 ${exportMenuOpen ? 'rotate-180' : ''}`} />
              </Button>

              {exportMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-64 bg-surface-raised border border-border-default rounded-card shadow-xl z-50 py-1 divide-y divide-border-subtle"
                >
                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportMenuOpen(false)
                        exportPaymentSummary()
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-muted transition-colors flex items-start gap-2.5 cursor-pointer"
                    >
                      <FileSpreadsheet size={15} className="text-accent shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold text-heading leading-tight">Payroll Summary (CSV)</p>
                        <p className="text-[11px] text-muted leading-tight mt-0.5">Payment breakdown for current run</p>
                      </div>
                    </button>

                    {activeRun?.currency === 'EUR' ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false)
                          exportSepa()
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-surface-muted transition-colors flex items-start gap-2.5 cursor-pointer"
                      >
                        <Landmark size={15} className="text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-semibold text-heading leading-tight">SEPA Transfer (.xml)</p>
                          <p className="text-[11px] text-muted leading-tight mt-0.5">ISO 20022 European bank batch</p>
                        </div>
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false)
                          exportNacha()
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-surface-muted transition-colors flex items-start gap-2.5 cursor-pointer"
                      >
                        <Landmark size={15} className="text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-semibold text-heading leading-tight">NACHA Direct Deposit (.ach)</p>
                          <p className="text-[11px] text-muted leading-tight mt-0.5">Standard 94-char ACH bank wire</p>
                        </div>
                      </button>
                    )}
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!run || activeRun?.status !== 'PAID'}
                      onClick={() => {
                        setExportMenuOpen(false)
                        exportLedger()
                      }}
                      title={activeRun?.status === 'PAID' ? 'Download payroll ledger CSV' : 'Available when run is marked paid'}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-muted transition-colors flex items-start gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <FileText size={15} className="text-muted shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold text-heading leading-tight">General Ledger (CSV)</p>
                        <p className="text-[11px] text-muted leading-tight mt-0.5">
                          {activeRun?.status === 'PAID' ? 'Accounting ledger entries' : 'Available when run is marked paid'}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Run Lifecycle Action (Void / Pay / Approve) */}
            {activeRun?.status === 'VOID' ? (
              <Badge variant="secondary">Voided</Badge>
            ) : activeRun?.status === 'PAID' ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!isAdmin || voidMutation.isPending}
                onClick={() => {
                  const reason = window.prompt('Reason for voiding this payroll run:')?.trim()
                  if (reason) voidMutation.mutate(reason)
                }}
                className="border-danger/40 text-danger hover:bg-danger/5"
              >
                {voidMutation.isPending ? 'Voiding…' : 'Void run'}
              </Button>
            ) : activeRun?.status === 'APPROVED' ? (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  type="button"
                  disabled={payMutation.isPending}
                  title="Records payment after it has been completed outside Asas."
                  onClick={() => { setPayrollActionError(null); payMutation.mutate() }}
                  className="shadow-sm"
                >
                  {payMutation.isPending ? 'Recording Payment…' : 'Mark Run Paid'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!isAdmin || voidMutation.isPending}
                  onClick={() => {
                    const reason = window.prompt('Reason for voiding this payroll run:')?.trim()
                    if (reason) voidMutation.mutate(reason)
                  }}
                  className="border-danger/40 text-danger hover:bg-danger/5"
                >
                  {voidMutation.isPending ? 'Voiding…' : 'Void run'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  type="button"
                  disabled={!activeRun || activeRun.status === 'APPROVED' || approveMutation.isPending}
                  onClick={() => { setPayrollActionError(null); approveMutation.mutate() }}
                  className="shadow-sm"
                >
                  {activeRun?.status === 'APPROVED' ? 'Pay Run Approved' : 'Approve Pay Run'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!activeRun || !isAdmin || voidMutation.isPending}
                  onClick={() => {
                    const reason = window.prompt('Reason for voiding this payroll run:')?.trim()
                    if (reason) voidMutation.mutate(reason)
                  }}
                  className="border-danger/40 text-danger hover:bg-danger/5"
                >
                  {voidMutation.isPending ? 'Voiding…' : 'Void run'}
                </Button>
              </div>
            )}

            {/* + New Payroll Run Button */}
            <Button
              size="sm"
              type="button"
              onClick={openNewRunDialog}
              disabled={!isAdmin}
              title={isAdmin ? undefined : 'Requires the ADMIN role'}
              className="gap-1.5 shadow-sm"
            >
              <Plus size={14} /> New Payroll Run
            </Button>
          </div>
        </div>
      </div>

      {payrollActionError && (
        <Alert variant="destructive" className="-mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{payrollActionError}</AlertDescription>
        </Alert>
      )}

      {/* ── KPI Grid (12-column grid, col-span-4 each, gap-5) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-12 gap-5 flex-shrink-0">
        <div className="lg:col-span-4 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-[92px] flex flex-col justify-start" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Total Gross</p>
          <p className="min-w-0 text-2xl font-bold text-heading mt-3.5 leading-none tracking-tight" style={{ fontSize: metricFontSize(totals.gross) }}>{money(totals.gross)}</p>
        </div>

        <div className="lg:col-span-4 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-[92px] flex flex-col justify-start" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Taxes & Deductions</p>
          <p className="min-w-0 text-2xl font-bold text-heading mt-3.5 leading-none tracking-tight" style={{ fontSize: metricFontSize(totals.deductions) }}>{money(totals.deductions)}</p>
        </div>

        <div className="lg:col-span-4 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-[92px] flex flex-col justify-start" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Total Net</p>
          <p className="min-w-0 text-2xl font-bold text-heading mt-3.5 leading-none tracking-tight" style={{ fontSize: metricFontSize(totals.net) }}>{money(totals.net)}</p>
        </div>
      </div>

      {roundingReviewOpen && (
        <section aria-label="Year-end rounding review" className="flex-shrink-0 max-h-[35vh] overflow-y-auto rounded-card border border-border-default bg-surface-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-heading">Earning-year rounding review</h2>
              <p className="mt-1 max-w-3xl text-xs text-muted">Compares summed deductions on paid runs with one currency-precision rounding over gross for each employee, currency, and unchanged saved rate schedule. This is a review of rounding differences, not a statutory tax calculation or an adjustment to payroll.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs sm:text-sm text-body">
                <span>Period start year</span>
                <input type="number" min="2000" max="2100" value={roundingYear} onChange={event => setRoundingYear(event.target.value)} className="w-24 rounded-input border border-border-default bg-surface-raised px-2 py-1 text-xs sm:text-sm" />
              </label>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label="Close rounding review"
                onClick={() => setRoundingReviewOpen(false)}
                className="h-7 w-7 text-muted hover:text-heading"
                title="Close rounding review"
              >
                <X size={15} />
              </Button>
            </div>
          </div>
          {isLoadingRoundingReview && <p className="mt-3 text-xs text-muted">Calculating rounding differences…</p>}
          {isRoundingReviewError && <p role="alert" className="mt-3 text-xs text-danger">{roundingReviewError?.message || 'Could not load the rounding review.'}</p>}
          {roundingReview && !isLoadingRoundingReview && !isRoundingReviewError && (() => {
            const differences = roundingReview.groups.filter(group => [group.variance, ...group.taxLines.map(line => line.variance)].some(value => Number(value) !== 0))
            return (
              <>
                <p className="mt-2 text-xs text-muted">{roundingReview.groups.length} rate groups reviewed · {roundingReview.excludedManualOverrideLines} {roundingReview.excludedManualOverrideLines === 1 ? 'line' : 'lines'} with manual tax overrides excluded · {roundingReview.excludedUnknownCurrencyLines} {roundingReview.excludedUnknownCurrencyLines === 1 ? 'line' : 'lines'} with unknown currency excluded.</p>
                {differences.length === 0 ? (
                  <p className="mt-2 text-xs text-body">No rounding-only differences were found for {roundingReview.year} paid earning periods.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded-button border border-border-default bg-surface-raised">
                    <Table className="w-full text-left text-xs">
                      <TableHeader className="bg-surface-muted text-muted">
                        <TableRow className="hover:bg-transparent border-0">
                          <TableHead className="px-3 py-2 text-left rtl:text-right">Employee / rate schedule</TableHead>
                          <TableHead className="px-3 py-2 text-left rtl:text-right">Paid lines</TableHead>
                          <TableHead className="px-3 py-2 text-left rtl:text-right">Gross</TableHead>
                          <TableHead className="px-3 py-2 text-left rtl:text-right">Recorded deductions</TableHead>
                          <TableHead className="px-3 py-2 text-left rtl:text-right">Aggregate-rounded</TableHead>
                          <TableHead className="px-3 py-2 text-left rtl:text-right">Variance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border-subtle">{differences.map((group, index) => (
                        <TableRow key={`${group.employeeId}-${index}`} className="border-0">
                          <TableCell className="px-3 py-2"><p className="font-medium text-heading">{group.employeeName}</p><p className="mt-0.5 text-muted">{group.taxRates.map(rate => `${rate.label} ${rate.rate}%`).join(' · ')} · {group.currency}</p><details className="mt-1"><summary className="cursor-pointer text-muted">Tax-line detail</summary><ul className="mt-1 space-y-1">{group.taxLines.map(line => <li key={line.label}>{line.label}: {formatMoney(line.recorded, { currency: group.currency })} recorded · {formatMoney(line.aggregateRounded, { currency: group.currency })} aggregate · variance {formatMoney(line.variance, { currency: group.currency })}</li>)}</ul></details></TableCell>
                          <TableCell className="px-3 py-2 text-body">{group.paidLineCount}</TableCell><TableCell className="px-3 py-2 text-body tabular-nums" title={formatMoney(group.grossTotal, { currency: group.currency })}>{formatCompactTableMoney(group.grossTotal, { currency: group.currency })}</TableCell><TableCell className="px-3 py-2 text-body tabular-nums" title={formatMoney(group.recordedDeductions, { currency: group.currency })}>{formatCompactTableMoney(group.recordedDeductions, { currency: group.currency })}</TableCell><TableCell className="px-3 py-2 text-body tabular-nums" title={formatMoney(group.aggregateRoundedDeductions, { currency: group.currency })}>{formatCompactTableMoney(group.aggregateRoundedDeductions, { currency: group.currency })}</TableCell><TableCell className="px-3 py-2 font-semibold text-heading tabular-nums" title={formatMoney(group.variance, { currency: group.currency })}>{formatCompactTableMoney(group.variance, { currency: group.currency })}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                )}
              </>
            )
          })()}
        </section>
      )}

      {/* ── Main Workspace: Table (col-span-8) & Right Inspector Panel (col-span-4) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Table Card (col-span-8) */}
        <div className="lg:col-span-8 min-w-0 h-[510px] bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm">
                  <Loader2 size={16} className="animate-spin" /> Loading payroll…
                </div>
              )}
              {isError && (
                <div className="p-6 text-sm text-danger text-center">
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
                <Table className="w-full table-fixed text-left border-collapse">
                  <colgroup>
                    <col className="w-[35%]" />
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                    <col className="w-[16%]" />
                    <col className="w-[13%] min-w-[85px]" />
                  </colgroup>
                  <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="px-4 py-2.5 text-left rtl:text-right bg-surface-muted">Employee</TableHead>
                      <TableHead className="px-4 py-2.5 text-right rtl:text-left bg-surface-muted">Gross</TableHead>
                      <TableHead className="px-4 py-2.5 text-right rtl:text-left bg-surface-muted">Deductions</TableHead>
                      <TableHead className="px-4 py-2.5 text-right rtl:text-left bg-surface-muted">Net</TableHead>
                      <TableHead className="px-4 py-2.5 bg-surface-muted text-right rtl:text-left" />
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {records.map(record => {
                      const isSelected = selectedId === record.id
                      return (
                        <TableRow
                          key={record.id}
                          onClick={() => {
                            setSelectedId(record.id)
                            setPayslipError(null)
                          }}
                          className={`cursor-pointer transition-colors border-0 ${
                            isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted/60'
                          }`}
                        >
                          <TableCell className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0">
                                {(record.employee?.name || '?').charAt(0)}
                              </div>
                              <div className="min-w-0 truncate">
                                <p className="text-sm font-semibold text-heading truncate">{record.employee?.name}</p>
                                <p className="text-[11px] text-muted truncate">{record.employee?.title || '—'}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3.5 text-xs sm:text-sm text-body text-right rtl:text-left tabular-nums truncate" title={money(record.gross)}>{compactMoney(record.gross)}</TableCell>
                          <TableCell className="px-4 py-3.5 text-xs sm:text-sm text-body text-right rtl:text-left tabular-nums truncate" title={formatNegativeDeduction(record.deductions, run?.currency)}>{formatCompactNegativeDeduction(record.deductions, run?.currency)}</TableCell>
                          <TableCell className="px-4 py-3.5 text-xs sm:text-sm font-semibold text-heading text-right rtl:text-left tabular-nums truncate" title={money(record.net)}>{compactMoney(record.net)}</TableCell>
                          <TableCell className="px-4 py-3.5 text-right rtl:text-left whitespace-nowrap">
                            <div className="flex items-center justify-end whitespace-nowrap">
                              <PayslipButton
                                runId={activeRunId}
                                lineId={record.id}
                                onSelect={() => setSelectedId(record.id)}
                                onNotifyError={setPayslipError}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Right Inspector Panel (col-span-4) */}
          <div className="lg:col-span-4 min-w-0 h-[510px] bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
            {!selectedRecord ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted">
                Select a payroll line to inspect breakdown.
              </div>
            ) : (
              <>
                {/* Fixed Inspector Header */}
                <div className="flex-shrink-0 p-5 border-b border-border-subtle bg-surface-raised">
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 leading-none">Selected Line</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-sm font-bold text-heading shrink-0">
                      {(selectedRecord.employee?.name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-base font-bold text-heading truncate">{selectedRecord.employee?.name}</h2>
                      <p className="text-xs text-muted truncate">{selectedRecord.employee?.title || '—'}</p>
                    </div>
                  </div>

                  {/* Side-by-side Edit payroll inputs and Payslip button */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={openLineEditor}
                      disabled={!isAdmin || !activeRun || ['APPROVED', 'PAID'].includes(activeRun.status)}
                      title={!isAdmin ? 'Requires the ADMIN role' : 'Adjust inputs and recalculate this line'}
                      className="flex-1 text-xs"
                    >
                      Edit payroll inputs
                    </Button>
                    <div className="shrink-0">
                      <PayslipButton
                        runId={activeRunId}
                        lineId={selectedRecord.id}
                        onNotifyError={setPayslipError}
                      />
                    </div>
                  </div>
                  {payslipError && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{payslipError}</AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Scrollable Inspector Breakdown */}
                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
                  {/* Subtle 1px divider above EARNINGS */}
                  <div className="border-t border-slate-100 my-3" />

                  <div>
                    <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-2">Earnings</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Period base pay</span>
                        <span className="font-semibold text-heading tabular-nums">{money(selectedRecord.baseSalary ?? selectedRecord.gross)}</span>
                      </div>
                      {selectedRecord.salaryRateSegments?.length <= 1 && selectedRecord.sourceSalary != null && (
                        <p className="text-[11px] text-muted leading-relaxed">
                          Source salary: {money(selectedRecord.sourceSalary)} {selectedRecord.salaryBasis?.toLowerCase()} · {run?.periodsPerYear} periods/year · {selectedRecord.eligibleDays}/{selectedRecord.periodDays} eligible calendar days. Period base pay may include manual adjustments.
                        </p>
                      )}
                      {selectedRecord.salaryRateSegments?.length > 1 && (
                        <div className="text-[11px] text-muted">
                          <p className="font-medium text-body">Effective salary rates used · {selectedRecord.eligibleDays}/{selectedRecord.periodDays} eligible days</p>
                          <ul className="mt-1 space-y-0.5">
                            {selectedRecord.salaryRateSegments.map(segment => (
                              <li key={segment.effectiveFrom}>
                                {money(segment.salary)} {segment.salaryBasis.toLowerCase()} from {formatDate(segment.effectiveFrom)} · {segment.eligibleDays} eligible days
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Missed days ({selectedRecord.missedDaysCount || 0})</span>
                        <span className="font-semibold text-heading tabular-nums">{formatNegativeDeduction(selectedRecord.missedDaysAmount || '0', run?.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Bonus {selectedRecord.bonusLabel ? `(${selectedRecord.bonusLabel})` : ''}</span>
                        <span className="font-semibold text-heading tabular-nums">{money(selectedRecord.bonusAmount || '0')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Subtle horizontal divider above Taxes & Deductions */}
                  <div className="border-t border-slate-100 my-3" />

                  <div>
                    <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-2">Taxes & Deductions</p>
                    <div className="space-y-1.5">
                      {(selectedRecord.taxLines || []).map(tax => (
                        <div key={tax.id} className="flex justify-between text-xs">
                          <span className="text-muted flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
                            {tax.label}
                          </span>
                          <span className="font-semibold text-heading tabular-nums">{formatNegativeDeduction(tax.amount, run?.currency)}</span>
                        </div>
                      ))}
                      {(!selectedRecord.taxLines || selectedRecord.taxLines.length === 0) && (
                        <p className="text-[11px] text-muted">No tax lines recorded for this employee.</p>
                      )}
                    </div>
                  </div>

                  {/* Subtle horizontal divider above Net Pay */}
                  <div className="border-t border-slate-100 my-3" />

                  <div className="flex justify-between items-center text-sm font-bold pt-0.5">
                    <span className="text-heading">Net Pay</span>
                    <span className="text-accent text-base tabular-nums">{money(selectedRecord.net)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      <FormDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="New payroll run"
        subtitle="Calculate pay for an explicit earning period. Existing employee salary bases take precedence."
        confirmLabel="Create run"
        busy={createRunMutation.isPending}
        onConfirm={submitNewRun}
        width="max-w-xl"
      >
        <div className="space-y-5">
          {savedRetryAvailable && <div role="status" className="flex items-start justify-between gap-3 rounded-input border border-accent/30 bg-accent/5 p-3 text-xs text-body">
            <span>A previous request may have reached the server before its response was lost. Retry unchanged to reuse its request key; changing details creates a new request.</span>
            <Button variant="link" size="sm" type="button" onClick={discardSavedRetry} className="h-auto p-0 font-semibold text-accent hover:underline shrink-0">Discard saved retry</Button>
          </div>}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="payroll-salary-basis" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Unspecified salary basis</label>
              <Select
                value={periodForm.salaryBasis || '__unassigned__'}
                onValueChange={val => setPeriodForm(current => ({ ...current, salaryBasis: val === '__unassigned__' ? '' : val }))}
              >
                <SelectTrigger id="payroll-salary-basis" className="h-9 w-full text-sm">
                  <SelectValue placeholder="Confirm salary basis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Confirm salary basis</SelectItem>
                  <SelectItem value="ANNUAL">Annual salary</SelectItem>
                  <SelectItem value="MONTHLY">Monthly salary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="payroll-frequency" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Pay frequency</label>
              <Select
                value={periodForm.payFrequency}
                onValueChange={payFrequency => setPeriodForm(current => ({
                  ...current,
                  payFrequency,
                  periodsPerYear: { MONTHLY: 12, SEMIMONTHLY: 24, BIWEEKLY: 26, WEEKLY: 52 }[payFrequency]
                }))}
              >
                <SelectTrigger id="payroll-frequency" className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="SEMIMONTHLY">Twice monthly</SelectItem>
                  <SelectItem value="BIWEEKLY">Every two weeks</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="payroll-period-start" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Earning period start</label>
              <input id="payroll-period-start" type="date" value={periodForm.periodStart} onChange={event => setPeriodForm(current => ({ ...current, periodStart: event.target.value }))} className={DIALOG_INPUT} />
            </div>
            <div>
              <label htmlFor="payroll-period-end" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Earning period end</label>
              <input id="payroll-period-end" type="date" value={periodForm.periodEnd} onChange={event => setPeriodForm(current => ({ ...current, periodEnd: event.target.value }))} className={DIALOG_INPUT} />
            </div>
            <div>
              <label htmlFor="payroll-annual-periods" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Periods per year</label>
              <Select
                value={String(periodForm.periodsPerYear)}
                onValueChange={val => setPeriodForm(current => ({ ...current, periodsPerYear: Number(val) }))}
              >
                <SelectTrigger id="payroll-annual-periods" className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {({ MONTHLY: [12], SEMIMONTHLY: [24], BIWEEKLY: [26, 27], WEEKLY: [52, 53] }[periodForm.payFrequency]).map(count => (
                    <SelectItem key={count} value={String(count)}>{count}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted">Equal-period pay is rounded once. Mid-period hires are prorated by inclusive calendar days; leave and other deductions remain explicit line adjustments. Choose 27/53 periods for a payroll calendar that requires them.</p>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => removeTaxRate(index)}
                    disabled={taxRates.length === 1}
                    aria-label={`Remove tax rate ${index + 1}`}
                    title={taxRates.length === 1 ? 'At least one rate is required' : 'Remove rate'}
                    className="h-8 w-8 text-caption hover:text-danger p-0 flex-shrink-0 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={addTaxRate}
                className="h-auto p-0 text-sm font-medium text-accent hover:text-accent-hover hover:bg-transparent"
              >
                <Plus size={14} className="mr-1" /> Add rate
              </Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
              Employees{' '}
              <span className="normal-case text-caption font-medium">({selectedEmployeeIds.size} selected)</span>
            </p>
            <Input
              type="search"
              value={employeeSearch}
              onChange={event => { setEmployeeSearch(event.target.value); setEmployeePage(1) }}
              placeholder="Search employees by name, title, email, or employee number"
              aria-label="Search employees for payroll"
              className="mb-2"
            />
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
                    <Checkbox
                      checked={selectedEmployeeIds.has(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                    />
                    <span className="font-medium text-heading">{emp.name}</span>
                    <span className="text-xs text-muted truncate">{emp.title}</span>
                  </label>
                ))
              )}
            </div>
            {employeeData?.pagination && <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{employeeData.pagination.total} matching employee(s) - page {employeePage} of {employeePages}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" type="button" disabled={employeePage <= 1 || isLoadingEmployees} onClick={() => setEmployeePage(page => page - 1)} className="h-7 px-2 text-xs">Previous</Button>
                <Button variant="outline" size="sm" type="button" disabled={employeePages === 0 || employeePage >= employeePages || isLoadingEmployees} onClick={() => setEmployeePage(page => page + 1)} className="h-7 px-2 text-xs">Next</Button>
              </div>
            </div>}
          </div>

          {dialogError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{dialogError}</AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>
      <FormDialog
        open={isLineDialogOpen}
        onClose={() => setIsLineDialogOpen(false)}
        title={`Adjust ${selectedRecord?.employee?.name || 'payroll line'}`}
        subtitle="The server recalculates gross, deductions, and net using this run’s tax rates."
        confirmLabel="Recalculate line"
        busy={adjustLineMutation.isPending}
        onConfirm={submitLineAdjustment}
        width="max-w-lg"
      >
        <div className="space-y-4">
          {[
            ['baseSalary', 'Period base pay', 'text'],
            ['missedDaysCount', 'Missed days', 'number'],
            ['missedDaysAmount', 'Missed days deduction', 'text'],
            ['bonusLabel', 'Bonus label', 'text'],
            ['bonusAmount', 'Bonus amount', 'text'],
          ].map(([field, labelText, type]) => (
            <label key={field} className="block text-xs font-bold uppercase tracking-wider text-muted">{labelText}
              <Input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} inputMode={type === 'text' && field !== 'bonusLabel' ? 'decimal' : undefined} value={lineForm[field]} onChange={event => setLineForm(current => ({ ...current, [field]: event.target.value }))} className="mt-1 normal-case font-normal tracking-normal" />
            </label>
          ))}
          {adjustLineMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{adjustLineMutation.error?.message || 'Unable to recalculate this line.'}</AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>
      <StatutoryTaxCalculator
        isOpen={statutoryCalculatorOpen}
        onClose={() => setStatutoryCalculatorOpen(false)}
      />
    </div>
  )
}
