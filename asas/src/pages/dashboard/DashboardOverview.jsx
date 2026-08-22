import { Link } from 'react-router-dom'
import { 
  ArrowUpRight, ArrowDownRight, DollarSign, Users, 
  AlertCircle, Clock, TrendingUp, CreditCard
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ── Mock Data ───────────────────────────────────────────────────────────

const CASH_FLOW_DATA = [
  { month: 'Jan', value: 180000 },
  { month: 'Feb', value: 220000 },
  { month: 'Mar', value: 195000 },
  { month: 'Apr', value: 280000 },
  { month: 'May', value: 250000 },
  { month: 'Jun', value: 310000 },
]

const STATS = [
  {
    label: 'Total Cash Balance',
    value: '$2.45M',
    change: '+4.2%',
    trend: 'up',
    icon: DollarSign,
  },
  {
    label: 'Total Pipeline',
    value: '$1.2M',
    change: '75% of goal',
    trend: 'neutral',
    icon: TrendingUp,
  },
  {
    label: 'Total Headcount',
    value: '142',
    change: '+3 this month',
    trend: 'up',
    icon: Users,
  },
  {
    label: 'Accounts Payable',
    value: '$145,200',
    change: 'Outstanding',
    trend: 'down',
    icon: CreditCard,
  },
]

const ACTION_ITEMS = [
  {
    id: 1,
    title: 'Amazon Web Services',
    subtitle: 'Invoice #INV-2026-06 • Pending',
    amount: '$15,200.00',
    type: 'finance',
  },
  {
    id: 2,
    title: 'Jane Doe',
    subtitle: 'Frontend Dev • Tech Interview',
    amount: 'Review',
    type: 'hr',
  },
  {
    id: 3,
    title: 'Acme Corp ERP Upgrade',
    subtitle: 'Proposal Stage • 85% Likelihood',
    amount: '$218,500',
    type: 'crm',
  },
]

const RECENT_ACTIVITY = [
  {
    id: 1,
    user: 'Mark D.',
    action: 'opened PR #402 in',
    target: 'asas-backend',
    time: '2 hours ago',
  },
  {
    id: 2,
    user: 'System',
    action: 'marked issue as',
    target: 'In Progress',
    time: 'Yesterday',
  },
  {
    id: 3,
    user: 'Marcus',
    action: 'added feedback for',
    target: 'Jane Doe',
    time: '2h ago',
  },
]

// ── Components ──────────────────────────────────────────────

function StatCard({ stat }) {
  const isUp = stat.trend === 'up'
  const isDown = stat.trend === 'down'

  return (
    <div className="bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-card-sm bg-surface-muted flex items-center justify-center border border-border-subtle">
          <stat.icon size={18} className="text-body-light" />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-input ${
          isUp ? 'text-success-text bg-success-light' : 
          isDown ? 'text-info bg-info-light' : 
          'text-body-light bg-surface-muted'
        }`}>
          {isUp && <ArrowUpRight size={14} />}
          {isDown && <ArrowDownRight size={14} />}
          {stat.change}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted mb-1">{stat.label}</p>
        <p className="text-3xl font-bold text-heading tracking-tight">{stat.value}</p>
      </div>
    </div>
  )
}

import TopBarActions from '../../components/TopBarActions';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../../services/dashboard.service';
import { Loader2 } from 'lucide-react';

export default function DashboardOverview() {
  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: dashboardService.getOverview,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center flex-1 p-8">
        <Loader2 className="animate-spin text-muted" size={32} />
      </div>
    );
  }

  if (isError || !responseData) {
    return (
      <div className="flex h-full items-center justify-center flex-1 p-8 text-danger">
        Failed to load dashboard overview.
      </div>
    );
  }

  const metrics = responseData?.data?.metrics || {};

  const stats = [
    {
      label: 'Monthly Revenue',
      value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(metrics.monthlyRevenue || 0),
      change: 'This month',
      trend: 'up',
      icon: DollarSign,
    },
    {
      label: 'Active Deals',
      value: metrics.activeDeals?.toString() || '0',
      change: 'In pipeline',
      trend: 'neutral',
      icon: TrendingUp,
    },
    {
      label: 'Total Headcount',
      value: metrics.totalUsers?.toString() || '0',
      change: 'System users',
      trend: 'up',
      icon: Users,
    },
    {
      label: 'Open Projects',
      value: metrics.openProjects?.toString() || '0',
      change: 'Active & planned',
      trend: 'down',
      icon: CreditCard,
    },
  ];

  return (
    <div className="p-page md:p-page max-w-7xl mx-auto space-y-section">
      
      <TopBarActions>
        <div className="flex items-center gap-3">
          <button className="bg-surface-raised border border-border-default text-body text-sm font-medium px-4 py-2 rounded-button hover:bg-surface-muted transition-colors">
            Generate Report
          </button>
        </div>
      </TopBarActions>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-grid-lg">
        {stats.map((stat, i) => (
          <StatCard key={i} stat={stat} />
        ))}
      </div>

      {/* ── Main Bento Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-grid-lg">
        
        {/* Left Column (Charts & Sprints) - Spans 2 cols */}
        <div className="lg:col-span-2 space-y-4 md:space-y-section">
          
          {/* Revenue Chart Box */}
          <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-heading">Cash Flow Analysis</h2>
                <p className="text-xs text-muted mt-1">Year to Date</p>
              </div>
              <select className="bg-surface-muted border border-border-default text-xs font-medium text-body rounded-input px-3 py-1.5 focus:outline-none">
                <option>FY 2026</option>
                <option>FY 2025</option>
              </select>
            </div>
            
            {/* Recharts Area Chart */}
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CASH_FLOW_DATA} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashFlowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-primary)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--color-chart-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 500 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} dx={-4} />
                  <Tooltip
                    contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                    formatter={(value) => [`$${(value / 1000).toFixed(0)}k`, 'Net Cash Flow']}
                    labelStyle={{ fontWeight: 600, color: 'var(--color-heading)' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--color-chart-primary)" strokeWidth={3} fill="url(#cashFlowGrad)" dot={false} activeDot={{ r: 5, fill: 'var(--color-chart-primary)', strokeWidth: 2, stroke: '#fff' }} animationDuration={1200} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Active Sprints Box */}
          <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-heading">Active Sprints</h2>
              <Link to="/dashboard/projects" className="text-xs font-medium text-accent hover:text-accent-hover">
                View Board &rarr;
              </Link>
            </div>
            
            <div className="space-y-3">
              <div className="p-4 rounded-card-sm border border-border-subtle bg-surface-muted flex items-center justify-between gap-4 hover:border-border-default transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-info-dot" />
                  <div>
                    <p className="text-sm font-semibold text-heading">Sprint 42: Warehouse Automation</p>
                    <p className="text-xs text-muted mt-0.5">3 Days Remaining • 68% Complete</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 rounded-card-sm border border-border-subtle flex items-center justify-between gap-4 hover:border-border-default transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-success-dot" />
                  <div>
                    <p className="text-sm font-semibold text-heading">Q3 Financial Audit</p>
                    <p className="text-xs text-muted mt-0.5">On Track • Operations Dept</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column (Actions & Activity) - Spans 1 col */}
        <div className="space-y-4 md:space-y-section">
          
          {/* Requires Attention */}
          <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-4">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-warning" />
                <h2 className="text-lg font-semibold text-heading">Requires Attention</h2>
              </div>
            </div>

            <div className="space-y-4">
              {ACTION_ITEMS.map((item) => (
                <div key={item.id} className="group flex items-start justify-between gap-3 border-b border-border-faint pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-heading group-hover:text-accent transition-colors cursor-pointer">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-muted mt-0.5 leading-tight">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-heading">{item.amount}</p>
                    <button className="text-[10px] font-medium text-accent hover:text-accent-hover mt-1">
                      Action
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-4">
            <div className="flex items-center gap-2 mb-6">
              <Clock size={16} className="text-caption" />
              <h2 className="text-lg font-semibold text-heading">Activity Feed</h2>
            </div>

            <div className="space-y-5">
              {RECENT_ACTIVITY.map((log, i) => (
                <div key={log.id} className="flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-faint mt-1.5" />
                    {i !== RECENT_ACTIVITY.length - 1 && (
                      <div className="w-px h-full bg-border-subtle absolute top-3.5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-body-light leading-relaxed">
                      <span className="font-semibold text-heading">{log.user}</span>{' '}
                      {log.action}{' '}
                      <span className="font-medium text-heading">{log.target}</span>
                    </p>
                    <p className="text-[10px] text-caption mt-0.5">{log.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}