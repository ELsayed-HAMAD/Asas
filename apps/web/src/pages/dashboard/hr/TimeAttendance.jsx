import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function initials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TimeAttendance() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTimesheetId, setSelectedTimesheetId] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [overtimeThreshold, setOvertimeThreshold] = useState(40);
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [autoFlagOvertime, setAutoFlagOvertime] = useState(true);
  const [departmentId, setDepartmentId] = useState('ALL');
  const [attendanceRangeDays, setAttendanceRangeDays] = useState(30);
  const [inspectorTab, setInspectorTab] = useState('punches'); // 'punches' | 'exceptions'

  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctionForm, setCorrectionForm] = useState({
    clockInDate: '',
    clockInTime: '',
    clockOutDate: '',
    clockOutTime: '',
  });

  const { data: activeMemberRole } = useActiveMemberRole();
  const roleName = getMemberRoleName(activeMemberRole);
  const isAdmin = ['OWNER', 'ADMIN'].includes(roleName);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.attendance.list({ rangeDays: attendanceRangeDays }),
    queryFn: () => hrApi.listAttendance({ rangeDays: attendanceRangeDays }),
  });

  const clockMutation = useMutation({
    mutationFn: (action) => (action === 'IN' ? hrApi.clockIn() : hrApi.clockOut()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  });

  const approveMutation = useMutation({
    mutationFn: (timesheetId) => hrApi.approveTimesheet(timesheetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  });

  const approveAllMutation = useMutation({
    mutationFn: (ids) => hrApi.approveValidTimesheets(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  });

  const resolveExceptionMutation = useMutation({
    mutationFn: (id) => hrApi.resolveAttendanceException(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() }),
  });

  const correctPunchMutation = useMutation({
    mutationFn: ({ id, body }) => hrApi.correctAttendancePunch(id, body),
    onSuccess: () => {
      setCorrectionTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() });
    },
  });

  const { data: departmentData } = useQuery({
    queryKey: queryKeys.hr.departments.list(),
    queryFn: hrApi.getDepartments,
  });

  // Normalize rows
  const exceptions = useMemo(
    () =>
      (data?.exceptions ?? [])
        .filter((item) => departmentId === 'ALL' || item.departmentId === departmentId)
        .map((item) => ({
          ...item,
          name: item.employeeName,
          avatar: item.employeeAvatar,
        })),
    [data?.exceptions, departmentId]
  );

  const timesheets = useMemo(
    () =>
      (data?.timesheets ?? []).filter(
        (item) => departmentId === 'ALL' || item.departmentId === departmentId
      ),
    [data?.timesheets, departmentId]
  );

  const eligibleTimesheets = timesheets.filter((item) => item.approvalEligible);
  const visibleExceptions = exceptions.filter(
    (item) => (!needsActionOnly || item.alert) && (autoFlagOvertime || item.type !== 'OVERTIME')
  );

  const summary = data?.summary ?? {
    exceptionCount: 0,
    exceptionCountPreviousPeriod: 0,
    onLeaveCount: 0,
    attendanceRate: null,
    attendanceRatePreviousPeriod: null,
    attendanceRateRangeDays: attendanceRangeDays,
    attendanceRateRecordedDays: 0,
    timesheetCount: 0,
    overtimeHours: 0,
  };

  const exceptionDelta = summary.exceptionCount - summary.exceptionCountPreviousPeriod;
  const attendanceRateDelta =
    summary.attendanceRate != null && summary.attendanceRatePreviousPeriod != null
      ? Math.round((summary.attendanceRate - summary.attendanceRatePreviousPeriod) * 10) / 10
      : null;

  // Auto-select first timesheet if none is selected
  useEffect(() => {
    if (!selectedEmployeeId && timesheets.length > 0) {
      setSelectedEmployeeId(timesheets[0].employeeId);
      setSelectedTimesheetId(timesheets[0].id);
    } else if (!selectedId && exceptions.length > 0) {
      setSelectedId(exceptions[0].id);
    }
  }, [timesheets, exceptions, selectedEmployeeId, selectedId]);

  function exportAttendance() {
    const rows = [
      ['Record Type', 'Employee', 'Date', 'Details', 'Status'],
      ...visibleExceptions.map((item) => [
        'Exception',
        item.name,
        item.date,
        item.label,
        item.alert ? 'Needs action' : 'Recorded',
      ]),
      ...timesheets.flatMap((sheet) =>
        (sheet.days || []).map((day) => [
          'Timesheet',
          sheet.employeeName,
          day.dayLabel,
          `${day.clockIn || ''} - ${day.clockOut || ''} (${day.totalHours ?? 0}h)`,
          sheet.approvedAt ? 'Approved' : 'Pending',
        ])
      ),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attendance.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Active item & employee for the right inspector
  const selectedTimesheet =
    timesheets.find((t) => t.id === selectedTimesheetId) ||
    timesheets.find((t) => t.employeeId === selectedEmployeeId) ||
    timesheets[0];
  const selectedException = exceptions.find((e) => e.id === selectedId);
  const activeEmployeeId =
    selectedEmployeeId || selectedTimesheet?.employeeId || selectedException?.employeeId;
  const activeEmployeeName =
    selectedTimesheet?.employeeName || selectedException?.name || 'Employee';
  const ts = timesheets.find((t) => t.employeeId === activeEmployeeId) || selectedTimesheet;
  const activeInitials = initials(activeEmployeeName);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5">
      {/* ── Unified Single Toolbar: Filter Controls & Action Buttons ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 w-full mb-5">
        {/* Left Filter Group */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger aria-label="Department" className="h-8 text-xs font-medium w-auto min-w-[130px] bg-surface-raised shadow-card">
              <span className="text-muted text-[11px] font-semibold uppercase mr-1">Dept</span>
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Departments</SelectItem>
              {(departmentData?.items ?? []).map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={needsActionOnly ? 'NEEDS_ACTION' : 'ALL'}
            onValueChange={(v) => setNeedsActionOnly(v === 'NEEDS_ACTION')}
          >
            <SelectTrigger aria-label="Status filter" className="h-8 text-xs font-medium w-auto min-w-[95px] bg-surface-raised shadow-card">
              <span className="text-muted text-[11px] font-semibold uppercase mr-1">Status</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="NEEDS_ACTION">Needs Action</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(attendanceRangeDays)}
            onValueChange={(v) => setAttendanceRangeDays(Number(v))}
          >
            <SelectTrigger aria-label="Punch completion range" className="h-8 text-xs font-medium w-auto min-w-[105px] bg-surface-raised shadow-card">
              <span className="text-muted text-[11px] font-semibold uppercase mr-1">Range</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(overtimeThreshold)}
            onValueChange={(e) => setOvertimeThreshold(Number(e))}
          >
            <SelectTrigger aria-label="Overtime threshold" className="h-8 text-xs font-medium w-auto min-w-[135px] bg-surface-raised shadow-card">
              <span className="text-muted text-[11px] font-semibold uppercase mr-1">OT</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="40">40 hrs/wk</SelectItem>
              <SelectItem value="35">35 hrs/wk</SelectItem>
              <SelectItem value="45">45 hrs/wk</SelectItem>
              <SelectItem value="48">48 hrs/wk</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 border border-border-default px-2 py-1 rounded-input text-xs font-medium bg-surface-raised shadow-card shrink-0">
            <span className="text-body text-[11px] font-medium">Auto-Flag OT</span>
            <Switch
              color="primary"
              checked={autoFlagOvertime}
              onCheckedChange={setAutoFlagOvertime}
              aria-label="Auto-Flag Overtime"
              className="scale-90"
            />
          </div>
        </div>

        {/* Right Action Group */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {data?.selfClock && (
            <Button
              size="sm"
              type="button"
              disabled={
                clockMutation.isPending ||
                (Boolean(data.selfClock.clockIn) && Boolean(data.selfClock.clockOut))
              }
              onClick={() =>
                clockMutation.mutate(
                  data.selfClock.clockIn && !data.selfClock.clockOut ? 'OUT' : 'IN'
                )
              }
              className="shadow-sm font-semibold"
            >
              {clockMutation.isPending
                ? 'Saving...'
                : data.selfClock.clockIn && !data.selfClock.clockOut
                ? 'Clock Out'
                : data.selfClock.clockOut
                ? 'Shift Complete'
                : 'Clock In'}
            </Button>
          )}

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
            onClick={() => approveAllMutation.mutate(eligibleTimesheets.map((item) => item.id))}
            disabled={!eligibleTimesheets.length || approveAllMutation.isPending}
            className="shadow-sm font-semibold"
          >
            {approveAllMutation.isPending
              ? 'Approving...'
              : `Approve All Valid${eligibleTimesheets.length ? ` (${eligibleTimesheets.length})` : ''}`}
          </Button>
        </div>

        {(clockMutation.isError ||
          approveMutation.isError ||
          approveAllMutation.isError ||
          resolveExceptionMutation.isError ||
          correctPunchMutation.isError) && (
          <div role="alert" className="w-full text-xs text-danger font-medium mt-1">
            {clockMutation.error?.message ||
              approveMutation.error?.message ||
              approveAllMutation.error?.message ||
              resolveExceptionMutation.error?.message ||
              correctPunchMutation.error?.message ||
              'Action failed.'}
          </div>
        )}
      </div>

      {/* ── 4 KPI Cards ── */}
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
            {exceptionDelta > 0 ? '+' : ''}
            {exceptionDelta} vs prior {summary.attendanceRateRangeDays} days
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
            {attendanceRateDelta != null
              ? ` · ${attendanceRateDelta > 0 ? '+' : ''}${attendanceRateDelta.toFixed(1)} pts`
              : ''}
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

      {/* ── Main Workspace: Left Column (Timesheets) & Right Column (Unified Tabbed Inspector) ── */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
          {/* ── Left Column: Weekly Timesheets Table (col-span-12 lg:col-span-8) ── */}
          <div className="col-span-12 lg:col-span-8 space-y-5 min-w-0">
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

              <div className="max-h-[580px] overflow-y-auto overflow-x-hidden">
                <Table wrapperClassName="overflow-x-hidden" className="w-full table-fixed text-left border-collapse">
                  <colgroup>
                    <col className="w-[27%]" />
                    <col className="w-[23%]" />
                    <col className="w-[26%]" />
                    <col className="w-[24%]" />
                  </colgroup>
                  <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="px-4 py-2.5 text-left rtl:text-right bg-surface-muted truncate">Employee Name</TableHead>
                      <TableHead className="px-4 py-2.5 text-left rtl:text-right bg-surface-muted truncate">Week</TableHead>
                      <TableHead className="px-4 py-2.5 text-right rtl:text-left bg-surface-muted truncate">Hours</TableHead>
                      <TableHead className="px-4 py-2.5 text-center bg-surface-muted truncate">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {timesheets.map((sheet) => {
                      const isSelected =
                        selectedTimesheetId === sheet.id ||
                        (activeEmployeeId === sheet.employeeId && !selectedException);
                      return (
                        <TableRow
                          key={sheet.id}
                          onClick={() => {
                            setSelectedId(sheet.id);
                            setSelectedTimesheetId(sheet.id);
                            setSelectedEmployeeId(sheet.employeeId);
                          }}
                          className={`cursor-pointer transition-colors border-0 ${
                            isSelected
                              ? 'bg-accent-light/50'
                              : 'bg-surface-raised hover:bg-surface-muted/60'
                          }`}
                        >
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden">
                                {(sheet.employeeName || '?').charAt(0)}
                              </div>
                              <div className="min-w-0 truncate">
                                <p className="text-sm font-semibold text-heading truncate">{sheet.employeeName}</p>
                                <p className="text-[11px] text-muted truncate">{sheet.departmentName || 'General'}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-xs sm:text-sm text-body truncate">
                            {sheet.weekStart ? `Week of ${formatShortDate(sheet.weekStart)}` : '—'}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right rtl:text-left tabular-nums truncate">
                            <span className="text-sm font-semibold text-heading">{sheet.totalHours || 0}h</span>
                            {sheet.overtimeHours > 0 && (
                              <span className="text-[11px] text-warning font-medium ml-1">
                                ({sheet.overtimeHours}h OT)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-center">
                            <Badge variant={sheet.approvedAt ? 'success' : 'warning'} className="truncate text-[11px]">
                              {sheet.approvedAt ? 'Approved' : 'Pending'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {timesheets.length === 0 && (
                      <TableRow className="hover:bg-transparent border-0">
                        <TableCell colSpan={4} className="p-8 text-center text-sm text-muted">
                          No weekly timesheets match the selected filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* ── Right Column: Single Unified Inspector Card (col-span-12 lg:col-span-4) ── */}
          <div className="col-span-12 lg:col-span-4 space-y-5 min-w-0">
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
              {/* Header: Employee Profile + Integrated Tab Switcher */}
              <div className="p-4 border-b border-border-subtle flex items-center justify-between gap-2.5 bg-surface-raised flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden">
                    {selectedTimesheet?.avatar ? (
                      <img
                        src={selectedTimesheet.avatar}
                        alt={activeEmployeeName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      activeInitials
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-heading truncate">{activeEmployeeName}</h2>
                    <p className="text-[11px] text-muted truncate">
                      {selectedTimesheet?.departmentName || 'General'}
                    </p>
                  </div>
                </div>

                {/* Sub-Tabs: Daily Punches vs Exceptions */}
                <div className="flex items-center p-0.5 rounded-lg bg-surface-muted border border-border-subtle shrink-0">
                  <button
                    type="button"
                    onClick={() => setInspectorTab('punches')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      inspectorTab === 'punches'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    <Clock size={12} />
                    <span>Daily Punches</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectorTab('exceptions')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      inspectorTab === 'exceptions'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    <AlertTriangle size={12} className={visibleExceptions.length > 0 ? 'text-danger' : 'text-muted'} />
                    <span>Exceptions ({visibleExceptions.length})</span>
                  </button>
                </div>
              </div>

              {/* ── View 1: Daily Punches Inspector ── */}
              {inspectorTab === 'punches' && (
                <div>
                  <div className="px-4 py-2.5 bg-surface-muted/30 border-b border-border-subtle flex items-center justify-between text-xs">
                    <span className="font-medium text-muted">Weekly Log</span>
                    <Button
                      size="sm"
                      type="button"
                      disabled={!ts || Boolean(ts.approvedAt) || approveMutation.isPending}
                      onClick={() => ts && approveMutation.mutate(ts.id)}
                      className="h-7 text-xs font-semibold"
                    >
                      {approveMutation.isPending
                        ? 'Approving…'
                        : ts?.approvedAt
                        ? 'Week Approved'
                        : 'Approve Week'}
                    </Button>
                  </div>

                  <div className="w-full overflow-hidden">
                    <Table wrapperClassName="overflow-x-hidden" className="w-full table-fixed text-left border-collapse text-xs">
                      <colgroup>
                        <col className="w-[28%]" />
                        <col className="w-[22%]" />
                        <col className="w-[22%]" />
                        <col className="w-[18%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <TableHeader className="bg-surface-muted/60 border-b border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                        <TableRow className="hover:bg-transparent border-0">
                          <TableHead className="px-2.5 py-2 text-left rtl:text-right truncate">Day</TableHead>
                          <TableHead className="px-2 py-2 text-left rtl:text-right truncate">In</TableHead>
                          <TableHead className="px-2 py-2 text-left rtl:text-right truncate">Out</TableHead>
                          <TableHead className="px-2 py-2 text-right rtl:text-left truncate">Total</TableHead>
                          <TableHead className="px-1 py-2 text-right rtl:text-left" />
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border-subtle">
                        {ts && ts.days && ts.days.length > 0 ? (
                          ts.days.map((day, idx) => (
                            <TableRow key={day.id || idx} className="hover:bg-surface-muted/50 transition-colors border-0">
                              <TableCell className="px-2.5 py-2 text-body font-medium truncate">
                                {day.dayLabel || '—'}
                              </TableCell>
                              <TableCell className="px-2 py-2 font-semibold text-heading tabular-nums text-xs truncate">
                                {day.clockIn || '—'}
                              </TableCell>
                              <TableCell className="px-2 py-2 font-semibold text-heading tabular-nums text-xs truncate">
                                {day.clockOut || '—'}
                              </TableCell>
                              <TableCell className="px-2 py-2 text-body text-right rtl:text-left tabular-nums truncate">
                                {day.totalHours || '0'}h
                              </TableCell>
                              <TableCell className="px-1 py-2 text-right rtl:text-left">
                                {isAdmin && !ts?.approvedAt && /^\d{4}-\d{2}-\d{2}$/.test(day.dayLabel) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="button"
                                    aria-label={`Correct punches for ${day.dayLabel}`}
                                    onClick={() => {
                                      setCorrectionTarget({
                                        id: day.id,
                                        employeeName: activeEmployeeName,
                                        dayLabel: day.dayLabel,
                                      });
                                      setCorrectionForm({
                                        clockInDate: day.clockInDate || day.dayLabel,
                                        clockInTime: day.clockIn || '',
                                        clockOutDate: day.clockOutDate || (day.clockOut ? day.dayLabel : ''),
                                        clockOutTime: day.clockOut || '',
                                      });
                                    }}
                                    className="h-6 w-6 p-0 text-muted hover:text-heading"
                                  >
                                    <Pencil size={13} />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow className="hover:bg-transparent border-0">
                            <TableCell colSpan={5} className="px-4 py-6 text-center text-muted text-xs">
                              No timesheet days recorded for this week.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Weekly Total Footer */}
                  {ts && (
                    <div className="px-4 py-2.5 bg-surface-muted/40 border-t border-border-default flex items-center justify-between text-xs">
                      <span className="font-semibold text-heading">Weekly Total</span>
                      <div className="flex gap-3 text-muted">
                        <span>
                          Reg: <strong className="text-body">{ts.regularHours}h</strong>
                        </span>
                        <span>
                          OT: <strong className="text-body">{ts.overtimeHours}h</strong>
                        </span>
                        <span className="font-bold text-heading">Total: {ts.totalHours}h</span>
                      </div>
                    </div>
                  )}

                  {/* Inline Exception Banner if employee has active anomaly */}
                  {selectedException && (
                    <div
                      className={`p-3.5 border-t ${
                        selectedException.alert
                          ? 'bg-danger-light/30 border-danger/20'
                          : 'bg-surface-muted/20 border-border-subtle'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle
                          size={15}
                          className={`mt-0.5 shrink-0 ${
                            selectedException.alert ? 'text-danger' : 'text-muted'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs font-bold ${
                              selectedException.alert ? 'text-danger' : 'text-heading'
                            }`}
                          >
                            {selectedException.alert ? 'Action Required' : 'Resolved'}:{' '}
                            {selectedException.label}
                          </p>
                          <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                            {formatShortDate(selectedException.date)}
                          </p>
                        </div>
                        {isAdmin && selectedException.alert && (
                          <Button
                            size="sm"
                            type="button"
                            disabled={resolveExceptionMutation.isPending}
                            onClick={() => resolveExceptionMutation.mutate(selectedException.id)}
                            className="h-6 px-2 text-xs font-medium shrink-0"
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── View 2: Exceptions List ── */}
              {inspectorTab === 'exceptions' && (
                <div>
                  <div className="px-4 py-2.5 bg-surface-muted/30 border-b border-border-subtle flex items-center justify-between text-xs">
                    <span className="font-medium text-muted">Attendance Anomalies</span>
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      onClick={() => setNeedsActionOnly((c) => !c)}
                      className="h-auto p-0 text-xs text-accent hover:underline"
                    >
                      {needsActionOnly ? 'Show All' : 'Action Only'}
                    </Button>
                  </div>

                  <div className="divide-y divide-border-subtle max-h-[420px] overflow-y-auto">
                    {visibleExceptions.map((item) => {
                      const isSelected = selectedId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedId(item.id);
                            setSelectedEmployeeId(item.employeeId);
                          }}
                          className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-danger-light/40 border-l-4 border-l-danger'
                              : 'bg-surface-raised hover:bg-surface-muted/60 border-l-4 border-l-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-heading truncate">{item.name}</p>
                              <div
                                className={`flex items-center gap-1 text-[11px] font-medium mt-0.5 ${
                                  item.alert ? 'text-danger' : 'text-muted'
                                }`}
                              >
                                {item.alert ? (
                                  <AlertTriangle size={11} className="shrink-0" />
                                ) : (
                                  <Clock size={11} className="shrink-0" />
                                )}
                                <span className="truncate">{item.label}</span>
                              </div>
                              <p className="text-[10px] text-muted mt-0.5">{formatShortDate(item.date)}</p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            {isAdmin && item.alert ? (
                              <Button
                                size="sm"
                                type="button"
                                disabled={resolveExceptionMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resolveExceptionMutation.mutate(item.id);
                                }}
                                className="h-6 px-2 text-xs font-semibold shadow-sm"
                                title="Resolve exception"
                              >
                                Resolve
                              </Button>
                            ) : (
                              <span className="text-xs text-muted font-medium">Resolved</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {visibleExceptions.length === 0 && (
                      <div className="p-8 text-center text-xs text-muted">
                        No attendance exceptions found.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Punch Correction Modal */}
      <FormDialog
        open={Boolean(correctionTarget)}
        onClose={() => !correctPunchMutation.isPending && setCorrectionTarget(null)}
        title="Correct attendance punches"
        subtitle={
          correctionTarget
            ? `${correctionTarget.employeeName} · ${correctionTarget.dayLabel}. Times use the workspace timezone.`
            : undefined
        }
        confirmLabel="Save correction"
        busy={correctPunchMutation.isPending}
        onConfirm={() => {
          if (!correctionTarget || !correctionForm.clockInDate || !correctionForm.clockInTime) return;
          if (Boolean(correctionForm.clockOutDate) !== Boolean(correctionForm.clockOutTime)) return;
          correctPunchMutation.mutate({
            id: correctionTarget.id,
            body: {
              clockInDate: correctionForm.clockInDate,
              clockInTime: correctionForm.clockInTime,
              clockOutDate: correctionForm.clockOutTime ? correctionForm.clockOutDate : null,
              clockOutTime: correctionForm.clockOutTime || null,
            },
          });
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-body">
              Clock-in date
              <Input
                type="date"
                required
                value={correctionForm.clockInDate}
                onChange={(event) =>
                  setCorrectionForm((current) => ({ ...current, clockInDate: event.target.value }))
                }
                className="mt-1"
              />
            </label>
            <label className="block text-sm font-medium text-body">
              Clock-in time
              <Input
                type="time"
                required
                value={correctionForm.clockInTime}
                onChange={(event) =>
                  setCorrectionForm((current) => ({ ...current, clockInTime: event.target.value }))
                }
                className="mt-1"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-body">
              Clock-out date <span className="font-normal text-muted">(optional)</span>
              <Input
                type="date"
                min={correctionForm.clockInDate || undefined}
                value={correctionForm.clockOutDate}
                onChange={(event) =>
                  setCorrectionForm((current) => ({ ...current, clockOutDate: event.target.value }))
                }
                className="mt-1"
              />
            </label>
            <label className="block text-sm font-medium text-body">
              Clock-out time <span className="font-normal text-muted">(optional)</span>
              <Input
                type="time"
                value={correctionForm.clockOutTime}
                onChange={(event) =>
                  setCorrectionForm((current) => ({ ...current, clockOutTime: event.target.value }))
                }
                className="mt-1"
              />
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
              <AlertDescription>
                {correctPunchMutation.error?.message || 'Could not save the punch correction.'}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>
    </div>
  );
}
