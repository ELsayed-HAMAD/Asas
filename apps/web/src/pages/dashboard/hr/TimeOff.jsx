import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  AlertTriangle,
  Loader2,
  CalendarDays,
  Plus,
  Clock,
  Shield,
  Layers,
} from 'lucide-react';
import FormDialog from '../../../components/common/FormDialog';
import { hrApi } from '../../../lib/api/hr';
import { queryKeys } from '../../../lib/queryKeys';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
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

const LEAVE_TYPE_LABELS = {
  VACATION: 'Vacation',
  SICK: 'Sick Leave',
  PERSONAL: 'Personal',
};

export default function TimeOff() {
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [rightPanelTab, setRightPanelTab] = useState('balances'); // 'balances' | 'policies'
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'VACATION', startDate: '', endDate: '' });
  const [policyType, setPolicyType] = useState('VACATION');
  const [policyDraft, setPolicyDraft] = useState({ annualAllowanceDays: '', weekdaysOnly: false });

  const { data: activeMemberRole } = useActiveMemberRole();
  const roleName = getMemberRoleName(activeMemberRole);
  const isAdmin = ['OWNER', 'ADMIN'].includes(roleName);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.attendance.list({ rangeDays: 90 }),
    queryFn: () => hrApi.listAttendance({ rangeDays: 90 }),
  });

  const { data: departmentData } = useQuery({
    queryKey: queryKeys.hr.departments.list(),
    queryFn: hrApi.getDepartments,
  });

  const { data: leaveBalanceData } = useQuery({
    queryKey: queryKeys.hr.leaveBalances.list({}),
    queryFn: () => hrApi.getLeaveBalances(),
  });

  const { data: leavePolicyData } = useQuery({
    queryKey: queryKeys.hr.leavePolicies.list({}),
    queryFn: hrApi.getLeavePolicies,
  });

  const createLeaveMutation = useMutation({
    mutationFn: (body) => hrApi.createSelfLeaveRequest(body),
    onSuccess: () => {
      setLeaveDialogOpen(false);
      setLeaveForm({ type: 'VACATION', startDate: '', endDate: '' });
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaveBalances.all() });
    },
  });

  const leaveDecisionMutation = useMutation({
    mutationFn: ({ id, decision }) =>
      decision === 'APPROVED' ? hrApi.approveLeaveRequest(id) : hrApi.rejectLeaveRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaveBalances.all() });
    },
  });

  const policyMutation = useMutation({
    mutationFn: ({ type, body }) => hrApi.updateLeavePolicy(type, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leavePolicies.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaveBalances.all() });
    },
  });

  const selectedPolicy = leavePolicyData?.items?.find((policy) => policy.type === policyType);
  useEffect(() => {
    setPolicyDraft({
      annualAllowanceDays: selectedPolicy?.annualAllowanceDays ?? '',
      weekdaysOnly: selectedPolicy?.weekdaysOnly ?? false,
    });
  }, [policyType, selectedPolicy?.annualAllowanceDays, selectedPolicy?.weekdaysOnly]);

  const rawLeaveRequests = useMemo(() => {
    return (data?.leaveRequests ?? []).map((item) => ({
      ...item,
      name: item.employeeName,
      avatar: item.employeeAvatar,
      date: item.startDate,
      humanType: LEAVE_TYPE_LABELS[item.type] || item.type,
    }));
  }, [data?.leaveRequests]);

  const filteredLeaveRequests = useMemo(() => {
    return rawLeaveRequests.filter((item) => {
      if (departmentId !== 'ALL' && item.departmentId !== departmentId) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      return true;
    });
  }, [rawLeaveRequests, departmentId, statusFilter, typeFilter]);

  const pendingRequestsCount = useMemo(
    () => rawLeaveRequests.filter((item) => item.status === 'PENDING').length,
    [rawLeaveRequests]
  );

  const approvedRequestsCount = useMemo(
    () => rawLeaveRequests.filter((item) => item.status === 'APPROVED').length,
    [rawLeaveRequests]
  );

  const rejectedRequestsCount = useMemo(
    () => rawLeaveRequests.filter((item) => item.status === 'REJECTED').length,
    [rawLeaveRequests]
  );

  const onLeaveCount = data?.summary?.onLeaveCount ?? 0;
  const totalEmployeesWithBalances = leaveBalanceData?.items?.length ?? 0;

  function exportLeaveCSV() {
    const rows = [
      ['Employee', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Status'],
      ...filteredLeaveRequests.map((item) => [
        item.name,
        item.departmentName || '',
        item.humanType,
        item.startDate || '',
        item.endDate || item.startDate || '',
        item.status,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'time-off-requests.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5">
      {/* ── Toolbar: Filters & Primary Actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full mb-5">
        {/* Left Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger aria-label="Department" className="h-8 text-xs font-medium w-auto min-w-[140px] bg-surface-raised shadow-card">
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

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger aria-label="Leave type filter" className="h-8 text-xs font-medium w-auto min-w-[125px] bg-surface-raised shadow-card">
              <span className="text-muted text-[11px] font-semibold uppercase mr-1">Type</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="VACATION">Vacation</SelectItem>
              <SelectItem value="SICK">Sick Leave</SelectItem>
              <SelectItem value="PERSONAL">Personal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={exportLeaveCSV}
            disabled={isLoading || isError || filteredLeaveRequests.length === 0}
            className="gap-1.5 shadow-sm"
          >
            <Download size={13} /> Export
          </Button>

          <Button
            size="sm"
            type="button"
            onClick={() => setLeaveDialogOpen(true)}
            disabled={!data?.selfClock}
            title={!data?.selfClock ? 'Link an active employee record to request time off' : undefined}
            className="gap-1.5 shadow-sm font-semibold"
          >
            <Plus size={14} /> Request Time Off
          </Button>
        </div>
      </div>

      {/* ── 4 KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5 mb-5 flex-shrink-0">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Pending Requests</p>
          <p className="text-2xl font-bold text-warning mt-1 leading-tight">{pendingRequestsCount}</p>
          <p className="text-xs text-muted mt-1 leading-normal">Awaiting admin review</p>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Currently On Leave</p>
          <p className="text-2xl font-bold text-heading mt-1 leading-tight">{onLeaveCount}</p>
          <p className="text-xs text-muted mt-1 leading-normal">Active employees away</p>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Approved Requests</p>
          <p className="text-2xl font-bold text-heading mt-1 leading-tight">{approvedRequestsCount}</p>
          <p className="text-xs text-muted mt-1 leading-normal">Recorded in current period</p>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider leading-none">Leave Balances Active</p>
          <p className="text-2xl font-bold text-heading mt-1 leading-tight">{totalEmployeesWithBalances}</p>
          <p className="text-xs text-muted mt-1 leading-normal">
            Year {leaveBalanceData?.year ?? 'current'} · {leavePolicyData?.items?.length ?? 0} policies
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12 text-muted">
          <Loader2 className="animate-spin mr-2" size={20} /> Loading time off data...
        </div>
      )}

      {isError && (
        <div className="p-6 text-danger text-center bg-danger-light/20 rounded-card border border-danger/30">
          {error?.message || 'Error loading time off data'}
        </div>
      )}

      {/* ── Main Workspace: Left Column (Requests Table) & Right Column (Unified Balances & Policies) ── */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
          {/* ── Left Column: Time Off Requests (col-span-12 lg:col-span-8) ── */}
          <div className="col-span-12 lg:col-span-8 space-y-5 min-w-0">
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
              {/* Header with Title + Segmented Status Switcher */}
              <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-raised flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays size={16} className="text-primary" />
                  <h2 className="text-sm font-bold text-heading">Time Off Requests</h2>
                  <span className="text-xs text-muted font-medium">({filteredLeaveRequests.length})</span>
                </div>

                {/* Status Segmented Filter Pills */}
                <div className="flex items-center p-0.5 rounded-lg bg-surface-muted border border-border-subtle shrink-0">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'ALL'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    All ({rawLeaveRequests.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('PENDING')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'PENDING'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    Pending ({pendingRequestsCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('APPROVED')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'APPROVED'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    Approved ({approvedRequestsCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('REJECTED')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'REJECTED'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    Rejected ({rejectedRequestsCount})
                  </button>
                </div>
              </div>

              <div className="max-h-[580px] overflow-y-auto overflow-x-hidden">
                <Table wrapperClassName="overflow-x-hidden" className="w-full table-fixed text-left border-collapse">
                  <colgroup>
                    <col className="w-[26%]" />
                    <col className="w-[16%]" />
                    <col className="w-[26%]" />
                    <col className="w-[16%]" />
                    {isAdmin && <col className="w-[16%]" />}
                  </colgroup>
                  <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="px-3.5 py-2.5 text-left rtl:text-right bg-surface-muted truncate">Employee</TableHead>
                      <TableHead className="px-3.5 py-2.5 text-left rtl:text-right bg-surface-muted truncate">Type</TableHead>
                      <TableHead className="px-3.5 py-2.5 text-left rtl:text-right bg-surface-muted truncate">Dates</TableHead>
                      <TableHead className="px-2 py-2.5 text-center bg-surface-muted truncate">Status</TableHead>
                      {isAdmin && <TableHead className="px-2 py-2.5 text-right rtl:text-left bg-surface-muted truncate">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {filteredLeaveRequests.map((item) => {
                      const displayDate = item.endDate
                        ? `${formatShortDate(item.startDate)} – ${formatShortDate(item.endDate)}`
                        : formatShortDate(item.startDate);

                      return (
                        <TableRow key={item.id} className="hover:bg-surface-muted/60 transition-colors border-0">
                          <TableCell className="px-3.5 py-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden">
                                {item.avatar ? (
                                  <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  (item.name?.[0] || '?')
                                )}
                              </div>
                              <div className="min-w-0 truncate">
                                <p className="text-sm font-semibold text-heading truncate">{item.name}</p>
                                <p className="text-[11px] text-muted truncate">{item.departmentName || 'General'}</p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="px-3.5 py-3">
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-strong text-body border border-border-subtle inline-block truncate max-w-full">
                              {item.humanType}
                            </span>
                          </TableCell>

                          <TableCell className="px-3.5 py-3 text-xs text-body truncate">
                            {displayDate}
                          </TableCell>

                          <TableCell className="px-2 py-3 text-center">
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full inline-block truncate max-w-full ${
                                item.status === 'APPROVED'
                                  ? 'bg-success-light text-success-text'
                                  : item.status === 'REJECTED'
                                  ? 'bg-danger-light text-danger'
                                  : 'bg-warning-light text-warning'
                              }`}
                            >
                              {item.status}
                            </span>
                          </TableCell>

                          {isAdmin && (
                            <TableCell className="px-2 py-3 text-right rtl:text-left">
                              {item.status === 'PENDING' ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    type="button"
                                    disabled={leaveDecisionMutation.isPending}
                                    onClick={() => leaveDecisionMutation.mutate({ id: item.id, decision: 'APPROVED' })}
                                    className="h-6 px-2 text-[11px] font-semibold"
                                    title="Approve leave"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    disabled={leaveDecisionMutation.isPending}
                                    onClick={() => leaveDecisionMutation.mutate({ id: item.id, decision: 'REJECTED' })}
                                    className="h-6 px-1.5 text-[11px] font-medium"
                                    title="Reject leave"
                                  >
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted font-medium">Done</span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}

                    {filteredLeaveRequests.length === 0 && (
                      <TableRow className="hover:bg-transparent border-0">
                        <TableCell colSpan={isAdmin ? 5 : 4} className="p-8 text-center text-sm text-muted">
                          No time off requests match the selected filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* ── Right Column: Single Unified Balances & Policies Panel (col-span-12 lg:col-span-4) ── */}
          <div className="col-span-12 lg:col-span-4 space-y-5 min-w-0">
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
              {/* Header with Sub-Tabs */}
              <div className="p-4 border-b border-border-subtle flex items-center justify-between gap-2.5 bg-surface-raised">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-accent" />
                  <h2 className="text-sm font-bold text-heading">
                    {rightPanelTab === 'balances' ? 'Annual Leave Balances' : 'Manage Leave Policies'}
                  </h2>
                </div>

                {/* Sub-Tabs: Balances vs Policy Rules */}
                <div className="flex items-center p-0.5 rounded-lg bg-surface-muted border border-border-subtle shrink-0">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('balances')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      rightPanelTab === 'balances'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    <Layers size={12} />
                    <span>Balances</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightPanelTab('policies')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      rightPanelTab === 'policies'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    <Shield size={12} />
                    <span>Policies</span>
                  </button>
                </div>
              </div>

              {/* View 1: Annual Leave Balances */}
              {rightPanelTab === 'balances' && (
                <div>
                  <div className="px-4 py-2.5 bg-surface-muted/30 border-b border-border-subtle flex items-center justify-between text-xs text-muted">
                    <span>Year {leaveBalanceData?.year ?? 'Current'} Employee Coverage</span>
                    <span>{leaveBalanceData?.items?.length ?? 0} active records</span>
                  </div>

                  <div className="max-h-[480px] overflow-y-auto overflow-x-hidden px-4 py-2 divide-y divide-border-subtle">
                    {(leaveBalanceData?.items ?? [])
                      .filter((item) => departmentId === 'ALL' || item.departmentId === departmentId)
                      .map((item) => (
                        <div
                          key={`${item.employeeId}-${item.type}`}
                          className="py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1 truncate">
                            <p className="font-semibold text-heading truncate">{item.employeeName}</p>
                            <p className="text-[11px] text-muted truncate">{LEAVE_TYPE_LABELS[item.type] || item.type}</p>
                          </div>
                          <div className="flex items-center gap-2 text-right shrink-0">
                            <div className="text-center w-12">
                              <p className="text-[9px] text-muted uppercase">Allowed</p>
                              <p className="font-medium text-body text-xs">{item.annualAllowanceDays ?? '—'}</p>
                            </div>
                            <div className="text-center w-12">
                              <p className="text-[9px] text-muted uppercase">Pending</p>
                              <p className="font-medium text-warning text-xs">{item.pendingDays}</p>
                            </div>
                            <div className="text-center w-14">
                              <p className="text-[9px] text-muted uppercase">Remaining</p>
                              <p className="font-bold text-heading text-xs">{item.remainingDays ?? '—'}d</p>
                            </div>
                          </div>
                        </div>
                      ))}

                    {(!leaveBalanceData?.items || leaveBalanceData.items.length === 0) && (
                      <p className="py-12 text-center text-xs text-muted">No annual leave balances recorded.</p>
                    )}
                  </div>
                </div>
              )}

              {/* View 2: Manage Leave Policies */}
              {rightPanelTab === 'policies' && (
                <div className="p-4 sm:p-5 space-y-4">
                  <p className="text-xs text-muted leading-relaxed">
                    Set the standard annual allowance and counting rules for each category of employee leave.
                  </p>

                  <div className="space-y-3.5">
                    <div>
                      <label htmlFor="policy-leave-type-off" className="text-xs font-semibold text-body block mb-1">
                        Leave Type
                      </label>
                      <Select value={policyType} onValueChange={setPolicyType}>
                        <SelectTrigger id="policy-leave-type-off" aria-label="Policy leave type" className="h-8 text-xs w-full bg-surface-raised">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(LEAVE_TYPE_LABELS).map(([type, label]) => (
                            <SelectItem key={type} value={type}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div>
                        <label htmlFor="policy-allowance-days" className="text-xs font-semibold text-body block mb-1">
                          Allowance (days)
                        </label>
                        <Input
                          id="policy-allowance-days"
                          aria-label="Annual leave allowance"
                          type="number"
                          min="0"
                          max="366"
                          step="1"
                          value={policyDraft.annualAllowanceDays}
                          onChange={(e) =>
                            setPolicyDraft((current) => ({ ...current, annualAllowanceDays: e.target.value }))
                          }
                          className="h-8 text-xs"
                        />
                      </div>

                      <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-body cursor-pointer">
                        <input
                          type="checkbox"
                          checked={policyDraft.weekdaysOnly}
                          onChange={(e) =>
                            setPolicyDraft((current) => ({ ...current, weekdaysOnly: e.target.checked }))
                          }
                          className="rounded border-border-default"
                        />
                        Weekdays only
                      </label>
                    </div>

                    {isAdmin && (
                      <Button
                        size="sm"
                        type="button"
                        disabled={policyMutation.isPending || policyDraft.annualAllowanceDays === ''}
                        onClick={() =>
                          policyMutation.mutate({
                            type: policyType,
                            body: {
                              annualAllowanceDays: Number(policyDraft.annualAllowanceDays),
                              weekdaysOnly: policyDraft.weekdaysOnly,
                            },
                          })
                        }
                        className="w-full h-8 text-xs font-semibold mt-2"
                      >
                        {policyMutation.isPending ? 'Saving…' : 'Save Policy Changes'}
                      </Button>
                    )}

                    {policyMutation.isError && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {policyMutation.error?.message || 'Could not save leave policy.'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Request Time Off Modal ── */}
      <FormDialog
        open={leaveDialogOpen}
        onClose={() => !createLeaveMutation.isPending && setLeaveDialogOpen(false)}
        title="Request time off"
        subtitle="Your request will be sent to a workspace administrator for review."
        confirmLabel="Submit request"
        busy={createLeaveMutation.isPending}
        onConfirm={() => {
          if (!leaveForm.startDate || (leaveForm.endDate && leaveForm.endDate < leaveForm.startDate)) return;
          createLeaveMutation.mutate({
            type: leaveForm.type,
            startDate: leaveForm.startDate,
            endDate: leaveForm.endDate || null,
          });
        }}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="leave-type-dialog" className="block text-sm font-medium text-body mb-1">
              Leave type
            </label>
            <Select
              value={leaveForm.type}
              onValueChange={(type) => setLeaveForm((current) => ({ ...current, type }))}
            >
              <SelectTrigger id="leave-type-dialog" className="h-9 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VACATION">Vacation</SelectItem>
                <SelectItem value="SICK">Sick leave</SelectItem>
                <SelectItem value="PERSONAL">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="block text-sm font-medium text-body">
            Start date
            <Input
              type="date"
              required
              value={leaveForm.startDate}
              onChange={(e) => setLeaveForm((current) => ({ ...current, startDate: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-body">
            End date <span className="font-normal text-muted">(optional)</span>
            <Input
              type="date"
              min={leaveForm.startDate || undefined}
              value={leaveForm.endDate}
              onChange={(e) => setLeaveForm((current) => ({ ...current, endDate: e.target.value }))}
              className="mt-1"
            />
          </label>
          {createLeaveMutation.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {createLeaveMutation.error?.message || 'Could not submit this request.'}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>
    </div>
  );
}
