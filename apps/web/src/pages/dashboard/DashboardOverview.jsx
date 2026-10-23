import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  AlertCircle,
  Clock,
  TrendingUp,
  CreditCard,
  Rocket,
  BarChart3,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import TopBarActions from '../../components/TopBarActions'
import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { dashboardApi } from '../../lib/api/dashboard'
import { auditLogApi } from '../../lib/api/auditLog'
import { queryKeys } from '../../lib/queryKeys'
import { formatMoney, formatCompactMoney, moneyToMajor, formatCompactCurrency, formatFullCurrency } from '../../lib/format'
import { countActiveSprints } from '../../lib/projectSprint'
import { downloadCsv } from '../../lib/csv'

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
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
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
  const payables = useQuery({
    queryKey: queryKeys.finance.payables.list({ limit: 1 }),
    queryFn: () => dashboardApi.listPayables({ limit: 1 }),
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
  const auditLogs = useQuery({
    queryKey: ['audit-logs', { limit: 5 }],
    queryFn: () => auditLogApi.listAuditLogs({ limit: 5 }),
  })

  // ── KPI cards: each value is a real server-side aggregate ──
  const headcount = employees.isLoading ? '…' : employees.isError ? '—' : employees.data?.summary?.totalHeadcount ?? 0
  const onLeaveCount = employees.data?.summary?.onLeaveCount ?? 0
  const hiredThisMonth = employees.data?.summary?.hiredThisMonth ?? 0
  const hiredPreviousMonthToDate = employees.data?.summary?.hiredPreviousMonthToDate ?? 0
  const hiresDelta = hiredThisMonth - hiredPreviousMonthToDate
  const openCount = crm.data?.pipeline?.openCount ?? 0
  const previousOpenCount = crm.data?.pipeline?.openCountComparison?.previousCount
  const openCountDelta = previousOpenCount == null ? null : openCount - previousOpenCount
  const openTotal = crm.data?.pipeline?.openTotal
  const previousOpenTotal = crm.data?.pipeline?.openTotalComparison?.previousTotal
  const openValueDelta = previousOpenTotal == null || openTotal == null
    ? null
    : { amount: openTotal.amount - previousOpenTotal.amount, currency: openTotal.currency }
  const payableOutstanding = finance.data?.payableOutstanding
  const pastDuePayables = payables.data?.summary?.pastDueTotal
  const dueIn7DaysPayables = payables.data?.summary?.dueIn7DaysTotal
  const paidThisMonthTotal = payables.data?.summary?.paidThisMonthTotal
  const paidThisMonthComparison = payables.data?.summary?.paidThisMonthComparison

  const payablesChangeText = (() => {
    if (pastDuePayables?.amount > 0) {
      return `${formatMoney(pastDuePayables)} past due${dueIn7DaysPayables?.amount > 0 ? ` · ${formatMoney(dueIn7DaysPayables)} due in 7d` : ''}`
    }
    if (dueIn7DaysPayables?.amount > 0) {
      return `${formatMoney(dueIn7DaysPayables)} due in 7 days`
    }
    if (paidThisMonthTotal && paidThisMonthComparison?.previousTotal) {
      return `${formatMoney(paidThisMonthTotal)} paid MTD (vs ${formatMoney(paidThisMonthComparison.previousTotal)})`
    }
    return 'All current'
  })()

  const sprintItems = sprints.data?.items ?? []
  const activeSprintCount = countActiveSprints(sprintItems)
  const completedSprintCount = sprintItems.filter(s => s.status === 'COMPLETED').length

  const stats = [
    {
      label: 'Headcount',
      value: headcount.toString(),
      change: `${hiredThisMonth} hired MTD`,
      subtitle: `${hiresDelta > 0 ? `+${hiresDelta}` : hiresDelta < 0 ? `${hiresDelta}` : '0'} vs last month${onLeaveCount > 0 ? ` · ${onLeaveCount} on leave` : ''}`,
      trend: hiresDelta > 0 ? 'up' : hiresDelta < 0 ? 'down' : 'neutral',
      icon: Users,
    },
    {
      label: 'Open Pipeline Value',
      value: crm.isLoading ? '…' : crm.isError ? '—' : formatCompactCurrency(openTotal),
      fullValue: crm.isLoading || crm.isError || !openTotal ? undefined : formatFullCurrency(openTotal),
      change: `${openCount} open deals`,
      subtitle: openCountDelta == null
        ? 'No historical comparison yet'
        : `${openCountDelta > 0 ? `+${openCountDelta}` : `${openCountDelta}`} deals vs prior month${openValueDelta == null ? '' : ` · ${formatMoney(openValueDelta)}`}`,
      trend: openCountDelta > 0 ? 'up' : openCountDelta < 0 ? 'down' : 'neutral',
      icon: TrendingUp,
    },
    {
      label: 'Payables Outstanding',
      value: finance.isLoading ? '…' : finance.isError ? '—' : formatCompactCurrency(payableOutstanding),
      fullValue: finance.isLoading || finance.isError || !payableOutstanding ? undefined : formatFullCurrency(payableOutstanding),
      change: payablesChangeText,
      subtitle: payables.data?.summary?.pendingApprovalCount > 0
        ? `${payables.data.summary.pendingApprovalCount} pending approval`
        : 'Across all vendor accounts',
      trend: 'neutral',
      icon: CreditCard,
    },
    {
      label: 'Active Sprints',
      value: sprints.isLoading ? '…' : sprints.isError ? '—' : activeSprintCount.toString(),
      change: activeSprintCount > 0 ? `${activeSprintCount} active` : 'No active sprint',
      subtitle: `${completedSprintCount} completed across portfolio`,
      trend: 'neutral',
      icon: Rocket,
    },
  ]

  // ── Cash-flow chart: real snapshots, wire money → major units for the axis ──
  const availableYears = [...new Set([selectedYear, ...(finance.data?.cashFlow ?? []).map(point => point.month.slice(0, 4))])].sort((a, b) => b.localeCompare(a))
  const cashFlowData = (finance.data?.cashFlow ?? []).filter(point => point.month.startsWith(`${selectedYear}-`)).map((point) => ({
    monthKey: point.month,
    month: shortMonth(point.month),
    value: moneyToMajor(point.net),
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
      amount: formatCompactCurrency(overdueTotal),
      fullAmount: formatFullCurrency(overdueTotal),
      to: '/dashboard/finance/accounts-receivable',
    })
  }
  if (lowStockProducts > 0) {
    attentionItems.push({
      id: 'low-stock',
      title: 'Low-Stock Products',
      subtitle: `Inventory • ${lowStockProducts} ${lowStockProducts === 1 ? 'product' : 'products'} below threshold`,
      amount: `${lowStockProducts} item${lowStockProducts === 1 ? '' : 's'}`,
      to: '/dashboard/inventory',
    })
  }
  if (pendingPayrollRuns > 0) {
    attentionItems.push({
      id: 'pending-payroll',
      title: 'Pending Payroll Runs',
      subtitle: `HR • ${pendingPayrollRuns} ${pendingPayrollRuns === 1 ? 'run' : 'runs'} awaiting approval`,
      amount: 'Approve',
      to: '/dashboard/hr/payroll',
    })
  }
  if (attendanceExceptions > 0) {
    attentionItems.push({
      id: 'attendance-exceptions',
      title: 'Attendance Exceptions',
      subtitle: `HR • ${attendanceExceptions} ${attendanceExceptions === 1 ? 'exception' : 'exceptions'} this period`,
      amount: 'Review',
      to: '/dashboard/hr/time-attendance',
    })
  }

  function downloadReport() {
    const rows = [
      ['Dashboard report', `Calendar year ${selectedYear}`],
      ['Metric', 'Value'],
      ...stats.map(stat => [stat.label, stat.value]),
      [],
      ['Cash flow month', 'Net amount (minor units)', 'Currency'],
      ...cashFlowData.map(point => {
        const money = finance.data?.cashFlow?.find(row => row.month === point.monthKey)?.net
        return [point.monthKey, money?.amount ?? '', money?.currency ?? '']
      }),
      [],
      ['Active sprint', 'Completion (%)', 'End date'],
      ...sprintItems.filter(sprint => sprint.status === 'ACTIVE').map(sprint => [sprint.name, sprint.completionPct, sprint.endsAt ?? '']),
      [],
      ['Requires attention', 'Detail', 'Amount / action'],
      ...attentionItems.map(item => [item.title, item.subtitle, item.amount]),
    ]
    downloadCsv(rows, `dashboard-${selectedYear}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadReport}
            className="h-9 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-xs sm:text-sm font-semibold text-slate-800 shadow-sm transition-all cursor-pointer"
          >
            Generate Report
          </Button>
        </div>
      </TopBarActions>

      {/* ── 1. Row 1: Compact 3-Tier Apple-Glass KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[126px]"
            >
              {/* Tier 1: Top Row */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {stat.label}
                </span>
                <div className="w-8 h-8 rounded-xl bg-slate-100/90 border border-slate-200/70 flex items-center justify-center text-slate-700 shrink-0">
                  {Icon && <Icon size={16} />}
                </div>
              </div>

              {/* Tier 2: Middle Row */}
              <div className="flex items-baseline justify-between gap-2 my-1.5 min-w-0">
                <span
                  className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums truncate cursor-help"
                  title={stat.fullValue || stat.value}
                >
                  {stat.value}
                </span>
                {stat.change && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/60 shrink-0 whitespace-nowrap">
                    {stat.change}
                  </span>
                )}
              </div>

              {/* Tier 3: Bottom Row Recessed Subtext Footer */}
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 truncate">
                {stat.subtitle || '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2. Row 2: Cash Flow Analysis (lg:col-span-8) & Requires Attention (lg:col-span-4) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

        {/* Left Card: Cash Flow Analysis */}
        <div className="lg:col-span-8 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <TrendingUp size={16} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Cash Flow Analysis</h2>
                <p className="text-xs text-slate-500">Calendar year {selectedYear}</p>
              </div>
            </div>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger
                aria-label="Cash flow calendar year"
                className="h-8.5 px-3 rounded-xl bg-slate-100/80 hover:bg-slate-100 border border-slate-200/70 text-xs font-semibold text-slate-700 w-auto gap-1.5 shadow-none cursor-pointer"
              >
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>Year {year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chart or Compact Structured Empty State */}
          {finance.isLoading || finance.isError ? (
            <div className="flex-1 min-h-[180px] flex items-center justify-center text-xs font-medium text-slate-500">
              {finance.isLoading ? 'Loading cash flow…' : 'Cash flow could not be loaded.'}
            </div>
          ) : cashFlowData.length === 0 ? (
            <div className="flex-1 min-h-[180px] bg-slate-50/70 border border-dashed border-slate-200/80 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/70 shadow-sm flex items-center justify-center text-slate-400">
                <BarChart3 size={18} />
              </div>
              <p className="text-xs font-medium text-slate-500">
                No cash flow data is available for {selectedYear}.
              </p>
            </div>
          ) : (
            <div className="h-56 sm:h-64 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashFlowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                    tickFormatter={(v) => formatCompactMoney(v, finance.data?.cashFlow?.[0]?.net?.currency || 'USD')}
                    dx={-4}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid rgba(226, 232, 240, 0.8)',
                      boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.08)',
                      fontSize: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      backdropFilter: 'blur(8px)',
                    }}
                    formatter={(value) => [formatCompactMoney(value, finance.data?.cashFlow?.[0]?.net?.currency || 'USD'), 'Net Cash Flow']}
                    labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    fill="url(#cashFlowGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                    animationDuration={1200}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right Card: Requires Attention */}
        <div className="lg:col-span-4 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={16} className="text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">Requires Attention</h2>
            </div>

            {[receivables, products, payroll, attendance].some(query => query.isLoading) && attentionItems.length === 0 ? (
              <p className="text-xs text-slate-400">Loading attention indicators…</p>
            ) : [receivables, products, payroll, attendance].some(query => query.isError) && attentionItems.length === 0 ? (
              <p className="text-xs text-amber-600">Attention indicators could not be loaded.</p>
            ) : attentionItems.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs font-medium text-slate-400">Nothing needs attention right now.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[receivables, products, payroll, attendance].some(query => query.isError) && (
                  <p role="status" className="text-xs text-amber-600">Some attention indicators could not be loaded.</p>
                )}
                {attentionItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/70 rounded-xl p-3 space-y-1.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                        {item.title}
                      </p>
                      <span
                        className="text-xs sm:text-sm font-bold text-slate-900 shrink-0 tabular-nums cursor-help"
                        title={item.fullAmount || item.amount}
                      >
                        {item.amount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-500 leading-tight">
                        {item.subtitle}
                      </p>
                      <Link
                        to={item.to}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[11px] font-semibold shrink-0 transition-colors"
                      >
                        Action
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── 3. Row 3: Active Sprints (lg:col-span-8) & Activity Feed (lg:col-span-4) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

        {/* Left Card: Active Sprints */}
        <div className="lg:col-span-8 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Active Sprints</h2>
              </div>
              <Link to="/dashboard/projects" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                View Board &rarr;
              </Link>
            </div>

            {sprints.isLoading ? (
              <p className="text-xs text-slate-400">Loading sprints…</p>
            ) : sprints.isError ? (
              <p className="text-xs text-slate-400">Sprints could not be loaded.</p>
            ) : sprintItems.filter(sprint => sprint.status === 'ACTIVE').length === 0 ? (
              <p className="text-xs text-slate-400">No active sprints found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {sprintItems
                  .filter(sprint => sprint.status === 'ACTIVE')
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
                  .map((sprint) => (
                    <Link
                      to="/dashboard/projects"
                      key={sprint.id}
                      className="bg-slate-50/80 hover:bg-white border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between gap-2 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] group cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              sprint.completionPct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                          />
                          <p className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                            {sprint.name}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-slate-800 tabular-nums shrink-0">
                          {sprint.completionPct}%
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="h-1.5 w-full rounded-full bg-slate-200/80 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, sprint.completionPct))}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          {sprintSubtitle(sprint)}
                        </p>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Activity Feed */}
        <div className="lg:col-span-4 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3.5">
              <Clock size={16} className="text-slate-500" />
              <h2 className="text-base font-bold text-slate-900">Activity Feed</h2>
            </div>

            {auditLogs.isLoading ? (
              <div className="py-4">
                <p className="text-xs text-slate-400">Loading activity...</p>
              </div>
            ) : auditLogs.isError ? (
              <div className="py-4">
                <p className="text-xs text-amber-600">Could not load activity.</p>
              </div>
            ) : auditLogs.data?.items?.length > 0 ? (
              <div className="border-l-2 border-slate-200/80 ml-2 pl-3.5 space-y-3">
                {auditLogs.data.items.map((log) => (
                  <div key={log.id} className="relative group">
                    <div className="absolute w-2 h-2 rounded-full bg-indigo-600 -left-[19px] top-1.5 ring-4 ring-white" />
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {log.action}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {log.actorName} • {new Date(log.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center">
                <Clock size={20} className="text-slate-300 mb-1.5" />
                <p className="text-xs font-semibold text-slate-600">No recent activity</p>
                <p className="text-[11px] text-slate-400 mt-0.5">New audits will display here in real time</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
