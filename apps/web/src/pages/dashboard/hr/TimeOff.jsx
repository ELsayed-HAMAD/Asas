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
  Search,
  CheckCircle2,
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
  const [searchQuery, setSearchQuery] = useState('');
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
    const q = searchQuery.trim().toLowerCase();
    return rawLeaveRequests.filter((item) => {
      if (departmentId !== 'ALL' && item.departmentId !== departmentId) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      if (q && !(item.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rawLeaveRequests, departmentId, statusFilter, typeFilter, searchQuery]);

  const filteredBalances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (leaveBalanceData?.items ?? []).filter((item) => {
      if (departmentId !== 'ALL' && item.departmentId !== departmentId) return false;
      if (q && !(item.employeeName || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leaveBalanceData?.items, departmentId, searchQuery]);

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
      <h1 className="sr-only">Time Off & Leave</h1>
      {/* ── Toolbar: Filters & Primary Actions (Apple-Glass Unified Bar) ── */}
      <div className="bg-surface-raised/85 backdrop-blur-xl border border-border-default rounded-2xl p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2.5 mb-5 shrink-0">
        {/* Left Filter Cluster: Employee Search + Dept + Type */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <div className="relative w-full sm:w-60 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface-muted border border-border-default text-xs sm:text-sm focus-visible:ring-1 focus-visible:ring-primary shadow-xs"
            />
          </div>

          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger aria-label="Department" className="h-9 text-xs sm:text-sm font-medium w-auto min-w-[150px] bg-surface-muted rounded-xl border border-border-default shadow-xs shrink-0">
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
            <SelectTrigger aria-label="Leave type filter" className="h-9 text-xs sm:text-sm font-medium w-auto min-w-[130px] bg-surface-muted rounded-xl border border-border-default shadow-xs shrink-0">
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

        {/* Right Action Cluster: Export + Request Time Off */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={exportLeaveCSV}
            disabled={isLoading || isError || filteredLeaveRequests.length === 0}
            className="h-9 px-3.5 rounded-xl border border-border-default text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-xs"
          >
            <Download size={13} /> Export
          </Button>

          <Button
            size="sm"
            type="button"
            onClick={() => setLeaveDialogOpen(true)}
            disabled={!data?.selfClock}
            title={!data?.selfClock ? 'Link an active employee record to request time off' : undefined}
            className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} /> Request Time Off
          </Button>
        </div>
      </div>

      {/* ── 4 KPI Cards: Tactile Apple-Glass Surface with Squircle Badges ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5 flex-shrink-0">
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[124px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Pending Requests</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-warning tracking-tight my-1 leading-none">{pendingRequestsCount}</div>
          <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] text-muted leading-tight">Awaiting admin review</div>
        </div>

        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[124px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Currently On Leave</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
              <CalendarDays size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-heading tracking-tight my-1 leading-none">{onLeaveCount}</div>
          <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] text-muted leading-tight">Active employees away</div>
        </div>

        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[124px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Approved Requests</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-heading tracking-tight my-1 leading-none">{approvedRequestsCount}</div>
          <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] text-muted leading-tight">Recorded in current period</div>
        </div>

        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[124px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Leave Balances Active</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
              <Layers size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-heading tracking-tight my-1 leading-none">{totalEmployeesWithBalances}</div>
          <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] text-muted leading-tight">
            Year {leaveBalanceData?.year ?? '2026'} · {leavePolicyData?.items?.length ?? 0} policies
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12 text-muted">
          <Loader2 className="animate-spin mr-2" size={20} /> Loading time off data...
        </div>
      )}

      {isError && (
        <div className="p-6 text-danger text-center bg-danger-light/20 rounded-2xl border border-danger/30">
          {error?.message || 'Error loading time off data'}
        </div>
      )}

      {/* ── Main Workspace: Master-Detail Grid (col-span-12 lg:col-span-7/8 vs lg:col-span-5/4) ── */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
          {/* ── Left Column: Time Off Requests (col-span-12 lg:col-span-7 xl:col-span-8) ── */}
          <div className="col-span-12 lg:col-span-7 xl:col-span-8 min-w-0">
            <div className="bg-surface-raised/95 backdrop-blur-xl border border-border-default rounded-2xl shadow-xs flex flex-col overflow-hidden">
              {/* Header with Title + Segmented Status Switcher */}
              <div className="px-5 py-3.5 border-b border-border-default/60 flex items-center justify-between bg-surface-raised flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-surface-muted border border-border-default/70 flex items-center justify-center text-primary shrink-0">
                    <CalendarDays size={16} />
                  </div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-heading">Time Off Requests</h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border-default/60">
                      {filteredLeaveRequests.length}
                    </span>
                  </div>
                </div>

                {/* Status Segmented Filter Pills */}
                <div className="flex items-center p-1 rounded-xl bg-surface-muted border border-border-default/60 shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'REJECTED'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    Rejected ({rejectedRequestsCount})
                  </button>
                </div>
              </div>

              {/* Table with Unconstrained Employee Names */}
              <div className="max-h-[580px] overflow-y-auto overflow-x-auto">
                <Table className="w-full text-left border-collapse">
                  <TableHeader className="bg-surface-muted/90 backdrop-blur-xs sticky top-0 z-10 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-xs">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="px-4 py-2.5 text-left rtl:text-right">Employee</TableHead>
                      <TableHead className="px-3.5 py-2.5 text-left rtl:text-right">Type</TableHead>
                      <TableHead className="px-3.5 py-2.5 text-left rtl:text-right">Dates</TableHead>
                      <TableHead className="px-3 py-2.5 text-center">Status</TableHead>
                      {isAdmin && <TableHead className="px-4 py-2.5 text-right rtl:text-left">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {filteredLeaveRequests.map((item) => {
                      const displayDate = item.endDate
                        ? `${formatShortDate(item.startDate)} – ${formatShortDate(item.endDate)}`
                        : formatShortDate(item.startDate);

                      return (
                        <TableRow key={item.id} className="hover:bg-surface-muted/60 transition-colors border-0">
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-subtle flex items-center justify-center text-xs font-bold text-heading shrink-0 overflow-hidden shadow-xs">
                                {item.avatar ? (
                                  <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  (item.name?.[0] || '?')
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-semibold text-heading whitespace-nowrap" title={item.name}>
                                  {item.name}
                                </p>
                                <p className="text-[11px] text-muted whitespace-nowrap" title={item.departmentName || 'General'}>
                                  {item.departmentName || 'General'}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="px-3.5 py-3">
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-surface-strong text-body border border-border-subtle inline-block whitespace-nowrap">
                              {item.humanType}
                            </span>
                          </TableCell>

                          <TableCell className="px-3.5 py-3 text-xs text-body whitespace-nowrap">
                            {displayDate}
                          </TableCell>

                          <TableCell className="px-3 py-3 text-center">
                            <span
                              className={`text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full inline-block whitespace-nowrap ${
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
                            <TableCell className="px-4 py-3 text-right rtl:text-left">
                              {item.status === 'PENDING' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    type="button"
                                    disabled={leaveDecisionMutation.isPending}
                                    onClick={() => leaveDecisionMutation.mutate({ id: item.id, decision: 'APPROVED' })}
                                    className="h-6 px-2.5 text-[11px] font-semibold rounded-md shadow-xs"
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
                                    className="h-6 px-2 text-[11px] font-medium rounded-md"
                                    title="Reject leave"
                                  >
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-surface-muted text-muted text-xs font-medium inline-block border border-border-default/50">
                                  Done
                                </span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}

                    {filteredLeaveRequests.length === 0 && (
                      <TableRow className="hover:bg-transparent border-0">
                        <TableCell colSpan={isAdmin ? 5 : 4} className="p-8 text-center text-sm text-muted">
                          {searchQuery.trim() || departmentId !== 'ALL' || typeFilter !== 'ALL' || statusFilter !== 'ALL'
                            ? 'No time off requests match the selected filters. Clear them to see every request.'
                            : 'No time off requests yet. Submitted requests will appear here for review.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* ── Right Column: Fixed Header Wrapping & Organized Balances / Policies (col-span-12 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-4) ── */}
          <div className="col-span-12 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-4 min-w-0">
            <div className="bg-surface-raised/95 backdrop-blur-xl border border-border-default rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
              {/* Header: 2-Row Clean Hierarchy (No 3-Line Title Wrapping) */}
              <div className="flex flex-col gap-3 pb-3 border-b border-border-default/60">
                {/* Row 1: Squircle Clock Badge + Full Title */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
                    <Clock size={16} />
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-heading whitespace-nowrap truncate">
                    {rightPanelTab === 'balances' ? 'Annual Leave Balances' : 'Manage Leave Policies'}
                  </h2>
                </div>

                {/* Row 2: Full-Width 2-Column Apple Segmented Control */}
                <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-muted border border-border-default/60 text-xs font-semibold gap-1">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('balances')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      rightPanelTab === 'balances'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    <Layers size={13} />
                    <span>Balances</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightPanelTab('policies')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      rightPanelTab === 'policies'
                        ? 'bg-surface-raised text-heading shadow-xs'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    <Shield size={13} />
                    <span>Policies</span>
                  </button>
                </div>
              </div>

              {/* View 1: Annual Leave Balances */}
              {rightPanelTab === 'balances' && (
                <div className="space-y-3">
                  {/* Recessed Metadata Bar */}
                  <div className="bg-surface-muted/80 border border-border-default/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs font-medium text-muted">
                    <span>Year {leaveBalanceData?.year ?? '2026'} Employee Coverage</span>
                    <span>{filteredBalances.length} active records</span>
                  </div>

                  {/* Sticky Column Header + High-Density Balance Rows */}
                  <div className="border border-border-default/60 rounded-xl overflow-hidden bg-surface-raised">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted px-3 py-2 bg-surface-muted/95 border-b border-border-default/60 sticky top-0 z-10">
                      <span className="flex-1 min-w-0">Employee / Type</span>
                      <div className="flex items-center gap-1 text-center shrink-0">
                        <span className="w-10">Allow</span>
                        <span className="w-10">Pend</span>
                        <span className="w-11">Rem</span>
                      </div>
                    </div>

                    <div className="max-h-[440px] overflow-y-auto space-y-1 p-2">
                      {filteredBalances.map((item) => (
                        <div
                          key={`${item.employeeId}-${item.type}`}
                          className="px-3 py-2 rounded-xl bg-surface-muted/40 hover:bg-surface-muted/80 border border-border-default/40 flex items-center justify-between gap-2 transition-colors text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-heading truncate" title={item.employeeName}>
                              {item.employeeName}
                            </p>
                            <p className="text-[11px] text-muted truncate">
                              {LEAVE_TYPE_LABELS[item.type] || item.type}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-right shrink-0 tabular-nums">
                            <div className="w-10 text-center font-mono font-medium text-body text-xs" title={`Allowed: ${item.annualAllowanceDays ?? '—'}`}>
                              {item.annualAllowanceDays ?? '—'}
                            </div>
                            <div className="w-10 text-center font-mono font-medium text-warning text-xs" title={`Pending: ${item.pendingDays}`}>
                              {item.pendingDays}
                            </div>
                            <div className="w-11 text-center font-mono font-bold text-heading text-xs" title={`Remaining: ${item.remainingDays ?? '—'} days`}>
                              {item.remainingDays ?? '—'}d
                            </div>
                          </div>
                        </div>
                      ))}

                      {filteredBalances.length === 0 && (
                        <p className="py-12 text-center text-xs text-muted">
                          {(leaveBalanceData?.items ?? []).length === 0
                            ? isAdmin
                              ? 'No annual leave balances recorded yet. Open Policies to set an allowance.'
                              : 'No annual leave balances recorded yet. Ask an administrator to configure leave policies.'
                            : 'No leave balances match the current search or department filter. Clear them to see every balance.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* View 2: Manage Leave Policies */}
              {rightPanelTab === 'policies' && (
                <div className="space-y-4">
                  <p className="text-xs text-muted leading-relaxed">
                    Set the standard annual allowance and counting rules for each category of employee leave.
                  </p>

                  <div className="space-y-3.5">
                    <div>
                      <label htmlFor="policy-leave-type-off" className="text-xs font-semibold text-body block mb-1">
                        Leave Type
                      </label>
                      <Select value={policyType} onValueChange={setPolicyType}>
                        <SelectTrigger id="policy-leave-type-off" aria-label="Policy leave type" className="h-9 text-xs w-full bg-surface-muted rounded-xl border border-border-default">
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

                    <div className="bg-surface-muted/60 border border-border-default/60 rounded-xl p-3 space-y-3">
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
                          className="h-8.5 text-xs bg-surface-raised rounded-lg border border-border-default"
                        />
                      </div>

                      <label className="flex items-center gap-2 pt-1 text-xs font-medium text-body cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={policyDraft.weekdaysOnly}
                          onChange={(e) =>
                            setPolicyDraft((current) => ({ ...current, weekdaysOnly: e.target.checked }))
                          }
                          className="rounded border-border-default text-primary focus:ring-primary/20"
                        />
                        <span>Weekdays only</span>
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
                        className="w-full h-9 text-xs font-semibold rounded-xl shadow-xs"
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
