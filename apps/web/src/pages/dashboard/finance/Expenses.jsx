import React, { useEffect, useState } from 'react';
import {
  Search,
  ChevronDown,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  FileText,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  Download,
  Loader2,
  Plus
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { hrApi } from '../../../lib/api/hr';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatCompactTableMoney } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';
import { useSearchParams } from 'react-router-dom';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table';

const metricFontSize = (money) => {
  const label = formatMoney(money)
  return `clamp(0.75rem, ${Math.min(14, 130 / Math.max(1, label.length))}cqw, 1.875rem)`
}

export default function Expenses() {
  const queryClient = useQueryClient();
  const { data: activeMemberRole } = useActiveMemberRole();
  const isAdmin = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole));
  const [selectedId, setSelectedId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  // Debounce the search box so each keystroke doesn't fire a list request and collapse the table.
  const search = useDebouncedValue(searchInput)
  const [departmentId, setDepartmentId] = useState('')
  const [sort, setSort] = useState('desc')
  const [receiptZoom, setReceiptZoom] = useState(100)
  const [receiptOpen, setReceiptOpen] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [employeeSearchInput, setEmployeeSearchInput] = useState('')
  const employeeSearch = useDebouncedValue(employeeSearchInput)
  const [employeePage, setEmployeePage] = useState(1)
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('')
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
    queryKey: queryKeys.hr.employees.list({ page: employeePage, limit: 25, search: employeeSearch || undefined }),
    queryFn: () => hrApi.listEmployees({ page: employeePage, limit: 25, search: employeeSearch || undefined }),
    enabled: isAdmin && createOpen,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const pages = employeesData?.pagination?.pages
    if (pages === undefined) return
    if (pages === 0 && employeePage !== 1) setEmployeePage(1)
    else if (pages > 0 && employeePage > pages) setEmployeePage(pages)
  }, [employeesData?.pagination?.pages, employeePage])

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
      setSelectedEmployeeName('')
      setEmployeeSearchInput('')
      setEmployeePage(1)
      setCreateError('');
    },
    onError: (err) => {
      setCreateError(err.message || 'Failed to submit expense.');
    },
  });
  const { data: departmentsData } = useQuery({ queryKey: queryKeys.hr.departments.list(), queryFn: hrApi.getDepartments })

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.expenses.list({ page: 1, limit: 100, search: search || undefined, departmentId: departmentId || undefined, sort }),
    queryFn: () => financeApi.listExpenses({ page: 1, limit: 100, search: search || undefined, departmentId: departmentId || undefined, sort }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const rows = data?.items || []
    if (!rows.some(row => row.id === selectedId)) setSelectedId(rows[0]?.id ?? null)
  }, [data?.items, selectedId])
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
      const rows = []
      let page = 1
      let pages = 1
      while (page <= pages) {
        const result = await financeApi.listExpenses({ page, limit: 100, search: search || undefined, departmentId: departmentId || undefined, sort })
        rows.push(...result.items)
        pages = result.pagination.pages
        page += 1
      }
      return rows
    },
    onSuccess: rows => {
      const header = ['Expense ID', 'Employee', 'Expense', 'Merchant', 'Category', 'Date', 'Amount (minor units)', 'Currency', 'Status', 'Policy Match']
      const records = rows.map(row => [row.id, row.employee, row.name, row.merchant, row.category, row.date, row.amount.amount, row.amount.currency, row.status, row.policyMatch])
      downloadCsv([header, ...records], `expenses-${new Date().toISOString().slice(0, 10)}.csv`)
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        Failed to load expenses.
      </div>
    );
  }

  const items = data.items || [];
  const summary = data.summary || {};

  const selectedRecord = items.find(r => r.id === selectedId);

  // Document-status totals and reimbursement settlement totals come from server aggregates,
  // not page-level reductions. The MTD settlement value is backed by posted journals.
  const pendingCount = summary.pendingCount ?? 0;
  const pendingAmount = summary.pendingTotal ?? { amount: 0, currency: 'USD' };
  const approvedAmount = summary.approvedTotal ?? { amount: 0, currency: 'USD' };
  const violationAmount = summary.flaggedTotal ?? { amount: 0, currency: 'USD' };

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">

      <TopBarActions>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
            className="gap-2 h-9 px-4 font-semibold shadow-card"
          >
            <Download size={14} /> {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => { setCreateError(''); setEmployeeSearchInput(''); setEmployeePage(1); setCreateOpen(true); }}
            className="gap-2 h-9 px-4 font-semibold shadow-card"
          >
            <Plus size={14} /> New Expense
          </Button>
        </div>
        {exportMutation.isError && (
          <Alert variant="destructive" className="mt-2 py-2 px-3">
            <AlertDescription className="text-xs">{exportMutation.error?.message || 'Could not export expenses.'}</AlertDescription>
          </Alert>
        )}
      </TopBarActions>

      {/* ── KPIs Row (Compact, baseline-aligned) ── */}
      <div className="px-4 sm:px-6 py-2.5 flex-shrink-0 border-b border-border-default bg-surface-muted">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Pending Approval */}
          <div className="border border-border-default rounded-card-sm px-3.5 py-2.5 bg-surface-raised shadow-card flex flex-col justify-between" style={{ containerType: 'inline-size' }}>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">Pending Approval</p>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <p className="min-w-0 text-xl font-bold text-heading tracking-tight tabular-nums" style={{ fontSize: metricFontSize(pendingAmount) }}>
                {formatMoney(pendingAmount)}
              </p>
              <span className="bg-surface-active text-muted px-2 py-0.5 rounded-input text-[11px] font-bold uppercase tracking-wider inline-flex items-center h-[20px] shrink-0">
                {pendingCount} Reports
              </span>
            </div>
            <p className="mt-1 text-xs text-muted truncate leading-tight">
              {pendingCount === 1 ? '1 report awaiting review' : `${pendingCount} reports awaiting review`}
            </p>
          </div>

          {/* Card 2: Approved Expenses */}
          <div className="border border-border-default rounded-card-sm px-3.5 py-2.5 bg-surface-raised shadow-card flex flex-col justify-between" style={{ containerType: 'inline-size' }}>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">Approved Expenses</p>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <p className="min-w-0 text-xl font-bold text-heading tracking-tight tabular-nums" style={{ fontSize: metricFontSize(approvedAmount) }}>
                {formatMoney(approvedAmount)}
              </p>
              <span className="bg-accent-light text-accent px-2 py-0.5 rounded-input text-[11px] font-bold uppercase tracking-wider inline-flex items-center h-[20px] shrink-0">
                {summary.approvedCount ?? 0} Reports
              </span>
            </div>
            <p className="mt-1 text-xs text-muted truncate leading-tight" title="Valued reimbursement journals in workspace base currency, net of linked reversals.">
              Reimbursed MTD: {summary.reimbursedThisMonthTotal == null ? 'unavailable' : formatMoney(summary.reimbursedThisMonthTotal)} · Prior period: {summary.reimbursedThisMonthComparison?.previousTotal == null ? 'unavailable' : formatMoney(summary.reimbursedThisMonthComparison.previousTotal)}
            </p>
          </div>

          {/* Card 3: Policy Violations */}
          <div className="border border-border-default rounded-card-sm px-3.5 py-2.5 bg-surface-raised shadow-card flex flex-col justify-between" style={{ containerType: 'inline-size' }}>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">Policy Violations</p>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <p className="min-w-0 text-xl font-bold text-heading tracking-tight tabular-nums" style={{ fontSize: metricFontSize(violationAmount) }}>
                {formatMoney(violationAmount)}
              </p>
              <span className="flex items-center gap-1 bg-danger-light text-danger-hover px-2 py-0.5 rounded-input text-[11px] font-bold uppercase tracking-wider inline-flex items-center h-[20px] shrink-0">
                <AlertTriangle size={11} strokeWidth={3} /> {summary.flaggedCount ?? 0} Reports
              </span>
            </div>
            <p className="mt-1 text-xs text-muted truncate leading-tight">
              {(summary.flaggedCount ?? 0) === 0 ? 'No active policy alerts' : `${summary.flaggedCount} flagged for review`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 flex flex-col min-[1100px]:flex-row overflow-y-auto min-[1100px]:overflow-hidden">

        {/* Left: List Pane */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-surface-muted min-[1100px]:border-r border-border-default p-3 gap-2.5">

          {/* List Pane Toolbar (compact height 44px) */}
          <div className="h-11 flex-shrink-0 px-3 flex items-center justify-between gap-2.5 bg-surface-raised rounded-card-sm border border-border-default shadow-card">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex-shrink-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                <Input
                  type="text"
                  value={searchInput}
                  onChange={event => setSearchInput(event.target.value)}
                  placeholder="Search..."
                  className="pl-8 pr-2.5 h-7 text-xs bg-surface-raised w-40 sm:w-52"
                />
              </div>
              <label className="relative flex items-center border border-border-default text-body px-2.5 h-7 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised flex-shrink-0 cursor-pointer">
                <span className="sr-only">Filter expenses by department</span>
                <select
                  value={departmentId}
                  onChange={event => setDepartmentId(event.target.value)}
                  className="appearance-none bg-transparent pr-4 text-xs outline-none cursor-pointer"
                >
                  <option value="">All Depts</option>
                  {(departmentsData?.items ?? departmentsData ?? []).map(department => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-1.5 text-caption" />
              </label>
            </div>
            <label className="relative flex items-center border border-border-default text-body px-2.5 h-7 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised flex-shrink-0 cursor-pointer">
              <span className="sr-only">Sort expenses</span>
              <select
                aria-label="Sort expenses"
                value={sort}
                onChange={event => setSort(event.target.value)}
                className="appearance-none bg-transparent pr-4 text-xs outline-none cursor-pointer font-medium text-body-light hover:text-heading"
              >
                <option value="desc">Sort: Newest First</option>
                <option value="asc">Sort: Oldest First</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-1.5 text-caption" />
            </label>
          </div>

          {/* Table Card (wrapped in a card: 1px border, border-radius 12-16px, overflow hidden) */}
          <div className="bg-surface-raised rounded-card border border-border-default shadow-card overflow-hidden flex flex-col flex-1 min-h-0">
            {/* Table Container (scrolls vertically on its own with sticky header) */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-surface-raised">
              <Table className="w-full table-fixed text-left border-collapse">
                <colgroup>
                  <col className="min-w-[170px]" />
                  <col className="w-[20%] min-w-[110px]" />
                  <col className="w-[85px] lg:w-[90px]" />
                  <col className="w-[100px] lg:w-[105px]" />
                  <col className="w-[100px] lg:w-[105px]" />
                </colgroup>
                <TableHeader className="bg-surface-muted/60 border-b border-border-default sticky top-0 z-10 h-10">
                  <TableRow className="h-10 hover:bg-transparent border-0">
                    <TableHead className="px-3 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Employee</TableHead>
                    <TableHead className="w-[20%] min-w-[110px] px-2.5 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Merchant</TableHead>
                    <TableHead className="w-[85px] lg:w-[90px] px-2.5 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Expense Date</TableHead>
                    <TableHead className="w-[100px] lg:w-[105px] px-2.5 py-0 text-center text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Status</TableHead>
                    <TableHead className="w-[100px] lg:w-[105px] px-2.5 pr-4 py-0 text-right rtl:text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Amount</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {items.map(item => {
                    const isSelected = selectedId === item.id;

                    let badgeStyle = "bg-surface-active text-body-light";
                    if (item.status === 'PENDING') badgeStyle = "bg-[#fff7ed] text-[#c2410c]";
                    if (item.status === 'FLAGGED') badgeStyle = "bg-danger-light text-danger-hover";

                    // Generate consistent colors based on string
                    const hashCode = (str) => {
                      let hash = 0;
                      for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                      return hash;
                    };
                    const colors = ['bg-primary', 'bg-accent', 'bg-green-600', 'bg-orange-600', 'bg-purple-600'];
                    const name = item.employee || 'Unassigned';
                    const bgClass = colors[Math.abs(hashCode(name)) % colors.length];

                    return (
                      <TableRow
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`h-[48px] cursor-pointer transition-colors border-0 ${
                          isSelected
                            ? 'bg-accent-light/40'
                            : 'bg-surface-raised hover:bg-surface-muted'
                        }`}
                      >
                        {/* Employee Column (name above category, 3px accent bar when selected) */}
                        <TableCell className="relative px-3 py-0 align-middle border-b border-border-subtle min-w-0">
                          {isSelected && (
                            <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600 pointer-events-none" />
                          )}
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-full ${bgClass} flex items-center justify-center text-[11px] font-bold text-white shadow-card shrink-0`}>
                              {name?.substring(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-heading truncate leading-tight" title={name}>{name}</p>
                              <p className="text-[10px] text-muted truncate leading-tight mt-0.5" title={item.category}>{item.category}</p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Merchant Column */}
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-xs font-medium text-body truncate" title={item.merchant || '—'}>
                          {item.merchant || '—'}
                        </TableCell>

                        {/* Expense Date Column */}
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-xs font-medium text-muted whitespace-nowrap">
                          {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                        </TableCell>

                        {/* Status Column */}
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-center whitespace-nowrap">
                          <Badge variant="outline" className={`border-0 text-[11px] font-semibold ${badgeStyle}`}>
                            {item.status}
                          </Badge>
                        </TableCell>

                        {/* Amount Column */}
                        <TableCell className="px-2.5 pr-4 py-0 align-middle border-b border-border-subtle text-right text-xs font-semibold text-heading tabular-nums whitespace-nowrap" title={formatMoney(item.amount)}>
                          {formatCompactTableMoney(item.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {items.length === 0 && (
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={5} className="px-6 py-8 text-center text-muted text-xs">
                        No expenses found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Table Footer (pinned to bottom of card, height 36px) */}
            {data.pagination && (
              <div className="h-9 flex-shrink-0 border-t border-border-default px-3 flex items-center text-xs text-muted bg-surface-raised">
                <span>Showing {items.length} of {data.pagination.total} expenses</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail Panel (rebalanced width 380px, compact padding 12px, gaps 10px) */}
        {selectedRecord && (
          <div className="w-full min-[1100px]:w-[380px] min-[1100px]:flex-shrink-0 bg-surface-muted border-t min-[1100px]:border-t-0 min-[1100px]:border-l border-border-default overflow-y-auto p-3 space-y-2.5">

            {/* Header Card (reorganized: Top: identity + amount, Below: compact action group, Separated: destructive action) */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-3.5 shadow-card space-y-2.5">
              {/* Top: Employee identity and amount */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-card">
                    {(selectedRecord.employee || 'Unassigned')?.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-heading leading-tight truncate" title={selectedRecord.employee || 'Unassigned'}>
                      {selectedRecord.employee || 'Unassigned'}
                    </h2>
                    <p className="text-[11px] text-muted truncate leading-tight mt-0.5">{selectedRecord.category}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-heading tracking-tight tabular-nums">
                    {formatMoney(selectedRecord.amount)}
                  </p>
                </div>
              </div>

              {isAdmin ? (
                <div className="space-y-2 pt-1">
                  {/* Below: Compact action group with sufficient width for labels */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status !== 'PENDING'}
                      onClick={() => statusMutation.mutate('APPROVED')}
                      className="h-9 flex-1 whitespace-nowrap text-xs font-semibold px-2.5"
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status !== 'APPROVED'}
                      onClick={() => statusMutation.mutate('REIMBURSED')}
                      title="Records reimbursement after it has been paid outside Asas."
                      className="h-9 flex-1 whitespace-nowrap text-xs font-semibold px-2.5"
                    >
                      Mark Reimbursed
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedRecord || statusMutation.isPending || ['APPROVED', 'REIMBURSED', 'REJECTED', 'VOID'].includes(selectedRecord.status)}
                      onClick={() => statusMutation.mutate('REJECTED')}
                      className="h-9 px-3 whitespace-nowrap text-xs font-medium"
                    >
                      Reject
                    </Button>
                  </div>

                  {/* Clearly separated: Destructive action */}
                  <div className="pt-2 border-t border-border-subtle">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedRecord || voidMutation.isPending || selectedRecord.status === 'VOID'}
                      onClick={() => {
                        const reason = window.prompt('Reason for voiding this expense:')?.trim()
                        if (reason) voidMutation.mutate(reason)
                      }}
                      className="h-9 w-full whitespace-nowrap text-xs font-medium border-danger/40 text-danger hover:bg-danger/5"
                    >
                      {voidMutation.isPending ? 'Voiding…' : 'Void expense'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="pt-1">
                  <Badge
                    variant="outline"
                    className={`inline-flex items-center justify-center h-8 px-3 w-full text-xs font-semibold uppercase tracking-wider border-0 ${
                      selectedRecord.status === 'APPROVED' ? 'bg-accent-light text-accent' :
                      selectedRecord.status === 'REIMBURSED' ? 'bg-accent text-white' :
                      selectedRecord.status === 'REJECTED' || selectedRecord.status === 'VOID' ? 'bg-danger-light text-danger' :
                      'bg-[#fff7ed] text-[#c2410c]'
                    }`}
                  >
                    {selectedRecord.status}
                  </Badge>
                </div>
              )}
            </div>
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

            {/* AI Data Extraction / Expense Details Card (standardized two-column alignment) */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-3.5 shadow-card">
              <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-border-subtle">
                <Sparkles size={14} className="text-accent shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-heading">Expense details</h3>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none mb-1">Merchant</p>
                  <p className="text-xs font-semibold text-heading truncate leading-tight" title={selectedRecord.merchant || '—'}>{selectedRecord.merchant || '—'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none mb-1">Category</p>
                  <p className="text-xs font-semibold text-heading truncate leading-tight" title={selectedRecord.category}>{selectedRecord.category}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none mb-1">Tax</p>
                  <p className="text-xs font-semibold text-heading tabular-nums leading-tight">{formatMoney(selectedRecord.tax)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none mb-1">Policy Match</p>
                  {selectedRecord.policyMatch === null ? (
                    <p className="text-xs font-semibold text-muted leading-tight">—</p>
                  ) : selectedRecord.policyMatch ? (
                    <p className="text-xs font-semibold text-accent flex items-center gap-1 leading-tight">
                      <CheckCircle2 size={13} /> Yes
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-danger leading-tight">No</p>
                  )}
                </div>
              </div>
            </div>

            {/* PDF Preview / Expense Summary Card (recovered vertical room) */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 bg-surface-raised border-b border-border-subtle">
                <div className="flex items-center gap-2 text-body">
                  <FileText size={14} className="text-caption" />
                  <span className="text-xs font-medium">Expense summary</span>
                </div>
                <div className="flex items-center gap-2.5 text-muted text-xs font-medium">
                  {!receiptOpen ? (
                    <Button type="button" variant="link" size="sm" onClick={() => setReceiptOpen(true)} className="h-auto p-0 text-accent font-semibold text-xs">View Receipt</Button>
                  ) : (
                    <>
                      <Button type="button" variant="ghost" size="icon" aria-label="Zoom out receipt" disabled={receiptZoom <= 50} onClick={() => setReceiptZoom(value => Math.max(50, value - 25))} className="h-6 w-6"><ZoomOut size={13} /></Button>
                      <span className="text-[11px]">{receiptZoom}%</span>
                      <Button type="button" variant="ghost" size="icon" aria-label="Zoom in receipt" disabled={receiptZoom >= 200} onClick={() => setReceiptZoom(value => Math.min(200, value + 25))} className="h-6 w-6"><ZoomIn size={13} /></Button>
                    </>
                  )}
                </div>
              </div>

              {receiptOpen && (
                <div className="bg-[#e2e8f0] p-3 flex justify-center relative max-h-[380px] overflow-auto">
                  {/* Pagination/Nav Control overlay */}
                  <div onClick={() => setReceiptOpen(false)} className="absolute left-4 top-4 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-elevated z-10 cursor-pointer hover:bg-primary transition-colors">
                    <ChevronLeft size={16} className="text-white" />
                  </div>

                  {/* Receipt Visual — original document dimensions preserved */}
                  <div style={{ zoom: `${receiptZoom}%` }} className="bg-surface-raised w-full max-w-[320px] shadow-elevated rounded-sm p-4 flex flex-col relative z-0 min-h-[280px]">
                    {/* Background watermark simulation */}
                    <div className="absolute top-4 right-4 opacity-10">
                      <div className="w-16 h-16 border-4 border-border-strong rounded-full flex items-center justify-center">
                        <div className="w-8 h-8 border-4 border-border-strong rounded-full"></div>
                      </div>
                    </div>

                    <div className="text-right mb-4">
                      <h3 className="text-base font-black text-heading uppercase tracking-widest">Expense Summary</h3>
                      <p className="text-[10px] text-muted mt-0.5">{selectedRecord.id}</p>
                      <p className="text-[10px] text-muted">{new Date(selectedRecord.date).toLocaleDateString()}</p>
                    </div>

                    <div className="mb-4">
                      <p className="text-[8px] font-bold text-caption uppercase tracking-wider mb-0.5">Claimed By</p>
                      <p className="text-xs font-bold text-heading">{selectedRecord.employee || 'Unassigned'}</p>
                      <p className="text-[10px] text-muted">Internal expense record</p>
                    </div>

                    <div className="flex justify-between items-end border-b border-border-subtle pb-1.5 mb-2">
                      <span className="text-[9px] text-caption">Description</span>
                      <span className="text-[9px] text-caption">Amount</span>
                    </div>

                    <div className="flex justify-between items-start mb-auto">
                      <p className="text-xs text-heading pr-4 leading-relaxed">
                        {selectedRecord.category} expense at {selectedRecord.merchant || '—'}
                      </p>
                      <span className="text-xs text-heading tabular-nums pt-1">{formatMoney(selectedRecord.amount)}</span>
                    </div>

                    <div className="pt-3 border-t-2 border-gray-900 flex justify-between items-center mt-4">
                      <span className="text-xs font-bold text-heading">Total {selectedRecord.amount?.currency || 'USD'}</span>
                      <span className="text-sm font-black text-heading tabular-nums">{formatMoney(selectedRecord.amount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── New Expense Dialog ── */}
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
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full border border-border-default rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="OFFICE">Office</option>
                <option value="TRAVEL">Travel</option>
                <option value="MEALS">Meals</option>
                <option value="SOFTWARE">Software</option>
                <option value="EQUIPMENT">Equipment</option>
                <option value="OTHER">Other</option>
              </select>
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
                <Input
                  type="search"
                  aria-label="Search employees"
                  placeholder="Search by name, title, or email"
                  value={employeeSearchInput}
                  onChange={event => { setEmployeeSearchInput(event.target.value); setEmployeePage(1) }}
                  className="mb-2 w-full text-sm"
                />
                <select
                  aria-label="Expense employee"
                  value={createForm.employeeId}
                  onChange={(e) => {
                    const employee = (employeesData?.items ?? []).find(item => item.id === e.target.value)
                    setCreateForm(current => ({ ...current, employeeId: e.target.value }))
                    setSelectedEmployeeName(employee?.name ?? '')
                  }}
                  className="w-full border border-border-default rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Select employee...</option>
                  {createForm.employeeId && !(employeesData?.items ?? []).some(employee => employee.id === createForm.employeeId) && (
                    <option value={createForm.employeeId}>{selectedEmployeeName || 'Selected employee'}</option>
                  )}
                  {(employeesData?.items ?? []).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
                {employeesData?.pagination && <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                  <span>Showing {employeesData.pagination.total === 0 ? 0 : (employeePage - 1) * employeesData.pagination.limit + 1}–{Math.min(employeePage * employeesData.pagination.limit, employeesData.pagination.total)} of {employeesData.pagination.total}</span>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={employeePage <= 1} onClick={() => setEmployeePage(current => current - 1)} className="h-6 px-2 text-xs">Previous</Button>
                    <span>Page {employeesData.pagination.pages === 0 ? 0 : employeePage} of {employeesData.pagination.pages}</span>
                    <Button type="button" variant="outline" size="sm" disabled={employeePage >= employeesData.pagination.pages} onClick={() => setEmployeePage(current => current + 1)} className="h-6 px-2 text-xs">Next</Button>
                  </div>
                </div>}
              </div>
            )}
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
