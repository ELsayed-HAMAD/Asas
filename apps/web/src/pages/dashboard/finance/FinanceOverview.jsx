import React, { useState } from 'react';
import {
  Calendar, Search, Download,
  Wallet, RefreshCw, FileText, Flame,
  MoreHorizontal, TrendingUp, Loader2
} from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatCompactMoney, formatCompactTableMoney, moneyToMajor } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import FormDialog from '../../../components/common/FormDialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
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
const metricFontSize = money => {
  const label = formatMoney(money)
  return `clamp(0.75rem, ${Math.min(14, 130 / label.length)}cqw, 1.5rem)`
}

const EXPENSE_COLORS = [
  'var(--color-info)',
  'var(--color-chart-orange)',
  'var(--color-chart-purple)',
  'var(--color-caption)',
  'var(--color-chart-positive)',
  'var(--color-chart-negative)',
]

export default function FinanceOverview() {
  const queryClient = useQueryClient()
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [transactionSearch, setTransactionSearch] = useState('')
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [invoiceForm, setInvoiceForm] = useState({ customerId: '', number: '', amount: '', dueDate: '' })
  const { data, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'overview', selectedYear],
    queryFn: () => financeApi.getOverview({ year: selectedYear }),
  });
  const { data: customersData } = useQuery({ queryKey: [...queryKeys.finance.all(), 'customers'], queryFn: financeApi.listCustomers })
  // Tenant-local month-to-date settlement summaries (null before ledger coverage) — they turn
  // the receivable/payable card badges from static labels into real period figures.
  const { data: receivablesData } = useQuery({
    queryKey: queryKeys.finance.receivables.list({ limit: 1 }),
    queryFn: () => financeApi.listReceivables({ limit: 1 }),
  })
  const { data: payablesData } = useQuery({
    queryKey: queryKeys.finance.payables.list({ limit: 1 }),
    queryFn: () => financeApi.listPayables({ limit: 1 }),
  })
  const createInvoice = useMutation({
    mutationFn: () => financeApi.createReceivable({ ...invoiceForm, number: invoiceForm.number || null, dueDate: invoiceForm.dueDate || null, status: 'CURRENT' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() }); setInvoiceOpen(false); setInvoiceForm({ customerId: '', number: '', amount: '', dueDate: '' }) },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger">
        Failed to load finance overview.
      </div>
    );
  }

  const availableYears = [...new Set([selectedYear, ...(data.cashFlow ?? []).map(point => point.month.slice(0, 4))])].sort((a, b) => b.localeCompare(a))
  const cashFlowData = (data.cashFlow ?? []).filter(point => point.month.startsWith(`${selectedYear}-`)).map((p) => ({
    month: p.month,
    inflow: major(p.inflow),
    outflow: major(p.outflow),
    net: major(p.net),
  }));
  const currency = data.cashFlow?.[0]?.inflow?.currency || data.receivableOutstanding?.currency || 'USD'
  const recentTransactions = (data.recentTransactions ?? []).filter(tx =>
    tx.date.startsWith(`${selectedYear}-`) && (!transactionSearch || tx.description.toLowerCase().includes(transactionSearch.toLowerCase()) || tx.status.toLowerCase().includes(transactionSearch.toLowerCase())),
  )

  function downloadFinanceReport() {
    const rows = [
      ['Finance report', `Calendar year ${selectedYear}`],
      ['Metric', 'Amount (minor units)', 'Currency'],
      ...[['Receivables outstanding', data.receivableOutstanding], ['Payables outstanding', data.payableOutstanding], ['Expenses total', data.expensesTotal], ['Expenses pending', data.expensesPendingTotal]].map(([label, amount]) => [label, amount.amount, amount.currency]),
      [],
      ['Month', 'Inflow (minor units)', 'Outflow (minor units)', 'Net (minor units)', 'Currency'],
      ...cashFlowData.map(point => {
        const source = data.cashFlow.find(row => row.month === point.month)
        return [point.month, source.inflow.amount, source.outflow.amount, source.net.amount, source.net.currency]
      }),
      [],
      ['Date', 'Description', 'Amount (minor units)', 'Currency', 'Type', 'Status'],
      ...recentTransactions.map(tx => [tx.date, tx.description, tx.amount.amount, tx.amount.currency, tx.type, tx.status]),
    ]
    downloadCsv(rows, `finance-${selectedYear}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function downloadCashFlow() {
    const rows = [
      ['Month', 'Inflow (minor units)', 'Outflow (minor units)', 'Net (minor units)', 'Currency'],
      ...cashFlowData.map(point => {
        const source = data.cashFlow.find(row => row.month === point.month)
        return [point.month, source.inflow.amount, source.outflow.amount, source.net.amount, source.net.currency]
      }),
    ]
    downloadCsv(rows, `cash-flow-${selectedYear}.csv`)
  }

  // Net cash-flow sparkline for the second KPI card (the old page drew a MRR sparkline here).
  const netSeries = cashFlowData.map((p, i) => ({ v: p.net, id: i }));
  const cashFlowDeltaMinor = data.cashFlowComparison.current.net.amount - data.cashFlowComparison.previous.net.amount
  const fullYearSelected = data.cashFlowComparison.current.endDateExclusive === `${Number(selectedYear) + 1}-01-01`
  const cashFlowChangeText = `${selectedYear}${fullYearSelected ? ' full year' : ' year-to-date'} vs ${Number(selectedYear) - 1} matching period: ${formatMoney(data.cashFlowComparison.previous.net)} prior, ${cashFlowDeltaMinor > 0 ? '+' : ''}${formatMoney({ amount: cashFlowDeltaMinor, currency: data.cashFlowComparison.current.net.currency })}`

  // Real month-to-date settlement badges; the static label stays when ledger coverage does
  // not yet include the current month (the totals are null then, never guessed).
  const collectedMtd = receivablesData?.summary?.collectedThisMonthTotal ?? null
  const collectedMtdPrior = receivablesData?.summary?.collectedThisMonthComparison?.previousTotal ?? null
  const receivablesBadgeText = collectedMtd == null
    ? 'To collect'
    : `${formatMoney(collectedMtd)} collected MTD${collectedMtdPrior == null ? '' : ` (vs ${formatMoney(collectedMtdPrior)})`}`
  const paidMtd = payablesData?.summary?.paidThisMonthTotal ?? null
  const paidMtdPrior = payablesData?.summary?.paidThisMonthComparison?.previousTotal ?? null
  const payablesBadgeText = paidMtd == null
    ? 'To pay'
    : `${formatMoney(paidMtd)} paid MTD${paidMtdPrior == null ? '' : ` (vs ${formatMoney(paidMtdPrior)})`}`

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
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5">

      {/* ── Page Toolbar (Single Row across 12-column width) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full mb-5 flex-shrink-0">
        {/* Left group */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
            <Input
              type="text"
              placeholder="Search..."
              value={transactionSearch}
              onChange={event => setTransactionSearch(event.target.value)}
              className="ps-9 pe-4 py-2 text-xs w-72 max-w-full bg-surface-raised shadow-card"
            />
          </div>

          <Select value={String(selectedYear)} onValueChange={val => setSelectedYear(val)}>
            <SelectTrigger aria-label="Finance calendar year" className="flex items-center gap-2 border border-border-default text-body px-3.5 h-9 rounded-input text-xs font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card shrink-0">
              <Calendar size={14} className="text-muted" />
              <span>Year</span>
              <SelectValue />
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

        {/* Right group */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadFinanceReport}
            aria-label="Download finance report"
            title="Download finance report"
            className="flex items-center gap-2 text-xs font-medium bg-surface-raised shadow-card"
          >
            <Download size={14} /> Export
          </Button>

          <Button
            type="button"
            onClick={() => setInvoiceOpen(true)}
            className="flex items-center gap-2 text-xs font-medium shadow-card"
          >
            Create Invoice
          </Button>
        </div>
      </div>

      {/* ── Top 4 KPI Cards Grid (grid-cols-12 gap-5 mb-5) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5 mb-5 flex-shrink-0">

        {/* Card 1: Outstanding Receivables */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 @container bg-surface-raised border border-border-subtle rounded-card p-4 shadow-card h-auto flex flex-col justify-start">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">Outstanding Receivables</p>
            <FileText size={15} className="text-caption shrink-0" />
          </div>
          <p
            className="min-w-0 mt-2 text-2xl font-bold text-heading leading-tight tracking-tight truncate"
            style={{ fontSize: metricFontSize(data.receivableOutstanding) }}
          >
            {formatMoney(data.receivableOutstanding)}
          </p>
          <div className="mt-2 flex items-center text-xs leading-normal truncate">
            <Badge variant="outline" className="inline-flex items-center gap-1 bg-success-light text-success-text px-2 py-0.5 text-xs font-semibold truncate border-transparent">
              <TrendingUp size={12} strokeWidth={2.5} className="shrink-0 mr-1" />
              <span className="truncate">{receivablesBadgeText}</span>
            </Badge>
          </div>
        </div>

        {/* Card 2: Selected Period Net Cash Flow */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 @container bg-surface-raised border border-border-subtle rounded-card p-4 shadow-card relative overflow-hidden h-auto flex flex-col justify-start">
          <div className="flex items-center justify-between gap-2 relative z-10">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate" title="Selected Period Net Cash Flow">
              Selected Period Net Cash Flow
            </p>
            <RefreshCw size={15} className="text-caption shrink-0" />
          </div>
          <p
            className="min-w-0 mt-2 text-2xl font-bold text-heading leading-tight tracking-tight relative z-10 truncate"
            style={{ fontSize: metricFontSize(data.cashFlowComparison.current.net) }}
          >
            {formatMoney(data.cashFlowComparison.current.net)}
          </p>
          <div className="mt-2 relative z-10 flex items-center text-xs leading-normal truncate">
            <p
              className={`truncate font-medium text-xs leading-normal ${cashFlowDeltaMinor > 0 ? 'text-success-text' : cashFlowDeltaMinor < 0 ? 'text-danger' : 'text-muted'}`}
              title={cashFlowChangeText}
            >
              {cashFlowChangeText}
            </p>
          </div>
          {/* Cash-flow Sparkline */}
          <div className="absolute bottom-0 left-0 w-full h-4 overflow-hidden pointer-events-none">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={netSeries} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-blue)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-chart-blue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="var(--color-chart-blue)" strokeWidth={2} fill="url(#mrrGrad)" dot={false} animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 3: Outstanding Payables */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 @container bg-surface-raised border border-border-subtle rounded-card p-4 shadow-card h-auto flex flex-col justify-start">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">Outstanding Payables</p>
            <Wallet size={15} className="text-caption shrink-0" />
          </div>
          <p
            className="min-w-0 mt-2 text-2xl font-bold text-heading leading-tight tracking-tight truncate"
            style={{ fontSize: metricFontSize(data.payableOutstanding) }}
          >
            {formatMoney(data.payableOutstanding)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs leading-normal truncate text-danger font-semibold">
            <TrendingUp size={13} strokeWidth={2.5} className="rotate-180 shrink-0" />
            <span className="truncate">{payablesBadgeText}</span>
          </div>
        </div>

        {/* Card 4: Expenses Total */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 @container bg-surface-raised border border-border-subtle rounded-card p-4 shadow-card h-auto flex flex-col justify-start">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">Expenses Total</p>
            <Flame size={15} className="text-caption shrink-0" />
          </div>
          <p
            className="min-w-0 mt-2 text-2xl font-bold text-heading leading-tight tracking-tight truncate"
            style={{ fontSize: metricFontSize(data.expensesTotal) }}
          >
            {formatMoney(data.expensesTotal)}
          </p>
          <div className="mt-2 flex items-center text-xs text-muted leading-normal font-medium truncate">
            <span className="truncate">{data.expensesPendingCount} pending approval</span>
          </div>
        </div>

      </div>

      {/* ── Cash Flow Chart (mb-5) ── */}
      <div className="bg-surface-raised border border-border-subtle rounded-card shadow-card overflow-hidden mb-5 flex-shrink-0">
        <div className="flex items-center justify-between p-5 pb-2">
          <h2 className="text-base font-bold text-heading">Cash Flow Analysis</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={downloadCashFlow}
            aria-label="Download cash flow data"
            title="Download cash flow data"
            className="text-caption hover:text-body h-8 w-8"
          >
            <MoreHorizontal size={18} />
          </Button>
        </div>

        <div className="p-5 pt-0">
          {cashFlowData.length === 0 ? (
            <div className="w-full h-[200px] flex items-center justify-center text-sm text-muted">
              No cash flow data is available for {selectedYear}.
            </div>
          ) : (
            <div className="w-full h-[300px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 600 }} tickFormatter={(v) => formatCompactMoney(v, currency)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13, padding: '12px', lineHeight: '1.5' }}
                    formatter={(value, name) => {
                      const label = name === 'inflow' ? 'Inflow' : name === 'outflow' ? 'Outflow' : 'Net'
                      const formattedValue = name === 'net' ? value : Math.abs(value)
                      return [formatCompactMoney(formattedValue, currency), label]
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

      {/* ── Bottom Row (grid-cols-12 gap-5 items-stretch) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-shrink-0">

        {/* Recent Transactions (col-span-9) */}
        <div className="col-span-12 lg:col-span-9 min-w-0 bg-surface-raised border border-border-subtle rounded-card shadow-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-surface-raised">
            <h2 className="text-base font-bold text-heading">Recent Transactions</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTransactionSearch('')}
              className="text-xs font-semibold text-accent hover:text-accent-hover h-6 px-2"
            >
              Clear Search
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            <Table className="w-full text-left border-collapse">
              <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="px-5 py-2.5 text-[11px] font-bold text-muted uppercase tracking-wider bg-surface-muted rtl:text-right">Date</TableHead>
                  <TableHead className="px-5 py-2.5 text-[11px] font-bold text-muted uppercase tracking-wider bg-surface-muted rtl:text-right">Description</TableHead>
                  <TableHead className="px-5 py-2.5 text-[11px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left bg-surface-muted">Amount</TableHead>
                  <TableHead className="px-5 py-2.5 text-[11px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left bg-surface-muted">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border-subtle">
                {recentTransactions.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-surface-muted/60 transition-colors h-14 border-0">
                    <TableCell className="px-5 py-2.5 text-xs text-body-light font-medium whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="px-5 py-2.5 text-sm font-semibold text-heading truncate max-w-xs">{tx.description}</TableCell>
                    <TableCell
                      className={`px-5 py-2.5 text-sm font-semibold text-right rtl:text-left tabular-nums whitespace-nowrap ${
                        tx.type === 'credit' ? 'text-success' : 'text-heading'
                      }`}
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
                    <TableCell className="px-5 py-2.5 text-right rtl:text-left whitespace-nowrap">
                      <Badge variant="outline" className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        tx.status === 'CLEARED'
                          ? (tx.type === 'credit'
                              ? 'bg-success-light text-success border-success-border'
                              : 'bg-surface-muted text-body border-border-default')
                          : 'bg-surface-muted text-body-light border-border-default'
                      }`}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {recentTransactions.length === 0 && (
                  <TableRow className="hover:bg-transparent border-0">
                    <TableCell colSpan={4} className="px-5 py-8 text-center text-muted text-sm">
                      <div className="min-h-[220px] flex items-center justify-center">
                        No recent transactions found.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Operating Expenses (col-span-3) */}
        <div className="col-span-12 lg:col-span-3 min-w-0 bg-surface-raised border border-border-subtle rounded-card p-5 shadow-card flex flex-col justify-between">
          <h2 className="text-base font-bold text-heading mb-4">Operating Expenses</h2>

          {/* Recharts Donut Chart */}
          <div className="relative w-44 h-44 mx-auto mb-4">
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
              <span className="text-[10px] font-bold text-caption uppercase tracking-widest">Total</span>
              <span className="text-xl font-extrabold text-heading mt-0.5">{formatMoney(data.expensesTotal, { compact: true })}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2.5 mt-auto">
            {expenseData.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                  <span className="text-xs font-semibold text-body-light truncate">{item.name}</span>
                </div>
                <span className="text-xs font-bold text-heading shrink-0">{item.pct}%</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      <FormDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Create invoice" subtitle="Create a receivable invoice for a customer." busy={createInvoice.isPending} onConfirm={() => createInvoice.mutate()} confirmLabel="Create invoice">
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
