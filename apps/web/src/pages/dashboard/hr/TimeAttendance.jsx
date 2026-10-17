import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ChevronDown,
  AlertTriangle,
  Clock,
  Pencil,
  Loader2,
} from 'lucide-react';
import FormDialog from '../../../components/common/FormDialog';
import { hrApi } from '../../../lib/api/hr';
import { queryKeys } from '../../../lib/queryKeys';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
import { Alert, AlertDescription } from '../../../components/ui/alert';

function formatShortDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

function initials(name) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// The old UI showed human leave-type labels; the wire carries the enum code.
const LEAVE_TYPE_LABELS = {
  VACATION: 'Vacation',
  SICK: 'Sick Leave',
  PERSONAL: 'Personal',
}

const TIMESHEET_PAGE_SIZE = 8;

export default function TimeAttendance() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTimesheetId, setSelectedTimesheetId] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [timesheetPage, setTimesheetPage] = useState(1);
  const [overtimeThreshold, setOvertimeThreshold] = useState(40);
  const [needsActionOnly, setNeedsActionOnly] = useState(false)
  const [autoFlagOvertime, setAutoFlagOvertime] = useState(true)
  const [departmentId, setDepartmentId] = useState('ALL')
  const [attendanceRangeDays, setAttendanceRangeDays] = useState(30)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ type: 'VACATION', startDate: '', endDate: '' })
  const [correctionTarget, setCorrectionTarget] = useState(null)
  const [correctionForm, setCorrectionForm] = useState({ clockInDate: '', clockInTime: '', clockOutDate: '', clockOutTime: '' })
  const [policyType, setPolicyType] = useState('VACATION')
  const [policyDraft, setPolicyDraft] = useState({ annualAllowanceDays: '', weekdaysOnly: false })
  const [balancesOpen, setBalancesOpen] = useState(false)
  const { data: activeMemberRole } = useActiveMemberRole()
  const roleName = getMemberRoleName(activeMemberRole)
  const isAdmin = ['OWNER', 'ADMIN'].includes(roleName)

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

  // Normalize the rebuilt wire rows to the field names the markup reads.
  const exceptions = useMemo(() => (data?.exceptions ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId).map(item => ({
    ...item,
    name: item.employeeName,
    avatar: item.employeeAvatar,
  })), [data?.exceptions, departmentId]);
  const leaveRequests = useMemo(() => (data?.leaveRequests ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId).map(item => ({
    ...item,
    name: item.employeeName,
    avatar: item.employeeAvatar,
    date: item.startDate,
    type: LEAVE_TYPE_LABELS[item.type] || item.type,
  })), [data?.leaveRequests, departmentId]);
  const timesheets = useMemo(() => (data?.timesheets ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId), [data?.timesheets, departmentId]);

  const eligibleTimesheets = timesheets.filter(item => item.approvalEligible);
  const visibleExceptions = exceptions.filter((item) => (!needsActionOnly || item.alert) && (autoFlagOvertime || item.type !== 'OVERTIME'));
  const visibleLeaveRequests = leaveRequests.filter((item) => !needsActionOnly || item.status === 'PENDING');
  const summary = data?.summary ?? { exceptionCount: 0, exceptionCountPreviousPeriod: 0, onLeaveCount: 0, attendanceRate: null, attendanceRatePreviousPeriod: null, attendanceRateRangeDays: attendanceRangeDays, attendanceRateRecordedDays: 0, timesheetCount: 0, overtimeHours: 0 };
  const exceptionDelta = summary.exceptionCount - summary.exceptionCountPreviousPeriod;
  const attendanceRateDelta = summary.attendanceRate != null && summary.attendanceRatePreviousPeriod != null
    ? Math.round((summary.attendanceRate - summary.attendanceRatePreviousPeriod) * 10) / 10
    : null;

  // Pagination for Weekly Timesheets table (8 rows per page)
  const totalTimesheets = timesheets.length;
  const timesheetPages = Math.ceil(totalTimesheets / TIMESHEET_PAGE_SIZE) || 1;
  const paginatedTimesheets = useMemo(() => {
    const start = (timesheetPage - 1) * TIMESHEET_PAGE_SIZE;
    return timesheets.slice(start, start + TIMESHEET_PAGE_SIZE);
  }, [timesheets, timesheetPage]);

  useEffect(() => {
    setTimesheetPage(1);
  }, [departmentId, needsActionOnly]);

  // Auto-select first timesheet if none is selected
  useEffect(() => {
    if (!selectedEmployeeId && timesheets.length > 0) {
      setSelectedEmployeeId(timesheets[0].employeeId);
      setSelectedTimesheetId(timesheets[0].id);
    } else if (!selectedId) {
      if (exceptions.length > 0) setSelectedId(exceptions[0].id);
      else if (leaveRequests.length > 0) setSelectedId(leaveRequests[0].id);
    }
  }, [timesheets, exceptions, leaveRequests, selectedEmployeeId, selectedId]);

  function exportAttendance() {
    const rows = [
      ['Record Type', 'Employee', 'Date', 'Details', 'Status'],
      ...visibleExceptions.map((item) => ['Exception', item.name, item.date, item.label, item.alert ? 'Needs action' : 'Recorded']),
      ...visibleLeaveRequests.map((item) => ['Leave request', item.name, item.date, item.type, item.status]),
      ...timesheets.flatMap((sheet) => (sheet.days || []).map((day) => ['Timesheet', sheet.employeeName, day.dayLabel, `${day.clockIn || ''} - ${day.clockOut || ''} (${day.totalHours ?? 0}h)`, sheet.approvedAt ? 'Approved' : 'Pending'])),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attendance.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Active item & employee for the right inspector
  const selectedTimesheet = timesheets.find(t => t.id === selectedTimesheetId) || timesheets.find(t => t.employeeId === selectedEmployeeId) || timesheets[0];
  const selectedException = exceptions.find(e => e.id === selectedId);
  const selectedLeave = leaveRequests.find(l => l.id === selectedId);
  const activeEmployeeId = selectedEmployeeId || selectedTimesheet?.employeeId || selectedException?.employeeId || selectedLeave?.employeeId;
  const activeEmployeeName = selectedTimesheet?.employeeName || selectedException?.name || selectedLeave?.name || 'Employee';
  const ts = timesheets.find(t => t.employeeId === activeEmployeeId) || selectedTimesheet;
  const activeInitials = initials(activeEmployeeName);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5">
      {/* ── Top Controls: 2 Clean Full-Width Rows ── */}
      {/* Row 1 (flex items-center justify-between gap-2 w-full mb-2.5): Left Filters & Right Primary Actions flush with right edge */}
      <div className="flex items-center justify-between gap-2 w-full mb-2.5">
        {/* Left group: DEPT All Departments, < 1 / N > pager, STATUS All, RANGE 30 days */}
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          <label className="flex items-center gap-1.5 border border-border-default text-body px-2.5 py-1.5 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card cursor-pointer shrink-0">
            <span className="text-muted text-[11px] font-semibold uppercase">Dept</span>
            <select
              aria-label="Department"
              value={departmentId}
              onChange={event => setDepartmentId(event.target.value)}
              className="bg-transparent text-xs font-medium outline-none cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              {(departmentData?.items ?? []).map(department => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="text-muted" />
          </label>

          {/* < 1/N > Timesheets Page Pagination */}
          <div className="flex items-center border border-border-default rounded-input text-xs bg-surface-raised shadow-card shrink-0">
            <button
              type="button"
              disabled={timesheetPage <= 1}
              onClick={() => setTimesheetPage(p => p - 1)}
              aria-label="Previous timesheet page"
              className="px-2 py-1.5 hover:bg-surface-muted disabled:opacity-40 transition-colors text-muted hover:text-heading cursor-pointer"
            >
              ‹
            </button>
            <span className="px-2 py-1 text-[11px] font-medium text-muted tabular-nums border-x border-border-default">
              {timesheetPage} / {timesheetPages}
            </span>
            <button
              type="button"
              disabled={timesheetPage >= timesheetPages}
              onClick={() => setTimesheetPage(p => p + 1)}
              aria-label="Next timesheet page"
              className="px-2 py-1.5 hover:bg-surface-muted disabled:opacity-40 transition-colors text-muted hover:text-heading cursor-pointer"
            >
              ›
            </button>
          </div>

          {/* Status: All ⌄ */}
          <label className="flex items-center gap-1.5 border border-border-default text-body px-2.5 py-1.5 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card cursor-pointer shrink-0">
            <span className="text-muted text-[11px] font-semibold uppercase">Status</span>
            <select
              aria-label="Status filter"
              value={needsActionOnly ? 'NEEDS_ACTION' : 'ALL'}
              onChange={e => setNeedsActionOnly(e.target.value === 'NEEDS_ACTION')}
              className="bg-transparent text-xs font-medium outline-none cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="NEEDS_ACTION">Needs Action</option>
            </select>
            <ChevronDown size={12} className="text-muted" />
          </label>

          {/* Range: 30 days ⌄ */}
          <label className="flex items-center gap-1.5 border border-border-default text-body px-2.5 py-1.5 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card cursor-pointer shrink-0">
            <span className="text-muted text-[11px] font-semibold uppercase">Range</span>
            <select
              aria-label="Punch completion range"
              value={attendanceRangeDays}
              onChange={event => setAttendanceRangeDays(Number(event.target.value))}
              className="bg-transparent text-xs font-medium outline-none cursor-pointer"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <ChevronDown size={12} className="text-muted" />
          </label>
        </div>

        {/* Right group: Request Time Off, Export, Approve All Valid aligned flush with right edge */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {data?.selfClock && (
            <Button
              size="sm"
              type="button"
              disabled={clockMutation.isPending || (Boolean(data.selfClock.clockIn) && Boolean(data.selfClock.clockOut))}
              onClick={() => clockMutation.mutate(data.selfClock.clockIn && !data.selfClock.clockOut ? 'OUT' : 'IN')}
              className="shadow-sm"
            >
              {clockMutation.isPending ? 'Saving...' : data.selfClock.clockIn && !data.selfClock.clockOut ? 'Clock Out' : data.selfClock.clockOut ? 'Shift Complete' : 'Clock In'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setLeaveDialogOpen(true)}
            disabled={!data?.selfClock}
            title={!data?.selfClock ? 'Link an active employee record to request time off' : undefined}
            className="shadow-sm"
          >
            Request Time Off
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={exportAttendance}
            disabled={isLoading || isError}
            className="gap-1.5 shadow-sm"
          >
            <Download size={13} /> Export
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={() => approveAllMutation.mutate(eligibleTimesheets.map(item => item.id))}
            disabled={!eligibleTimesheets.length || approveAllMutation.isPending}
            className="shadow-sm"
          >
            {approveAllMutation.isPending ? 'Approving...' : `Approve All Valid${eligibleTimesheets.length ? ` (${eligibleTimesheets.length})` : ''}`}
          </Button>
        </div>
      </div>

      {/* Row 2 (flex items-center justify-start gap-3 w-full mb-5): Left Overtime Controls */}
      <div className="flex items-center justify-start gap-3 w-full mb-5">
        <label className="flex items-center gap-1.5 border border-border-default text-body px-2.5 py-1.5 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card cursor-pointer shrink-0">
          <span className="text-muted text-[11px] font-semibold uppercase">Overtime threshold</span>
          <select
            aria-label="Overtime threshold"
            value={overtimeThreshold}
            onChange={e => setOvertimeThreshold(Number(e.target.value))}
            className="bg-transparent text-xs font-medium outline-none cursor-pointer"
          >
            <option value={40}>40 hrs/wk</option>
            <option value={35}>35 hrs/wk</option>
            <option value={45}>45 hrs/wk</option>
            <option value={48}>48 hrs/wk</option>
          </select>
          <ChevronDown size={12} className="text-muted" />
        </label>

        {/* Auto-Flag Overtime toggle */}
        <div className="flex items-center gap-2 border border-border-default px-2.5 py-1.5 rounded-input text-xs font-medium bg-surface-raised shadow-card shrink-0">
          <span className="text-body text-xs font-medium">Auto-Flag Overtime</span>
          <Switch
            color="primary"
            checked={autoFlagOvertime}
            onCheckedChange={setAutoFlagOvertime}
            aria-label="Auto-Flag Overtime"
          />
        </div>

        {(clockMutation.isError || approveMutation.isError || approveAllMutation.isError || createLeaveMutation.isError || leaveDecisionMutation.isError || resolveExceptionMutation.isError || correctPunchMutation.isError) && (
          <span role="alert" className="text-xs text-danger font-medium ml-auto">
            {clockMutation.error?.message || approveMutation.error?.message || approveAllMutation.error?.message || createLeaveMutation.error?.message || leaveDecisionMutation.error?.message || resolveExceptionMutation.error?.message || correctPunchMutation.error?.message || 'Action failed.'}
          </span>
        )}
      </div>

      {/* ── Top 4 KPI Cards (grid-cols-12 gap-5 mb-5) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5 mb-5 flex-shrink-0">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Total Timesheets</p>
          <p className="text-2xl font-bold text-heading mt-1 leading-tight">{summary.timesheetCount}</p>
          <p className="text-xs text-muted mt-1 leading-normal">Current period</p>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Total Exceptions</p>
          <p className="text-2xl font-bold text-danger mt-1 leading-tight">{summary.exceptionCount}</p>
          <p className="text-xs text-muted mt-1 leading-normal truncate">
            {exceptionDelta > 0 ? '+' : ''}{exceptionDelta} vs prior {summary.attendanceRateRangeDays} days
          </p>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Total Overtime</p>
          <p className="text-2xl font-bold text-heading mt-1 leading-tight">
            {Number(summary.overtimeHours || 0).toFixed(1)}h
          </p>
          <p className="text-xs text-muted mt-1 leading-normal">Across all departments</p>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Punch Completion</p>
          <p className="text-2xl font-bold text-heading mt-1 leading-tight">
            {summary.attendanceRate != null ? `${Math.round(summary.attendanceRate)}%` : '—'}
          </p>
          <p className="text-xs text-muted mt-1 leading-normal truncate">
            Past {summary.attendanceRateRangeDays} days · {summary.attendanceRateRecordedDays} recorded days
            {attendanceRateDelta != null ? ` · ${attendanceRateDelta > 0 ? '+' : ''}${attendanceRateDelta.toFixed(1)} pts` : ''}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12 text-muted">
          <Loader2 className="animate-spin mr-2" size={20} /> Loading attendance data...
        </div>
      )}

      {isError && (
        <div className="p-6 text-danger text-center bg-danger-light/20 rounded-card border border-danger/30">
          {error?.message || 'Error loading attendance data'}
        </div>
      )}

      {/* ── Main Workspace: Left Column (col-span-8) & Right Inspector (col-span-4) with gap-5 and items-start ── */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
          {/* ── Left Column (col-span-8 space-y-5): Weekly Timesheets + Time Off Requests ── */}
          <div className="col-span-12 lg:col-span-8 space-y-5 min-w-0">
            {/* 1. Weekly Timesheets Table Card (8 rows per page) */}
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-raised">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-accent" />
                  <h2 className="text-sm font-bold text-heading">Weekly Timesheets</h2>
                  <span className="text-xs text-muted font-medium">({timesheets.length} items)</span>
                </div>
                {isAdmin && eligibleTimesheets.length > 0 && (
                  <span className="text-xs text-muted font-medium">
                    {eligibleTimesheets.length} ready to approve
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                    <tr>
                      <th className="px-4 py-2.5 text-left bg-surface-muted">Employee Name</th>
                      <th className="px-4 py-2.5 text-left bg-surface-muted">Week</th>
                      <th className="px-4 py-2.5 text-right bg-surface-muted">Hours</th>
                      <th className="px-4 py-2.5 text-center bg-surface-muted w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {paginatedTimesheets.map(sheet => {
                      const isSelected = selectedTimesheetId === sheet.id || (activeEmployeeId === sheet.employeeId && !selectedException && !selectedLeave);
                      return (
                        <tr
                          key={sheet.id}
                          onClick={() => {
                            setSelectedId(sheet.id);
                            setSelectedTimesheetId(sheet.id);
                            setSelectedEmployeeId(sheet.employeeId);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted/60'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden">
                                {(sheet.employeeName || '?').charAt(0)}
                              </div>
                              <div className="min-w-0 truncate">
                                <p className="text-sm font-semibold text-heading truncate">{sheet.employeeName}</p>
                                <p className="text-[11px] text-muted truncate">{sheet.departmentName || 'General'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs sm:text-sm text-body whitespace-nowrap">
                            {sheet.weekStart ? `Week of ${formatShortDate(sheet.weekStart)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                            <span className="text-sm font-semibold text-heading">{sheet.totalHours || 0}h</span>
                            {sheet.overtimeHours > 0 && (
                              <span className="text-[11px] text-warning font-medium ml-1">({sheet.overtimeHours}h OT)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <Badge variant={sheet.approvedAt ? 'success' : 'warning'}>
                              {sheet.approvedAt ? 'Approved' : 'Pending'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {paginatedTimesheets.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-sm text-muted">
                          No weekly timesheets match the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer (8 rows per page) */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-border-default text-xs text-muted bg-surface-muted/30">
                <span>
                  Showing {totalTimesheets === 0 ? 0 : (timesheetPage - 1) * TIMESHEET_PAGE_SIZE + 1}–{Math.min(timesheetPage * TIMESHEET_PAGE_SIZE, totalTimesheets)} of {totalTimesheets}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={timesheetPage <= 1}
                    onClick={() => setTimesheetPage(p => p - 1)}
                    className="h-7 px-2 text-xs"
                  >
                    Previous
                  </Button>
                  <span>Page {totalTimesheets === 0 ? 0 : timesheetPage} of {timesheetPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={timesheetPage >= timesheetPages}
                    onClick={() => setTimesheetPage(p => p + 1)}
                    className="h-7 px-2 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            {/* 2. Time Off Requests Card (directly underneath Timesheets in Left Column) */}
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-raised">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-primary" />
                  <h2 className="text-sm font-bold text-heading">Time Off Requests</h2>
                  <span className="text-xs text-muted font-medium">({visibleLeaveRequests.length} items)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLeaveDialogOpen(true)}
                  disabled={!data?.selfClock}
                  className="text-xs font-semibold text-accent hover:underline disabled:opacity-50 cursor-pointer"
                >
                  + Request Time Off
                </button>
              </div>

              <div className="divide-y divide-border-subtle max-h-[240px] overflow-y-auto">
                {visibleLeaveRequests.map(item => {
                  const isSelected = selectedId === item.id;
                  const displayDate = item.endDate ? `${formatShortDate(item.date)} - ${formatShortDate(item.endDate)}` : formatShortDate(item.date);
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSelectedEmployeeId(item.employeeId);
                      }}
                      className={`flex items-center justify-between px-5 py-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent-light/50 border-l-4 border-l-primary' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden">
                          {item.avatar ? <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" /> : (item.name?.[0] || '?')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-heading truncate">{item.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-strong text-body border border-border-subtle">
                              {item.type}
                            </span>
                            <span className="text-xs text-muted">{displayDate}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          item.status === 'APPROVED' ? 'bg-success-light text-success-text' :
                          item.status === 'REJECTED' ? 'bg-danger-light text-danger' :
                          'bg-warning-light text-warning'
                        }`}>
                          {item.status}
                        </span>
                        {isAdmin && item.status === 'PENDING' && (
                          <div className="flex items-center gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={leaveDecisionMutation.isPending}
                              onClick={() => leaveDecisionMutation.mutate({ id: item.id, decision: 'APPROVED' })}
                              className="px-2 py-1 text-xs font-semibold rounded bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-60 cursor-pointer"
                              title="Approve leave"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={leaveDecisionMutation.isPending}
                              onClick={() => leaveDecisionMutation.mutate({ id: item.id, decision: 'REJECTED' })}
                              className="px-2 py-1 text-xs font-medium rounded border border-border-default text-body hover:bg-surface-muted transition-colors disabled:opacity-60 cursor-pointer"
                              title="Reject leave"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleLeaveRequests.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted">
                    No time off requests found.
                  </div>
                )}
              </div>

              {/* Annual Leave Balances & Policies (Collapsed by default) */}
              <div className="border-t border-border-subtle text-xs bg-surface-muted/20">
                <button
                  type="button"
                  onClick={() => setBalancesOpen(prev => !prev)}
                  className="w-full p-3.5 cursor-pointer font-semibold text-muted hover:text-heading select-none flex items-center justify-between text-left"
                  aria-expanded={balancesOpen}
                >
                  <span>{leaveBalanceData?.year ?? 'Current year'} Annual Leave Balances</span>
                  <span className="text-[11px] text-accent">
                    {balancesOpen ? 'Collapse balances & policies ▴' : 'Expand balances & policies ▾'}
                  </span>
                </button>
                {balancesOpen && (
                  <div className="px-3.5 pb-3.5">
                    <div className="max-h-36 overflow-auto">
                      {(leaveBalanceData?.items ?? []).filter(item => departmentId === 'ALL' || item.departmentId === departmentId).map(item => (
                        <div key={`${item.employeeId}-${item.type}`} className="grid grid-cols-[1fr_100px_100px_100px] gap-2 py-1 border-b border-border-subtle text-[11px]">
                          <span className="truncate text-body font-medium">{item.employeeName} · {LEAVE_TYPE_LABELS[item.type]}</span>
                          <span className="text-muted">Allowance: {item.annualAllowanceDays ?? '—'}</span>
                          <span className="text-muted">Reserved: {item.pendingDays}</span>
                          <span className="font-semibold text-heading">Remaining: {item.remainingDays ?? '—'}</span>
                        </div>
                      ))}
                      {!leaveBalanceData?.items?.length && <p className="py-2 text-xs text-muted">No active employees found.</p>}
                    </div>
                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t border-border-subtle">
                        <p className="font-semibold text-heading mb-2">Manage annual leave policies</p>
                        <div className="flex flex-wrap items-end gap-2.5">
                          <label className="text-xs text-muted">
                            Type
                            <select
                              aria-label="Policy leave type"
                              value={policyType}
                              onChange={event => setPolicyType(event.target.value)}
                              className="mt-1 block rounded-input border border-border-default bg-surface-raised px-2 py-1 text-body text-xs"
                            >
                              {Object.entries(LEAVE_TYPE_LABELS).map(([type, label]) => (
                                <option key={type} value={type}>{label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Allowance (days)
                            <input
                              aria-label="Annual leave allowance"
                              type="number"
                              min="0"
                              max="366"
                              step="1"
                              value={policyDraft.annualAllowanceDays}
                              onChange={event => setPolicyDraft(current => ({ ...current, annualAllowanceDays: event.target.value }))}
                              className="mt-1 block w-28 rounded-input border border-border-default px-2 py-1 text-body text-xs"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 pb-1 text-xs text-body cursor-pointer">
                            <input
                              type="checkbox"
                              checked={policyDraft.weekdaysOnly}
                              onChange={event => setPolicyDraft(current => ({ ...current, weekdaysOnly: event.target.checked }))}
                            />
                            Weekdays only
                          </label>
                          <button
                            type="button"
                            disabled={policyMutation.isPending || policyDraft.annualAllowanceDays === ''}
                            onClick={() => policyMutation.mutate({ type: policyType, body: { annualAllowanceDays: Number(policyDraft.annualAllowanceDays), weekdaysOnly: policyDraft.weekdaysOnly } })}
                            className="rounded-input bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-60 cursor-pointer"
                          >
                            {policyMutation.isPending ? 'Saving…' : 'Save policy'}
                          </button>
                          {policyMutation.isError && <span role="alert" className="text-xs text-danger">{policyMutation.error?.message || 'Could not save leave policy.'}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Column (col-span-4 space-y-5): Daily Breakdown Inspector + Attendance Exceptions ── */}
          <div className="col-span-12 lg:col-span-4 space-y-5 min-w-0">
            {/* 1. Selected Employee Daily Breakdown Inspector */}
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
              {/* Profile Header */}
              <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between gap-2.5 bg-surface-raised">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden">
                    {selectedTimesheet?.avatar ? <img src={selectedTimesheet.avatar} alt={activeEmployeeName} className="w-full h-full object-cover" /> : activeInitials}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-heading whitespace-nowrap">{activeEmployeeName}</h2>
                    <p className="text-xs text-muted truncate">{selectedTimesheet?.departmentName || 'General'} · Daily Breakdown</p>
                  </div>
                </div>
                <button
                  disabled={!ts || Boolean(ts.approvedAt) || approveMutation.isPending}
                  onClick={() => ts && approveMutation.mutate(ts.id)}
                  className="bg-primary text-white px-3 py-1.5 rounded-input text-xs font-semibold hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60 shrink-0 cursor-pointer whitespace-nowrap"
                >
                  {approveMutation.isPending ? 'Approving…' : ts?.approvedAt ? 'Week Approved' : 'Approve Week'}
                </button>
              </div>

              {/* Daily Timesheet Days Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface-muted/60 border-b border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                    <tr>
                      <th className="px-2.5 py-2 w-16 whitespace-nowrap">Day</th>
                      <th className="px-2.5 py-2 whitespace-nowrap text-xs">In</th>
                      <th className="px-2.5 py-2 whitespace-nowrap text-xs">Out</th>
                      <th className="px-2.5 py-2 text-right whitespace-nowrap">Total</th>
                      <th className="px-1.5 py-2 text-right w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {ts && ts.days && ts.days.length > 0 ? (
                      ts.days.map((day, idx) => (
                        <tr key={day.id || idx} className="hover:bg-surface-muted/50 transition-colors">
                          <td className="px-2.5 py-2 text-body font-medium whitespace-nowrap">{day.dayLabel || '—'}</td>
                          <td className="px-2.5 py-2 font-semibold text-heading tabular-nums whitespace-nowrap text-xs">{day.clockIn || '—'}</td>
                          <td className="px-2.5 py-2 font-semibold text-heading tabular-nums whitespace-nowrap text-xs">{day.clockOut || '—'}</td>
                          <td className="px-2.5 py-2 text-body text-right tabular-nums whitespace-nowrap">{day.totalHours || '0'}h</td>
                          <td className="px-1.5 py-2 text-right">
                            {isAdmin && !ts?.approvedAt && /^\d{4}-\d{2}-\d{2}$/.test(day.dayLabel) && (
                              <button
                                type="button"
                                aria-label={`Correct punches for ${day.dayLabel}`}
                                onClick={() => {
                                  setCorrectionTarget({ id: day.id, employeeName: activeEmployeeName, dayLabel: day.dayLabel });
                                  setCorrectionForm({
                                    clockInDate: day.clockInDate || day.dayLabel,
                                    clockInTime: day.clockIn || '',
                                    clockOutDate: day.clockOutDate || (day.clockOut ? day.dayLabel : ''),
                                    clockOutTime: day.clockOut || '',
                                  });
                                }}
                                className="rounded p-1 text-muted hover:bg-surface-muted hover:text-heading cursor-pointer"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-center text-muted text-xs">
                          No timesheet days recorded for this week.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Weekly Total Footer */}
              {ts && (
                <div className="px-4 py-2.5 bg-surface-muted/30 border-t border-border-default flex items-center justify-between text-xs">
                  <span className="font-semibold text-heading">Weekly Total</span>
                  <div className="flex gap-3 text-muted">
                    <span>Reg: <strong className="text-body">{ts.regularHours}h</strong></span>
                    <span>OT: <strong className="text-body">{ts.overtimeHours}h</strong></span>
                    <span className="font-bold text-heading">Total: {ts.totalHours}h</span>
                  </div>
                </div>
              )}

              {/* Exception Notice Banner (if active item has exception) */}
              {selectedException && (
                <div className={`p-3.5 border-t ${selectedException.alert ? 'bg-danger-light/30 border-danger/20' : 'bg-surface-muted/20 border-border-subtle'}`}>
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${selectedException.alert ? 'text-danger' : 'text-muted'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold ${selectedException.alert ? 'text-danger' : 'text-heading'}`}>
                        {selectedException.alert ? 'Action Required' : 'Resolved'}: {selectedException.label}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                        {selectedException.alert
                          ? `Timesheet on ${formatShortDate(selectedException.date)} needs review.`
                          : `Exception from ${formatShortDate(selectedException.date)} resolved.`}
                      </p>
                    </div>
                    {isAdmin && selectedException.alert && (
                      <button
                        type="button"
                        disabled={resolveExceptionMutation.isPending}
                        onClick={() => resolveExceptionMutation.mutate(selectedException.id)}
                        className="px-2 py-1 rounded bg-primary text-white text-xs font-medium hover:bg-primary-hover disabled:opacity-60 shrink-0 cursor-pointer"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Leave Notice Banner (if active item has leave) */}
              {selectedLeave && (
                <div className="p-3.5 border-t border-border-subtle bg-surface-muted/20">
                  <div className="flex items-start gap-2.5">
                    <Clock size={15} className="mt-0.5 text-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-heading">
                        Time Off: {selectedLeave.type}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                        Requested {formatShortDate(selectedLeave.date)} {selectedLeave.endDate ? `to ${formatShortDate(selectedLeave.endDate)}` : ''} · {selectedLeave.status}
                      </p>
                    </div>
                    {isAdmin && selectedLeave.status === 'PENDING' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={leaveDecisionMutation.isPending}
                          onClick={() => leaveDecisionMutation.mutate({ id: selectedLeave.id, decision: 'APPROVED' })}
                          className="px-2 py-1 rounded bg-primary text-white text-xs font-medium hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={leaveDecisionMutation.isPending}
                          onClick={() => leaveDecisionMutation.mutate({ id: selectedLeave.id, decision: 'REJECTED' })}
                          className="px-2 py-1 rounded border border-border-default text-xs text-body hover:bg-surface-muted disabled:opacity-60 cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Attendance Exceptions Card (Right Column, directly underneath Daily Breakdown) */}
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between gap-2 whitespace-nowrap bg-surface-raised">
                <div className="flex items-center gap-2 shrink-0">
                  <AlertTriangle size={15} className="text-danger shrink-0" />
                  <h2 className="text-sm font-semibold text-heading shrink-0">Attendance Exceptions</h2>
                  <span className="text-xs text-muted font-medium shrink-0">({visibleExceptions.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNeedsActionOnly(c => !c)}
                  className="text-xs text-accent hover:underline cursor-pointer shrink-0 whitespace-nowrap"
                >
                  {needsActionOnly ? 'Show All' : 'Action Only'}
                </button>
              </div>

              <div className="divide-y divide-border-subtle max-h-[260px] overflow-y-auto pr-1">
                {visibleExceptions.map(item => {
                  const isSelected = selectedId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSelectedEmployeeId(item.employeeId);
                      }}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-danger-light/40 border-l-4 border-l-danger' : 'bg-surface-raised hover:bg-surface-muted/60 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden mt-0.5">
                          {item.avatar ? <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" /> : (item.name?.[0] || '?')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-heading truncate">{item.name}</p>
                          <div className={`flex items-center gap-1.5 text-xs font-medium mt-0.5 ${item.alert ? 'text-danger' : 'text-muted'}`}>
                            {item.alert ? <AlertTriangle size={12} className="shrink-0" /> : <Clock size={12} className="shrink-0" />}
                            <span className="truncate">{item.label}</span>
                          </div>
                          <p className="text-[11px] text-muted mt-0.5">{formatShortDate(item.date)}</p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-2">
                        {isAdmin && item.alert ? (
                          <button
                            type="button"
                            disabled={resolveExceptionMutation.isPending}
                            onClick={e => {
                              e.stopPropagation();
                              resolveExceptionMutation.mutate(item.id);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-60 shadow-sm cursor-pointer"
                            title="Resolve exception"
                          >
                            Resolve
                          </button>
                        ) : (
                          <span className="text-xs text-muted font-medium">Resolved</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleExceptions.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted">
                    No timesheet exceptions found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Dialogs (Zero deleted features) */}
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
            <Input type="date" required value={leaveForm.startDate} onChange={event => setLeaveForm(current => ({ ...current, startDate: event.target.value }))} className="mt-1" />
          </label>
          <label className="block text-sm font-medium text-body">End date <span className="font-normal text-muted">(optional)</span>
            <Input type="date" min={leaveForm.startDate || undefined} value={leaveForm.endDate} onChange={event => setLeaveForm(current => ({ ...current, endDate: event.target.value }))} className="mt-1" />
          </label>
          {createLeaveMutation.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{createLeaveMutation.error?.message || 'Could not submit this request.'}</AlertDescription>
            </Alert>
          )}
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
              <Input type="date" required value={correctionForm.clockInDate} onChange={event => setCorrectionForm(current => ({ ...current, clockInDate: event.target.value }))} className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-body">Clock-in time
              <Input type="time" required value={correctionForm.clockInTime} onChange={event => setCorrectionForm(current => ({ ...current, clockInTime: event.target.value }))} className="mt-1" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-body">Clock-out date <span className="font-normal text-muted">(optional)</span>
              <Input type="date" min={correctionForm.clockInDate || undefined} value={correctionForm.clockOutDate} onChange={event => setCorrectionForm(current => ({ ...current, clockOutDate: event.target.value }))} className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-body">Clock-out time <span className="font-normal text-muted">(optional)</span>
              <Input type="time" value={correctionForm.clockOutTime} onChange={event => setCorrectionForm(current => ({ ...current, clockOutTime: event.target.value }))} className="mt-1" />
            </label>
          </div>
          {Boolean(correctionForm.clockOutDate) !== Boolean(correctionForm.clockOutTime) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Enter both clock-out date and time, or leave both empty.</AlertDescription>
            </Alert>
          )}
          {correctPunchMutation.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{correctPunchMutation.error?.message || 'Could not save the punch correction.'}</AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>
    </div>
  );
}
