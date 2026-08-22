import React from 'react';
import { 
  ChevronRight, Calendar, Search, Download, 
  Wallet, RefreshCw, FileText, Flame, 
  MoreHorizontal, AlertTriangle, TrendingUp, Loader2
} from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { useQuery } from '@tanstack/react-query';
import { financeService } from '../../../services/finance.service';
import TopBarActions from '../../../components/TopBarActions';

const formatCurrency = (num, forcePlus = false, compact = false) => {
  const isNegative = num < 0;
  const options = { style: 'currency', currency: 'USD' };
  
  if (compact) {
    options.notation = 'compact';
    options.maximumFractionDigits = 1;
  } else {
    options.minimumFractionDigits = 2;
  }

  const formatted = new Intl.NumberFormat('en-US', options).format(Math.abs(num));
  if (isNegative) return `-${formatted}`;
  return forcePlus ? `+${formatted}` : formatted;
};

const EXPENSE_COLORS = [
  'var(--color-info)',
  'var(--color-chart-orange)',
  'var(--color-chart-purple)',
  'var(--color-caption)',
  'var(--color-chart-positive)',
  'var(--color-chart-negative)',
]

export default function FinanceOverview() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance', 'overview'],
    queryFn: financeService.getOverview,
  });

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

  const mrrSparkline = data.mrrSparkline.map((v, i) => ({ v, id: i }))
  
  const totalExpense = data.expenseBreakdown.reduce((sum, e) => sum + e.value, 0) || 1;
  const expenseData = [...data.expenseBreakdown]
    .sort((a, b) => b.value - a.value)
    .map((e, i) => ({
      name: e.name,
      value: e.value, // raw value for Pie
      pct: Math.round((e.value / totalExpense) * 100), // percentage for Legend
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length]
    }));

  // Fallback if no expenses
  if (expenseData.length === 0) {
    expenseData.push({ name: 'None', value: 1, pct: 100, color: 'var(--color-caption)' });
  }

  return (
    <div className="flex h-full flex-col bg-surface overflow-x-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Calendar size={14} className="text-muted" />
            Year to Date
            <ChevronRight size={14} className="text-caption rotate-90" />
          </button>
          
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-56 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          
          <button className="p-1.5 text-muted hover:text-heading transition-colors">
            <Download size={18} />
          </button>
          
          <button className="bg-primary text-on-primary px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Create Invoice
          </button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* ── KPIs Grid ── */}
        <div className="grid grid-cols-4 gap-4">
          
          {/* Total Cash Balance */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Total Cash Balance</p>
              <Wallet size={16} className="text-caption" />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-extrabold text-heading tracking-tight">$2.45M</p>
              <span className="flex items-center gap-1 bg-success-light text-success-text px-2 py-0.5 rounded text-xs font-bold">
                <TrendingUp size={12} strokeWidth={3} /> +4.2%
              </span>
            </div>
          </div>

          {/* MRR */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card relative overflow-hidden">
            <div className="flex justify-between items-start mb-1 relative z-10">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider w-3/4">Monthly Recurring Rev (MRR)</p>
              <RefreshCw size={16} className="text-caption" />
            </div>
            <p className="text-3xl font-extrabold text-heading tracking-tight relative z-10">{formatCurrency(mrrSparkline[mrrSparkline.length - 1]?.v || 0)}</p>
            {/* MRR Sparkline */}
            <div className="absolute bottom-0 left-0 w-full h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mrrSparkline} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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

          {/* Outstanding Receivables */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Outstanding Receivables</p>
              <FileText size={16} className="text-caption" />
            </div>
            <p className="text-3xl font-extrabold text-heading tracking-tight">$320k</p>
            <div className="flex items-center gap-1.5 text-danger text-xs font-bold mt-2.5">
              <AlertTriangle size={14} strokeWidth={2.5} />
              12 Invoices Overdue
            </div>
          </div>

          {/* Burn Rate */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Current Burn Rate</p>
              <Flame size={16} className="text-caption" />
            </div>
            <p className="text-3xl font-extrabold text-heading tracking-tight">
              $45k<span className="text-lg font-semibold text-caption">/mo</span>
            </p>
            <p className="text-xs text-muted mt-2.5 font-medium">
              Runway: <span className="font-bold text-heading">54 months</span>
            </p>
          </div>

        </div>

        {/* ── Cash Flow Chart ── */}
        <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden">
          <div className="flex items-center justify-between p-6 pb-2">
            <h2 className="text-lg font-bold text-heading">Cash Flow Analysis</h2>
            <button className="text-caption hover:text-body">
              <MoreHorizontal size={20} />
            </button>
          </div>
          
          <div className="p-6 pt-0">
            <div className="w-full h-[320px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.cashFlows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 600 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13, padding: '12px', lineHeight: '1.5' }}
                    formatter={(value, name) => {
                      const label = name === 'inflow' ? 'Inflow' : name === 'outflow' ? 'Outflow' : 'Net'
                      // Do not use Math.abs() for Net so negative values render correctly in the tooltip
                      const formattedValue = name === 'net' ? (value / 1000).toFixed(0) : Math.abs(value / 1000).toFixed(0)
                      return [`$${formattedValue}k`, label]
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
          
          {/* Recent Transactions */}
          <div className="col-span-2 bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border-subtle">
              <h2 className="text-lg font-bold text-heading">Recent Transactions</h2>
              <button className="text-sm font-semibold text-accent hover:text-accent-hover">
                View All
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
                  {data.recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-surface-muted/50">
                      <td className="px-6 py-4 text-sm text-body-light font-medium">
                        {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-heading">{tx.description}</td>
                      <td className={`px-6 py-4 text-sm font-medium text-right tabular-nums ${
                        tx.type === 'credit' ? 'text-success' : 'text-heading'
                      }`}>
                        {formatCurrency(tx.type === 'debit' ? -tx.amount : tx.amount, tx.type === 'credit')}
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
                  {data.recentTransactions.length === 0 && (
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
                    formatter={(value) => [formatCurrency(value), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-bold text-caption uppercase tracking-widest">Total</span>
                <span className="text-2xl font-extrabold text-heading mt-0.5">{formatCurrency(totalExpense, false, true)}</span>
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
    </div>
  );
}