import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Download,
  TrendingUp, AlertTriangle, Pencil, Mail, Calendar,
  Banknote, Briefcase, Network, History, Trash2,
  Building2, Plus, Check, X,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
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
  const roleName = typeof activeMemberRole === 'string' ? activeMemberRole : activeMemberRole?.role
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
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1) }}
              placeholder="Search employees..."
              className="pl-9 pr-12 py-2 text-sm border border-border-default rounded-input bg-surface-muted/50 w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <select value={departmentId} onChange={event => { setDepartmentId(event.target.value); setPage(1) }} aria-label="Filter by department" className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm hover:bg-surface-muted transition-colors bg-surface-raised">
            <option value="">Department: All</option>
            {(departmentsData?.items ?? departmentsData ?? []).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
          <button type="button" onClick={() => { setDeptError(''); setDeptModalOpen(true) }} className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm hover:bg-surface-muted transition-colors bg-surface-raised font-medium" title="Manage departments">
            <Building2 size={16} /> Departments
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors">Add Employee</button>
          <button type="button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60">
            <Download size={16} /> {exportMutation.isPending ? 'Exporting...' : 'Export Directory'}
          </button>
        </div>
      </TopBarActions>

      <div className="px-6 py-4 flex-shrink-0 border-b border-border-default">
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Total Headcount</p>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-heading">{stats.totalHeadcount}</p>
              <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                <TrendingUp size={14} /> {`${stats.hiredThisMonth} hired MTD · ${stats.hiredThisMonth - stats.hiredPreviousMonthToDate > 0 ? '+' : ''}${stats.hiredThisMonth - stats.hiredPreviousMonthToDate} vs same period last month`}
              </span>
            </div>
          </div>
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Open Roles</p>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-heading">{stats.openRoles}</p>
              <span className="text-sm font-medium text-muted">From recruitment</span>
            </div>
          </div>
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">On Leave</p>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-heading">{stats.onLeaveCount}</p>
              <span className="flex items-center gap-1 text-sm font-semibold text-warning">
                <AlertTriangle size={14} /> Currently inactive
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-muted/50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={allSelected} onChange={event => setSelectedIds(event.target.checked ? employees.map(employee => employee.id) : [])} aria-label="Select all employees on this page" className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent" />
              <span className="text-sm font-medium text-body-light">{selectedIds.length ? `${selectedIds.length} selected` : 'Select All'}</span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={exportSelected}
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 ml-2 cursor-pointer"
                >
                  <Download size={12} /> Export Selected ({selectedIds.length})
                </button>
              )}
            </div>
            <button type="button" onClick={() => { setSortAscending(value => !value); setPage(1) }} aria-label={`Sort employee names ${sortAscending ? 'descending' : 'ascending'}`} className="text-sm font-medium text-body-light hover:text-heading">Name {sortAscending ? 'A-Z' : 'Z-A'} ↕</button>
          </div>

          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            isEmpty={!employees.length}
            emptyTitle="No employees yet"
            emptyDescription="This workspace is empty. Add an employee or reload sample data from onboarding."
          >
            <table className="w-full text-left border-collapse flex-1">
              <thead className="bg-surface-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 border-b border-border-default w-12" />
                  <th className="px-2 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Employee</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Role</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Department</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {employees.map(emp => {
                  const isSelected = selectedId === emp.id
                  return (
                    <tr
                      key={emp.id}
                      onClick={() => setSelectedId(emp.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(emp.id)}
                          aria-label={`Select ${emp.name}`}
                          onClick={event => event.stopPropagation()}
                          onChange={event => setSelectedIds(current => event.target.checked ? [...new Set([...current, emp.id])] : current.filter(id => id !== emp.id))}
                          className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent"
                        />
                      </td>
                      <td className="px-2 py-4">
                        <span className="text-sm font-bold text-heading">{emp.name}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-body-light">{emp.title}</td>
                      <td className="px-6 py-4 text-sm text-body-light">{emp.department || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          emp.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}
                        >
                          {STATUS_LABELS[emp.status] || emp.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </QueryState>
          {data?.pagination && <div className="flex items-center justify-between px-6 py-3 border-t border-border-default text-xs text-muted">
            <span>Showing {data.pagination.total === 0 ? 0 : (page - 1) * data.pagination.limit + 1}–{Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Previous</button>
              <span>Page {data.pagination.pages === 0 ? 0 : page} of {data.pagination.pages}</span>
              <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage(current => current + 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>}
        </div>

        <div className="w-[420px] bg-surface-raised border-l border-border-default overflow-y-auto p-6 flex-shrink-0 space-y-6">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-sm text-muted text-center px-4">
              Select an employee to view details.
            </div>
          ) : (
            <>
              <div className="border border-border-default rounded-card-sm p-6 relative">
                <div className="absolute top-4 right-4 flex gap-2">
                  {canEditEmployee && <button type="button" onClick={() => { setEditForm({ name: selected.name || '', title: selected.title || '', email: selected.email || '', location: selected.location || '', departmentId: selected.departmentId || '', salary: selected.salary || '', salaryBasis: selected.salaryBasis || '', salaryEffectiveFrom: selected.salaryEffectiveFrom || '', hiredAt: selected.hiredAt ? selected.hiredAt.split('T')[0] : '', employmentEndDate: selected.employmentEndDate || '', status: selected.status || 'ACTIVE', band: selected.band || '', equityOptions: selected.equityOptions ?? '' }); setEditOpen(true) }} className="p-1.5 border border-border-default rounded-input text-caption hover:text-body-light hover:bg-surface-muted transition-colors" aria-label="Edit profile">
                    <Pencil size={14} />
                  </button>}
                  <button type="button" disabled={!canDelete} title={canDelete ? 'Delete employee' : 'Requires the ADMIN role'} onClick={() => setDeleteOpen(true)} className="p-1.5 border border-border-default rounded-input text-danger hover:bg-danger-light transition-colors disabled:opacity-40" aria-label="Delete employee">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-surface-strong rounded-full mb-4 overflow-hidden border border-border-subtle flex items-center justify-center text-lg font-bold text-heading">
                    {selected.avatarUrl ? (
                      <img src={selected.avatarUrl} alt={selected.name} className="w-full h-full object-cover" />
                    ) : (
                      initials(selected.name)
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-heading">{selected.name}</h2>
                  <p className="text-sm text-muted mt-1">
                    {selected.title} · Hired {selected.hiredAt ? formatDate(selected.hiredAt, { month: 'short', year: 'numeric' }) : '—'}
                  </p>
                  {selected.employmentEndDate && <p className="text-xs text-muted mt-1">Last eligible payroll day: {formatDate(selected.employmentEndDate)}</p>}
                  <div className="flex gap-3 mt-5 w-full justify-center">
                    <a href={selected.email ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent('Hello ' + selected.name)}` : undefined} aria-disabled={!selected.email} title={selected.email ? 'Open a message draft in your mail app' : 'No email address is available'} className={`flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors ${!selected.email ? 'opacity-60 pointer-events-none' : ''}`}>
                      <Mail size={14} /> Message
                    </a>
                    <a href={selected.email ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent('Schedule time with ' + selected.name)}&body=${encodeURIComponent(`Hi ${selected.name},\n\nCould you share a few times that work for a meeting?`)}` : undefined} aria-disabled={!selected.email} title={selected.email ? 'Draft a scheduling email in your mail app' : 'No email address is available'} className={`flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors ${!selected.email ? 'opacity-60 pointer-events-none' : ''}`}>
                      <Calendar size={14} /> Schedule
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-border-default rounded-card-sm p-4">
                  <div className="flex items-center gap-2 text-muted mb-3">
                    <Banknote size={14} />
                    <span className="text-xs font-semibold">Compensation</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Salary</p>
                      <p className="text-sm font-bold text-heading">{formatMoney(selected.salary)}</p>
                      {selected.salaryBasis && <p className="mt-0.5 text-xs text-muted">{selected.salaryBasis === 'ANNUAL' ? 'Annual' : 'Monthly'} basis</p>}
                      {selected.salaryEffectiveFrom && <p className="mt-0.5 text-xs text-muted">Rate effective {formatDate(selected.salaryEffectiveFrom)}</p>}
                      {(selected.salaryHistory?.length ?? 0) > 1 && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Salary history ({selected.salaryHistory.length} rates)</summary><ul className="mt-2 space-y-1">{selected.salaryHistory.slice(1).map(rate => <li key={rate.effectiveFrom}>{formatMoney(rate.salary, { currency: rate.currency })} {rate.salaryBasis?.toLowerCase() || 'basis not set'} · {formatDate(rate.effectiveFrom)}</li>)}</ul></details>}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Equity</p>
                      <p className="text-sm font-bold text-heading">
                        {selected.equityOptions != null ? `${selected.equityOptions.toLocaleString()} Options` : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-border-default rounded-card-sm p-4">
                  <div className="flex items-center gap-2 text-muted mb-3">
                    <Briefcase size={14} />
                    <span className="text-xs font-semibold">Position</span>
                  </div>
                  <div className="space-y-3">
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

              <div className="border border-border-default rounded-card-sm p-5">
                <div className="flex items-center gap-2 text-muted mb-5">
                  <Network size={14} />
                  <span className="text-xs font-semibold">Reporting Structure</span>
                </div>
                <div className="relative pl-4 space-y-4">
                  <div className="absolute left-7 top-4 bottom-4 w-px bg-surface-strong" />
                  {selected.manager ? (
                    <div className="relative z-10 flex items-center gap-3">
                      <div className="w-7 h-7 bg-surface-raised border border-border-default rounded-full flex items-center justify-center text-[10px] font-bold text-muted">
                        {initials(selected.manager.name)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-heading leading-tight">{selected.manager.name}</p>
                        <p className="text-[10px] text-muted">{selected.manager.title}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="relative z-10 text-xs text-muted font-medium pl-10">No manager assigned</p>
                  )}
                  <div className="relative z-10 flex items-center gap-3 bg-surface-muted p-2.5 rounded-button border border-border-default -ml-2">
                    <div className="w-7 h-7 bg-blue-100 text-accent rounded-full flex items-center justify-center text-[10px] font-bold border border-accent-light">
                      {initials(selected.name)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-heading leading-tight">{selected.name}</p>
                      <p className="text-[10px] text-muted">{selected.title}</p>
                    </div>
                  </div>
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="w-7 h-7 bg-surface-raised flex items-center justify-center text-caption">
                      <div className="w-3 h-3 border-l-2 border-b-2 border-border-strong rounded-bl" />
                    </div>
                    <p className="text-xs text-muted font-medium">
                      {selected.directReports > 0
                        ? `${selected.directReports} direct report${selected.directReports === 1 ? '' : 's'}`
                        : 'No direct reports'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-border-default rounded-card-sm p-5">
                <div className="flex items-center gap-2 text-muted mb-5">
                  <History size={14} />
                  <span className="text-xs font-semibold">Recent Activity</span>
                </div>
                {auditLogs.isLoading ? (
                  <p className="text-sm text-muted">Loading activity...</p>
                ) : auditLogs.isError ? (
                  <p className="text-sm text-warning">Could not load activity.</p>
                ) : auditLogs.data?.items?.length > 0 ? (
                  <div className="space-y-4">
                    {auditLogs.data.items.map((log) => (
                      <div key={log.id} className="relative pl-4 border-l-2 border-border-faint">
                        <div className="absolute w-2 h-2 rounded-full bg-accent -left-[5px] top-1.5" />
                        <p className="text-sm text-heading">{log.action}</p>
                        <p className="text-[11px] text-muted mt-1">
                          {log.actorName} • {new Date(log.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No recent activity.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <FormDialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit employee" subtitle="Update profile and payroll compensation details." busy={editMutation.isPending} onConfirm={() => editMutation.mutate()} confirmLabel="Save changes">
        <div className="space-y-4">
          {['name', 'title', 'email', 'location'].map(field => <label key={field} className="block text-sm font-medium text-body"><span className="mb-1 block capitalize">{field}</span><input value={editForm[field]} onChange={event => setEditForm(current => ({ ...current, [field]: event.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" /></label>)}
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-body"><span className="mb-1 block">Salary</span><input type="number" min="0" step="0.01" value={editForm.salary} onChange={event => setEditForm(current => ({ ...current, salary: event.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" /></label>
            <label className="block text-sm font-medium text-body"><span className="mb-1 block">Salary basis</span><select value={editForm.salaryBasis} onChange={event => setEditForm(current => ({ ...current, salaryBasis: event.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2"><option value="">None</option><option value="ANNUAL">Annual</option><option value="MONTHLY">Monthly</option></select></label>
            <label className="block text-sm font-medium text-body"><span className="mb-1 block">Salary effective from</span><input type="date" required={!!editForm.salary} value={editForm.salaryEffectiveFrom} onChange={event => setEditForm(current => ({ ...current, salaryEffectiveFrom: event.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" /></label>
            <p className="self-center text-xs text-muted">Set a new date when changing salary or basis. Existing payroll history is preserved.</p>
            <label className="block text-sm font-medium text-body"><span className="mb-1 block">Employment end date</span><input type="date" min={editForm.hiredAt || undefined} value={editForm.employmentEndDate} onChange={event => setEditForm(current => ({ ...current, employmentEndDate: event.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" /></label>
            <p className="self-center text-xs text-muted">Last eligible paid day. Leave blank while employment is ongoing.</p>
            <p className="col-span-2 -mt-2 text-xs text-muted">If no basis is saved, the payroll run will ask you to confirm one before pricing the run.</p>
          </div>
        </div>
      </FormDialog>
      <FormDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add employee" subtitle="Create an employee profile." busy={createMutation.isPending} onConfirm={() => createMutation.mutate()} confirmLabel="Add employee">
        <div className="space-y-4">
          {['name', 'title', 'email'].map(field => <label key={field} className="block text-sm font-medium text-body"><span className="mb-1 block capitalize">{field}</span><input type={field === 'email' ? 'email' : 'text'} required={field !== 'email'} value={createForm[field]} onChange={event => setCreateForm(current => ({ ...current, [field]: event.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" /></label>)}
          <label className="block text-sm font-medium text-body"><span className="mb-1 block">Department</span><select value={createForm.departmentId} onChange={event => setCreateForm(current => ({ ...current, departmentId: event.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2"><option value="">No department</option>{(departmentsData?.items ?? departmentsData ?? []).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Salary</span>
              <input type="number" step="0.01" value={createForm.salary} onChange={e => setCreateForm(c => ({ ...c, salary: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Basis</span>
              <select value={createForm.salaryBasis} onChange={e => setCreateForm(c => ({ ...c, salaryBasis: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2">
                <option value="">None</option>
                <option value="ANNUAL">Annual</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Salary effective from</span>
              <input type="date" required={!!createForm.salary} value={createForm.salaryEffectiveFrom} onChange={e => setCreateForm(c => ({ ...c, salaryEffectiveFrom: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Hire Date</span>
              <input type="date" value={createForm.hiredAt} onChange={e => setCreateForm(c => ({ ...c, hiredAt: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Employment end date</span>
              <input type="date" min={createForm.hiredAt || undefined} value={createForm.employmentEndDate} onChange={e => setCreateForm(c => ({ ...c, employmentEndDate: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Status</span>
              <select value={createForm.status} onChange={e => setCreateForm(c => ({ ...c, status: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2">
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Band</span>
              <input type="text" value={createForm.band} onChange={e => setCreateForm(c => ({ ...c, band: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-body">
              <span className="mb-1 block">Equity</span>
              <input type="number" value={createForm.equityOptions} onChange={e => setCreateForm(c => ({ ...c, equityOptions: e.target.value }))} className="w-full rounded-input border border-border-default px-3 py-2" />
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
              <button
                type="button"
                onClick={() => { setDeptModalOpen(false); setEditingDeptId(null); setDeptError('') }}
                className="p-1 rounded-input hover:bg-surface-muted text-muted hover:text-body transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {deptError && (
              <div role="alert" className="mt-4 p-3 rounded-button bg-danger-light border border-danger-border text-danger text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{deptError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const trimmed = newDeptName.trim()
                if (trimmed) createDeptMutation.mutate(trimmed)
              }}
              className="mt-4 flex gap-2"
            >
              <input
                type="text"
                placeholder="New department name..."
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                className="flex-1 rounded-input border border-border-default px-3 py-2 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!newDeptName.trim() || createDeptMutation.isPending}
                className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                <Plus size={16} /> Add
              </button>
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
                        <input
                          type="text"
                          value={editingDeptName}
                          onChange={(e) => setEditingDeptName(e.target.value)}
                          className="flex-1 rounded-input border border-border-default px-2.5 py-1 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!editingDeptName.trim() || updateDeptMutation.isPending}
                          className="p-1.5 text-success-text hover:bg-success-light rounded-input transition-colors disabled:opacity-50"
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDeptId(null)}
                          className="p-1.5 text-muted hover:bg-surface-muted rounded-input transition-colors"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-body">{dept.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeptId(dept.id)
                              setEditingDeptName(dept.name)
                              setDeptError('')
                            }}
                            className="p-1.5 text-muted hover:text-body hover:bg-surface-muted rounded-input transition-colors"
                            title="Rename"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeptError('')
                              setDeletingDept(dept)
                            }}
                            className="p-1.5 text-muted hover:text-danger hover:bg-danger-light rounded-input transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => { setDeptModalOpen(false); setEditingDeptId(null); setDeptError('') }}
                className="px-4 py-2 border border-border-default rounded-input text-sm font-medium text-body hover:bg-surface-muted transition-colors"
              >
                Close
              </button>
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
