import React from 'react';
import { 
  ChevronRight, Calendar, Search, Download, 
  Wallet, RefreshCw, FileText, Flame, 
  MoreHorizontal, AlertTriangle, TrendingUp 
} from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

// ── Chart Data ──────────────────────────────────────────────────────
const MRR_SPARKLINE = [
  { v: 140 }, { v: 155 }, { v: 148 }, { v: 162 }, { v: 158 }, { v: 170 }, { v: 175 }, { v: 185 },
]

const CASH_FLOW_CHART = [
  { month: 'Jan', inflow: 180000, outflow: -120000, net: 60000 },
  { month: 'Feb', inflow: 250000, outflow: -150000, net: 100000 },
  { month: 'Mar', inflow: 210000, outflow: -170000, net: 40000 },
  { month: 'Apr', inflow: 300000, outflow: -160000, net: 140000 },
  { month: 'May', inflow: 230000, outflow: -160000, net: 70000 },
  { month: 'Jun', inflow: 340000, outflow: -160000, net: 180000 },
]

const EXPENSE_DATA = [
  { name: 'Payroll', value: 45, color: 'var(--color-info)' },
  { name: 'Marketing', value: 30, color: 'var(--color-chart-orange)' },
  { name: 'Software', value: 15, color: 'var(--color-chart-purple)' },
  { name: 'Office', value: 10, color: 'var(--color-caption)' },
]

// ── Mock Data ────────────────────────────────────────────────
const RECENT_TRANSACTIONS = [
  { id: '1', date: 'Today', description: 'Stripe Payout', amount: 12450.00, status: 'Cleared', type: 'positive' },
  { id: '2', date: 'Yesterday', description: 'AWS Cloud Hosting', amount: -3240.00, status: 'Cleared', type: 'negative' },
  { id: '3', date: 'Jun 02', description: 'Acme Corp Retainer', amount: 45000.00, status: 'Processing', type: 'positive' },
];

const formatCurrency = (num) => {
  const isNegative = num < 0;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
  }).format(Math.abs(num));
  return isNegative ? `-${formatted}` : `+${formatted}`;
};

import TopBarActions from '../../../components/TopBarActions';

export default function FinanceOverview() {
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
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-muted">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
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
            <p className="text-3xl font-extrabold text-heading tracking-tight relative z-10">$185k</p>
            {/* MRR Sparkline */}
            <div className="absolute bottom-0 left-0 w-full h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MRR_SPARKLINE} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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
                <ComposedChart data={CASH_FLOW_CHART} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 600 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                    formatter={(value, name) => {
                      const label = name === 'inflow' ? 'Inflow' : name === 'outflow' ? 'Outflow' : 'Net'
                      return [`$${(Math.abs(value) / 1000).toFixed(0)}k`, label]
                    }}
                    labelStyle={{ fontWeight: 600, color: 'var(--color-heading)' }}
                  />
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
                  {RECENT_TRANSACTIONS.map((tx) => (
                    <tr key={tx.id} className="hover:bg-surface-muted/50">
                      <td className="px-6 py-4 text-sm text-body-light font-medium">{tx.date}</td>
                      <td className="px-6 py-4 text-sm font-bold text-heading">{tx.description}</td>
                      <td className={`px-6 py-4 text-sm font-medium text-right tabular-nums ${
                        tx.type === 'positive' ? 'text-success' : 'text-heading'
                      }`}>
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          tx.status === 'Cleared' 
                            ? 'bg-success-light text-success border border-success-border' 
                            : 'bg-surface-muted text-body-light border border-border-default'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
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
                    data={EXPENSE_DATA}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    animationDuration={1000}
                    stroke="none"
                  >
                    {EXPENSE_DATA.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                    formatter={(value, name) => [`${value}%`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-bold text-caption uppercase tracking-widest">Total</span>
                <span className="text-2xl font-extrabold text-heading mt-0.5">$45,000</span>
              </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 mt-auto">
              {EXPENSE_DATA.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-xs font-semibold text-body-light">{item.name}</span>
                  </div>
                  <span className="text-xs font-bold text-heading">{item.value}%</span>
                </div>
              ))}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}