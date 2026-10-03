import { Link } from 'react-router-dom'
import {
  Users,
  AlertCircle, Clock, TrendingUp, CreditCard, Rocket, Loader2
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import TopBarActions from '../../components/TopBarActions'
import StatCard from '../../components/common/StatCard'
import { dashboardApi } from '../../lib/api/dashboard'
import { queryKeys } from '../../lib/queryKeys'
import { formatMoney } from '../../lib/format'

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `YYYY-MM` (the cash-flow snapshot key) → the same short label the old mock used ('Jan'…). */
function shortMonth(ym) {
  const idx = Number(String(ym).slice(5, 7)) - 1
  return MONTHS[idx] ?? ym
}

/** The old mock row read "3 Days Remaining • 68% Complete" — build the same line from real fields. */
function sprintSubtitle(sprint) {
  const pct = `${sprint.completionPct}% Complete`
  if (!sprint.endsAt) return `No end date • ${pct}`
  const days = Math.ceil((new Date(sprint.endsAt).getTime() - Date.now()) / 86400000)
  if (days > 0) return `${days} ${days === 1 ? 'Day' : 'Days'} Remaining • ${pct}`
  if (days === 0) return `Ends today • ${pct}`
  return `Past end date • ${pct}`
}

export default function DashboardOverview() {
  // The old page pulled one composed `/dashboard/overview`; the new API exposes no such route, so
  // the page composes the real module aggregates directly — one distinct query (and cache key)
  // per underlying endpoint, all read as MEMBER.
  const employees = useQuery({
    queryKey: queryKeys.hr.employees.list({ limit: 1 }),
    queryFn: () => dashboardApi.listEmployees({ limit: 1 }),
  })
  const crm = useQuery({
    queryKey: queryKeys.crm.overview(),
    queryFn: dashboardApi.getCrmOverview,
  })
  const finance = useQuery({
    queryKey: [...queryKeys.finance.all(), 'overview'],
    queryFn: dashboardApi.getFinanceOverview,
  })
  const sprints = useQuery({
    queryKey: queryKeys.projects.sprints.list({}),
    queryFn: dashboardApi.getSprints,
  })
  const receivables = useQuery({
    queryKey: queryKeys.finance.receivables.list({ limit: 1 }),
    queryFn: () => dashboardApi.listReceivables({ limit: 1 }),
  })
  const products = useQuery({
    queryKey: queryKeys.inventory.products.list({ limit: 1 }),
    queryFn: () => dashboardApi.listProducts({ limit: 1 }),
  })
  const payroll = useQuery({
    queryKey: queryKeys.hr.payrollRuns.list({ limit: 1 }),
    queryFn: () => dashboardApi.listPayrollRuns({ limit: 1 }),
  })
  const attendance = useQuery({
    queryKey: queryKeys.hr.attendance.all(),
    queryFn: dashboardApi.getAttendance,
  })

  if ([employees, crm, finance, sprints, receivables, products, payroll, attendance].some(q => q.isLoading)) {
    return (
      <div className="flex h-full items-center justify-center flex-1 p-8">
        <Loader2 className="animate-spin text-muted" size={32} />
      </div>
    )
  }

  if ([employees, crm, finance, sprints, receivables, products, payroll, attendance].some(q => q.isError)) {
    return (
      <div className="flex h-full items-center justify-center flex-1 p-8 text-danger">
        Failed to load dashboard overview.
      </div>
    )
  }

  // ── KPI cards: each value is a real server-side aggregate ──
  const headcount = employees.data?.summary?.totalHeadcount ?? 0
  const onLeaveCount = employees.data?.summary?.onLeaveCount ?? 0
  const openCount = crm.data?.pipeline?.openCount ?? 0
  const openTotal = crm.data?.pipeline?.openTotal
  const payableOutstanding = finance.data?.payableOutstanding
  const sprintItems = sprints.data?.items ?? []

  const stats = [
    {
      label: 'Headcount',
      value: headcount.toString(),
      change: onLeaveCount > 0 ? `${onLeaveCount} on leave` : 'All active',
      trend: 'up',
      icon: Users,
    },
    {
      label: 'Open Pipeline Value',
      value: formatMoney(openTotal, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      change: `${openCount} open deals`,
      trend: 'neutral',
      icon: TrendingUp,
    },
    {
      label: 'Payables Outstanding',
      value: formatMoney(payableOutstanding, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      change: 'Outstanding',
      trend: 'down',
      icon: CreditCard,
    },
    {
      label: 'Active Sprints',
      value: sprintItems.length.toString(),
      change: 'Running now',
      trend: 'up',
      icon: Rocket,
    },
  ]

  // ── Cash-flow chart: real snapshots, wire money → major units for the axis ──
  const cashFlowData = (finance.data?.cashFlow ?? []).map((point) => ({
    month: shortMonth(point.month),
    value: point.net.amount / 100,
  }))

  // ── "Requires Attention": real signals, each only when its count is non-zero ──
  const overdueCount = receivables.data?.summary?.overdueCount ?? 0
  const overdueTotal = receivables.data?.summary?.overdueTotal
  const lowStockProducts = products.data?.summary?.lowStockProducts ?? 0
  const pendingPayrollRuns = payroll.data?.summary?.pendingCount ?? 0
  const attendanceExceptions = attendance.data?.summary?.exceptionCount ?? 0

  const attentionItems = []
  if (overdueCount > 0) {
    attentionItems.push({
      id: 'overdue-receivables',
      title: 'Overdue Receivables',
      subtitle: `Accounts receivable • ${overdueCount} ${overdueCount === 1 ? 'invoice' : 'invoices'} past due`,
      amount: formatMoney(overdueTotal),
    })
  }
  if (lowStockProducts > 0) {
    attentionItems.push({
      id: 'low-stock',
      title: 'Low-Stock Products',
      subtitle: `Inventory • ${lowStockProducts} ${lowStockProducts === 1 ? 'product' : 'products'} below threshold`,
      amount: `${lowStockProducts} item${lowStockProducts === 1 ? '' : 's'}`,
    })
  }
  if (pendingPayrollRuns > 0) {
    attentionItems.push({
      id: 'pending-payroll',
      title: 'Pending Payroll Runs',
      subtitle: `HR • ${pendingPayrollRuns} ${pendingPayrollRuns === 1 ? 'run' : 'runs'} awaiting approval`,
      amount: 'Approve',
    })
  }
  if (attendanceExceptions > 0) {
    attentionItems.push({
      id: 'attendance-exceptions',
      title: 'Attendance Exceptions',
      subtitle: `HR • ${attendanceExceptions} ${attendanceExceptions === 1 ? 'exception' : 'exceptions'} this period`,
      amount: 'Review',
    })
  }

  return (
    <div className="p-page md:p-page max-w-7xl mx-auto space-y-section">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <button disabled className="bg-surface-raised border border-border-default text-body text-sm font-medium px-4 py-2 rounded-button hover:bg-surface-muted transition-colors disabled:opacity-60">
            Generate Report
          </button>
        </div>
      </TopBarActions>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-grid-lg">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
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
                <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
              {sprintItems.length === 0 ? (
                <p className="text-sm text-muted">No active sprints found.</p>
              ) : (
                sprintItems.map((sprint, i) => (
                  <div key={sprint.id} className={`p-4 rounded-card-sm border border-border-subtle flex items-center justify-between gap-4 hover:border-border-default transition-colors cursor-pointer${i % 2 === 0 ? ' bg-surface-muted' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${sprint.completionPct === 100 ? 'bg-success-dot' : 'bg-info-dot'}`} />
                      <div>
                        <p className="text-sm font-semibold text-heading">{sprint.name}</p>
                        <p className="text-xs text-muted mt-0.5">{sprintSubtitle(sprint)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
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

            {attentionItems.length === 0 ? (
              <p className="text-sm text-muted">Nothing needs attention right now.</p>
            ) : (
              <div className="space-y-4">
                {attentionItems.map((item) => (
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
                      <button disabled className="text-[10px] font-medium text-accent hover:text-accent-hover mt-1 disabled:opacity-60">
                        Action
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-4">
            <div className="flex items-center gap-2 mb-6">
              <Clock size={16} className="text-caption" />
              <h2 className="text-lg font-semibold text-heading">Activity Feed</h2>
            </div>

            {/* No activity feed endpoint exists — an honest empty state instead of the old mock rows. */}
            <div className="space-y-5">
              <p className="text-sm text-muted">No recent activity</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
