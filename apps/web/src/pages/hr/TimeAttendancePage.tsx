import type {
  AttendanceExceptionRow,
  AttendanceResponse,
  LeaveRequestRow,
  LeaveRequestWriteInput,
} from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { Toaster, toast } from '@/components/ui/toast'
import type { ColumnDef } from '@tanstack/react-table'
import { ApiError } from '@/lib/api/http.js'
import { hrApi } from '@/lib/api/hr.js'
import { formatDate, formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

const EXCEPTION_LABELS: Record<string, string> = {
  MISSING_IN: 'Missing clock-in',
  MISSING_OUT: 'Missing clock-out',
  OVERTIME: 'Overtime',
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  VACATION: 'Vacation',
  SICK: 'Sick',
  PERSONAL: 'Personal',
}

const STATUS_VARIANTS = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
} as const

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * Time & attendance — the surface the rebuild plan's Phase 2 called out specifically:
 *
 * The legacy page derived exceptions from `new Date('2000-01-01 ' + day.clockIn)` and computed
 * the attendance rate in the browser from a broken `late` flag. Here, every number is real:
 *
 *  - **Exceptions** are `AttendanceException` rows (MISSING_IN/MISSING_OUT/OVERTIME) read from
 *    the table, not derived from timesheet clock strings.
 *  - **Attendance rate** is a SQL aggregate the server computed (`100 * (1 - exceptions /
 *    expectedDays)`), shown as "—" when there is no timesheet data.
 *  - **Leave requests** are real rows with a working "Request leave" dialog.
 */
export function TimeAttendancePage() {
  const isAdmin = useMyRole() === 'ADMIN' || useMyRole() === 'OWNER'

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.hr.attendance.all(),
    queryFn: () => hrApi.listAttendance(),
  })

  const exceptions = useMemo(() => data?.exceptions ?? [], [data])
  const leaveRequests = useMemo(() => data?.leaveRequests ?? [], [data])
  const summary = data?.summary

  const exceptionColumns = useMemo<ColumnDef<AttendanceExceptionRow>[]>(
    () => [
      {
        accessorKey: 'employeeName',
        header: 'Employee',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-heading)]">{row.original.employeeName}</span>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant={row.original.type === 'OVERTIME' ? 'info' : 'warning'}>
            {EXCEPTION_LABELS[row.original.type] ?? row.original.type}
          </Badge>
        ),
      },
      {
        accessorKey: 'label',
        header: 'Details',
        cell: ({ row }) => (
          <span className="text-sm text-[var(--color-body)]">{row.original.label}</span>
        ),
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-[var(--color-muted)]">
            {formatDate(row.original.date)}
          </span>
        ),
      },
    ],
    [],
  )

  const leaveColumns = useMemo<ColumnDef<LeaveRequestRow>[]>(
    () => [
      {
        accessorKey: 'employeeName',
        header: 'Employee',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-heading)]">{row.original.employeeName}</span>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="secondary">
            {LEAVE_TYPE_LABELS[row.original.type] ?? row.original.type}
          </Badge>
        ),
      },
      {
        accessorKey: 'startDate',
        header: 'Start',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-[var(--color-muted)]">
            {formatDate(row.original.startDate)}
          </span>
        ),
      },
      {
        accessorKey: 'endDate',
        header: 'End',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-[var(--color-muted)]">
            {row.original.endDate ? formatDate(row.original.endDate) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'secondary'}>
            {row.original.status.charAt(0) + row.original.status.slice(1).toLowerCase()}
          </Badge>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Time & attendance</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Exceptions and leave requests, with attendance rate computed from real data.
          </p>
        </div>
        {isAdmin && <LeaveRequestDialog />}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Attendance rate</CardDescription>
            <CardTitle className="text-3xl">
              {summary?.attendanceRate != null ? formatPercent(summary.attendanceRate) : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Exceptions</CardDescription>
            <CardTitle className="text-3xl">{summary?.exceptionCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>On leave</CardDescription>
            <CardTitle className="text-3xl">{summary?.onLeaveCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Exceptions table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
            Attendance exceptions
          </CardTitle>
          <CardDescription>
            Real <code className="text-xs">AttendanceException</code> rows — not derived from clock-in strings.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load attendance data.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : exceptions.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No attendance exceptions recorded.</p>
          ) : (
            <DataTable columns={exceptionColumns} data={exceptions} pageSize={10} />
          )}
        </CardContent>
      </Card>

      {/* Leave requests table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--color-accent)]" />
            Leave requests
          </CardTitle>
          <CardDescription>Time-off requests across the tenant.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load leave requests.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : leaveRequests.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No leave requests yet.</p>
          ) : (
            <DataTable columns={leaveColumns} data={leaveRequests} pageSize={10} />
          )}
        </CardContent>
      </Card>

      <Toaster />
    </div>
  )
}

// ── Leave request dialog ─────────────────────────────────────────────────────

function LeaveRequestDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [type, setType] = useState<'VACATION' | 'SICK' | 'PERSONAL'>('VACATION')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Fetch employees for the dropdown
  const { data: employeesData } = useQuery({
    queryKey: queryKeys.hr.employees.list({}),
    queryFn: () => hrApi.listEmployees({ limit: 100 }),
    enabled: open,
  })
  const employees = employeesData?.items ?? []

  const createLeave = useMutation({
    mutationFn: (input: LeaveRequestWriteInput) => hrApi.createLeaveRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaveRequests?.all?.() ?? ['asas', 'hr', 'leave-requests'] })
      toast({ title: 'Leave request submitted', variant: 'success' })
      setOpen(false)
      setEmployeeId('')
      setStartDate('')
      setEndDate('')
    },
    onError: (error: unknown) =>
      toast({ title: errorMessage(error, 'Could not submit leave request'), variant: 'error' }),
  })

  const valid = employeeId && startDate

  function submit() {
    if (!valid) return
    createLeave.mutate({
      employeeId,
      type,
      startDate,
      endDate: endDate || undefined,
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Request leave
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
            <DialogDescription>Submit a time-off request for an employee.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-[var(--color-heading)]">Employee</label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} — {emp.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-[var(--color-heading)]">Leave type</label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VACATION">Vacation</SelectItem>
                  <SelectItem value="SICK">Sick</SelectItem>
                  <SelectItem value="PERSONAL">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
                Start date
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
                End date (optional)
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={createLeave.isPending}>
              <X /> Cancel
            </Button>
            <Button disabled={!valid || createLeave.isPending} onClick={submit}>
              {createLeave.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
