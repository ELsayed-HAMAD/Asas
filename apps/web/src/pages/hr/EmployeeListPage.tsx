import type { Department, Employee, EmployeeWriteInput } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
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
import { ApiError } from '@/lib/api/http.js'
import { hrApi } from '@/lib/api/hr.js'
import { formatMoney } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

const EMPTY_FORM: EmployeeWriteInput = {
  name: '',
  title: '',
  departmentId: null,
  managerId: null,
  status: 'ACTIVE',
  salary: null,
  email: null,
  location: null,
  band: null,
  hiredAt: null,
}

/**
 * Ports the legacy `EmployeeDirectory` (asas/src/pages/dashboard/hr/EmployeeList.jsx) onto the
 * shadcn component set and the real `/api/v1/hr/employees` endpoint. This is the reference page
 * for the rebuild's Phase 2 — the layout is adapted to `DataTable`/`Card` rather than copied
 * line for line, but the data it renders is real: search and pagination both round-trip to the
 * server, and `summary` comes from `GET /hr/employees` rather than a client-side `.reduce()`.
 *
 * `salary` renders as "—" for any caller without `employee.salary.read` — the API redacts it
 * server-side (see employees.service.ts), so there is no value here to accidentally leak.
 *
 * Write actions (create/edit/delete employee, create department) are gated on `useMyRole()`
 * returning ADMIN or OWNER — the server enforces via `requirePermission('employee.write')`
 * regardless, but hiding the buttons avoids a visible-then-403 flash.
 */
export function EmployeeListPage() {
  const role = useMyRole()
  const isAdmin = role === 'ADMIN' || role === 'OWNER'
  const [search, setSearch] = useState('')
  const [showAddEmp, setShowAddEmp] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null)
  const [showDepts, setShowDepts] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.hr.employees.list({ search: search || undefined }),
    queryFn: () => hrApi.listEmployees({ search: search || undefined, limit: 100 }),
  })

  const employees = useMemo(() => data?.items ?? [], [data])
  const summary = data?.summary ?? { totalHeadcount: 0, onLeaveCount: 0, openRoles: 0 }

  const columns = useMemo<ColumnDef<Employee>[]>(() => {
    const base: ColumnDef<Employee>[] = [
      {
        accessorKey: 'name',
        header: 'Employee',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-[var(--color-heading)]">{row.original.name}</p>
            <p className="text-xs text-[var(--color-muted)]">{row.original.title}</p>
          </div>
        ),
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ row }) => (
          <span className="text-sm text-[var(--color-body)]">{row.original.department ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'location',
        header: 'Location',
        cell: ({ row }) => (
          <span className="text-sm text-[var(--color-muted)]">{row.original.location ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'ACTIVE' ? 'success' : 'warning'}>
            {row.original.status === 'ACTIVE' ? 'Active' : 'On leave'}
          </Badge>
        ),
      },
      {
        accessorKey: 'salary',
        header: 'Salary',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-[var(--color-body)]">
            {row.original.salary ? formatMoney(row.original.salary) : '—'}
          </span>
        ),
      },
    ]

    if (isAdmin) {
      base.push({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditEmployee(row.original)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteEmployee(row.original)}
            >
              <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
            </Button>
          </div>
        ),
      })
    }

    return base
  }, [isAdmin])

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Employees</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Directory, search, and management — all backed by real endpoints.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDepts(true)}>
              Departments
            </Button>
            <Button onClick={() => setShowAddEmp(true)}>
              <Plus /> Add employee
            </Button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Headcount</CardDescription>
            <CardTitle className="text-3xl">{summary.totalHeadcount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>On leave</CardDescription>
            <CardTitle className="text-3xl">{summary.onLeaveCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Open roles</CardDescription>
            <CardTitle className="text-3xl">{summary.openRoles}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search */}
      <Input
        placeholder="Search employees by name, title, or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-md"
      />

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load employees.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : employees.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              {search ? 'No employees match your search.' : 'No employees yet. Add one to get started.'}
            </p>
          ) : (
            <DataTable columns={columns} data={employees} pageSize={25} />
          )}
        </CardContent>
      </Card>

      {/* Create / Edit / Delete dialogs */}
      {showAddEmp && (
        <EmployeeFormDialog
          mode="create"
          onClose={() => setShowAddEmp(false)}
        />
      )}
      {editEmployee && (
        <EmployeeFormDialog
          mode="edit"
          employee={editEmployee}
          onClose={() => setEditEmployee(null)}
        />
      )}
      {deleteEmployee && (
        <DeleteEmployeeDialog
          employee={deleteEmployee}
          onClose={() => setDeleteEmployee(null)}
        />
      )}
      {showDepts && (
        <DepartmentDialog onClose={() => setShowDepts(false)} />
      )}

      <Toaster />
    </div>
  )
}

// ── Employee form dialog (create + edit) ─────────────────────────────────────

function EmployeeFormDialog({
  mode,
  employee,
  onClose,
}: {
  mode: 'create' | 'edit'
  employee?: Employee
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EmployeeWriteInput>(() => {
    if (mode === 'edit' && employee) {
      return {
        name: employee.name,
        title: employee.title,
        departmentId: employee.departmentId,
        managerId: employee.managerId,
        status: employee.status,
        salary: employee.salary,
        email: employee.email,
        location: employee.location,
        band: employee.band,
        hiredAt: employee.hiredAt ? employee.hiredAt.slice(0, 10) : null,
      }
    }
    return { ...EMPTY_FORM }
  })

  // Fetch departments + employees for the dropdowns
  const { data: deptsData } = useQuery({
    queryKey: queryKeys.hr.departments.all(),
    queryFn: () => hrApi.listDepartments(),
  })
  const departments = deptsData?.items ?? []

  const { data: mgrData } = useQuery({
    queryKey: queryKeys.hr.employees.list({}),
    queryFn: () => hrApi.listEmployees({ limit: 100 }),
  })
  const managers = mgrData?.items ?? []

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return hrApi.createEmployee(form)
      }
      return hrApi.updateEmployee(employee!.id, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees.all() })
      toast({
        title: mode === 'create' ? 'Employee added' : 'Employee updated',
        variant: 'success',
      })
      onClose()
    },
    onError: (error: unknown) =>
      toast({
        title: errorMessage(error, `Could not ${mode === 'create' ? 'add' : 'update'} employee`),
        variant: 'error',
      }),
  })

  const valid = form.name.trim() && form.title.trim()

  function set<K extends keyof EmployeeWriteInput>(key: K, value: EmployeeWriteInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add employee' : 'Edit employee'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create a new employee record in this workspace.'
              : `Update ${employee?.name}'s record.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Name *
            <Input value={form.name} onChange={e => set('name', e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Title *
            <Input value={form.title} onChange={e => set('title', e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Department
            <Select
              value={form.departmentId ?? '__none__'}
              onValueChange={v => set('departmentId', v === '__none__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No department</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Manager
            <Select
              value={form.managerId ?? '__none__'}
              onValueChange={v => set('managerId', v === '__none__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No manager</SelectItem>
                {managers
                  .filter(m => m.id !== employee?.id)
                  .map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name} — {m.title}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Status
            <Select
              value={form.status ?? 'ACTIVE'}
              onValueChange={v => set('status', v as 'ACTIVE' | 'ON_LEAVE')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ON_LEAVE">On leave</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Salary
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 75000"
              value={form.salary ?? ''}
              onChange={e => set('salary', e.target.value || null)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Email
            <Input
              type="email"
              value={form.email ?? ''}
              onChange={e => set('email', e.target.value || null)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Location
            <Input
              value={form.location ?? ''}
              onChange={e => set('location', e.target.value || null)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Band
            <Input
              value={form.band ?? ''}
              onChange={e => set('band', e.target.value || null)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Hired date
            <Input
              type="date"
              value={form.hiredAt ?? ''}
              onChange={e => set('hiredAt', e.target.value || null)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            <X /> Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending
              ? 'Saving…'
              : mode === 'create'
                ? 'Add employee'
                : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete employee dialog ────────────────────────────────────────────────────

function DeleteEmployeeDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => hrApi.deleteEmployee(employee.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees.all() })
      toast({ title: 'Employee deleted', variant: 'success' })
      onClose()
    },
    onError: (error: unknown) =>
      toast({ title: errorMessage(error, 'Could not delete employee'), variant: 'error' }),
  })

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete employee</DialogTitle>
          <DialogDescription>
            This permanently removes {employee.name} from the workspace. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Department management dialog ─────────────────────────────────────────────

function DepartmentDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [deptName, setDeptName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.departments.all(),
    queryFn: () => hrApi.listDepartments(),
  })
  const departments: Department[] = data?.items ?? []

  const createDept = useMutation({
    mutationFn: () => hrApi.createDepartment({ name: deptName.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.departments.all() })
      toast({ title: 'Department added', variant: 'success' })
      setDeptName('')
    },
    onError: (error: unknown) =>
      toast({ title: errorMessage(error, 'Could not add department'), variant: 'error' }),
  })

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Departments</DialogTitle>
          <DialogDescription>Add and view departments for this workspace.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="Department name"
              value={deptName}
              onChange={e => setDeptName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && deptName.trim()) createDept.mutate()
              }}
            />
            <Button disabled={!deptName.trim() || createDept.isPending} onClick={() => createDept.mutate()}>
              <Plus /> Add
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {isLoading ? (
              <p className="text-sm text-[var(--color-muted)]">Loading…</p>
            ) : departments.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No departments yet.</p>
            ) : (
              departments.map(d => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-[var(--radius-button)] border border-[var(--color-border-default)] px-3 py-2"
                >
                  <span className="text-sm font-medium text-[var(--color-heading)]">{d.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
