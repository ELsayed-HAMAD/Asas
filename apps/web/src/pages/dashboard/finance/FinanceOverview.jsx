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
import { formatMoney, formatCompactMoney, moneyToMajor } from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';

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
]

export default function FinanceOverview() {
  const queryClient = useQueryClient()
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [transactionSearch, setTransactionSearch] = useState('')
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [invoiceForm, setInvoiceForm] = useState({ customerId: '', number: '', amount: '', dueDate: '' })
  const { data, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'overview'],
    queryFn: financeApi.getOverview,
  });
  const { data: customersData } = useQuery({ queryKey: [...queryKeys.finance.all(), 'customers'], queryFn: financeApi.listCustomers })
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

  function downloadCsv(filename, rows) {
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = rows.map(row => row.map(quote).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function downloadFinanceReport() {
    downloadCsv(`finance-${selectedYear}-${new Date().toISOString().slice(0, 10)}.csv`, [
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
    ])
  }

  function downloadCashFlow() {
    downloadCsv(`cash-flow-${selectedYear}.csv`, [
      ['Month', 'Inflow (minor units)', 'Outflow (minor units)', 'Net (minor units)', 'Currency'],
      ...cashFlowData.map(point => {
        const source = data.cashFlow.find(row => row.month === point.month)
        return [point.month, source.inflow.amount, source.outflow.amount, source.net.amount, source.net.currency]
      }),
    ])
  }

  // Net cash-flow sparkline for the second KPI card (the old page drew a MRR sparkline here).
  const netSeries = cashFlowData.map((p, i) => ({ v: p.net, id: i }));
  const lastNet = netSeries.length ? netSeries[netSeries.length - 1].v : 0;

  // Operating-expenses donut: split the real expense total into pending vs already carried.
  const totalExp = major(data.expensesTotal);
  const pendExp = major(data.expensesPendingTotal);
  let expenseData = [
    { name: 'Carried', value: Math.max(0, totalExp - pendExp), pct: totalExp ? Math.round((Math.max(0, totalExp - pendExp) / totalExp) * 100) : 0, color: EXPENSE_COLORS[0] },
    { name: 'Pending', value: pendExp, pct: totalExp ? Math.round((pendExp / totalExp) * 100) : 0, color: EXPENSE_COLORS[1] },
  ].filter((s) => s.value > 0);

  // Fallback if no expenses
  if (expenseData.length === 0) {
    expenseData.push({ name: 'None', value: 1, pct: 100, color: 'var(--color-caption)' });
  }

  return (
    <div className="flex h-full flex-col bg-surface overflow-x-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Calendar size={14} className="text-muted" />
            <span>Year</span>
            <select aria-label="Finance calendar year" value={selectedYear} onChange={event => setSelectedYear(event.target.value)} className="bg-transparent focus:outline-none">
              {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search..."
              value={transactionSearch}
              onChange={event => setTransactionSearch(event.target.value)}
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-56 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button type="button" onClick={downloadFinanceReport} aria-label="Download finance report" title="Download finance report" className="p-1.5 text-muted hover:text-heading transition-colors">
            <Download size={18} />
          </button>

          <button onClick={() => setInvoiceOpen(true)} className="bg-primary text-on-primary px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Create Invoice
          </button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── KPIs Grid ── */}
        <div className="grid grid-cols-4 gap-4">

          {/* Receivables Outstanding (replaces the old "Total Cash Balance" — no cash-balance field exists in the API) */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Outstanding Receivables</p>
              <FileText size={16} className="text-caption" />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-extrabold text-heading tracking-tight">{formatMoney(data.receivableOutstanding)}</p>
              <span className="flex items-center gap-1 bg-success-light text-success-text px-2 py-0.5 rounded text-xs font-bold">
                <TrendingUp size={12} strokeWidth={3} /> To collect
              </span>
            </div>
          </div>

          {/* Net Cash Flow (sparkline fed by the real cash-flow series) */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card relative overflow-hidden">
            <div className="flex justify-between items-start mb-1 relative z-10">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider w-3/4">Net Cash Flow</p>
              <RefreshCw size={16} className="text-caption" />
            </div>
            <p className="text-3xl font-extrabold text-heading tracking-tight relative z-10">{formatMoney(lastNet)}</p>
            {/* Cash-flow Sparkline */}
            <div className="absolute bottom-0 left-0 w-full h-12">
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

          {/* Payables Outstanding */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Outstanding Payables</p>
              <Wallet size={16} className="text-caption" />
            </div>
            <p className="text-3xl font-extrabold text-heading tracking-tight">{formatMoney(data.payableOutstanding)}</p>
            <div className="flex items-center gap-1.5 text-danger text-xs font-bold mt-2.5">
              <TrendingUp size={14} strokeWidth={2.5} className="rotate-180" />
              To pay
            </div>
          </div>

          {/* Expenses Total */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Expenses Total</p>
              <Flame size={16} className="text-caption" />
            </div>
            <p className="text-3xl font-extrabold text-heading tracking-tight">
              {formatMoney(data.expensesTotal)}
            </p>
            <p className="text-xs text-muted mt-2.5 font-medium">
              {data.expensesPendingCount} pending approval
            </p>
          </div>

        </div>

        {/* ── Cash Flow Chart ── */}
        <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden">
          <div className="flex items-center justify-between p-6 pb-2">
            <h2 className="text-lg font-bold text-heading">Cash Flow Analysis</h2>
              <button type="button" onClick={downloadCashFlow} aria-label="Download cash flow data" title="Download cash flow data" className="text-caption hover:text-body">
              <MoreHorizontal size={20} />
            </button>
          </div>

          <div className="p-6 pt-0">
            <div className="w-full h-[320px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 600 }} tickFormatter={(v) => formatCompactMoney(v, currency)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13, padding: '12px', lineHeight: '1.5' }}
                    formatter={(value, name) => {
                      const label = name === 'inflow' ? 'Inflow' : name === 'outflow' ? 'Outflow' : 'Net'
                      // Do not use Math.abs() for Net so negative values render correctly in the tooltip
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
          </div>
        </div>

        {/* ── Bottom Row ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* Recent Transactions — the overview endpoint exposes no transactions feed, so the
              card renders its empty state (no rows) rather than fabricated data. */}
          <div className="col-span-2 bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border-subtle">
              <h2 className="text-lg font-bold text-heading">Recent Transactions</h2>
              <button type="button" onClick={() => setTransactionSearch('')} className="text-sm font-semibold text-accent hover:text-accent-hover">
                Clear Search
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-raised">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-subtle">Date</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-subtle">Description</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-subtle text-right">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-subtle text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-surface-muted/50">
                      <td className="px-6 py-4 text-sm text-body-light font-medium">
                        {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-heading">{tx.description}</td>
                      <td className={`px-6 py-4 text-sm font-medium text-right tabular-nums ${
                        tx.type === 'credit' ? 'text-success' : 'text-heading'
                      }`}>
                        {formatMoney(tx.type === 'debit' && tx.amount && typeof tx.amount === 'object'
                          ? { ...tx.amount, amount: -Math.abs(tx.amount.amount) }
                          : tx.type === 'debit' ? -Number(tx.amount) : tx.amount,
                          { forcePlus: tx.type === 'credit' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          tx.status === 'CLEARED'
                            ? (tx.type === 'credit'
                                ? 'bg-success-light text-success border border-success-border'
                                : 'bg-surface-muted text-body border border-border-default')
                            : 'bg-surface-muted text-body-light border border-border-default'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {recentTransactions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-muted text-sm">
                        No recent transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Operating Expenses */}
          <div className="col-span-1 bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card flex flex-col">
            <h2 className="text-lg font-bold text-heading mb-8">Operating Expenses</h2>

            {/* Recharts Donut Chart */}
            <div className="relative w-48 h-48 mx-auto mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80}
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
                    formatter={(value) => [formatMoney(value), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-bold text-caption uppercase tracking-widest">Total</span>
                <span className="text-2xl font-extrabold text-heading mt-0.5">{formatMoney(data.expensesTotal, { compact: true })}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-col gap-3 mt-auto">
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

      </div>
      <FormDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Create invoice" subtitle="Create a receivable invoice for a customer." busy={createInvoice.isPending} onConfirm={() => createInvoice.mutate()} confirmLabel="Create invoice">
        <div className="space-y-4"><label className="block text-sm font-medium text-body">Customer<select required value={invoiceForm.customerId} onChange={event => setInvoiceForm(current => ({ ...current, customerId: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2"><option value="">Select a customer</option>{(customersData?.items ?? []).map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="block text-sm font-medium text-body">Invoice number<input value={invoiceForm.number} onChange={event => setInvoiceForm(current => ({ ...current, number: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Amount<input required type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={event => setInvoiceForm(current => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Due date<input type="date" value={invoiceForm.dueDate} onChange={event => setInvoiceForm(current => ({ ...current, dueDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label></div>
      </FormDialog>
    </div>
  );
}
