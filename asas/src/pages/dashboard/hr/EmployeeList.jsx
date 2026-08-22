import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, ChevronDown, Download,
  TrendingUp, AlertTriangle, Pencil, Mail, Calendar,
  Banknote, Briefcase, Network, History, Loader2,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import { hrService } from '../../../services/hr.service'

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
}

function formatHired(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function formatMoney(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function EmployeeDirectory() {
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hr', 'employees', { search }],
    queryFn: () => hrService.listEmployees({ search: search || undefined, limit: 100 }),
  })

  const employees = data?.items ?? []
  const stats = data?.stats ?? { totalHeadcount: 0, onLeaveCount: 0, openRoles: 0 }

  useEffect(() => {
    if (!employees.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !employees.some(emp => emp.id === selectedId)) {
      setSelectedId(employees[0].id)
    }
  }, [employees, selectedId])

  const selected = useMemo(
    () => employees.find(emp => emp.id === selectedId) || null,
    [employees, selectedId],
  )

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search employees..."
              className="pl-9 pr-12 py-2 text-sm border border-border-default rounded-input bg-surface-muted/50 w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <button type="button" className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm hover:bg-surface-muted transition-colors">
            Department: All <ChevronDown size={14} className="text-caption" />
          </button>
          <button type="button" className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors">
            <Download size={16} /> Export Directory
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
                <TrendingUp size={14} /> Live
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
              <input type="checkbox" className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent" readOnly />
              <span className="text-sm font-medium text-body-light">Select All</span>
            </div>
            <span className="text-sm font-medium text-body-light">A-Z Sort: Name A-Z</span>
          </div>

          {isLoading && (
            <div className="flex-1 flex items-center justify-center gap-2 text-muted text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading employees…
            </div>
          )}

          {isError && (
            <div className="flex-1 flex items-center justify-center text-sm text-danger px-6 text-center">
              {error?.response?.data?.error?.message || 'Unable to load employees.'}
            </div>
          )}

          {!isLoading && !isError && employees.length === 0 && (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center max-w-sm">
                <p className="text-base font-semibold text-heading mb-1">No employees yet</p>
                <p className="text-sm text-muted">
                  This workspace is empty. Add people manually or reload sample data from onboarding.
                </p>
              </div>
            </div>
          )}

          {!isLoading && !isError && employees.length > 0 && (
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
                          checked={isSelected}
                          readOnly
                          className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent"
                        />
                      </td>
                      <td className="px-2 py-4">
                        <span className="text-sm font-bold text-heading">{emp.name}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-body-light">{emp.role}</td>
                      <td className="px-6 py-4 text-sm text-body-light">{emp.department || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          emp.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="w-[420px] bg-surface-raised border-l border-border-default overflow-y-auto p-6 flex-shrink-0 space-y-6">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-sm text-muted text-center px-4">
              Select an employee to view details.
            </div>
          ) : (
            <>
              <div className="border border-border-default rounded-card-sm p-6 relative">
                <button type="button" className="absolute top-4 right-4 p-1.5 border border-border-default rounded-input text-caption hover:text-body-light hover:bg-surface-muted transition-colors" aria-label="Edit profile">
                  <Pencil size={14} />
                </button>
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
                    {selected.role} · Hired {formatHired(selected.hiredAt)}
                  </p>
                  <div className="flex gap-3 mt-5 w-full justify-center">
                    <button type="button" className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors">
                      <Mail size={14} /> Message
                    </button>
                    <button type="button" className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
                      <Calendar size={14} /> Schedule
                    </button>
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
                        <p className="text-[10px] text-muted">{selected.manager.role}</p>
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
                      <p className="text-[10px] text-muted">{selected.role}</p>
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
                <p className="text-sm text-muted">Activity feed will appear here as HR events are recorded.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
