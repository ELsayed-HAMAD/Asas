import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Download,
  TrendingUp, AlertTriangle, Pencil, Mail, Calendar,
  Banknote, Briefcase, Network, History, Trash2,
  Building2, Plus, Check, X,
} from 'lucide-react'
import QueryState from '../../../components/common/QueryState'
import { hrApi } from '../../../lib/api/hr'
import { auditLogApi } from '../../../lib/api/auditLog'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney, formatDate } from '../../../lib/format'
import { exportsApi } from '../../../lib/api/exports'
import { downloadCsv } from '../../../lib/csv'
import FormDialog from '../../../components/common/FormDialog'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
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

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
}

const STATUS_LABELS = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On Leave',
}

// Stable fallback so effects/memos keyed on `employees` don't re-run every render.
const EMPTY_EMPLOYEES = []
const EMPTY_EMPLOYEE_FORM = { name: '', title: '', email: '', departmentId: '', salary: '', salaryBasis: '', salaryEffectiveFrom: '', hiredAt: '', employmentEndDate: '', status: 'ACTIVE', band: '', equityOptions: '' }

// The API's Zod schemas reject empty strings for optional fields (`z.email()`, `min(1)`).

export default function EmployeeDirectory() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [sortAscending, setSortAscending] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', title: '', email: '', location: '', departmentId: '', salary: '', salaryBasis: '', salaryEffectiveFrom: '', hiredAt: '', employmentEndDate: '', status: 'ACTIVE', band: '', equityOptions: '' })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deptModalOpen, setDeptModalOpen] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [editingDeptId, setEditingDeptId] = useState(null)
  const [editingDeptName, setEditingDeptName] = useState('')
  const [deptError, setDeptError] = useState('')
  const [deletingDept, setDeletingDept] = useState(null)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const { data: activeMemberRole } = useActiveMemberRole()
  const roleName = getMemberRoleName(activeMemberRole)
  const canEditEmployee = roleName === 'OWNER' || roleName === 'ADMIN'
  const canDelete = canEditEmployee
  const exportMutation = useMutation({
    mutationFn: async () => {
      let job = await exportsApi.createJob({ kind: 'employees' })
      const maxAttempts = 15
      let attempts = 0
      while (job.status !== 'DONE' && job.status !== 'FAILED' && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000))
        attempts++
        const list = await exportsApi.listJobs({ limit: 10 })
        const found = list.items?.find(j => j.id === job.id)
        if (found) job = found
      }
      if (job.status === 'FAILED') throw new Error('Employee directory export failed.')
      if (job.status !== 'DONE') throw new Error('Export is taking longer than expected. Check Settings > Data Export.')
      const blob = await exportsApi.downloadJob(job.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = job.filename || 'employees.xlsx'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return job
    },
  })
  const { data: departmentsData } = useQuery({
    queryKey: queryKeys.hr.departments.list(),
    queryFn: hrApi.getDepartments,
  })
  const createMutation = useMutation({
    mutationFn: () => hrApi.createEmployee((function(form){ return {
        ...form,
        name: form.name || undefined,
        title: form.title || undefined,
        email: form.email || null,
        location: form.location || null,
        departmentId: form.departmentId || null,
        salary: form.salary || null,
        salaryBasis: form.salaryBasis || null,
        salaryEffectiveFrom: form.salary ? form.salaryEffectiveFrom || null : null,
        hiredAt: form.hiredAt ? new Date(form.hiredAt).toISOString() : null,
        employmentEndDate: form.employmentEndDate || null,
        status: form.status || 'ACTIVE',
        band: form.band || null,
        equityOptions: form.equityOptions !== '' ? parseInt(form.equityOptions, 10) : null
      } })(createForm)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees.all() })
      setCreateOpen(false)
      setCreateForm({ ...EMPTY_EMPLOYEE_FORM })
    },
  })
  const editMutation = useMutation({
    mutationFn: () => hrApi.updateEmployee(selectedId, (function(form){ return {
        ...form,
        name: form.name || undefined,
        title: form.title || undefined,
        email: form.email || null,
        location: form.location || null,
        departmentId: form.departmentId || null,
        salary: form.salary || null,
        salaryBasis: form.salaryBasis || null,
        salaryEffectiveFrom: form.salaryEffectiveFrom || null,
        hiredAt: form.hiredAt ? new Date(form.hiredAt).toISOString() : null,
        employmentEndDate: form.employmentEndDate || null,
        status: form.status || 'ACTIVE',
        band: form.band || null,
        equityOptions: form.equityOptions !== '' ? parseInt(form.equityOptions, 10) : null
      } })(editForm)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees.all() })
      setEditOpen(false)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: () => hrApi.deleteEmployee(selectedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees.all() })
      setDeleteOpen(false)
      setSelectedId(null)
    },
  })
  const createDeptMutation = useMutation({
    mutationFn: (name) => hrApi.createDepartment({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.departments.all() })
      setNewDeptName('')
      setDeptError('')
    },
    onError: (err) => setDeptError(err?.message || 'Could not create department'),
  })
  const updateDeptMutation = useMutation({
    mutationFn: ({ id, name }) => hrApi.updateDepartment(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.departments.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees.all() })
      setEditingDeptId(null)
      setEditingDeptName('')
      setDeptError('')
    },
    onError: (err) => setDeptError(err?.message || 'Could not update department'),
  })
  const deleteDeptMutation = useMutation({
    mutationFn: (id) => hrApi.deleteDepartment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.departments.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees.all() })
      setDeletingDept(null)
      setDeptError('')
    },
    onError: (err) => setDeptError(err?.message || 'Could not delete department'),
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.employees.list({ page, limit: 25, search: search || undefined, departmentId: departmentId || undefined, sort: sortAscending ? 'NAME_ASC' : 'NAME_DESC' }),
    queryFn: () => hrApi.listEmployees({ page, limit: 25, search: search || undefined, departmentId: departmentId || undefined, sort: sortAscending ? 'NAME_ASC' : 'NAME_DESC' }),
  })
  const auditLogs = useQuery({
    queryKey: ['audit-logs', { targetType: 'Employee', targetId: selectedId }],
    queryFn: () => auditLogApi.listAuditLogs({ targetType: 'Employee', targetId: selectedId }),
    enabled: Boolean(selectedId),
  })

  const employees = data?.items ?? EMPTY_EMPLOYEES
  const allSelected = employees.length > 0 && employees.every(employee => selectedIds.includes(employee.id))
  const stats = data?.summary ?? { totalHeadcount: 0, onLeaveCount: 0, openRoles: 0, hiredThisMonth: 0, hiredPreviousMonthToDate: 0 }

  useEffect(() => {
    if (!employees.length) {
      setSelectedId(null)
      setSelectedIds(current => (current.length ? [] : current))
      return
    }
    if (!selectedId || !employees.some(emp => emp.id === selectedId)) {
      setSelectedId(employees[0].id)
    }
  }, [employees, selectedId])

  useEffect(() => {
    const pages = data?.pagination?.pages ?? 0
    if (pages > 0 && page > pages) setPage(pages)
  }, [data?.pagination?.pages, page])

  const selected = useMemo(
    () => employees.find(emp => emp.id === selectedId) || null,
    [employees, selectedId],
  )

  const exportSelected = () => {
    if (!selectedIds.length) return
    const selectedRows = employees.filter(e => selectedIds.includes(e.id))
    const header = ['ID', 'Name', 'Title', 'Department', 'Email', 'Status', 'Location', 'Hired At']
    const records = selectedRows.map(e => [
      e.id,
      e.name,
      e.title || '',
      e.department?.name || '',
      e.email || '',
      e.status || '',
      e.location || '',
      e.hiredAt || '',
    ])
    downloadCsv([header, ...records], `employees-selected-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0">
      {/* ── Fixed Top Controls (Toolbar + 3 KPI Cards) ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 space-y-3">
        {/* Action & Filter Toolbar */}
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          {/* Left group (flush with the left edge of TOTAL HEADCOUNT) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={event => { setSearch(event.target.value); setPage(1) }}
                placeholder="Search employees..."
                className="pl-9 pr-4 py-2 text-sm w-[280px] bg-surface-muted/50"
              />
            </div>
            <Select
              value={departmentId || '__all__'}
              onValueChange={val => { setDepartmentId(val === '__all__' ? '' : val); setPage(1) }}
            >
              <SelectTrigger aria-label="Filter by department" className="w-auto min-w-[160px] h-9 text-sm bg-surface-raised border border-border-default">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">Department: All</SelectItem>
                {(departmentsData?.items ?? departmentsData ?? []).map(department => (
                  <SelectItem key={department.id} value={department.id} className="text-sm">
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              type="button"
              onClick={() => { setDeptError(''); setDeptModalOpen(true) }}
              className="gap-2 text-body"
              title="Manage departments"
            >
              <Building2 size={16} /> Departments
            </Button>
          </div>

          {/* Right group (flush with the right edge of ON LEAVE) */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              type="button"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
              className="gap-2 text-body"
            >
              <Download size={16} /> {exportMutation.isPending ? 'Exporting...' : 'Export Directory'}
            </Button>
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus size={16} /> Add Employee
            </Button>
          </div>
        </div>

        {/* ── KPI Grid (12-column grid, col-span-4 each) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 bg-surface-raised rounded-card border border-border-subtle p-3.5 sm:p-4 shadow-card">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Total Headcount</p>
            <p className="text-2xl font-bold text-heading mt-1.5 leading-none">{stats.totalHeadcount}</p>
            <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-accent leading-none truncate">
              <TrendingUp size={14} className="shrink-0" />
              <span className="truncate">{`${stats.hiredThisMonth} hired MTD · ${stats.hiredThisMonth - stats.hiredPreviousMonthToDate > 0 ? '+' : ''}${stats.hiredThisMonth - stats.hiredPreviousMonthToDate} vs last month`}</span>
            </div>
          </div>

          <div className="lg:col-span-4 bg-surface-raised rounded-card border border-border-subtle p-3.5 sm:p-4 shadow-card">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Open Roles</p>
            <p className="text-2xl font-bold text-heading mt-1.5 leading-none">{stats.openRoles}</p>
            <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-muted leading-none truncate">
              <span className="truncate">From recruitment</span>
            </div>
          </div>

          <div className="lg:col-span-4 bg-surface-raised rounded-card border border-border-subtle p-3.5 sm:p-4 shadow-card">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">On Leave</p>
            <p className="text-2xl font-bold text-heading mt-1.5 leading-none">{stats.onLeaveCount}</p>
            <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-warning leading-none truncate">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="truncate">Currently inactive</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Workspace: Table (col-span-8) & Right Inspector Panel (col-span-4) ── */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 pb-4 flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
          {/* Table Card (col-span-8) */}
          <div className="lg:col-span-8 min-w-0 h-[510px] bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
            {selectedIds.length > 0 && (
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-accent-light/40 border-b border-accent-light text-xs font-medium text-heading">
                <span>{selectedIds.length} employee{selectedIds.length === 1 ? '' : 's'} selected</span>
                <Button
                  type="button"
                  variant="link"
                  onClick={exportSelected}
                  className="inline-flex items-center gap-1 text-accent font-semibold hover:underline p-0 h-auto text-xs"
                >
                  <Download size={13} /> Export Selected ({selectedIds.length})
                </Button>
              </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <QueryState
                isLoading={isLoading}
                isError={isError}
                error={error}
                isEmpty={!employees.length}
                emptyTitle="No employees yet"
                emptyDescription="This workspace is empty. Add an employee or reload sample data from onboarding."
              >
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                  <Table className="w-full text-left border-collapse">
                    <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider shadow-sm">
                      <TableRow className="border-b border-border-default hover:bg-transparent">
                        <TableHead className="w-12 px-4 py-3 text-center bg-surface-muted">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={checked => setSelectedIds(checked ? employees.map(emp => emp.id) : [])}
                              aria-label="Select all employees on this page"
                            />
                          </div>
                        </TableHead>
                        <TableHead className="px-4 py-3 bg-surface-muted">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSortAscending(val => !val); setPage(1) }}
                            aria-label={`Sort employee names ${sortAscending ? 'descending' : 'ascending'}`}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-heading uppercase tracking-wider h-auto p-0 hover:bg-transparent"
                          >
                            <span>Employee</span>
                            <span className="text-xs">{sortAscending ? '↑' : '↓'}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="px-4 py-3 bg-surface-muted">Role</TableHead>
                        <TableHead className="px-4 py-3 bg-surface-muted">Department</TableHead>
                        <TableHead className="px-4 py-3 bg-surface-muted">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border-subtle">
                      {employees.map(emp => {
                        const isSelected = selectedId === emp.id
                        return (
                          <TableRow
                            key={emp.id}
                            onClick={() => setSelectedId(emp.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted/60'
                            }`}
                          >
                            <TableCell className="w-12 px-4 py-2.5 text-center">
                              <div className="flex items-center justify-center" onClick={event => event.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.includes(emp.id)}
                                  aria-label={`Select ${emp.name}`}
                                  onCheckedChange={checked => setSelectedIds(current => checked ? [...new Set([...current, emp.id])] : current.filter(id => id !== emp.id))}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-2.5">
                              <span className="text-sm font-semibold text-heading">{emp.name}</span>
                            </TableCell>
                            <TableCell className="px-4 py-2.5 text-sm text-body-light">{emp.title}</TableCell>
                            <TableCell className="px-4 py-2.5 text-sm text-body-light">{emp.department || '—'}</TableCell>
                            <TableCell className="px-4 py-2.5">
                              <Badge variant={emp.status === 'ACTIVE' ? 'success' : 'warning'}>
                                {STATUS_LABELS[emp.status] || emp.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </QueryState>
            </div>

            {data?.pagination && (
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-border-default text-xs text-muted bg-surface-muted/30">
                <span>Showing {data.pagination.total === 0 ? 0 : (page - 1) * data.pagination.limit + 1}–{Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(current => current - 1)}
                    className="h-7 px-2 text-xs"
                  >
                    Previous
                  </Button>
                  <span>Page {data.pagination.pages === 0 ? 0 : page} of {data.pagination.pages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={page >= data.pagination.pages}
                    onClick={() => setPage(current => current + 1)}
                    className="h-7 px-2 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 min-w-0 h-[510px] overflow-y-auto space-y-3 pr-1">
            {!selected ? (
              <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-6 text-center text-sm text-muted">
                Select an employee to view details.
              </div>
            ) : (
              <>
                <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-4 relative">
                  <div className="absolute top-3.5 right-3.5 flex gap-1.5">
                    {canEditEmployee && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditForm({
                            name: selected.name || '',
                            title: selected.title || '',
                            email: selected.email || '',
                            location: selected.location || '',
                            departmentId: selected.departmentId || '',
                            salary: selected.salary || '',
                            salaryBasis: selected.salaryBasis || '',
                            salaryEffectiveFrom: selected.salaryEffectiveFrom || '',
                            hiredAt: selected.hiredAt ? selected.hiredAt.split('T')[0] : '',
                            employmentEndDate: selected.employmentEndDate || '',
                            status: selected.status || 'ACTIVE',
                            band: selected.band || '',
                            equityOptions: selected.equityOptions ?? '',
                          })
                          setEditOpen(true)
                        }}
                        className="h-7 w-7 text-caption hover:text-body-light hover:bg-surface-muted"
                        aria-label="Edit profile"
                      >
                        <Pencil size={13} />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!canDelete}
                      title={canDelete ? 'Delete employee' : 'Requires the ADMIN role'}
                      onClick={() => setDeleteOpen(true)}
                      className="h-7 w-7 text-danger hover:bg-danger-light disabled:opacity-40"
                      aria-label="Delete employee"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>

                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-surface-strong rounded-full mb-2.5 overflow-hidden border border-border-subtle flex items-center justify-center text-base font-bold text-heading shrink-0">
                      {selected.avatarUrl ? (
                        <img src={selected.avatarUrl} alt={selected.name} className="w-full h-full object-cover" />
                      ) : (
                        initials(selected.name)
                      )}
                    </div>
                    <h2 className="text-base font-bold text-heading">{selected.name}</h2>
                    <p className="text-xs text-muted mt-0.5">
                      {selected.title} · Hired {selected.hiredAt ? formatDate(selected.hiredAt, { month: 'short', year: 'numeric' }) : '—'}
                    </p>
                    {selected.employmentEndDate && (
                      <p className="text-[11px] text-muted mt-0.5">Last eligible payroll day: {formatDate(selected.employmentEndDate)}</p>
                    )}
                    <div className="flex gap-2.5 mt-3 w-full justify-center">
                      <a
                        href={selected.email ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent('Hello ' + selected.name)}` : undefined}
                        aria-disabled={!selected.email}
                        title={selected.email ? 'Open a message draft in your mail app' : 'No email address is available'}
                        className={`flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-input text-xs font-medium hover:bg-primary-hover transition-colors ${!selected.email ? 'opacity-60 pointer-events-none' : ''}`}
                      >
                        <Mail size={13} /> Message
                      </a>
                      <a
                        href={selected.email ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent('Schedule time with ' + selected.name)}&body=${encodeURIComponent(`Hi ${selected.name},\n\nCould you share a few times that work for a meeting?`)}` : undefined}
                        aria-disabled={!selected.email}
                        title={selected.email ? 'Draft a scheduling email in your mail app' : 'No email address is available'}
                        className={`flex items-center gap-1.5 border border-border-default text-body px-3 py-1.5 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised ${!selected.email ? 'opacity-60 pointer-events-none' : ''}`}
                      >
                        <Calendar size={13} /> Schedule
                      </a>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-3.5">
                    <div className="flex items-center gap-1.5 text-muted mb-2.5">
                      <Banknote size={13} />
                      <span className="text-xs font-semibold">Compensation</span>
                    </div>
                    <div className="space-y-2.5">
                      <div>
                        <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Salary</p>
                        <p className="text-sm font-bold text-heading">{formatMoney(selected.salary)}</p>
                        {selected.salaryBasis && <p className="mt-0.5 text-[11px] text-muted">{selected.salaryBasis === 'ANNUAL' ? 'Annual' : 'Monthly'} basis</p>}
                        {selected.salaryEffectiveFrom && <p className="mt-0.5 text-[11px] text-muted">Rate effective {formatDate(selected.salaryEffectiveFrom)}</p>}
                        {(selected.salaryHistory?.length ?? 0) > 1 && (
                          <details className="mt-1.5 text-[11px] text-muted">
                            <summary className="cursor-pointer">Salary history ({selected.salaryHistory.length} rates)</summary>
                            <ul className="mt-1.5 space-y-1">
                              {selected.salaryHistory.slice(1).map(rate => (
                                <li key={rate.effectiveFrom}>
                                  {formatMoney(rate.salary, { currency: rate.currency })} {rate.salaryBasis?.toLowerCase() || 'basis not set'} · {formatDate(rate.effectiveFrom)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Equity</p>
                        <p className="text-sm font-bold text-heading">
                          {selected.equityOptions != null ? `${selected.equityOptions.toLocaleString()} Options` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-3.5">
                    <div className="flex items-center gap-1.5 text-muted mb-2.5">
                      <Briefcase size={13} />
                      <span className="text-xs font-semibold">Position</span>
                    </div>
                    <div className="space-y-2.5">
                      <div>
                        <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Band</p>
                        <p className="text-sm font-bold text-heading">{selected.band || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Location</p>
                        <p className="text-sm font-bold text-heading">{selected.location || '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-3.5">
                  <div className="flex items-center gap-1.5 text-muted mb-3">
                    <Network size={13} />
                    <span className="text-xs font-semibold">Reporting Structure</span>
                  </div>
                  <div className="relative pl-3 space-y-3">
                    <div className="absolute left-6 top-3 bottom-3 w-px bg-surface-strong" />
                    {selected.manager ? (
                      <div className="relative z-10 flex items-center gap-2.5">
                        <div className="w-6 h-6 bg-surface-raised border border-border-default rounded-full flex items-center justify-center text-[10px] font-bold text-muted">
                          {initials(selected.manager.name)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-heading leading-tight">{selected.manager.name}</p>
                          <p className="text-[10px] text-muted">{selected.manager.title}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="relative z-10 text-xs text-muted font-medium pl-8">No manager assigned</p>
                    )}
                    <div className="relative z-10 flex items-center gap-2.5 bg-surface-muted p-2 rounded-button border border-border-default -ml-1">
                      <div className="w-6 h-6 bg-blue-100 text-accent rounded-full flex items-center justify-center text-[10px] font-bold border border-accent-light">
                        {initials(selected.name)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-heading leading-tight">{selected.name}</p>
                        <p className="text-[10px] text-muted">{selected.title}</p>
                      </div>
                    </div>
                    <div className="relative z-10 flex items-center gap-2.5">
                      <div className="w-6 h-6 bg-surface-raised flex items-center justify-center text-caption">
                        <div className="w-2.5 h-2.5 border-l-2 border-b-2 border-border-strong rounded-bl" />
                      </div>
                      <p className="text-xs text-muted font-medium">
                        {selected.directReports > 0
                          ? `${selected.directReports} direct report${selected.directReports === 1 ? '' : 's'}`
                          : 'No direct reports'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-3.5">
                  <div className="flex items-center gap-1.5 text-muted mb-3">
                    <History size={13} />
                    <span className="text-xs font-semibold">Recent Activity</span>
                  </div>
                  {auditLogs.isLoading ? (
                    <p className="text-xs text-muted">Loading activity...</p>
                  ) : auditLogs.isError ? (
                    <p className="text-xs text-warning">Could not load activity.</p>
                  ) : auditLogs.data?.items?.length > 0 ? (
                    <div className="space-y-3">
                      {auditLogs.data.items.map((log) => (
                        <div key={log.id} className="relative pl-3.5 border-l-2 border-border-faint">
                          <div className="absolute w-1.5 h-1.5 rounded-full bg-accent -left-[4px] top-1.5" />
                          <p className="text-xs text-heading font-medium">{log.action}</p>
                          <p className="text-[10px] text-muted mt-0.5">
                            {log.actorName} • {new Date(log.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No recent activity recorded.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <FormDialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit employee" subtitle="Update profile and payroll compensation details." busy={editMutation.isPending} onConfirm={() => editMutation.mutate()} confirmLabel="Save changes">
        <div className="space-y-4">
          {['name', 'title', 'email', 'location'].map(field => <label key={field} className="block text-sm font-medium text-body"><span className="mb-1 block capitalize">{field}</span><Input value={editForm[field]} onChange={event => setEditForm(current => ({ ...current, [field]: event.target.value }))} /></label>)}
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-body"><span className="mb-1 block">Salary</span><Input type="number" min="0" step="0.01" value={editForm.salary} onChange={event => setEditForm(current => ({ ...current, salary: event.target.value }))} /></label>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Salary basis</label>
              <Select
                value={editForm.salaryBasis || '__none__'}
                onValueChange={val => setEditForm(current => ({ ...current, salaryBasis: val === '__none__' ? '' : val }))}
              >
                <SelectTrigger className="w-full bg-surface-raised">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="ANNUAL">Annual</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="block text-sm font-medium text-body"><span className="mb-1 block">Salary effective from</span><Input type="date" required={!!editForm.salary} value={editForm.salaryEffectiveFrom} onChange={event => setEditForm(current => ({ ...current, salaryEffectiveFrom: event.target.value }))} /></label>
            <p className="self-center text-xs text-muted">Set a new date when changing salary or basis. Existing payroll history is preserved.</p>
            <label className="block text-sm font-medium text-body"><span className="mb-1 block">Employment end date</span><Input type="date" min={editForm.hiredAt || undefined} value={editForm.employmentEndDate} onChange={event => setEditForm(current => ({ ...current, employmentEndDate: event.target.value }))} /></label>
            <p className="self-center text-xs text-muted">Last eligible paid day. Leave blank while employment is ongoing.</p>
            <p className="col-span-2 -mt-2 text-xs text-muted">If no basis is saved, the payroll run will ask you to confirm one before pricing the run.</p>
          </div>
        </div>
      </FormDialog>
      <FormDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add employee" subtitle="Create an employee profile." busy={createMutation.isPending} onConfirm={() => createMutation.mutate()} confirmLabel="Add employee">
        <div className="space-y-4">
          {['name', 'title', 'email'].map(field => <label key={field} className="block text-sm font-medium text-body"><span className="mb-1 block capitalize">{field}</span><Input type={field === 'email' ? 'email' : 'text'} required={field !== 'email'} value={createForm[field]} onChange={event => setCreateForm(current => ({ ...current, [field]: event.target.value }))} /></label>)}
          <div>
            <label className="block text-sm font-medium text-body mb-1">Department</label>
            <Select
              value={createForm.departmentId || '__none__'}
              onValueChange={val => setCreateForm(current => ({ ...current, departmentId: val === '__none__' ? '' : val }))}
            >
              <SelectTrigger className="w-full bg-surface-raised">
                <SelectValue placeholder="No department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No department</SelectItem>
                {(departmentsData?.items ?? departmentsData ?? []).map(department => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Salary</span>
              <Input type="number" step="0.01" value={createForm.salary} onChange={e => setCreateForm(c => ({ ...c, salary: e.target.value }))} />
            </label>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Basis</label>
              <Select
                value={createForm.salaryBasis || '__none__'}
                onValueChange={val => setCreateForm(c => ({ ...c, salaryBasis: val === '__none__' ? '' : val }))}
              >
                <SelectTrigger className="w-full bg-surface-raised">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="ANNUAL">Annual</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Salary effective from</span>
              <Input type="date" required={!!createForm.salary} value={createForm.salaryEffectiveFrom} onChange={e => setCreateForm(c => ({ ...c, salaryEffectiveFrom: e.target.value }))} />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Hire Date</span>
              <Input type="date" value={createForm.hiredAt} onChange={e => setCreateForm(c => ({ ...c, hiredAt: e.target.value }))} />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Employment end date</span>
              <Input type="date" min={createForm.hiredAt || undefined} value={createForm.employmentEndDate} onChange={e => setCreateForm(c => ({ ...c, employmentEndDate: e.target.value }))} />
            </label>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Status</label>
              <Select
                value={createForm.status || 'ACTIVE'}
                onValueChange={val => setCreateForm(c => ({ ...c, status: val }))}
              >
                <SelectTrigger className="w-full bg-surface-raised">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Band</span>
              <Input type="text" value={createForm.band} onChange={e => setCreateForm(c => ({ ...c, band: e.target.value }))} />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Equity</span>
              <Input type="number" value={createForm.equityOptions} onChange={e => setCreateForm(c => ({ ...c, equityOptions: e.target.value }))} />
            </label>
          </div>

        </div>
      </FormDialog>
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={() => deleteMutation.mutate()} title="Delete employee?" description={`This permanently removes ${selected?.name || 'this employee'} and associated records.`} confirmLabel="Delete employee" busy={deleteMutation.isPending} danger />
      {deptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-card bg-surface-raised p-6 shadow-card border border-border-default">
            <div className="flex items-center justify-between pb-4 border-b border-border-default">
              <div>
                <h3 className="text-lg font-bold text-heading">Departments</h3>
                <p className="text-xs text-muted mt-0.5">Manage departments for employee organization.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => { setDeptModalOpen(false); setEditingDeptId(null); setDeptError('') }}
                className="h-7 w-7 text-muted hover:text-body"
              >
                <X size={18} />
              </Button>
            </div>

            {deptError && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{deptError}</AlertDescription>
              </Alert>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const trimmed = newDeptName.trim()
                if (trimmed) createDeptMutation.mutate(trimmed)
              }}
              className="mt-4 flex gap-2"
            >
              <Input
                type="text"
                placeholder="New department name..."
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={!newDeptName.trim() || createDeptMutation.isPending}
                className="gap-1.5"
              >
                <Plus size={16} /> Add
              </Button>
            </form>

            <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-border-default border border-border-default rounded-input">
              {(departmentsData?.items ?? departmentsData ?? []).length === 0 ? (
                <div className="p-4 text-center text-sm text-muted">No departments yet. Add one above.</div>
              ) : (
                (departmentsData?.items ?? departmentsData ?? []).map((dept) => (
                  <div key={dept.id} className="flex items-center justify-between p-3 gap-2">
                    {editingDeptId === dept.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          const trimmed = editingDeptName.trim()
                          if (trimmed) updateDeptMutation.mutate({ id: dept.id, name: trimmed })
                        }}
                        className="flex flex-1 items-center gap-2"
                      >
                        <Input
                          type="text"
                          value={editingDeptName}
                          onChange={(e) => setEditingDeptName(e.target.value)}
                          className="flex-1 h-8 text-sm"
                          autoFocus
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          disabled={!editingDeptName.trim() || updateDeptMutation.isPending}
                          className="h-7 w-7 text-success-text hover:bg-success-light disabled:opacity-50"
                          title="Save"
                        >
                          <Check size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingDeptId(null)}
                          className="h-7 w-7 text-muted hover:bg-surface-muted"
                          title="Cancel"
                        >
                          <X size={16} />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-body">{dept.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingDeptId(dept.id)
                              setEditingDeptName(dept.name)
                              setDeptError('')
                            }}
                            className="h-7 w-7 text-muted hover:text-body"
                            title="Rename"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeptError('')
                              setDeletingDept(dept)
                            }}
                            className="h-7 w-7 text-muted hover:text-danger hover:bg-danger-light"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                type="button"
                onClick={() => { setDeptModalOpen(false); setEditingDeptId(null); setDeptError('') }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deletingDept)}
        onClose={() => setDeletingDept(null)}
        onConfirm={() => deletingDept && deleteDeptMutation.mutate(deletingDept.id)}
        title="Delete department?"
        description={`Are you sure you want to delete "${deletingDept?.name}"? Any archived employees and projects will be unlinked.`}
        confirmLabel="Delete department"
        busy={deleteDeptMutation.isPending}
        danger
      />
    </div>
  )
}
