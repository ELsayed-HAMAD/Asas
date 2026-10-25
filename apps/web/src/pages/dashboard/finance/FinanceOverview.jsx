import React, { useState } from 'react';
import {
  Calendar,
  Download,
  Wallet,
  RefreshCw,
  FileText,
  Flame,
  MoreHorizontal,
  TrendingUp,
  Loader2,
  Plus,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { queryKeys } from '../../../lib/queryKeys';
import {
  formatMoney,
  formatCompactCurrency,
  formatCompactMoney,
  formatCompactTableMoney,
  moneyToMajor,
} from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import FormDialog from '../../../components/common/FormDialog';
import SearchInput from '../../../components/common/SearchInput';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
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

// Display-only conversion of a wire money object ({amount: minor units, currency}) to a
// major-unit number, used solely to feed recharts' numeric series / axis ticks. Every
// human-readable figure still goes through formatMoney.
const major = (money) => (money ? moneyToMajor(money) : 0);

const EXPENSE_COLORS = [
  'var(--color-info)',
  'var(--color-chart-orange)',
  'var(--color-chart-purple)',
  'var(--color-caption)',
  'var(--color-chart-positive)',
  'var(--color-chart-negative)',
];

export default function FinanceOverview() {
  const queryClient = useQueryClient();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [invoiceForm, setInvoiceForm] = useState({ customerId: '', number: '', amount: '', dueDate: '' });

  const { data, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'overview', selectedYear],
    queryFn: () => financeApi.getOverview({ year: selectedYear }),
  });
  const { data: customersData } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'customers'],
    queryFn: financeApi.listCustomers,
  });

  // Tenant-local month-to-date settlement summaries (null before ledger coverage) — they turn
  // the receivable/payable card badges from static labels into real period figures.
  const { data: receivablesData } = useQuery({
    queryKey: queryKeys.finance.receivables.list({ limit: 1 }),
    queryFn: () => financeApi.listReceivables({ limit: 1 }),
  });
  const { data: payablesData } = useQuery({
    queryKey: queryKeys.finance.payables.list({ limit: 1 }),
    queryFn: () => financeApi.listPayables({ limit: 1 }),
  });

  const createInvoice = useMutation({
    mutationFn: () => financeApi.createReceivable({
      ...invoiceForm,
      number: invoiceForm.number || null,
      dueDate: invoiceForm.dueDate || null,
      status: 'CURRENT',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setInvoiceOpen(false);
      setInvoiceForm({ customerId: '', number: '', amount: '', dueDate: '' });
    },
  });

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
        Failed to load finance overview.
      </div>
    );
  }

  const availableYears = [...new Set([selectedYear, ...(data.cashFlow ?? []).map(point => point.month.slice(0, 4))])].sort((a, b) => b.localeCompare(a));
  const cashFlowData = (data.cashFlow ?? []).filter(point => point.month.startsWith(`${selectedYear}-`)).map((p) => ({
    month: p.month,
    inflow: major(p.inflow),
    outflow: major(p.outflow),
    net: major(p.net),
  }));
  const currency = data.cashFlow?.[0]?.inflow?.currency || data.receivableOutstanding?.currency || 'USD';
  const recentTransactions = (data.recentTransactions ?? []).filter(tx =>
    tx.date.startsWith(`${selectedYear}-`) && (!transactionSearch || tx.description.toLowerCase().includes(transactionSearch.toLowerCase()) || tx.status.toLowerCase().includes(transactionSearch.toLowerCase())),
  );

  function downloadFinanceReport() {
    const rows = [
      ['Finance report', `Calendar year ${selectedYear}`],
      ['Metric', 'Amount (minor units)', 'Currency'],
      ...[['Receivables outstanding', data.receivableOutstanding], ['Payables outstanding', data.payableOutstanding], ['Expenses total', data.expensesTotal], ['Expenses pending', data.expensesPendingTotal]].map(([label, amount]) => [label, amount.amount, amount.currency]),
      [],
      ['Month', 'Inflow (minor units)', 'Outflow (minor units)', 'Net (minor units)', 'Currency'],
      ...cashFlowData.map(point => {
        const source = data.cashFlow.find(row => row.month === point.month);
        return [point.month, source.inflow.amount, source.outflow.amount, source.net.amount, source.net.currency];
      }),
      [],
      ['Date', 'Description', 'Amount (minor units)', 'Currency', 'Type', 'Status'],
      ...recentTransactions.map(tx => [tx.date, tx.description, tx.amount.amount, tx.amount.currency, tx.type, tx.status]),
    ];
    downloadCsv(rows, `finance-${selectedYear}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function downloadCashFlow() {
    const rows = [
      ['Month', 'Inflow (minor units)', 'Outflow (minor units)', 'Net (minor units)', 'Currency'],
      ...cashFlowData.map(point => {
        const source = data.cashFlow.find(row => row.month === point.month);
        return [point.month, source.inflow.amount, source.outflow.amount, source.net.amount, source.net.currency];
      }),
    ];
    downloadCsv(rows, `cash-flow-${selectedYear}.csv`);
  }

  // Net cash-flow sparkline for the second KPI card
  const netSeries = cashFlowData.map((p, i) => ({ v: p.net, id: i }));
  const cashFlowDeltaMinor = data.cashFlowComparison.current.net.amount - data.cashFlowComparison.previous.net.amount;
  const fullYearSelected = data.cashFlowComparison.current.endDateExclusive === `${Number(selectedYear) + 1}-01-01`;
  const cashFlowChangeText = `${selectedYear}${fullYearSelected ? ' full year' : ' year-to-date'} vs ${Number(selectedYear) - 1} matching period: ${formatMoney(data.cashFlowComparison.previous.net)} prior, ${cashFlowDeltaMinor > 0 ? '+' : ''}${formatMoney({ amount: cashFlowDeltaMinor, currency: data.cashFlowComparison.current.net.currency })}`;

  // Real month-to-date settlement badges; the static label stays when ledger coverage does
  // not yet include the current month (the totals are null then, never guessed).
  const collectedMtd = receivablesData?.summary?.collectedThisMonthTotal ?? null;
  const collectedMtdPrior = receivablesData?.summary?.collectedThisMonthComparison?.previousTotal ?? null;
  const receivablesBadgeText = collectedMtd == null
    ? 'To collect'
    : `${formatMoney(collectedMtd)} collected MTD${collectedMtdPrior == null ? '' : ` (vs ${formatMoney(collectedMtdPrior)})`}`;
  const paidMtd = payablesData?.summary?.paidThisMonthTotal ?? null;
  const paidMtdPrior = payablesData?.summary?.paidThisMonthComparison?.previousTotal ?? null;
  const payablesBadgeText = paidMtd == null
    ? 'To pay'
    : `${formatMoney(paidMtd)} paid MTD${paidMtdPrior == null ? '' : ` (vs ${formatMoney(paidMtdPrior)})`}`;

  // Operating-expenses donut: split the real expense total into pending vs approved.
  const totalExp = major(data.expensesTotal);
  const pendExp = major(data.expensesPendingTotal);
  let expenseData = [];
  if (totalExp > 0) {
    const approvedExp = Math.max(0, totalExp - pendExp);
    const approvedPct = Math.round((approvedExp / totalExp) * 100);
    const pendingPct = 100 - approvedPct;
    if (approvedExp > 0) {
      expenseData.push({ name: 'Approved', value: approvedExp, pct: approvedPct, color: EXPENSE_COLORS[0] });
    }
    if (pendExp > 0) {
      expenseData.push({ name: 'Pending', value: pendExp, pct: pendingPct, color: EXPENSE_COLORS[1] });
    }
  } else {
    expenseData.push({ name: 'No expenses', value: 0, pct: 0, color: 'var(--color-caption)' });
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 p-4 sm:p-6 space-y-4">

      {/* ── 1. Unified Single-Row Apple-Glass Command Toolbar ── */}
      <div className="relative z-30 bg-surface-raised/85 backdrop-blur-xl border border-border-default rounded-2xl p-2.5 shadow-xs flex flex-wrap xl:flex-nowrap items-center justify-between gap-2.5 flex-shrink-0">
        {/* Left Cluster: Search transactions + Year select */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <SearchInput
            placeholder="Search transactions..."
            value={transactionSearch}
            onChange={event => setTransactionSearch(event.target.value)}
            wrapperClassName="w-full sm:w-80 md:w-96 lg:w-[460px] shrink-0"
            className="h-9 pl-9 pr-3 text-xs sm:text-sm"
          />

          <Select value={String(selectedYear)} onValueChange={val => setSelectedYear(val)}>
            <SelectTrigger
              aria-label="Finance calendar year"
              className="h-9 w-auto min-w-[125px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 shrink-0 bg-surface-muted hover:bg-surface-muted/80 border border-border-default shadow-xs text-body hover:text-heading"
            >
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-muted shrink-0" />
                <span className="text-muted text-[11px] font-semibold uppercase mr-1">Year</span>
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={String(year)} className="text-xs">
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Right Cluster: Export + Create Invoice */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadFinanceReport}
            aria-label="Download finance report"
            title="Download finance report"
            className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border border-border-default bg-surface-raised hover:bg-surface-muted shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Download size={14} /> Export
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setInvoiceOpen(true)}
            className="h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
          >
            <Plus size={14} /> Create Invoice
          </Button>
        </div>
      </div>

      {/* ── 2. Row 1: 3-Tier Apple-Glass KPI Cards + Compact Currency ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">

        {/* Card 1: Outstanding Receivables */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-snug">
              Outstanding Receivables
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
              <FileText size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(data.receivableOutstanding)}
            >
              {formatCompactCurrency(data.receivableOutstanding)}
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle flex items-center">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 w-fit">
              <TrendingUp size={12} strokeWidth={2.5} className="shrink-0" />
              <span>{receivablesBadgeText}</span>
            </span>
          </div>
        </div>

        {/* Card 2: Selected Period Net Cash (Fixed Header & Subtext Truncation) */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2 relative z-10">
            <span
              className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-snug break-words"
              title="Selected Period Net Cash Flow"
            >
              Selected Period Net Cash
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
              <RefreshCw size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1 relative z-10">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(data.cashFlowComparison.current.net)}
            >
              {formatCompactCurrency(data.cashFlowComparison.current.net)}
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle relative z-10">
            <p
              className={cn(
                'font-medium text-[11px] leading-snug',
                cashFlowDeltaMinor > 0 ? 'text-emerald-600 dark:text-emerald-400' : cashFlowDeltaMinor < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted',
              )}
              title={cashFlowChangeText}
            >
              {cashFlowChangeText}
            </p>
          </div>
          {/* Subtle sparkline in background */}
          <div className="absolute bottom-0 left-0 w-full h-5 overflow-hidden pointer-events-none opacity-30">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={netSeries} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netCashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-primary, #6366f1)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-chart-primary, #6366f1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="var(--color-chart-primary, #6366f1)" strokeWidth={2} fill="url(#netCashGrad)" dot={false} animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 3: Outstanding Payables */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-snug">
              Outstanding Payables
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center shrink-0">
              <Wallet size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(data.payableOutstanding)}
            >
              {formatCompactCurrency(data.payableOutstanding)}
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle flex items-center">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20 w-fit">
              <TrendingUp size={12} strokeWidth={2.5} className="rotate-180 shrink-0" />
              <span>{payablesBadgeText}</span>
            </span>
          </div>
        </div>

        {/* Card 4: Expenses Total */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-snug">
              Expenses Total
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
              <Flame size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(data.expensesTotal)}
            >
              {formatCompactCurrency(data.expensesTotal)}
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle flex items-center">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 w-fit">
              <span>{data.expensesPendingCount} pending approval</span>
            </span>
          </div>
        </div>

      </div>

      {/* ── 3. Row 2: Compact Cash Flow Analysis Card ── */}
      <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl p-5 shadow-card overflow-hidden flex flex-col justify-between flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-heading">Cash Flow Analysis</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={downloadCashFlow}
            aria-label="Download cash flow data"
            title="Download cash flow data"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:text-heading hover:bg-surface-muted transition-colors cursor-pointer border border-transparent hover:border-border-default"
          >
            <MoreHorizontal size={18} />
          </Button>
        </div>

        <div>
          {cashFlowData.length === 0 ? (
            <div className="min-h-[165px] rounded-xl border border-dashed border-border-default bg-surface-muted/60 p-6 flex flex-col items-center justify-center text-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-surface-raised border border-border-default shadow-xs flex items-center justify-center text-muted">
                <TrendingUp size={16} />
              </div>
              <p className="text-xs font-medium text-muted">
                No cash flow data is available for {selectedYear}.
              </p>
            </div>
          ) : (
            <div className="w-full h-[280px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 600 }} tickFormatter={(v) => formatCompactMoney(v, currency)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13, padding: '12px', lineHeight: '1.5' }}
                    formatter={(value, name) => {
                      const label = name === 'inflow' ? 'Inflow' : name === 'outflow' ? 'Outflow' : 'Net';
                      const formattedValue = name === 'net' ? value : Math.abs(value);
                      return [formatCompactMoney(formattedValue, currency), label];
                    }}
                    labelStyle={{ fontWeight: 600, color: 'var(--color-heading)' }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 13, fontWeight: 500, color: 'var(--color-muted)' }} formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)} />
                  <Bar dataKey="inflow" fill="var(--color-chart-positive)" radius={[4, 4, 0, 0]} barSize={20} animationDuration={1000} />
                  <Bar dataKey="outflow" fill="var(--color-chart-negative)" radius={[4, 4, 0, 0]} barSize={20} animationDuration={1000} />
                  <Line type="monotone" dataKey="net" stroke="var(--color-chart-primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--color-chart-primary)', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} animationDuration={1200} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Row 3: Recent Transactions & Operating Expenses ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch flex-shrink-0">

        {/* Recent Transactions (col-span-8) */}
        <div className="col-span-12 lg:col-span-8 min-w-0 bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card overflow-hidden flex flex-col p-5">
          <div className="flex items-center justify-between mb-3 pb-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-heading">Recent Transactions</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border-default/60">
                {recentTransactions.length}
              </span>
            </div>
            <button
              type="button"
              disabled={!transactionSearch}
              onClick={() => setTransactionSearch('')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border border-border-default/60',
                transactionSearch
                  ? 'bg-surface-muted text-accent hover:bg-surface-muted/80 cursor-pointer shadow-xs'
                  : 'bg-surface-muted/40 text-muted opacity-40 cursor-not-allowed',
              )}
            >
              Clear Search
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <Table className="w-full text-left border-collapse">
              <TableHeader className="bg-surface-muted/60 sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wider border-y border-border-default text-muted">
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider rtl:text-right">DATE</TableHead>
                  <TableHead className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider rtl:text-right">DESCRIPTION</TableHead>
                  <TableHead className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider text-right rtl:text-left">AMOUNT</TableHead>
                  <TableHead className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider text-right rtl:text-left">STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border-subtle">
                {recentTransactions.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-surface-muted/60 transition-colors h-12 border-0">
                    <TableCell className="px-4 py-2.5 text-xs text-muted font-medium whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-heading truncate max-w-xs">{tx.description}</TableCell>
                    <TableCell
                      className={cn(
                        'px-4 py-2.5 text-xs sm:text-sm font-semibold text-right rtl:text-left tabular-nums whitespace-nowrap',
                        tx.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-heading',
                      )}
                      title={formatMoney(tx.type === 'debit' && tx.amount && typeof tx.amount === 'object'
                        ? { ...tx.amount, amount: -Math.abs(tx.amount.amount) }
                        : tx.type === 'debit' ? -Number(tx.amount) : tx.amount,
                        { forcePlus: tx.type === 'credit' })}
                    >
                      {formatCompactTableMoney(tx.type === 'debit' && tx.amount && typeof tx.amount === 'object'
                        ? { ...tx.amount, amount: -Math.abs(tx.amount.amount) }
                        : tx.type === 'debit' ? -Number(tx.amount) : tx.amount,
                        { forcePlus: tx.type === 'credit' })}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right rtl:text-left whitespace-nowrap">
                      <Badge variant="outline" className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                        tx.status === 'CLEARED'
                          ? (tx.type === 'credit'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : 'bg-surface-muted text-body border-border-default')
                          : 'bg-surface-muted text-muted border-border-default',
                      )}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {recentTransactions.length === 0 && (
                  <TableRow className="hover:bg-transparent border-0">
                    <TableCell colSpan={4} className="p-0 border-0">
                      <div className="flex-1 min-h-[170px] my-3 rounded-xl border border-dashed border-border-default bg-surface-muted/60 p-6 flex flex-col items-center justify-center text-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-surface-raised border border-border-default shadow-xs flex items-center justify-center text-muted">
                          <FileText size={15} />
                        </div>
                        <p className="text-xs font-medium text-muted">
                          No recent transactions found.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Operating Expenses (col-span-4) */}
        <div className="col-span-12 lg:col-span-4 min-w-0 bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl p-5 shadow-card flex flex-col justify-between">
          <h2 className="text-base font-bold text-heading mb-2">Operating Expenses</h2>

          {/* Recharts Donut Chart */}
          <div className="relative w-44 h-44 mx-auto my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseData.some(s => s.value > 0) ? expenseData.filter(s => s.value > 0) : [{ name: 'No expenses', value: 1, color: 'var(--color-border-default)' }]}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                  animationDuration={1000}
                  stroke="none"
                >
                  {expenseData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                  formatter={(value, name) => [totalExp > 0 ? formatMoney(value, { currency }) : 'No expenses', name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-muted uppercase tracking-widest leading-none">Total</span>
              <span className="text-xl font-bold text-heading mt-1 tabular-nums tracking-tight">
                {formatCompactCurrency(data.expensesTotal)}
              </span>
            </div>
          </div>

          {/* Legend with sleek recessed glass mini-rows */}
          <div className="space-y-1.5 pt-2">
            {expenseData.map((item) => (
              <div
                key={item.name}
                className="px-3 py-1.5 rounded-xl border border-border-subtle bg-surface-muted/60 flex items-center justify-between text-xs font-medium"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-body truncate">{item.name}</span>
                </div>
                <span className="text-heading font-bold tabular-nums shrink-0">{item.pct}%</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      <FormDialog
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Create invoice"
        subtitle="Create a receivable invoice for a customer."
        busy={createInvoice.isPending}
        onConfirm={() => createInvoice.mutate()}
        confirmLabel="Create invoice"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Customer</label>
            <Select
              value={invoiceForm.customerId}
              onValueChange={val => setInvoiceForm(current => ({ ...current, customerId: val }))}
            >
              <SelectTrigger className="w-full bg-surface-muted">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {(customersData?.items ?? []).map(customer => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Invoice number</label>
            <Input
              value={invoiceForm.number}
              onChange={event => setInvoiceForm(current => ({ ...current, number: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Amount</label>
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              value={invoiceForm.amount}
              onChange={event => setInvoiceForm(current => ({ ...current, amount: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Due date</label>
            <Input
              type="date"
              value={invoiceForm.dueDate}
              onChange={event => setInvoiceForm(current => ({ ...current, dueDate: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
