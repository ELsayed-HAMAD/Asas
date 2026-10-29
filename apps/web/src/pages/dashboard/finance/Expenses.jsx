import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ChevronDown,
  Check,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  FileText,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  Download,
  Loader2,
  Plus,
  Clock,
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { hrApi } from '../../../lib/api/hr';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatCompactCurrency } from '../../../lib/format';
import { EMPTY } from '../../../lib/emptyText';
import { downloadCsv } from '../../../lib/csv';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import FormDialog from '../../../components/common/FormDialog';
import SearchInput from '../../../components/common/SearchInput';
import { useSearchParams } from 'react-router-dom';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { cn } from '../../../lib/utils';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../../components/ui/dropdown-menu';

function formatCategory(category) {
  if (!category) return EMPTY.category;
  return String(category)
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const STATUS_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

function getStatusDotColor(status) {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-500';
    case 'FLAGGED':
    case 'REJECTED':
      return 'bg-rose-500';
    case 'APPROVED':
    case 'REIMBURSED':
      return 'bg-emerald-500';
    case 'PROCESSING':
      return 'bg-blue-500';
    case 'VOID':
      return 'bg-slate-400';
    default:
      return 'bg-slate-400';
  }
}

function formatStatus(status) {
  if (!status) return EMPTY.status;
  const lower = String(status).toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export default function Expenses() {
  const queryClient = useQueryClient();
  const { data: activeMemberRole } = useActiveMemberRole();
  const isAdmin = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole));
  const [selectedId, setSelectedId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);
  const [departmentId, setDepartmentId] = useState('');
  const [sort, setSort] = useState('desc');
  const [statusTab, setStatusTab] = useState('ALL');
  const [receiptZoom, setReceiptZoom] = useState(100);
  const [receiptOpen, setReceiptOpen] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [employeeSearchInput, setEmployeeSearchInput] = useState('');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('');
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    category: 'OFFICE',
    merchant: '',
    amount: '',
    tax: '',
    date: new Date().toISOString().slice(0, 10),
    employeeId: '',
  });
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: employeesData } = useQuery({
    queryKey: queryKeys.hr.employees.list({ limit: 100 }),
    queryFn: () => hrApi.listEmployees({ limit: 100 }),
    enabled: isAdmin && createOpen,
    placeholderData: keepPreviousData,
  });

  const allEmployees = employeesData?.items ?? [];
  const filteredEmployees = allEmployees.filter(emp => {
    if (!employeeSearchInput.trim()) return true;
    const q = employeeSearchInput.toLowerCase().trim();
    return (
      emp.name?.toLowerCase().includes(q) ||
      emp.title?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q)
    );
  });
  const selectedEmployee = allEmployees.find(emp => emp.id === createForm.employeeId);

  const createExpenseMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: createForm.name.trim(),
        category: createForm.category || 'OFFICE',
        merchant: createForm.merchant.trim() || null,
        amount: createForm.amount.trim(),
        tax: createForm.tax.trim() || null,
        date: createForm.date,
      };
      if (isAdmin && createForm.employeeId) {
        payload.employeeId = createForm.employeeId;
        return financeApi.createExpense(payload);
      }
      return financeApi.createExpenseSelf(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setCreateOpen(false);
      setCreateForm({
        name: '',
        category: 'OFFICE',
        merchant: '',
        amount: '',
        tax: '',
        date: new Date().toISOString().slice(0, 10),
        employeeId: '',
      });
      setSelectedEmployeeName('');
      setEmployeeSearchInput('');
      setEmployeeDropdownOpen(false);
      setCreateError('');
    },
    onError: (err) => {
      setCreateError(err.message || 'Failed to submit expense.');
    },
  });

  const { data: departmentsData } = useQuery({
    queryKey: queryKeys.hr.departments.list(),
    queryFn: hrApi.getDepartments,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.expenses.list({
      page: 1,
      limit: 100,
      search: search || undefined,
      departmentId: departmentId || undefined,
      sort,
    }),
    queryFn: () => financeApi.listExpenses({
      page: 1,
      limit: 100,
      search: search || undefined,
      departmentId: departmentId || undefined,
      sort,
    }),
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const summary = useMemo(() => data?.summary || {}, [data?.summary]);

  const filteredItems = useMemo(() => {
    if (statusTab === 'ALL') return items;
    if (statusTab === 'PENDING') return items.filter(r => r.status === 'PENDING');
    if (statusTab === 'PROCESSING') return items.filter(r => r.status === 'PROCESSING' || r.status === 'FLAGGED');
    if (statusTab === 'APPROVED') return items.filter(r => r.status === 'APPROVED' || r.status === 'REIMBURSED');
    if (statusTab === 'REJECTED') return items.filter(r => r.status === 'REJECTED' || r.status === 'VOID');
    return items.filter(r => r.status === statusTab);
  }, [items, statusTab]);

  useEffect(() => {
    if (!filteredItems.some(row => row.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? null);
    }
  }, [filteredItems, selectedId]);

  const selectedRecord = useMemo(() => {
    return items.find(r => r.id === selectedId) || filteredItems[0] || null;
  }, [items, filteredItems, selectedId]);

  const statusMutation = useMutation({
    mutationFn: (status) => financeApi.updateExpenseStatus(selectedId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() }),
  });

  const voidMutation = useMutation({
    mutationFn: (reason) => financeApi.voidExpense(selectedId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() }),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const rows = [];
      let page = 1;
      let pages = 1;
      while (page <= pages) {
        const result = await financeApi.listExpenses({
          page,
          limit: 100,
          search: search || undefined,
          departmentId: departmentId || undefined,
          sort,
        });
        rows.push(...result.items);
        pages = result.pagination.pages;
        page += 1;
      }
      return rows;
    },
    onSuccess: rows => {
      const header = ['Expense ID', 'Employee', 'Expense', 'Merchant', 'Category', 'Date', 'Amount (minor units)', 'Currency', 'Status', 'Policy Match'];
      const records = rows.map(row => [
        row.id,
        row.employee,
        row.name,
        row.merchant,
        row.category,
        row.date,
        row.amount?.amount,
        row.amount?.currency,
        row.status,
        row.policyMatch,
      ]);
      downloadCsv([header, ...records], `expenses-${new Date().toISOString().slice(0, 10)}.csv`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <h1 className="sr-only">Expenses</h1>
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        <h1 className="sr-only">Expenses</h1>
        Failed to load expenses.
      </div>
    );
  }

  const pendingCount = summary.pendingCount ?? 0;
  const pendingAmount = summary.pendingTotal ?? { amount: 0, currency: 'USD' };
  const approvedAmount = summary.approvedTotal ?? { amount: 0, currency: 'USD' };
  const violationAmount = summary.flaggedTotal ?? { amount: 0, currency: 'USD' };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 p-4 sm:p-6 space-y-4">
      <h1 className="sr-only">Expenses</h1>

      {/* ── 1. Full-Width Single-Row Apple-Glass Command Toolbar ── */}
      <div className="relative z-30 bg-surface-raised/85 backdrop-blur-xl border border-border-default rounded-2xl p-2.5 shadow-xs flex flex-wrap xl:flex-nowrap items-center justify-between gap-2.5 flex-shrink-0">
        {/* Left Cluster: Search + Dept Select + Sort Select */}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
          <SearchInput
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            placeholder="Search..."
            wrapperClassName="w-full sm:w-64 xl:w-72 shrink-0"
            className="h-9 pl-9 pr-3 text-xs sm:text-sm"
          />

          <Select
            value={departmentId || '__all__'}
            onValueChange={v => setDepartmentId(v === '__all__' ? '' : v)}
          >
            <SelectTrigger
              aria-label="Filter expenses by department"
              className="h-9 px-3 rounded-xl text-xs font-medium shrink-0 w-auto min-w-[100px] bg-surface-muted hover:bg-surface-muted/80 border border-border-default shadow-xs"
            >
              <SelectValue placeholder="All Depts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">All Depts</SelectItem>
              {(departmentsData?.items ?? departmentsData ?? []).map(department => (
                <SelectItem key={department.id} value={department.id} className="text-xs">
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={v => setSort(v)}>
            <SelectTrigger
              aria-label="Sort expenses"
              className="h-9 px-3 rounded-xl text-xs font-medium shrink-0 w-auto min-w-[130px] bg-surface-muted hover:bg-surface-muted/80 border border-border-default shadow-xs text-body hover:text-heading"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc" className="text-xs">Sort: Newest First</SelectItem>
              <SelectItem value="asc" className="text-xs">Sort: Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right Cluster: Export CSV + + New Expense */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border border-border-default bg-surface-raised hover:bg-surface-muted shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Download size={14} /> {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => { setCreateError(''); setEmployeeSearchInput(''); setCreateOpen(true); }}
            className="h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
          >
            <Plus size={14} /> New Expense
          </Button>
        </div>
      </div>

      {exportMutation.isError && (
        <Alert variant="destructive" className="py-2 px-3">
          <AlertDescription className="text-xs">{exportMutation.error?.message || 'Could not export expenses.'}</AlertDescription>
        </Alert>
      )}

      {/* ── 2. Row 1: 3-Tier Apple-Glass KPI Cards + Compact Currency ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
        {/* Card 1: PENDING APPROVAL */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              Pending Approval
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(pendingAmount)}
            >
              {formatCompactCurrency(pendingAmount)}
            </span>
            <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 tabular-nums">
              {pendingCount} Reports
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle text-[11px] leading-snug text-muted">
            {pendingCount === 1 ? '1 report awaiting review' : `${pendingCount} reports awaiting review`}
          </div>
        </div>

        {/* Card 2: APPROVED EXPENSES */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              Approved Expenses
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(approvedAmount)}
            >
              {formatCompactCurrency(approvedAmount)}
            </span>
            <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 tabular-nums">
              {summary.approvedCount ?? 0} Reports
            </span>
          </div>
          <div
            className="pt-1.5 border-t border-border-subtle text-[11px] leading-snug text-muted"
            title="Valued reimbursement journals in workspace base currency, net of linked reversals."
          >
            Reimbursed MTD: {summary.reimbursedThisMonthTotal == null ? 'unavailable' : formatMoney(summary.reimbursedThisMonthTotal)} · Prior period: {summary.reimbursedThisMonthComparison?.previousTotal == null ? 'unavailable' : formatMoney(summary.reimbursedThisMonthComparison.previousTotal)}
          </div>
        </div>

        {/* Card 3: POLICY VIOLATIONS */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              Policy Violations
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums leading-none"
              title={formatMoney(violationAmount)}
            >
              {formatCompactCurrency(violationAmount)}
            </span>
            <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 tabular-nums">
              {summary.flaggedCount ?? 0} Reports
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle text-[11px] leading-snug text-muted">
            {(summary.flaggedCount ?? 0) === 0 ? 'No active policy alerts' : `${summary.flaggedCount} flagged for review`}
          </div>
        </div>
      </div>

      {/* ── 3. Row 2: Aligned Master-Detail Workspace Grid ── */}
      <div className={`grid grid-cols-1 ${selectedRecord ? 'lg:grid-cols-12' : ''} gap-4 items-start flex-1 min-h-0`}>

        {/* Left Column: Expenses Table with Integrated Status Filter Tabs */}
        <div className={`${selectedRecord ? 'lg:col-span-7 xl:col-span-8' : 'col-span-12'} min-w-0 flex flex-col gap-3`}>
          <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card overflow-hidden flex flex-col h-[560px] min-h-[560px]">

            {/* Integrated Card Header with Segmented Status Filter Tabs */}
            <div className="px-4 py-3 border-b border-border-default/60 flex flex-wrap items-center justify-between gap-3 bg-surface-raised">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-heading">Expense Reports</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border-default/60">
                  {filteredItems.length}
                </span>
              </div>

              {/* Status Segmented Filter Tabs */}
              <div role="tablist" aria-label="Filter expenses by status" className="flex items-center p-1 rounded-xl bg-surface-muted border border-border-default/60 shrink-0 gap-1 overflow-x-auto no-scrollbar">
                {STATUS_TABS.map(tab => {
                  const isActive = statusTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setStatusTab(tab.key)}
                      className={`w-auto px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        isActive
                          ? 'bg-surface-raised text-heading shadow-xs'
                          : 'text-muted hover:text-heading'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Table Viewport */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-surface-raised">
              <Table className="w-full table-fixed text-left border-collapse">
                <colgroup>
                  <col className="min-w-[170px]" />
                  <col className="w-[20%] min-w-[110px]" />
                  <col className="w-[85px] lg:w-[90px]" />
                  <col className="w-[100px] lg:w-[105px]" />
                  <col className="w-[110px] lg:w-[120px]" />
                </colgroup>
                <TableHeader className="bg-surface-muted/60 border-b border-border-default sticky top-0 z-10 h-10">
                  <TableRow className="h-10 hover:bg-transparent border-0">
                    <TableHead className="pl-4 pr-3 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Employee</TableHead>
                    <TableHead className="w-[20%] min-w-[110px] px-2.5 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Merchant</TableHead>
                    <TableHead className="w-[85px] lg:w-[90px] px-2.5 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Expense Date</TableHead>
                    <TableHead className="w-[100px] lg:w-[105px] px-2.5 py-0 text-center text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Status</TableHead>
                    <TableHead className="w-[110px] lg:w-[120px] px-2.5 pr-4 py-0 text-right rtl:text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Amount</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredItems.map(item => {
                    const isSelected = selectedId === item.id;
                    const name = item.employee || 'Unassigned';

                    return (
                      <TableRow
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          'h-[48px] cursor-pointer transition-colors border-0',
                          isSelected
                            ? 'border-l-[3px] border-l-indigo-600 bg-slate-50/80 hover:bg-slate-100/70'
                            : 'border-l-[3px] border-l-transparent bg-surface-raised hover:bg-surface-muted/60'
                        )}
                      >
                        {/* Employee Column */}
                        <TableCell className="pl-4 pr-3 py-0 align-middle border-b border-border-subtle min-w-0">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-surface-muted border border-border-default flex items-center justify-center text-xs font-bold text-heading shrink-0 shadow-xs">
                              {name?.substring(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-heading truncate leading-tight" title={name}>{name}</p>
                              <p className="text-[11px] text-muted truncate leading-tight mt-0.5" title={formatCategory(item.category)}>
                                {formatCategory(item.category)}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Merchant Column */}
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-xs font-medium text-body truncate" title={item.merchant || EMPTY.provided}>
                          {item.merchant || EMPTY.provided}
                        </TableCell>

                        {/* Expense Date Column */}
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-xs font-medium text-muted whitespace-nowrap">
                          {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                        </TableCell>

                        {/* Status Column */}
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-center whitespace-nowrap">
                          <span className="bg-slate-100/80 border border-slate-200/60 text-slate-700 px-2.5 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 capitalize">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", getStatusDotColor(item.status))} aria-hidden="true" />
                            {formatStatus(item.status)}
                          </span>
                        </TableCell>

                        {/* Amount Column: Exact Currency with tabular-nums */}
                        <TableCell className="px-2.5 pr-4 py-0 align-middle border-b border-border-subtle text-right text-xs sm:text-sm font-bold text-heading tabular-nums whitespace-nowrap" title={formatMoney(item.amount)}>
                          {formatMoney(item.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredItems.length === 0 && (
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={5} className="px-6 py-8 text-center text-muted text-xs">
                        {items.length === 0 && statusTab === 'ALL' && !search.trim() && !departmentId
                          ? 'No expenses yet. Use New Expense to submit the first report.'
                          : statusTab !== 'ALL'
                          ? `No ${STATUS_TABS.find(tab => tab.key === statusTab)?.label.toLowerCase() ?? ''} expenses. Choose All to see every expense.`
                          : 'No expenses match the current search or department filter. Clear the filters to see every report.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Table Card Footer */}
            <div className="h-9 flex-shrink-0 border-t border-border-subtle px-4 flex items-center justify-between text-xs text-muted bg-surface-muted/30">
              <span>Showing {filteredItems.length} of {data.pagination?.total ?? items.length} expenses</span>
              {statusTab !== 'ALL' && (
                <span className="text-[11px] font-medium text-accent">Filtered by: {statusTab}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Unified Sticky Apple-Glass Expense & Receipt Inspector */}
        {selectedRecord && (
          <div data-testid="expense-detail-panel" className="col-span-12 lg:col-span-5 xl:col-span-4 min-w-0 lg:sticky lg:top-6">
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card p-4 space-y-3.5 flex flex-col overflow-hidden">

              {/* 1. Compact Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-muted border border-border-default flex items-center justify-center text-sm font-bold text-heading shrink-0 shadow-xs">
                    {(selectedRecord.employee || 'Unassigned')?.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-bold text-heading leading-tight truncate" title={selectedRecord.employee || 'Unassigned'}>
                      {selectedRecord.employee || 'Unassigned'}
                    </h2>
                    <p className="text-xs text-muted truncate leading-tight mt-0.5">
                      {formatCategory(selectedRecord.category)}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-bold text-heading tracking-tight tabular-nums">
                    {formatMoney(selectedRecord.amount)}
                  </span>
                </div>
              </div>

              {/* 2. Action Bar: 2x2 Calm Structured Grid */}
              {isAdmin ? (
                <div className="pt-0.5">
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status !== 'PENDING'}
                      onClick={() => statusMutation.mutate('APPROVED')}
                      className="h-9 px-3 rounded-xl text-xs font-semibold bg-surface-inverse-strong text-white hover:bg-slate-800 shadow-xs whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status !== 'APPROVED'}
                      onClick={() => statusMutation.mutate('REIMBURSED')}
                      title="Records reimbursement after it has been paid outside Asas."
                      className="h-9 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-medium whitespace-nowrap cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      Mark Reimbursed
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedRecord || statusMutation.isPending || ['APPROVED', 'REIMBURSED', 'REJECTED', 'VOID'].includes(selectedRecord.status)}
                      onClick={() => statusMutation.mutate('REJECTED')}
                      className="h-9 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-medium whitespace-nowrap cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      Reject
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedRecord || voidMutation.isPending || selectedRecord.status === 'VOID'}
                      onClick={() => {
                        const reason = window.prompt('Reason for voiding this expense:')?.trim();
                        if (reason) voidMutation.mutate(reason);
                      }}
                      className="h-9 px-3 rounded-xl bg-white hover:bg-rose-50/50 border border-slate-200/80 text-slate-500 hover:text-rose-600 text-xs font-medium whitespace-nowrap cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {voidMutation.isPending ? 'Voiding…' : 'Void expense'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="pt-1">
                  <span className="inline-flex items-center justify-center gap-1.5 h-8 px-3 w-full text-xs font-semibold capitalize rounded-xl border border-slate-200/80 bg-slate-100/80 text-slate-700">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", getStatusDotColor(selectedRecord.status))} aria-hidden="true" />
                    {formatStatus(selectedRecord.status)}
                  </span>
                </div>
              )}

              {statusMutation.isError && (
                <Alert variant="destructive" className="py-2 px-3">
                  <AlertDescription className="text-xs">{statusMutation.error?.message || 'Unable to update the expense status.'}</AlertDescription>
                </Alert>
              )}
              {voidMutation.isError && (
                <Alert variant="destructive" className="py-2 px-3">
                  <AlertDescription className="text-xs">{voidMutation.error?.message || 'Unable to void the expense.'}</AlertDescription>
                </Alert>
              )}

              {/* 3. Compact EXPENSE DETAILS Recessed Well (Matching Payroll) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-accent shrink-0" />
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider">Expense details</h3>
                </div>

                <div className="rounded-xl bg-slate-50/70 border border-slate-200/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Merchant</span>
                    <span className="font-semibold text-slate-900 truncate max-w-[180px]" title={selectedRecord.merchant || EMPTY.provided}>
                      {selectedRecord.merchant || EMPTY.provided}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Category</span>
                    <span className="font-semibold text-slate-900 truncate max-w-[180px]" title={formatCategory(selectedRecord.category)}>
                      {formatCategory(selectedRecord.category)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Tax</span>
                    <span className={cn("tabular-nums", selectedRecord.tax?.amount != null && selectedRecord.tax.amount > 0 ? "font-semibold text-slate-900" : "text-slate-400")}>
                      {selectedRecord.tax?.amount != null && selectedRecord.tax.amount > 0 ? formatMoney(selectedRecord.tax) : EMPTY.tax}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Policy match</span>
                    <div className="text-xs">
                      {selectedRecord.policyMatch === null ? (
                        <span className="text-slate-400">Not evaluated</span>
                      ) : selectedRecord.policyMatch ? (
                        <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
                          <CheckCircle2 size={13} className="shrink-0" /> Yes
                        </span>
                      ) : (
                        <span className="text-rose-600 font-medium inline-flex items-center gap-1">
                          <AlertTriangle size={13} className="shrink-0" /> No
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Integrated Expense summary Receipt Viewer */}
              <div className="border border-border-default rounded-xl bg-surface-raised overflow-hidden shadow-xs flex flex-col">
                <div className="flex items-center justify-between px-3.5 py-2 bg-surface-muted/60 border-b border-border-subtle rounded-t-xl">
                  <div className="flex items-center gap-2 text-heading">
                    <FileText size={14} className="text-accent" />
                    <span className="text-xs font-bold">Expense summary</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted text-xs font-medium">
                    {!receiptOpen ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => setReceiptOpen(true)}
                        className="h-auto p-0 text-accent font-semibold text-xs cursor-pointer"
                      >
                        View Receipt
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1 bg-surface-raised border border-border-default rounded-lg px-1 py-0.5 shadow-2xs">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Zoom out receipt"
                          disabled={receiptZoom <= 50}
                          onClick={() => setReceiptZoom(value => Math.max(50, value - 25))}
                          className="h-6 w-6 rounded-md hover:bg-surface-muted cursor-pointer"
                        >
                          <ZoomOut size={13} />
                        </Button>
                        <span className="text-[11px] font-semibold text-heading tabular-nums min-w-[34px] text-center">{receiptZoom}%</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Zoom in receipt"
                          disabled={receiptZoom >= 200}
                          onClick={() => setReceiptZoom(value => Math.min(200, value + 25))}
                          className="h-6 w-6 rounded-md hover:bg-surface-muted cursor-pointer"
                        >
                          <ZoomIn size={13} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {receiptOpen && (
                  <div className="bg-slate-50/80 border-t border-slate-200/60 p-4 flex justify-center relative max-h-[340px] overflow-auto rounded-b-xl">
                    {/* Collapse toggle button */}
                    <button
                      type="button"
                      onClick={() => setReceiptOpen(false)}
                      title="Collapse receipt preview"
                      className="absolute left-4 top-4 w-6 h-6 bg-surface-raised border border-border-default rounded-full flex items-center justify-center text-muted hover:text-heading hover:bg-surface-muted shadow-xs z-10 cursor-pointer transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    {/* Receipt Visual */}
                    <div
                      style={{ zoom: `${receiptZoom}%` }}
                      className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs w-full max-w-[320px] flex flex-col relative z-0 min-h-[260px]"
                    >
                      {/* Background watermark simulation */}
                      <div className="absolute top-3 right-3 opacity-15 pointer-events-none">
                        <div className="w-14 h-14 border-2 border-border-strong rounded-full flex items-center justify-center">
                          <div className="w-7 h-7 border-2 border-border-strong rounded-full" />
                        </div>
                      </div>

                      <div className="text-right mb-3 pr-2">
                        <h3 className="text-sm font-black text-heading uppercase tracking-widest">Expense Summary</h3>
                        <p className="text-[10px] text-muted font-medium mt-0.5 truncate max-w-[160px] ml-auto">{selectedRecord.id}</p>
                        <p className="text-[10px] text-muted">{new Date(selectedRecord.date).toLocaleDateString()}</p>
                      </div>

                      <div className="mb-3">
                        <p className="text-[8px] font-bold text-caption uppercase tracking-wider mb-0.5">Claimed By</p>
                        <p className="text-xs font-bold text-heading">{selectedRecord.employee || 'Unassigned'}</p>
                        <p className="text-[10px] text-muted">Internal expense record</p>
                      </div>

                      <div className="flex justify-between items-end border-b border-border-subtle pb-1.5 mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-caption">Description</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-caption">Amount</span>
                      </div>

                      <div className="flex justify-between items-start mb-auto gap-2">
                        <p className="text-xs text-heading leading-relaxed">
                          {formatCategory(selectedRecord.category)} expense at {selectedRecord.merchant || EMPTY.provided}
                        </p>
                        <span className="text-xs font-bold text-heading tabular-nums shrink-0 pt-0.5">{formatMoney(selectedRecord.amount)}</span>
                      </div>

                      <div className="pt-2.5 border-t-2 border-border-strong flex justify-between items-center mt-3">
                        <span className="text-xs font-bold text-heading">Total {selectedRecord.amount?.currency || 'USD'}</span>
                        <span className="text-sm font-black text-heading tabular-nums">{formatMoney(selectedRecord.amount)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. New Expense Dialog ── */}
      <FormDialog
        open={createOpen}
        onClose={() => !createExpenseMutation.isPending && setCreateOpen(false)}
        title="New Expense"
        subtitle="Submit an employee expense for approval and reimbursement."
        confirmLabel="Submit Expense"
        busy={createExpenseMutation.isPending}
        error={createError}
        onConfirm={() => createExpenseMutation.mutate()}
        width="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Description / Purpose</label>
            <Input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Client lunch meeting"
              className="w-full text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Category</label>
              <Select
                value={createForm.category}
                onValueChange={(val) => setCreateForm((f) => ({ ...f, category: val }))}
              >
                <SelectTrigger className="w-full bg-surface-raised">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFFICE">Office</SelectItem>
                  <SelectItem value="TRAVEL">Travel</SelectItem>
                  <SelectItem value="MEALS">Meals</SelectItem>
                  <SelectItem value="SOFTWARE">Software</SelectItem>
                  <SelectItem value="EQUIPMENT">Equipment</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Merchant</label>
              <Input
                type="text"
                value={createForm.merchant}
                onChange={(e) => setCreateForm((f) => ({ ...f, merchant: e.target.value }))}
                placeholder="e.g. AWS, Uber"
                className="w-full text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Amount</label>
              <Input
                type="text"
                inputMode="decimal"
                required
                value={createForm.amount}
                onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Tax (Optional)</label>
              <Input
                type="text"
                inputMode="decimal"
                value={createForm.tax}
                onChange={(e) => setCreateForm((f) => ({ ...f, tax: e.target.value }))}
                placeholder="0.00"
                className="w-full text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Date Incurred</label>
              <Input
                type="date"
                required
                value={createForm.date}
                onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full text-sm"
              />
            </div>

            {isAdmin && (
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Employee (Optional)</label>
                <DropdownMenu open={employeeDropdownOpen} onOpenChange={setEmployeeDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Expense employee"
                      className="flex h-9 w-full items-center justify-between rounded-input border border-border-default bg-surface-raised px-3 py-2 text-sm text-heading shadow-card ring-offset-background placeholder:text-caption focus:outline-none focus:ring-2 focus:ring-accent transition-colors hover:bg-surface-muted/50 text-left cursor-pointer"
                    >
                      <span className="truncate flex items-center gap-2 min-w-0">
                        {selectedEmployee ? (
                          <>
                            <span className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold shrink-0">
                              {selectedEmployee.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium truncate">{selectedEmployee.name}</span>
                            {selectedEmployee.title && (
                              <span className="text-caption text-xs truncate">· {selectedEmployee.title}</span>
                            )}
                          </>
                        ) : selectedEmployeeName ? (
                          <span className="font-medium truncate">{selectedEmployeeName}</span>
                        ) : (
                          <span className="text-muted">None (unassigned)</span>
                        )}
                      </span>
                      <ChevronDown className="h-4 w-4 text-caption shrink-0 ml-2" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="z-[60] w-[280px] p-2 bg-surface-raised border border-border-default shadow-elevated rounded-card-sm"
                  >
                    <div className="relative mb-2 px-1">
                      <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-muted pointer-events-none" />
                      <input
                        type="search"
                        placeholder="Search employee..."
                        value={employeeSearchInput}
                        onChange={(e) => setEmployeeSearchInput(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-muted rounded-input border border-border-subtle focus:outline-none focus:ring-1 focus:ring-accent text-heading placeholder:text-muted"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5 no-scrollbar">
                      <DropdownMenuItem
                        onSelect={() => {
                          setCreateForm(current => ({ ...current, employeeId: '' }));
                          setSelectedEmployeeName('');
                          setEmployeeSearchInput('');
                        }}
                        className={`justify-between text-xs ${!createForm.employeeId ? 'bg-accent/10 text-accent font-semibold' : ''}`}
                      >
                        <span className="text-muted italic">None (unassigned)</span>
                        {!createForm.employeeId && <Check className="h-3.5 w-3.5 text-accent shrink-0 ml-2" />}
                      </DropdownMenuItem>
                      {filteredEmployees.map((emp) => {
                        const isSelected = createForm.employeeId === emp.id;
                        return (
                          <DropdownMenuItem
                            key={emp.id}
                            onSelect={() => {
                              setCreateForm(current => ({ ...current, employeeId: emp.id }));
                              setSelectedEmployeeName(emp.name);
                              setEmployeeSearchInput('');
                            }}
                            className={`justify-between text-xs ${isSelected ? 'bg-accent/10 text-accent font-semibold' : ''}`}
                          >
                            <div className="flex items-center gap-2 truncate min-w-0">
                              <span className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold shrink-0">
                                {emp.name.charAt(0).toUpperCase()}
                              </span>
                              <div className="truncate min-w-0">
                                <span className="text-heading truncate font-medium block leading-tight">{emp.name}</span>
                                {emp.title && <span className="text-caption text-[10px] block truncate leading-tight mt-0.5">{emp.title}</span>}
                              </div>
                            </div>
                            {isSelected && <Check className="h-3.5 w-3.5 text-accent shrink-0 ml-2" />}
                          </DropdownMenuItem>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <p className="py-4 text-center text-xs text-muted">No employees found</p>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
