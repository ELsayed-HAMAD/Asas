import type {
  Employee,
  PayrollLine,
  PayrollRun,
  PayrollRunListItem,
  PayrollRunStatus,
} from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Toaster, toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/http.js'
import { hrApi } from '@/lib/api/hr.js'
import { formatDate, formatMoney } from '@/lib/format.js'
import { downloadBlob } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

const STATUS_META: Record<PayrollRunStatus, { label: string; variant: 'secondary' | 'warning' | 'success' | 'info' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  PENDING: { label: 'Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  PAID: { label: 'Paid', variant: 'info' },
}

function statusMeta(status: PayrollRunStatus) {
  return STATUS_META[status] ?? { label: status, variant: 'secondary' as const }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function money(value: string | null | undefined): string {
  return value == null || value === '' ? '—' : formatMoney(value)
}

/**
 * The payroll surface — the runs list, the payslip (a run's lines with their tax split),
 * creating a run, approving one, and adjusting a line. All four are real mutations against
 * `/api/v1/hr/payroll/*`; the run's money is what the API priced through `@asas/domain`, never
 * recomputed here.
 *
 * Privileged actions are *predicted* client-side from `useMyRole()` so a MEMBER never sees the
 * Approve/Adjust buttons (the server still 403s them — see the hook's doc comment) and invalid
 * state cannot happen client-side.
 */
export function PayrollRunsPage() {
  const queryClient = useQueryClient()
  const role = useMyRole()
  const isAdmin = role === 'ADMIN' || role === 'OWNER'

  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const status = (statusFilter || undefined) as PayrollRunStatus | undefined

  const { data: runs, isLoading: runsLoading, isError: runsError } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.list({ status }),
    queryFn: () => hrApi.listPayrollRuns({ status, limit: 100 }),
  })

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.detail(selectedRunId ?? ''),
    queryFn: () => hrApi.getPayrollRun(selectedRunId!),
    enabled: selectedRunId !== null,
  })

  const { data: employees } = useQuery({
    queryKey: queryKeys.hr.employees.list({ limit: 100 }),
    queryFn: () => hrApi.listEmployees({ limit: 100 }),
    enabled: isAdmin,
  })

  const createRun = useMutation({
    mutationFn: (input: Parameters<typeof hrApi.createPayrollRun>[0]) => hrApi.createPayrollRun(input),
    onSuccess: run => {
      toast({ title: 'Payroll run priced', description: `${run.lines.length} line(s) — pending approval.` })
      setCreateOpen(false)
      setSelectedRunId(run.id)
    },
    onError: error => toast({ variant: 'error', title: 'Could not create the run', description: errorMessage(error, 'Try again.') }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })

  const approveRun = useMutation({
    mutationFn: (runId: string) => hrApi.approvePayrollRun(runId),
    onSuccess: run => toast({ title: 'Run approved', description: run.label }),
    onError: error => toast({ variant: 'error', title: 'Could not approve', description: errorMessage(error, 'Try again.') }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })

  const adjustLine = useMutation({
    mutationFn: ({ runId, lineId, input }: { runId: string; lineId: string; input: Parameters<typeof hrApi.adjustPayrollLine>[2] }) =>
      hrApi.adjustPayrollLine(runId, lineId, input),
    onSuccess: () => toast({ title: 'Line adjusted', description: 'The run was re-priced from its stored tax rates.' }),
    onError: error => toast({ variant: 'error', title: 'Could not adjust the line', description: errorMessage(error, 'Try again.') }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })

  const downloadPayslip = async (runId: string, line: PayrollLine): Promise<void> => {
    const blob = await hrApi.downloadPayslip(runId, line.id)
    downloadBlob(blob, `payslip-${line.employee.name}.pdf`)
  }

  const summary = runs?.summary

  const columns = useMemo<ColumnDef<PayrollRunListItem>[]>(
    () => [
      {
        accessorKey: 'label',
        header: 'Run',
        cell: ({ row }) => <span className="font-medium text-[var(--color-heading)]">{row.original.label}</span>,
      },
      {
        accessorKey: 'payDate',
        header: 'Pay date',
        cell: ({ row }) => (row.original.payDate ? formatDate(row.original.payDate) : '—'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const meta = statusMeta(row.original.status)
          return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
      },
      {
        accessorKey: 'lineCount',
        header: 'Lines',
        cell: ({ row }) => <span className="tabular-nums">{row.original.lineCount}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => <span className="text-[var(--color-muted)]">{formatDate(row.original.createdAt)}</span>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setSelectedRunId(row.original.id)}>
            View payslips
          </Button>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Payroll</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Runs are priced server-side from each employee's salary and the run's tax rates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter || 'all'} onValueChange={value => setStatusFilter(value === 'all' ? '' : value)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New run
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total runs</CardDescription>
            <CardTitle className="text-3xl">{summary?.totalRuns ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Awaiting approval</CardDescription>
            <CardTitle className="text-3xl">{summary?.pendingCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Gross paid (all time)</CardDescription>
            <CardTitle className="text-3xl">{money(summary?.totalGross)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Net paid (all time)</CardDescription>
            <CardTitle className="text-3xl">{money(summary?.totalNet)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {runsError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load payroll runs.</p>
          ) : runsLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : (
            <DataTable columns={columns} data={runs?.items ?? []} pageSize={10} />
          )}
        </CardContent>
      </Card>

      {selectedRunId !== null && (
        <RunDetail
          run={detail}
          loading={detailLoading}
          isAdmin={isAdmin}
          approving={approveRun.isPending}
          adjusting={adjustLine.isPending}
          onBack={() => setSelectedRunId(null)}
          onApprove={runId => approveRun.mutate(runId)}
          onAdjust={variables => adjustLine.mutate(variables)}
          onDownloadPayslip={line => (selectedRunId ? downloadPayslip(selectedRunId, line) : Promise.resolve())}
        />
      )}

      <CreateRunDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        employees={employees?.items ?? []}
        busy={createRun.isPending}
        onSubmit={input => createRun.mutate(input)}
      />

      <Toaster />
    </div>
  )
}

function RunDetail({
  run,
  loading,
  isAdmin,
  approving,
  adjusting,
  onBack,
  onApprove,
  onAdjust,
  onDownloadPayslip,
}: {
  run: PayrollRun | undefined
  loading: boolean
  isAdmin: boolean
  approving: boolean
  adjusting: boolean
  onBack: () => void
  onApprove: (runId: string) => void
  onAdjust: (variables: { runId: string; lineId: string; input: Parameters<typeof hrApi.adjustPayrollLine>[2] }) => void
  onDownloadPayslip: (line: PayrollLine) => Promise<void>
}) {
  const [adjustedLine, setAdjustedLine] = useState<PayrollLine | null>(null)
  const canAdjust = isAdmin && run != null && (run.status === 'PENDING' || run.status === 'DRAFT')

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-3">
            Payslips — {run?.label ?? '…'}
            {run && (
              <Badge variant={statusMeta(run.status).variant}>{statusMeta(run.status).label}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {run?.payDate ? `Pay date ${formatDate(run.payDate)} · ` : ''}
            {run ? `${run.lines.length} line(s)` : 'Loading…'}
            {canAdjust ? '' : ' — prices are final until a correction run.'}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && run?.status === 'PENDING' && (
            <Button size="sm" disabled={approving} onClick={() => onApprove(run.id)}>
              {approving ? 'Approving…' : 'Approve run'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onBack}>
            <X /> Close
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !run ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : run.lines.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">This run has no lines.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card-sm)] border border-[var(--color-border-default)]">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-muted)] text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3 text-right">Base</th>
                  <th className="px-4 py-3 text-right">Missed days</th>
                  <th className="px-4 py-3 text-right">Bonus</th>
                  <th className="px-4 py-3">Deductions</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Net</th>
                  <th className="px-4 py-3 text-right">Payslip</th>
                  {canAdjust && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-faint)]">
                {run.lines.map(line => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-heading)]">{line.employee.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">{line.employee.title}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(line.baseSalary)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {line.missedDaysCount != null ? `${line.missedDaysCount} day(s) · ${money(line.missedDaysAmount)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {line.bonusAmount != null ? (
                        <span>
                          {line.bonusLabel ? `${line.bonusLabel} · ` : ''}
                          {formatMoney(line.bonusAmount)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {line.taxLines.map(taxLine => (
                          <p key={taxLine.id} className="text-xs text-[var(--color-muted)]">
                            {taxLine.label}: {formatMoney(taxLine.amount)}
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(line.gross)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--color-heading)]">
                      {formatMoney(line.net)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onDownloadPayslip(line)
                            .then(() => toast({ title: 'Payslip downloaded', description: line.employee.name }))
                            .catch(error =>
                              toast({
                                variant: 'error',
                                title: 'Could not download the payslip',
                                description: errorMessage(error, 'Try again.'),
                              }),
                            )
                        }
                      >
                        PDF
                      </Button>
                    </td>
                    {canAdjust && (
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" disabled={adjusting} onClick={() => setAdjustedLine(line)}>
                          Adjust
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {adjustedLine && run && (
          <AdjustLineDialog
            run={run}
            line={adjustedLine}
            busy={adjusting}
            onClose={() => setAdjustedLine(null)}
            onSubmit={input => {
              onAdjust({ runId: run.id, lineId: adjustedLine.id, input })
              setAdjustedLine(null)
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

function CreateRunDialog({
  open,
  onOpenChange,
  employees,
  busy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: Employee[]
  busy: boolean
  onSubmit: (input: Parameters<typeof hrApi.createPayrollRun>[0]) => void
}) {
  const [label, setLabel] = useState('')
  const [payDate, setPayDate] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rates, setRates] = useState<{ label: string; rate: string }[]>([{ label: 'Pension', rate: '10' }])

  const pinnable = useMemo(() => employees.filter(employee => employee.salary != null), [employees])
  const skipped = employees.length - pinnable.length

  const canSubmit =
    label.trim().length > 0 &&
    selected.size > 0 &&
    rates.length > 0 &&
    rates.every(rate => rate.label.trim().length > 0 && Number(rate.rate) >= 0)

  function toggleEmployee(id: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateRate(index: number, patch: Partial<{ label: string; rate: string }>) {
    setRates(current => current.map((rate, i) => (i === index ? { ...rate, ...patch } : rate)))
  }

  function reset() {
    setLabel('')
    setPayDate('')
    setSelected(new Set())
    setRates([{ label: 'Pension', rate: '10' }])
  }

  function submit() {
    if (!canSubmit) return
    onSubmit({
      label: label.trim(),
      payDate: payDate || null,
      taxRates: rates.map(rate => ({ label: rate.label.trim(), rate: String(Number(rate.rate)) })),
      employeeIds: [...selected],
    })
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New payroll run</DialogTitle>
          <DialogDescription>
            Every selected employee is priced from their stored salary through the tax rates below —
            the server computes gross, the split, and net.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
              Label
              <Input value={label} onChange={event => setLabel(event.target.value)} placeholder="September pay" />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
              Pay date (optional)
              <Input type="date" value={payDate} onChange={event => setPayDate(event.target.value)} />
            </label>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-medium text-[var(--color-body)]">
              Employees to pay <span className="text-[var(--color-muted)]">({selected.size} selected)</span>
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-[var(--radius-card-sm)] border border-[var(--color-border-default)] p-2">
              {pinnable.length === 0 ? (
                <p className="p-2 text-sm text-[var(--color-muted)]">No employees with a salary on file yet.</p>
              ) : (
                pinnable.map(employee => (
                  <label
                    key={employee.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-[var(--radius-card-sm)] px-2 py-1.5 text-sm hover:bg-[var(--color-surface-muted)]',
                      selected.has(employee.id) && 'bg-[var(--color-surface-active)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(employee.id)}
                      onChange={() => toggleEmployee(employee.id)}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="text-[var(--color-heading)]">{employee.name}</span>
                    <span className="text-xs text-[var(--color-muted)]">{employee.title}</span>
                    <span className="ml-auto text-xs tabular-nums text-[var(--color-muted)]">
                      {formatMoney(employee.salary, { compact: true })}
                    </span>
                  </label>
                ))
              )}
            </div>
            {skipped > 0 && (
              <p className="text-xs text-[var(--color-warning-text)]">
                {skipped} employee(s) skipped — no salary on file yet.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-medium text-[var(--color-body)]">Tax rates (percent of gross)</p>
            {rates.map((rate, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={rate.label}
                  onChange={event => updateRate(index, { label: event.target.value })}
                  placeholder="Label (e.g. Pension)"
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={rate.rate}
                  onChange={event => updateRate(index, { rate: event.target.value })}
                  className="w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={rates.length === 1}
                  onClick={() => setRates(current => current.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRates(current => [...current, { label: '', rate: '' }])}>
              <Plus /> Add rate
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || busy} onClick={submit}>
            {busy ? 'Pricing…' : `Price ${selected.size || 0} line(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AdjustLineDialog({
  run,
  line,
  busy,
  onClose,
  onSubmit,
}: {
  run: PayrollRun
  line: PayrollLine
  busy: boolean
  onClose: () => void
  onSubmit: (input: Parameters<typeof hrApi.adjustPayrollLine>[2]) => void
}) {
  const [baseSalary, setBaseSalary] = useState(line.baseSalary ?? '')
  const [missedDaysCount, setMissedDaysCount] = useState(line.missedDaysCount?.toString() ?? '')
  const [missedDaysAmount, setMissedDaysAmount] = useState(line.missedDaysAmount ?? '')
  const [bonusLabel, setBonusLabel] = useState(line.bonusLabel ?? '')
  const [bonusAmount, setBonusAmount] = useState(line.bonusAmount ?? '')

  const base = Number(baseSalary)
  const valid = baseSalary !== '' && Number.isFinite(base) && base > 0

  function submit() {
    if (!valid) return
    onSubmit({
      baseSalary: String(base),
      missedDaysCount: missedDaysCount === '' ? null : Number(missedDaysCount),
      missedDaysAmount: missedDaysAmount === '' ? null : String(Number(missedDaysAmount)),
      bonusLabel: bonusLabel === '' ? null : bonusLabel.trim(),
      bonusAmount: bonusAmount === '' ? null : String(Number(bonusAmount)),
    })
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Adjust — {line.employee.name}</SheetTitle>
          <SheetDescription>
            {run.label}: change the inputs; the server recomputes gross, the split, and net with
            the run's stored tax rates.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Base salary
            <Input type="number" min="0" step="0.01" value={baseSalary} onChange={event => setBaseSalary(event.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
              Missed days (count)
              <Input
                type="number"
                min="0"
                step="1"
                value={missedDaysCount}
                onChange={event => setMissedDaysCount(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
              Missed days (amount)
              <Input
                type="number"
                min="0"
                step="0.01"
                value={missedDaysAmount}
                onChange={event => setMissedDaysAmount(event.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
              Bonus label
              <Input value={bonusLabel} onChange={event => setBonusLabel(event.target.value)} placeholder="e.g. Spot bonus" />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
              Bonus amount
              <Input type="number" min="0" step="0.01" value={bonusAmount} onChange={event => setBonusAmount(event.target.value)} />
            </label>
          </div>
        </div>

        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline" disabled={busy}>
              Cancel
            </Button>
          </SheetClose>
          <Button disabled={!valid || busy} onClick={submit}>
            {busy ? 'Repricing…' : 'Save & re-price'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
