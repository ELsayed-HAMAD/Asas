import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ChevronDown,
  X,
  AlertTriangle,
  Clock,
  MoreHorizontal,
  Pencil,
  Loader2
} from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';
import { hrApi } from '../../../lib/api/hr';
import { queryKeys } from '../../../lib/queryKeys';
import { useActiveMemberRole } from '../../../lib/authClient';

function formatShortDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

// The old UI showed human leave-type labels; the wire carries the enum code.
const LEAVE_TYPE_LABELS = {
  VACATION: 'Vacation',
  SICK: 'Sick Leave',
  PERSONAL: 'Personal',
}

export default function TimeAttendance() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null);
  const [needsActionOnly, setNeedsActionOnly] = useState(true)
  const [autoFlagOvertime, setAutoFlagOvertime] = useState(true)
  const [departmentId, setDepartmentId] = useState('ALL')
  const [attendanceRangeDays, setAttendanceRangeDays] = useState(30)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ type: 'VACATION', startDate: '', endDate: '' })
  const [correctionTarget, setCorrectionTarget] = useState(null)
  const [correctionForm, setCorrectionForm] = useState({ clockInDate: '', clockInTime: '', clockOutDate: '', clockOutTime: '' })
  const [policyType, setPolicyType] = useState('VACATION')
  const [policyDraft, setPolicyDraft] = useState({ annualAllowanceDays: '', weekdaysOnly: false })
  const { data: activeMemberRole } = useActiveMemberRole()
  const isAdmin = ['OWNER', 'ADMIN'].includes(activeMemberRole?.role)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.attendance.list({ rangeDays: attendanceRangeDays }),
    queryFn: () => hrApi.listAttendance({ rangeDays: attendanceRangeDays }),
  })
  const clockMutation = useMutation({
    mutationFn: (action) => action === 'IN' ? hrApi.clockIn() : hrApi.clockOut(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  })
  const approveMutation = useMutation({
    mutationFn: (timesheetId) => hrApi.approveTimesheet(timesheetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  })
  const approveAllMutation = useMutation({
    mutationFn: (ids) => hrApi.approveValidTimesheets(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  })
  const createLeaveMutation = useMutation({
    mutationFn: (body) => hrApi.createSelfLeaveRequest(body),
    onSuccess: () => {
      setLeaveDialogOpen(false)
      setLeaveForm({ type: 'VACATION', startDate: '', endDate: '' })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaveBalances.all() })
    },
  })
  const leaveDecisionMutation = useMutation({
    mutationFn: ({ id, decision }) => decision === 'APPROVED' ? hrApi.approveLeaveRequest(id) : hrApi.rejectLeaveRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaveBalances.all() })
    },
  })
  const resolveExceptionMutation = useMutation({
    mutationFn: (id) => hrApi.resolveAttendanceException(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  })
  const correctPunchMutation = useMutation({
    mutationFn: ({ id, body }) => hrApi.correctAttendancePunch(id, body),
    onSuccess: () => {
      setCorrectionTarget(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() })
    },
  })
  const { data: departmentData } = useQuery({
    queryKey: queryKeys.hr.departments.list(),
    queryFn: hrApi.getDepartments,
  })
  const { data: leaveBalanceData } = useQuery({
    queryKey: queryKeys.hr.leaveBalances.list({}),
    queryFn: () => hrApi.getLeaveBalances(),
  })
  const { data: leavePolicyData } = useQuery({
    queryKey: queryKeys.hr.leavePolicies.list({}),
    queryFn: hrApi.getLeavePolicies,
  })
  const selectedPolicy = leavePolicyData?.items?.find(policy => policy.type === policyType)
  useEffect(() => {
    setPolicyDraft({ annualAllowanceDays: selectedPolicy?.annualAllowanceDays ?? '', weekdaysOnly: selectedPolicy?.weekdaysOnly ?? false })
  }, [policyType, selectedPolicy?.annualAllowanceDays, selectedPolicy?.weekdaysOnly])
  const policyMutation = useMutation({
    mutationFn: ({ type, body }) => hrApi.updateLeavePolicy(type, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leavePolicies.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaveBalances.all() })
    },
  })

  // Normalize the rebuilt wire rows to the field names the (unchanged) markup reads.
  // The endpoint no longer returns per-day timesheets, so that collection is empty and the
  // right-hand timesheet table falls back to its "no days recorded" state.
  const exceptions = (data?.exceptions ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId).map(item => ({
    ...item,
    name: item.employeeName,
    avatar: item.employeeAvatar,
  }));
  const leaveRequests = (data?.leaveRequests ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId).map(item => ({
    ...item,
    name: item.employeeName,
    avatar: item.employeeAvatar,
    date: item.startDate,
    type: LEAVE_TYPE_LABELS[item.type] || item.type,
  }));
  const timesheets = (data?.timesheets ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId);
  const eligibleTimesheets = timesheets.filter(item => item.approvalEligible);
  const visibleExceptions = exceptions.filter((item) => (!needsActionOnly || item.alert) && (autoFlagOvertime || item.type !== 'OVERTIME'));
  const visibleLeaveRequests = leaveRequests.filter((item) => !needsActionOnly || item.status === 'PENDING');
  const summary = data?.summary ?? { exceptionCount: 0, exceptionCountPreviousPeriod: 0, onLeaveCount: 0, attendanceRate: null, attendanceRatePreviousPeriod: null, attendanceRateRangeDays, attendanceRateRecordedDays: 0, timesheetCount: 0, overtimeHours: 0 };
  const exceptionDelta = summary.exceptionCount - summary.exceptionCountPreviousPeriod;
  const attendanceRateDelta = summary.attendanceRate != null && summary.attendanceRatePreviousPeriod != null
    ? Math.round((summary.attendanceRate - summary.attendanceRatePreviousPeriod) * 10) / 10
    : null;

  function exportAttendance() {
    const rows = [
      ['Record Type', 'Employee', 'Date', 'Details', 'Status'],
      ...visibleExceptions.map((item) => ['Exception', item.name, item.date, item.label, item.alert ? 'Needs action' : 'Recorded']),
      ...visibleLeaveRequests.map((item) => ['Leave request', item.name, item.date, item.type, item.status]),
      ...timesheets.flatMap((sheet) => sheet.days.map((day) => ['Timesheet', sheet.employeeName, day.dayLabel, `${day.clockIn || ''} - ${day.clockOut || ''} (${day.totalHours ?? 0}h)`, sheet.approvedAt ? 'Approved' : 'Pending'])),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attendance.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Auto-select first exception or leave request if none is selected
  useEffect(() => {
    if (!selectedId) {
      if (exceptions.length > 0) setSelectedId(exceptions[0].id)
      else if (leaveRequests.length > 0) setSelectedId(leaveRequests[0].id)
    }
  }, [exceptions, leaveRequests, selectedId])

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex gap-3">
          <button type="button" onClick={() => setLeaveDialogOpen(true)} disabled={!data?.selfClock} title={!data?.selfClock ? 'Link an active employee record to request time off' : undefined} className="border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card disabled:opacity-60">
            Request Time Off
          </button>
          {data?.selfClock && (
            <button
              disabled={clockMutation.isPending || (Boolean(data.selfClock.clockIn) && Boolean(data.selfClock.clockOut))}
              onClick={() => clockMutation.mutate(data.selfClock.clockIn && !data.selfClock.clockOut ? 'OUT' : 'IN')}
              className="bg-primary text-white px-5 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60"
            >
              {clockMutation.isPending ? 'Saving...' : data.selfClock.clockIn && !data.selfClock.clockOut ? 'Clock Out' : data.selfClock.clockOut ? 'Shift Complete' : 'Clock In'}
            </button>
          )}
          {clockMutation.isError && <span role="alert" className="self-center text-xs text-danger">{clockMutation.error?.message || 'Could not record attendance.'}</span>}
          {approveMutation.isError && <span role="alert" className="self-center text-xs text-danger">{approveMutation.error?.message || 'Could not approve this week.'}</span>}
          {approveAllMutation.isError && <span role="alert" className="self-center text-xs text-danger">{approveAllMutation.error?.message || 'Could not approve valid timesheets.'}</span>}
          {createLeaveMutation.isError && <span role="alert" className="self-center text-xs text-danger">{createLeaveMutation.error?.message || 'Could not request time off.'}</span>}
          {leaveDecisionMutation.isError && <span role="alert" className="self-center text-xs text-danger">{leaveDecisionMutation.error?.message || 'Could not update this request.'}</span>}
          {resolveExceptionMutation.isError && <span role="alert" className="self-center text-xs text-danger">{resolveExceptionMutation.error?.message || 'Could not resolve this exception.'}</span>}
          {correctPunchMutation.isError && <span role="alert" className="self-center text-xs text-danger">{correctPunchMutation.error?.message || 'Could not correct this punch.'}</span>}
          <button onClick={exportAttendance} disabled={isLoading || isError} className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card disabled:opacity-60">
            <Download size={16} /> Export
          </button>
          <button onClick={() => approveAllMutation.mutate(eligibleTimesheets.map(item => item.id))} disabled={!eligibleTimesheets.length || approveAllMutation.isPending} className="bg-primary text-white px-5 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60">
            {approveAllMutation.isPending ? 'Approving...' : `Approve All Valid${eligibleTimesheets.length ? ` (${eligibleTimesheets.length})` : ''}`}
          </button>
        </div>
      </TopBarActions>

      {/* ── Toolbar & KPIs ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-raised z-10">

        {/* Filters & Toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted font-medium text-xs tracking-wider uppercase">Filter</span>
              <label className="flex items-center gap-2 border border-border-strong text-body px-3 py-1.5 rounded-input">
                <select aria-label="Department" value={departmentId} onChange={event => setDepartmentId(event.target.value)} className="max-w-44 bg-transparent text-sm outline-none">
                  <option value="ALL">All Departments</option>
                  {(departmentData?.items ?? []).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
                <ChevronDown size={14} className="text-caption" />
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm ml-2">
              <span className="text-muted font-medium text-xs tracking-wider uppercase">Status</span>
              <button type="button" onClick={() => setNeedsActionOnly((current) => !current)} className="flex items-center gap-1.5 border border-border-strong bg-surface-muted text-body px-3 py-1.5 rounded-input">
                {needsActionOnly ? 'Needs Action' : 'All Statuses'} {needsActionOnly && <X size={14} className="text-caption" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              Completion range
              <select aria-label="Punch completion range" value={attendanceRangeDays} onChange={event => setAttendanceRangeDays(Number(event.target.value))} className="border border-border-strong bg-surface-raised text-body px-2 py-1.5 rounded-input">
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <span className="text-sm font-medium text-body">Auto-Flag Overtime</span>
            {/* Custom Toggle Switch */}
            <button type="button" role="switch" aria-checked={autoFlagOvertime} onClick={() => setAutoFlagOvertime((current) => !current)} className={`w-10 h-5 rounded-full relative flex items-center px-0.5 shadow-panel ${autoFlagOvertime ? 'bg-accent' : 'bg-surface-strong'}`}>
              <div className={`w-4 h-4 bg-surface-raised rounded-full transition-transform shadow-card ${autoFlagOvertime ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Total Timesheets</p>
            <p className="text-2xl font-bold text-heading">{summary.timesheetCount}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Total Exceptions</p>
            <p className="text-2xl font-bold text-danger">{summary.exceptionCount}</p>
            <p className="text-[10px] text-muted mt-1">{exceptionDelta > 0 ? '+' : ''}{exceptionDelta} vs prior {summary.attendanceRateRangeDays} days</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Total Overtime</p>
            <p className="text-2xl font-bold text-heading">{summary.overtimeHours}h</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Punch Completion</p>
            <p className="text-2xl font-bold text-heading">
              {summary.attendanceRate != null ? `${Math.round(summary.attendanceRate)}%` : '—'}
            </p>
            <p className="text-[10px] text-muted mt-1">
              Past {summary.attendanceRateRangeDays} days · {summary.attendanceRateRecordedDays} recorded days
              {attendanceRateDelta != null ? ` · ${attendanceRateDelta > 0 ? '+' : ''}${attendanceRateDelta.toFixed(1)} points vs prior period` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Interactive List Area */}
        <div className="flex-1 flex flex-col bg-surface-raised overflow-y-auto">
          <section className="border-b border-border-default bg-surface-raised px-6 py-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{leaveBalanceData?.year ?? 'Current year'} leave balances</h3>
            <div className="mt-2 max-h-40 overflow-auto">
              {(leaveBalanceData?.items ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId).map(item => (
                <div key={`${item.employeeId}-${item.type}`} className="grid grid-cols-[1fr_100px_100px_100px] gap-3 border-b border-border-subtle py-1.5 text-xs">
                  <span className="truncate text-body">{item.employeeName} · {LEAVE_TYPE_LABELS[item.type]}</span>
                  <span className="text-muted">Allowance: {item.annualAllowanceDays ?? 'Not set'}</span>
                  <span className="text-muted">Reserved: {item.pendingDays}</span>
                  <span className="font-semibold text-heading">Remaining: {item.remainingDays ?? '—'}</span>
                </div>
              ))}
              {!leaveBalanceData?.items?.length && <p className="py-2 text-xs text-muted">No active employees found.</p>}
            </div>
            {isAdmin && <details className="mt-3 rounded-button border border-border-default p-3">
              <summary className="cursor-pointer text-xs font-semibold text-body">Manage annual leave policies</summary>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-xs text-muted">Leave type<select aria-label="Policy leave type" value={policyType} onChange={event => setPolicyType(event.target.value)} className="mt-1 block rounded-input border border-border-default bg-surface-raised px-2 py-1.5 text-body">{Object.entries(LEAVE_TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
                <label className="text-xs text-muted">Annual allowance (days)<input aria-label="Annual leave allowance" type="number" min="0" max="366" step="1" value={policyDraft.annualAllowanceDays} onChange={event => setPolicyDraft(current => ({ ...current, annualAllowanceDays: event.target.value }))} className="mt-1 block w-36 rounded-input border border-border-default px-2 py-1.5 text-body" /></label>
                <label className="flex items-center gap-2 pb-2 text-xs text-body"><input type="checkbox" checked={policyDraft.weekdaysOnly} onChange={event => setPolicyDraft(current => ({ ...current, weekdaysOnly: event.target.checked }))} />Count weekdays only</label>
                <button type="button" disabled={policyMutation.isPending || policyDraft.annualAllowanceDays === ''} onClick={() => policyMutation.mutate({ type: policyType, body: { annualAllowanceDays: Number(policyDraft.annualAllowanceDays), weekdaysOnly: policyDraft.weekdaysOnly } })} className="rounded-input bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{policyMutation.isPending ? 'Saving…' : 'Save policy'}</button>
                {policyMutation.isError && <span role="alert" className="text-xs text-danger">{policyMutation.error?.message || 'Could not save leave policy.'}</span>}
              </div>
            </details>}
          </section>
          {isLoading && (
            <div className="flex items-center justify-center p-10 text-muted">
              <Loader2 className="animate-spin mr-2" size={20} /> Loading attendance data...
            </div>
          )}
          {isError && (
            <div className="p-10 text-danger">{error?.message || 'Error loading attendance data'}</div>
          )}
          {!isLoading && visibleExceptions.length === 0 && visibleLeaveRequests.length === 0 && (
            <div className="p-10 text-center text-muted">
              <p className="text-sm">No attendance records found.</p>
              <p className="text-xs mt-2">Load the sample pack to see demo data.</p>
            </div>
          )}

          {/* Section: Exceptions */}
          {visibleExceptions.length > 0 && (
            <>
              <div className="px-6 py-2.5 bg-surface-muted/80 border-b border-border-default sticky top-0 z-10">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  Timesheet Exceptions · {visibleExceptions.length} Items
                </span>
              </div>
              <div className="divide-y divide-border-subtle">
                {visibleExceptions.map(item => {
                  const isSelected = selectedId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`flex items-center justify-between px-6 py-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent-light/50 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-semibold text-body-light border border-border-strong overflow-hidden">
                          {item.avatar ? <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" /> : (item.name?.[0] || '?')}
                        </div>
                        <div className="w-40 font-semibold text-sm text-heading truncate">{item.name}</div>
                        <div className={`flex items-center gap-1.5 text-sm font-medium ${item.alert ? 'text-danger' : 'text-body-light'}`}>
                          {item.alert ? <AlertTriangle size={14} /> : <Clock size={14} className="text-caption" />}
                          {item.label}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted">{formatShortDate(item.date)}</span>
                        <MoreHorizontal size={16} className="text-caption" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Section: Leave Requests */}
          {visibleLeaveRequests.length > 0 && (
            <>
              <div className="px-6 py-2.5 bg-surface-muted/80 border-y border-border-default sticky top-0 z-10">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  Time Off · {visibleLeaveRequests.length} Items
                </span>
              </div>
              <div className="divide-y divide-border-subtle">
                {visibleLeaveRequests.map(item => {
                  const isSelected = selectedId === item.id;
                  const displayDate = item.endDate ? `${formatShortDate(item.date)} - ${formatShortDate(item.endDate)}` : formatShortDate(item.date);
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`flex items-center justify-between px-6 py-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent-light/50 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-semibold text-body-light border border-border-strong overflow-hidden">
                          {item.avatar ? <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" /> : (item.name?.[0] || '?')}
                        </div>
                        <div className="w-40 font-semibold text-sm text-heading truncate">{item.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-strong text-body border border-border-subtle">
                            {item.type}
                          </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{item.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted whitespace-nowrap">{displayDate}</span>
                        <MoreHorizontal size={16} className="text-caption" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[500px] bg-surface-muted border-l border-border-default overflow-y-auto p-6 flex-shrink-0">
          {(() => {
            if (!selectedId) return <div className="text-muted text-center mt-10">Select an item to view details</div>;

            const selectedException = exceptions.find(e => e.id === selectedId);
            const selectedLeave = leaveRequests.find(l => l.id === selectedId);

            const activeItem = selectedException || selectedLeave;
            if (!activeItem) return null;

            const employeeId = activeItem.employeeId;
            const ts = timesheets.find(t => t.employeeId === employeeId);
            const employeeName = activeItem.name;
            const initials = employeeName ? employeeName.split(' ').map(n => n[0]).join('').slice(0, 2) : '??';

            return (
              <>
                {/* Profile Header */}
                <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 mb-6 flex items-center justify-between shadow-card">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-surface-strong rounded-full border border-border-strong flex items-center justify-center text-body-light font-bold text-lg overflow-hidden">
                      {activeItem.avatar ? <img src={activeItem.avatar} alt={activeItem.name} className="w-full h-full object-cover" /> : initials}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-heading">{employeeName}</h2>
                      <p className="text-xs text-muted mt-0.5">Employee Details</p>
                    </div>
                  </div>
                  <button
                    disabled={!ts || Boolean(ts.approvedAt) || approveMutation.isPending}
                    onClick={() => ts && approveMutation.mutate(ts.id)}
                    className="bg-primary text-white px-4 py-2 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60"
                  >
                    {approveMutation.isPending ? 'Approving...' : ts?.approvedAt ? 'Week Approved' : 'Approve Week'}
                  </button>
                </div>

                {/* Timesheet Table */}
                <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden mb-6">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-raised border-b border-border-subtle">
                      <tr>
                        <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider w-16">Day</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider">In</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider">Out</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider">Total</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider text-right w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-sm">
                      {ts && ts.days && ts.days.length > 0 ? (
                        ts.days.map((day, idx) => (
                          <tr key={day.id || idx} className="hover:bg-surface-muted transition-colors">
                            <td className="px-5 py-3.5 text-body-light font-medium">{day.dayLabel || '—'}</td>
                            <td className="px-5 py-3.5 font-semibold text-heading">{day.clockIn || '—'}</td>
                            <td className="px-5 py-3.5 font-semibold text-heading">{day.clockOut || '—'}</td>
                            <td className="px-5 py-3.5 text-body-light">{day.totalHours || '0'}h</td>
                            <td className="px-5 py-3.5 text-right">
                              {isAdmin && !ts?.approvedAt && /^\d{4}-\d{2}-\d{2}$/.test(day.dayLabel) && (
                                <button type="button" aria-label={`Correct punches for ${day.dayLabel}`} onClick={() => {
                                  setCorrectionTarget({ id: day.id, employeeName, dayLabel: day.dayLabel })
                                  setCorrectionForm({
                                    clockInDate: day.clockInDate || day.dayLabel,
                                    clockInTime: day.clockIn || '',
                                    clockOutDate: day.clockOutDate || (day.clockOut ? day.dayLabel : ''),
                                    clockOutTime: day.clockOut || '',
                                  })
                                }} className="rounded p-1 text-caption hover:bg-surface-muted hover:text-body">
                                  <Pencil size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-5 py-4 text-center text-muted text-sm">
                            No timesheet days recorded for this week.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {ts && (
                    <div className="px-5 py-4 bg-surface-muted/50 border-t border-border-default flex items-center justify-between">
                      <span className="text-sm font-semibold text-heading">Weekly Total</span>
                      <div className="flex gap-4">
                        <span className="text-sm text-body-light">Regular: {ts.regularHours}h</span>
                        <span className="text-sm text-body-light">Overtime: {ts.overtimeHours}h</span>
                        <span className="text-sm font-bold text-heading">Total: {ts.totalHours}h</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Exception Notice */}
                {selectedException && (
                  <div className={`p-4 rounded-card-sm border ${selectedException.alert ? 'bg-danger-light border-danger/20' : 'bg-surface-raised border-border-default'} mb-6 shadow-card`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className={`mt-0.5 ${selectedException.alert ? 'text-danger' : 'text-muted'}`} />
                      <div>
                        <h3 className={`text-sm font-bold ${selectedException.alert ? 'text-danger' : 'text-heading'}`}>
                          {selectedException.alert ? 'Action Required' : 'Resolved'}: {selectedException.label}
                        </h3>
                        <p className="text-xs text-body mt-1 leading-relaxed">
                          {selectedException.alert
                            ? `This employee's timesheet on ${formatShortDate(selectedException.date)} needs review before the week can be approved.`
                            : `This attendance exception from ${formatShortDate(selectedException.date)} has been reviewed and no longer blocks timesheet approval.`}
                        </p>
                      </div>
                    </div>
                    {isAdmin && selectedException.alert && (
                      <div className="flex justify-end mt-4">
                        <button type="button" disabled={resolveExceptionMutation.isPending} onClick={() => resolveExceptionMutation.mutate(selectedException.id)} className="px-3 py-1.5 rounded-input bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-60">
                          {resolveExceptionMutation.isPending ? 'Resolving...' : 'Resolve Exception'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Leave Notice */}
                {selectedLeave && (
                  <div className="p-4 rounded-card-sm border border-border-default bg-surface-raised mb-6 shadow-card">
                    <div className="flex items-start gap-3">
                      <Clock size={18} className="mt-0.5 text-accent" />
                      <div>
                        <h3 className="text-sm font-bold text-heading">
                          Time Off Request: {selectedLeave.type}
                        </h3>
                        <p className="text-xs text-body mt-1 leading-relaxed">
                          Requested for {formatShortDate(selectedLeave.date)} {selectedLeave.endDate ? `to ${formatShortDate(selectedLeave.endDate)}` : ''}.
                        </p>
                      </div>
                    </div>
                    {isAdmin && selectedLeave.status === 'PENDING' && (
                      <div className="flex justify-end gap-2 mt-4">
                        <button type="button" disabled={leaveDecisionMutation.isPending} onClick={() => leaveDecisionMutation.mutate({ id: selectedLeave.id, decision: 'REJECTED' })} className="px-3 py-1.5 rounded-input border border-border-default text-sm text-body hover:bg-surface-muted disabled:opacity-60">Reject</button>
                        <button type="button" disabled={leaveDecisionMutation.isPending} onClick={() => leaveDecisionMutation.mutate({ id: selectedLeave.id, decision: 'APPROVED' })} className="px-3 py-1.5 rounded-input bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-60">Approve</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
      <FormDialog
        open={leaveDialogOpen}
        onClose={() => !createLeaveMutation.isPending && setLeaveDialogOpen(false)}
        title="Request time off"
        subtitle="Your request will be sent to a workspace administrator for review."
        confirmLabel="Submit request"
        busy={createLeaveMutation.isPending}
        onConfirm={() => {
          if (!leaveForm.startDate || (leaveForm.endDate && leaveForm.endDate < leaveForm.startDate)) return
          createLeaveMutation.mutate({ type: leaveForm.type, startDate: leaveForm.startDate, endDate: leaveForm.endDate || null })
        }}
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">Leave type
            <select value={leaveForm.type} onChange={event => setLeaveForm(current => ({ ...current, type: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body">
              <option value="VACATION">Vacation</option><option value="SICK">Sick leave</option><option value="PERSONAL">Personal</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-body">Start date
            <input type="date" required value={leaveForm.startDate} onChange={event => setLeaveForm(current => ({ ...current, startDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body" />
          </label>
          <label className="block text-sm font-medium text-body">End date <span className="font-normal text-muted">(optional)</span>
            <input type="date" min={leaveForm.startDate || undefined} value={leaveForm.endDate} onChange={event => setLeaveForm(current => ({ ...current, endDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body" />
          </label>
          {createLeaveMutation.isError && <p role="alert" className="text-sm text-danger">{createLeaveMutation.error?.message || 'Could not submit this request.'}</p>}
        </div>
      </FormDialog>
      <FormDialog
        open={Boolean(correctionTarget)}
        onClose={() => !correctPunchMutation.isPending && setCorrectionTarget(null)}
        title="Correct attendance punches"
        subtitle={correctionTarget ? `${correctionTarget.employeeName} · ${correctionTarget.dayLabel}. Times use the workspace timezone.` : undefined}
        confirmLabel="Save correction"
        busy={correctPunchMutation.isPending}
        onConfirm={() => {
          if (!correctionTarget || !correctionForm.clockInDate || !correctionForm.clockInTime) return
          if (Boolean(correctionForm.clockOutDate) !== Boolean(correctionForm.clockOutTime)) return
          correctPunchMutation.mutate({
            id: correctionTarget.id,
            body: {
              clockInDate: correctionForm.clockInDate,
              clockInTime: correctionForm.clockInTime,
              clockOutDate: correctionForm.clockOutTime ? correctionForm.clockOutDate : null,
              clockOutTime: correctionForm.clockOutTime || null,
            },
          })
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-body">Clock-in date
              <input type="date" required value={correctionForm.clockInDate} onChange={event => setCorrectionForm(current => ({ ...current, clockInDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body" />
            </label>
            <label className="block text-sm font-medium text-body">Clock-in time
              <input type="time" required value={correctionForm.clockInTime} onChange={event => setCorrectionForm(current => ({ ...current, clockInTime: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-body">Clock-out date <span className="font-normal text-muted">(optional)</span>
              <input type="date" min={correctionForm.clockInDate || undefined} value={correctionForm.clockOutDate} onChange={event => setCorrectionForm(current => ({ ...current, clockOutDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body" />
            </label>
            <label className="block text-sm font-medium text-body">Clock-out time <span className="font-normal text-muted">(optional)</span>
              <input type="time" value={correctionForm.clockOutTime} onChange={event => setCorrectionForm(current => ({ ...current, clockOutTime: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-body" />
            </label>
          </div>
          {Boolean(correctionForm.clockOutDate) !== Boolean(correctionForm.clockOutTime) && <p role="alert" className="text-sm text-danger">Enter both clock-out date and time, or leave both empty.</p>}
          {correctPunchMutation.isError && <p role="alert" className="text-sm text-danger">{correctPunchMutation.error?.message || 'Could not save the punch correction.'}</p>}
        </div>
      </FormDialog>
    </div>
  );
}
