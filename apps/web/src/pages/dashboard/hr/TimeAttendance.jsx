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
import { hrApi } from '../../../lib/api/hr';
import { queryKeys } from '../../../lib/queryKeys';

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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.attendance.list(),
    queryFn: () => hrApi.listAttendance(),
  })
  const clockMutation = useMutation({
    mutationFn: (action) => action === 'IN' ? hrApi.clockIn() : hrApi.clockOut(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.list() }),
  })
  const approveMutation = useMutation({
    mutationFn: (timesheetId) => hrApi.approveTimesheet(timesheetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.list() }),
  })
  const approveAllMutation = useMutation({
    mutationFn: (ids) => hrApi.approveValidTimesheets(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.list() }),
  })
  const { data: departmentData } = useQuery({
    queryKey: queryKeys.hr.departments.list(),
    queryFn: hrApi.getDepartments,
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
  const visibleExceptions = exceptions.filter((item) => !needsActionOnly || item.alert || (autoFlagOvertime && item.type === 'OVERTIME'));
  const visibleLeaveRequests = leaveRequests.filter((item) => !needsActionOnly || item.status === 'PENDING');
  const summary = data?.summary ?? { exceptionCount: 0, onLeaveCount: 0, attendanceRate: null, timesheetCount: 0, overtimeHours: 0 };

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
                  {(departmentData ?? []).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
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
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Total Overtime</p>
            <p className="text-2xl font-bold text-heading">{summary.overtimeHours}h</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">On-Time Rate</p>
            <p className="text-2xl font-bold text-heading">
              {summary.attendanceRate != null ? `${Math.round(summary.attendanceRate)}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Interactive List Area */}
        <div className="flex-1 flex flex-col bg-surface-raised overflow-y-auto">
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
                            <td className="px-5 py-3.5 text-right"><Pencil size={14} className="inline-block text-caption hover:text-body cursor-pointer" /></td>
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
                  <div className={`p-4 rounded-card-sm border ${selectedException.alert ? 'bg-danger-light border-danger/20' : 'bg-warning-light border-warning/20'} mb-6 shadow-card`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className={`mt-0.5 ${selectedException.alert ? 'text-danger' : 'text-warning'}`} />
                      <div>
                        <h3 className={`text-sm font-bold ${selectedException.alert ? 'text-danger' : 'text-warning-text'}`}>
                          Action Required: {selectedException.label}
                        </h3>
                        <p className="text-xs text-body mt-1 leading-relaxed">
                          This employee's timesheet on {formatShortDate(selectedException.date)} is missing a punch or has unauthorized overtime. Please review and adjust the timesheet before approving the week.
                        </p>
                      </div>
                    </div>
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
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
