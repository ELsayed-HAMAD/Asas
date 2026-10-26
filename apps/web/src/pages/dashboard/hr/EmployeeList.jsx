import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  TrendingUp, AlertTriangle, Pencil, Mail, Calendar,
  Banknote, Briefcase, Network, History, Trash2,
  Building2, Plus, Check, X, Users,
} from 'lucide-react'
import QueryState from '../../../components/common/QueryState'
import { hrApi } from '../../../lib/api/hr'
import { auditLogApi } from '../../../lib/api/auditLog'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney, formatDate } from '../../../lib/format'
import { cn } from '../../../lib/utils'
import { exportsApi } from '../../../lib/api/exports'
import FormDialog from '../../../components/common/FormDialog'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import SearchInput from '../../../components/common/SearchInput'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
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
const EMPTY_EMPLOYEE_FORM = {
  name: '', title: '', email: '', departmentId: '', salary: '', salaryBasis: '',
  salaryEffectiveFrom: '', hiredAt: '', employmentEndDate: '', status: 'ACTIVE',
  band: '', equityOptions: '', bankRoutingNumber: '', bankAccountNumber: '',
  bankAccountType: 'CHECKING', bankIban: '', bankBic: '',
}

// The API's Zod schemas reject empty strings for optional fields (`z.email()`, `min(1)`).

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'Active', label: 'Active' },
  { key: 'On Leave', label: 'On Leave' },
]

export default function EmployeeDirectory() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(null)
  const [sortAscending, setSortAscending] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', title: '', email: '', location: '', departmentId: '', salary: '',
    salaryBasis: '', salaryEffectiveFrom: '', hiredAt: '', employmentEndDate: '',
    status: 'ACTIVE', band: '', equityOptions: '', bankRoutingNumber: '',
    bankAccountNumber: '', bankAccountType: 'CHECKING', bankIban: '', bankBic: '',
  })
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
        equityOptions: form.equityOptions !== '' ? parseInt(form.equityOptions, 10) : null,
        bankRoutingNumber: form.bankRoutingNumber || null,
        bankAccountNumber: form.bankAccountNumber || null,
        bankAccountType: form.bankAccountType || null,
        bankIban: form.bankIban || null,
        bankBic: form.bankBic || null,
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
        equityOptions: form.equityOptions !== '' ? parseInt(form.equityOptions, 10) : null,
        bankRoutingNumber: form.bankRoutingNumber || null,
        bankAccountNumber: form.bankAccountNumber || null,
        bankAccountType: form.bankAccountType || null,
        bankIban: form.bankIban || null,
        bankBic: form.bankBic || null,
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
    queryKey: queryKeys.hr.employees.list({
      page,
      limit: 25,
      search: search || undefined,
      departmentId: departmentId || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      sort: sortAscending ? 'NAME_ASC' : 'NAME_DESC',
    }),
    queryFn: () => hrApi.listEmployees({
      page,
      limit: 25,
      search: search || undefined,
      departmentId: departmentId || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      sort: sortAscending ? 'NAME_ASC' : 'NAME_DESC',
    }),
  })
  const auditLogs = useQuery({
    queryKey: ['audit-logs', { targetType: 'Employee', targetId: selectedId }],
    queryFn: () => auditLogApi.listAuditLogs({ targetType: 'Employee', targetId: selectedId }),
    enabled: Boolean(selectedId),
  })

  const employees = data?.items ?? EMPTY_EMPLOYEES
  const stats = data?.summary ?? { totalHeadcount: 0, onLeaveCount: 0, openRoles: 0, hiredThisMonth: 0, hiredPreviousMonthToDate: 0 }

  useEffect(() => {
    if (!employees.length) {
      setSelectedId(null)
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

  const departmentsList = useMemo(
    () => departmentsData?.items ?? (Array.isArray(departmentsData) ? departmentsData : []),
    [departmentsData],
  )

  const selected = useMemo(
    () => employees.find(emp => emp.id === selectedId) || null,
    [employees, selectedId],
  )

  function getEmployeeDepartment(emp, departments) {
    if (typeof emp?.department === 'string' && emp.department.trim()) return emp.department
    if (typeof emp?.department?.name === 'string' && emp.department.name.trim()) return emp.department.name
    if (typeof emp?.departmentName === 'string' && emp.departmentName.trim()) return emp.departmentName
    if (emp?.departmentId && Array.isArray(departments)) {
      const match = departments.find(d => d.id === emp.departmentId)
      if (match?.name) return match.name
    }
    return '—'
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5 space-y-5">
      <h1 className="sr-only">HR overview</h1>
      {/* ── Single-Row Apple-Glass Top Command Toolbar ── */}
      <div className="relative z-30 bg-surface-raised/85 backdrop-blur-xl border border-border-default rounded-2xl p-2.5 shadow-xs flex flex-wrap xl:flex-nowrap items-center justify-between gap-3 flex-shrink-0">
        {/* Left Cluster: Search + Dept Select + Depts Button */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1) }}
            placeholder="Search employees..."
            wrapperClassName="w-full sm:w-60 md:w-72 shrink-0"
            className="h-9 pl-9 pr-3 text-xs sm:text-sm"
          />

          <Select
            value={departmentId || '__all__'}
            onValueChange={val => { setDepartmentId(val === '__all__' ? '' : val); setPage(1) }}
          >
            <SelectTrigger aria-label="Filter by department" className="inline-flex items-center justify-between gap-2 w-auto min-w-[150px] h-9 px-3 rounded-xl text-xs font-medium shrink-0 bg-surface-muted hover:bg-surface-muted/80 border border-border-default shadow-xs">
              <SelectValue placeholder="Department: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">Department: All</SelectItem>
              {departmentsList.map(department => (
                <SelectItem key={department.id} value={department.id} className="text-xs">
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => { setDeptError(''); setDeptModalOpen(true) }}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 bg-surface-raised hover:bg-surface-muted border border-border-default shadow-xs text-body"
            title="Manage departments"
          >
            <Building2 size={14} />
            <span>Departments</span>
          </Button>
        </div>

        {/* Right Cluster: Export Directory + Add Employee */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 bg-surface-raised hover:bg-surface-muted border border-border-default shadow-xs text-body"
          >
            <Download size={14} />
            <span>{exportMutation.isPending ? 'Exporting...' : 'Export Directory'}</span>
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm shrink-0 whitespace-nowrap"
          >
            <Plus size={14} />
            <span>+ Add Employee</span>
          </Button>
        </div>
      </div>

      {/* ── Row 1: 3-Tier Apple-Glass KPI Cards ── */}
      {(() => {
        const activeCount = Math.max(0, stats.totalHeadcount - stats.onLeaveCount)
        const activePct = stats.totalHeadcount > 0 ? ((activeCount / stats.totalHeadcount) * 100).toFixed(1) : '100'
        const leavePct = stats.totalHeadcount > 0 ? ((stats.onLeaveCount / stats.totalHeadcount) * 100).toFixed(1) : '0'

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
            {/* Card 1: TOTAL HEADCOUNT */}
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
                  Total Headcount
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
                  <Users size={16} />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2 my-1">
                <span className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none">
                  {stats.totalHeadcount}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-indigo-500/10 border-indigo-500/20 text-indigo-700">
                  {activePct}% Active
                </span>
              </div>
              <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] font-medium text-accent flex items-center gap-1.5 truncate">
                <TrendingUp size={13} className="shrink-0" />
                <span className="truncate">{`${stats.hiredThisMonth} hired MTD · ${stats.hiredThisMonth - stats.hiredPreviousMonthToDate > 0 ? '+' : ''}${stats.hiredThisMonth - stats.hiredPreviousMonthToDate} vs last month`}</span>
              </div>
            </div>

            {/* Card 2: OPEN ROLES */}
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
                  Open Roles
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                  <Briefcase size={16} />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2 my-1">
                <span className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none">
                  {stats.openRoles}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/20 text-emerald-700">
                  Hiring Active
                </span>
              </div>
              <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] font-medium text-muted flex items-center gap-1.5 truncate">
                <span className="truncate">From recruitment</span>
              </div>
            </div>

            {/* Card 3: ON LEAVE */}
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
                  On Leave
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Calendar size={16} />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2 my-1">
                <span className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none">
                  {stats.onLeaveCount}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-amber-500/10 border-amber-500/20 text-amber-700">
                  {leavePct}% Away
                </span>
              </div>
              <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] font-semibold text-warning flex items-center gap-1.5 truncate">
                <AlertTriangle size={13} className="shrink-0" />
                <span className="truncate">Currently inactive</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Row 2: Master-Detail Workspace Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
        {/* Left Column (col-span-8): Employee Directory Table Card */}
        <div className="col-span-12 lg:col-span-8 min-w-0 bg-surface-raised rounded-2xl border border-border-default shadow-xs flex flex-col overflow-hidden h-[560px] min-h-[560px]">
          {/* Integrated Card Header: Title + Segmented Status Filter Pills */}
          <div className="px-4 py-3 border-b border-border-default flex flex-wrap items-center justify-between gap-3 bg-surface-raised/50 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-surface-muted border border-border-default/70 flex items-center justify-center text-primary shrink-0">
                <Users size={16} />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-heading">Employee Directory</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border-default/60 tabular-nums">
                  {data?.pagination?.total ?? employees.length}
                </span>
              </div>
            </div>

            {/* Status Segmented Filter Pills (All | Active | On Leave) */}
            <div className="p-1 rounded-xl bg-surface-muted border border-border-default inline-flex items-center gap-1 shrink-0">
              {STATUS_FILTERS.map(pill => {
                const isActive = statusFilter === pill.key
                return (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => { setStatusFilter(pill.key); setPage(1) }}
                    className={`w-auto px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-surface-raised text-heading shadow-xs font-bold'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    {pill.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-surface-raised">
            <QueryState
              isLoading={isLoading}
              isError={isError}
              error={error}
              isEmpty={!employees.length}
              emptyTitle="No employees yet"
              emptyDescription="This workspace is empty. Use Add Employee to create the first profile."
            >
              <Table wrapperClassName="overflow-visible" className="w-full text-left border-collapse table-fixed">
                <colgroup>
                  <col className="w-[38%] min-w-[180px]" />
                  <col className="w-[24%] min-w-[120px]" />
                  <col className="w-[22%] min-w-[110px]" />
                  <col className="w-[16%] min-w-[90px]" />
                </colgroup>
                <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border-default shadow-xs">
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableHead className="pl-4 pr-3.5 py-2.5 text-left rtl:text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSortAscending(val => !val); setPage(1) }}
                        aria-label={`Sort employee names ${sortAscending ? 'descending' : 'ascending'}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-heading uppercase tracking-wider h-auto p-0 hover:bg-transparent"
                      >
                        <span>Employee</span>
                        <span className="text-xs">{sortAscending ? '↑' : '↓'}</span>
                      </Button>
                    </TableHead>
                    <TableHead className="px-3.5 py-2.5 text-left rtl:text-right">Role</TableHead>
                    <TableHead className="px-3.5 py-2.5 text-left rtl:text-right">Department</TableHead>
                    <TableHead className="pr-4 pl-3.5 py-2.5 text-right rtl:text-left">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border-subtle">
                  {employees.map(emp => {
                    const isSelected = selectedId === emp.id
                    const deptName = getEmployeeDepartment(emp, departmentsList)
                    return (
                      <TableRow
                        key={emp.id}
                        onClick={() => setSelectedId(emp.id)}
                        className={cn(
                          'group cursor-pointer transition-colors border-0',
                          isSelected
                            ? 'bg-surface-row-selected hover:bg-surface-row-selected-hover'
                            : 'bg-surface-raised hover:bg-surface-muted/60'
                        )}
                      >
                        <TableCell className={cn(
                          'pl-4 pr-3.5 py-2.5 transition-colors',
                          isSelected ? 'border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'
                        )}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-surface-muted border border-border-default flex items-center justify-center text-[11px] font-bold text-heading shrink-0 overflow-hidden shadow-xs">
                              {emp.avatarUrl ? (
                                <img src={emp.avatarUrl} alt={emp.name} className="w-full h-full object-cover" />
                              ) : (
                                initials(emp.name)
                              )}
                            </div>
                            <span className="text-xs sm:text-sm font-semibold text-heading truncate">{emp.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5 text-xs sm:text-sm text-body-light truncate">{emp.title || '—'}</TableCell>
                        <TableCell className="px-3.5 py-2.5 text-xs sm:text-sm text-body-light truncate">{deptName}</TableCell>
                        <TableCell className="pr-4 pl-3.5 py-2.5 text-right rtl:text-left whitespace-nowrap">
                          <Badge variant={emp.status === 'ACTIVE' ? 'success' : 'warning'} className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
                            {STATUS_LABELS[emp.status] || emp.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </QueryState>
          </div>

          {data?.pagination && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-border-default text-xs text-muted bg-surface-muted/50">
              <span>Showing {data.pagination.total === 0 ? 0 : (page - 1) * data.pagination.limit + 1}–{Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(current => current - 1)}
                  className="h-7 px-2.5 text-xs font-medium"
                >
                  Previous
                </Button>
                <span className="font-medium">Page {data.pagination.pages === 0 ? 0 : page} of {data.pagination.pages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(current => current + 1)}
                  className="h-7 px-2.5 text-xs font-medium"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (col-span-4): Compact Identity Header & Recessed Inspector */}
        <div className="col-span-12 lg:col-span-4 min-w-0 lg:sticky lg:top-6">
          {!selected ? (
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card p-8 text-center text-xs text-muted">
              Select an employee to view details.
            </div>
          ) : (
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card flex flex-col overflow-hidden">
              {/* 1. Compact Horizontal Identity Header */}
              <div className="p-4 border-b border-border-subtle bg-surface-raised/50 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-surface-muted border border-border-default flex items-center justify-center text-sm font-bold text-heading shrink-0 overflow-hidden shadow-xs">
                      {selected.avatarUrl ? (
                        <img src={selected.avatarUrl} alt={selected.name} className="w-full h-full object-cover" />
                      ) : (
                        initials(selected.name)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold text-heading leading-tight truncate">{selected.name}</h2>
                      <p className="text-xs font-semibold text-heading leading-snug mt-0.5">
                        {selected.title || '—'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-muted text-muted border border-border-default/60">
                          <Calendar size={11} className="shrink-0 text-caption" />
                          <span>Hired {selected.hiredAt ? formatDate(selected.hiredAt, { month: 'short', year: 'numeric' }) : '—'}</span>
                        </span>
                        {selected.employmentEndDate && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20">
                            <span>Ends {formatDate(selected.employmentEndDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
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
                            bankRoutingNumber: selected.bankRoutingNumber || '',
                            bankAccountNumber: selected.bankAccountNumber || '',
                            bankAccountType: selected.bankAccountType || 'CHECKING',
                            bankIban: selected.bankIban || '',
                            bankBic: selected.bankBic || '',
                          })
                          setEditOpen(true)
                        }}
                        className="h-7 w-7 rounded-lg text-muted hover:text-heading hover:bg-surface-muted transition-colors"
                        aria-label="Edit profile"
                        title="Edit profile"
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
                      className="h-7 w-7 rounded-lg text-danger hover:bg-danger/10 hover:text-danger border-border-default disabled:opacity-40 transition-colors"
                      aria-label="Delete employee"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border-subtle">
                  <a
                    href={selected.email ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent('Hello ' + selected.name)}` : undefined}
                    aria-disabled={!selected.email}
                    title={selected.email ? 'Open a message draft in your mail app' : 'No email address is available'}
                    className={`h-8.5 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm bg-primary text-white hover:bg-primary-hover transition-colors ${!selected.email ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <Mail size={13} /> Message
                  </a>
                  <a
                    href={selected.email ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent('Schedule time with ' + selected.name)}&body=${encodeURIComponent(`Hi ${selected.name},\n\nCould you share a few times that work for a meeting?`)}` : undefined}
                    aria-disabled={!selected.email}
                    title={selected.email ? 'Draft a scheduling email in your mail app' : 'No email address is available'}
                    className={`h-8.5 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 bg-surface-raised hover:bg-surface-muted border border-border-default text-heading shadow-xs transition-colors ${!selected.email ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <Calendar size={13} /> Schedule
                  </a>
                </div>
              </div>

              {/* Inspector Body Content */}
              <div className="p-4 space-y-3">
                {/* 2-Column Bento Grid: Compensation & Position */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Compensation Well */}
                  <div className="bg-surface-muted/60 border border-border-subtle rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Banknote size={13} className="text-accent shrink-0" />
                      <span className="text-xs font-bold text-heading">Compensation</span>
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Salary</p>
                        <p className="text-sm font-bold text-heading tabular-nums">{formatMoney(selected.salary)}</p>
                        {selected.salaryBasis && <p className="mt-0.5 text-[11px] text-muted">{selected.salaryBasis === 'ANNUAL' ? 'Annual' : 'Monthly'} basis</p>}
                        {selected.salaryEffectiveFrom && <p className="mt-0.5 text-[11px] text-muted">Rate effective {formatDate(selected.salaryEffectiveFrom)}</p>}
                        {(selected.salaryHistory?.length ?? 0) > 1 && (
                          <details className="mt-1 text-[11px] text-muted">
                            <summary className="cursor-pointer hover:text-heading">Salary history ({selected.salaryHistory.length} rates)</summary>
                            <ul className="mt-1 space-y-0.5">
                              {selected.salaryHistory.slice(1).map(rate => (
                                <li key={rate.effectiveFrom}>
                                  {formatMoney(rate.salary, { currency: rate.currency })} {rate.salaryBasis?.toLowerCase() || 'basis not set'} · {formatDate(rate.effectiveFrom)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                      <div className="pt-1.5 border-t border-border-subtle/80">
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Equity</p>
                        <p className="text-xs font-bold text-heading tabular-nums">
                          {selected.equityOptions != null ? `${selected.equityOptions.toLocaleString()} Options` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Position Well */}
                  <div className="bg-surface-muted/60 border border-border-subtle rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Briefcase size={13} className="text-accent shrink-0" />
                      <span className="text-xs font-bold text-heading">Position</span>
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Band</p>
                        <p className="text-sm font-bold text-heading">{selected.band || '—'}</p>
                      </div>
                      <div className="pt-1.5 border-t border-border-subtle/80">
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Location</p>
                        <p className="text-xs font-bold text-heading truncate" title={selected.location || '—'}>{selected.location || '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recessed Reporting Structure Org-Chart Well */}
                <div className="bg-surface-muted/60 border border-border-subtle rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-muted">
                    <Network size={13} className="text-accent shrink-0" />
                    <span className="text-xs font-bold text-heading">Reporting Structure</span>
                  </div>
                  <div className="relative pl-2.5 space-y-2">
                    <div className="absolute left-5 top-2.5 bottom-2.5 w-px bg-border-strong/70" />
                    {selected.manager ? (
                      <div className="relative z-10 flex items-center gap-2">
                        <div className="w-6 h-6 bg-surface-raised border border-border-default rounded-full flex items-center justify-center text-[10px] font-bold text-muted shrink-0 shadow-2xs">
                          {initials(selected.manager.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-heading leading-tight truncate">{selected.manager.name}</p>
                          <p className="text-[10px] text-muted truncate">{selected.manager.title}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="relative z-10 text-xs text-muted font-medium pl-8">No manager assigned</p>
                    )}
                    <div className="relative z-10 flex items-center gap-2 bg-surface-raised/90 p-2 rounded-xl border border-border-default/80 shadow-2xs -ml-1">
                      <div className="w-6 h-6 bg-accent-light text-accent rounded-full flex items-center justify-center text-[10px] font-bold border border-accent/20 shrink-0">
                        {initials(selected.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-heading leading-tight truncate">{selected.name}</p>
                        <p className="text-[10px] text-muted truncate">{selected.title}</p>
                      </div>
                    </div>
                    <div className="relative z-10 flex items-center gap-2">
                      <div className="w-6 h-6 bg-surface-raised flex items-center justify-center text-caption shrink-0">
                        <div className="w-2.5 h-2.5 border-l-2 border-b-2 border-border-strong rounded-bl" />
                      </div>
                      <p className="text-xs text-muted font-medium truncate">
                        {selected.directReports > 0
                          ? `${selected.directReports} direct report${selected.directReports === 1 ? '' : 's'}`
                          : 'No direct reports'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recessed Recent Activity Audit Logs Well */}
                <div className="bg-surface-muted/60 border border-border-subtle rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-muted">
                    <History size={13} className="text-accent shrink-0" />
                    <span className="text-xs font-bold text-heading">Recent Activity</span>
                  </div>
                  {auditLogs.isLoading ? (
                    <p className="text-xs text-muted">Loading activity...</p>
                  ) : auditLogs.isError ? (
                    <p className="text-xs text-warning">Could not load activity.</p>
                  ) : auditLogs.data?.items?.length > 0 ? (
                    <div className="space-y-2.5">
                      {auditLogs.data.items.map((log) => (
                        <div key={log.id} className="relative pl-3.5 border-l-2 border-border-default">
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
              </div>
            </div>
          )}
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
                <SelectTrigger aria-label="Salary basis" className="w-full bg-surface-raised">
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
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-xs font-semibold text-heading mb-2">Bank & Payment Details (Direct Deposit / SEPA)</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-body">
                <span className="mb-1 block">ABA Routing Number</span>
                <Input
                  placeholder="9-digit routing"
                  maxLength={9}
                  value={editForm.bankRoutingNumber}
                  onChange={e => setEditForm(c => ({ ...c, bankRoutingNumber: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-body">
                <span className="mb-1 block">Account Number</span>
                <Input
                  placeholder="Bank account number"
                  value={editForm.bankAccountNumber}
                  onChange={e => setEditForm(c => ({ ...c, bankAccountNumber: e.target.value }))}
                />
              </label>
              <div>
                <label className="block text-xs font-medium text-body mb-1">Account Type</label>
                <Select
                  value={editForm.bankAccountType || 'CHECKING'}
                  onValueChange={val => setEditForm(c => ({ ...c, bankAccountType: val }))}
                >
                  <SelectTrigger className="w-full bg-surface-raised">
                    <SelectValue placeholder="Checking" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHECKING">Checking</SelectItem>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="block text-xs font-medium text-body">
                <span className="mb-1 block">IBAN (SEPA / International)</span>
                <Input
                  placeholder="e.g. DE89..."
                  value={editForm.bankIban}
                  onChange={e => setEditForm(c => ({ ...c, bankIban: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-body col-span-2">
                <span className="mb-1 block">BIC / SWIFT</span>
                <Input
                  placeholder="e.g. DEUTDEFF"
                  value={editForm.bankBic}
                  onChange={e => setEditForm(c => ({ ...c, bankBic: e.target.value }))}
                />
              </label>
            </div>
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

          <div className="pt-2 border-t border-border-subtle">
            <p className="text-xs font-semibold text-heading mb-2">Bank & Payment Details (Direct Deposit / SEPA)</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-body">
                <span className="mb-1 block">ABA Routing Number</span>
                <Input
                  placeholder="9-digit routing"
                  maxLength={9}
                  value={createForm.bankRoutingNumber}
                  onChange={e => setCreateForm(c => ({ ...c, bankRoutingNumber: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-body">
                <span className="mb-1 block">Account Number</span>
                <Input
                  placeholder="Bank account number"
                  value={createForm.bankAccountNumber}
                  onChange={e => setCreateForm(c => ({ ...c, bankAccountNumber: e.target.value }))}
                />
              </label>
              <div>
                <label className="block text-xs font-medium text-body mb-1">Account Type</label>
                <Select
                  value={createForm.bankAccountType || 'CHECKING'}
                  onValueChange={val => setCreateForm(c => ({ ...c, bankAccountType: val }))}
                >
                  <SelectTrigger className="w-full bg-surface-raised">
                    <SelectValue placeholder="Checking" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHECKING">Checking</SelectItem>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="block text-xs font-medium text-body">
                <span className="mb-1 block">IBAN (SEPA / International)</span>
                <Input
                  placeholder="e.g. DE89..."
                  value={createForm.bankIban}
                  onChange={e => setCreateForm(c => ({ ...c, bankIban: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-body col-span-2">
                <span className="mb-1 block">BIC / SWIFT</span>
                <Input
                  placeholder="e.g. DEUTDEFF"
                  value={createForm.bankBic}
                  onChange={e => setCreateForm(c => ({ ...c, bankBic: e.target.value }))}
                />
              </label>
            </div>
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
