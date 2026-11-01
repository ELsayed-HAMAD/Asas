import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users,
  AlertCircle,
  Clock,
  TrendingUp,
  CreditCard,
  Rocket,
  BarChart3,
  ArrowRight,
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
import { formatMoney, formatCompactMoney, moneyToMajor, formatCompactCurrency, formatFullCurrency, formatDate } from '../../lib/format'
import { EMPTY } from '../../lib/emptyText'
import { countActiveSprints } from '../../lib/projectSprint'
import { downloadCsv } from '../../lib/csv'
import { formatLocaleFor } from '../../lib/i18n'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** `YYYY-MM` (the cash-flow snapshot key) → a localized short month label ('Jan'…). */
function monthLabel(ym, locale) {
  const [year, month] = String(ym).split('-').map(Number)
  if (!year || !month) return ym
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1)))
  } catch {
    return ym
  }
}

/** The old mock row read "3 Days Remaining • 68% Complete" — build the same line from real fields. */
function sprintSubtitle(sprint, t) {
  const pct = sprint.completionPct
  if (!sprint.endsAt) return t('dashboard.sprints.noEndDate', { pct })
  const days = Math.ceil((new Date(sprint.endsAt).getTime() - Date.now()) / 86400000)
  if (days > 0) return t('dashboard.sprints.daysRemaining', { count: days, pct })
  if (days === 0) return t('dashboard.sprints.endsToday', { pct })
  return t('dashboard.sprints.pastEndDate', { pct })
}

export default function DashboardOverview() {
  const { t, i18n } = useTranslation()
  const locale = formatLocaleFor(i18n.language)
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
  const headcount = employees.isLoading ? '…' : employees.isError ? EMPTY.unavailable : employees.data?.summary?.totalHeadcount ?? 0
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
      return `${t('dashboard.stats.pastDue', { amount: formatCompactCurrency(pastDuePayables) })}${dueIn7DaysPayables?.amount > 0 ? ` · ${t('dashboard.stats.dueIn7d', { amount: formatCompactCurrency(dueIn7DaysPayables) })}` : ''}`
    }
    if (dueIn7DaysPayables?.amount > 0) {
      return t('dashboard.stats.dueIn7Days', { amount: formatCompactCurrency(dueIn7DaysPayables) })
    }
    if (paidThisMonthTotal && paidThisMonthComparison?.previousTotal) {
      return t('dashboard.stats.paidMtd', {
        amount: formatCompactCurrency(paidThisMonthTotal),
        previous: formatCompactCurrency(paidThisMonthComparison.previousTotal),
      })
    }
    return t('dashboard.stats.noPastDueBills')
  })()

  const sprintItems = sprints.data?.items ?? []
  const activeSprintCount = countActiveSprints(sprintItems)
  const completedSprintCount = sprintItems.filter(s => s.status === 'COMPLETED').length
  const reportDataLoading = [employees, crm, finance, payables, sprints, receivables, products, payroll, attendance].some(query => query.isLoading)

  const stats = [
    {
      label: t('dashboard.stats.headcount'),
      value: headcount.toString(),
      change: t('dashboard.stats.hiredMtd', { count: hiredThisMonth }),
      subtitle: `${t('dashboard.stats.vsLastMonth', { delta: hiresDelta > 0 ? `+${hiresDelta}` : `${hiresDelta}` })}${onLeaveCount > 0 ? ` ${t('dashboard.stats.onLeave', { count: onLeaveCount })}` : ''}`,
      trend: hiresDelta > 0 ? 'up' : hiresDelta < 0 ? 'down' : 'neutral',
      icon: Users,
    },
    {
      label: t('dashboard.stats.openPipelineValue'),
      value: crm.isLoading ? '…' : crm.isError ? EMPTY.unavailable : formatCompactCurrency(openTotal),
      fullValue: crm.isLoading || crm.isError || !openTotal ? undefined : formatFullCurrency(openTotal),
      change: t('dashboard.stats.openDeals', { count: openCount }),
      subtitle: openCountDelta == null
        ? t('dashboard.stats.noHistoricalComparison')
        : `${t('dashboard.stats.dealsVsPriorMonth', { delta: openCountDelta > 0 ? `+${openCountDelta}` : `${openCountDelta}` })}${openValueDelta == null ? '' : ` · ${formatMoney(openValueDelta)}`}`,
      trend: openCountDelta > 0 ? 'up' : openCountDelta < 0 ? 'down' : 'neutral',
      icon: TrendingUp,
    },
    {
      label: t('dashboard.stats.payablesOutstanding'),
      value: finance.isLoading ? '…' : finance.isError ? EMPTY.unavailable : formatCompactCurrency(payableOutstanding),
      fullValue: finance.isLoading || finance.isError || !payableOutstanding ? undefined : formatFullCurrency(payableOutstanding),
      change: payablesChangeText,
      subtitle: payables.data?.summary?.pendingApprovalCount > 0
        ? t('dashboard.stats.pendingApproval', { count: payables.data.summary.pendingApprovalCount })
        : t('dashboard.stats.acrossVendorAccounts'),
      trend: 'neutral',
      icon: CreditCard,
    },
    {
      label: t('dashboard.stats.activeSprints'),
      value: sprints.isLoading ? '…' : sprints.isError ? EMPTY.unavailable : activeSprintCount.toString(),
      change: activeSprintCount > 0
        ? t('dashboard.stats.activeCount', { count: activeSprintCount })
        : t('dashboard.stats.noActiveSprint'),
      subtitle: t('dashboard.stats.completedAcrossPortfolio', { count: completedSprintCount }),
      trend: 'neutral',
      icon: Rocket,
    },
  ]

  // ── Cash-flow chart: real snapshots, wire money → major units for the axis ──
  const availableYears = [...new Set([selectedYear, ...(finance.data?.cashFlow ?? []).map(point => point.month.slice(0, 4))])].sort((a, b) => b.localeCompare(a))
  const cashFlowData = (finance.data?.cashFlow ?? []).filter(point => point.month.startsWith(`${selectedYear}-`)).map((point) => ({
    monthKey: point.month,
    month: monthLabel(point.month, locale),
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
      title: t('dashboard.attention.overdueReceivables'),
      subtitle: t('dashboard.attention.overdueSubtitle', { count: overdueCount }),
      amount: formatCompactCurrency(overdueTotal),
      fullAmount: formatFullCurrency(overdueTotal),
      actionLabel: t('dashboard.attention.open'),
      to: '/dashboard/finance/accounts-receivable',
    })
  }
  if (lowStockProducts > 0) {
    attentionItems.push({
      id: 'low-stock',
      title: t('dashboard.attention.lowStock'),
      subtitle: t('dashboard.attention.lowStockSubtitle', { count: lowStockProducts }),
      amount: t('dashboard.attention.lowStockAmount', { count: lowStockProducts }),
      actionLabel: t('dashboard.attention.open'),
      to: '/dashboard/inventory',
    })
  }
  if (pendingPayrollRuns > 0) {
    attentionItems.push({
      id: 'pending-payroll',
      title: t('dashboard.attention.pendingPayroll'),
      subtitle: t('dashboard.attention.pendingPayrollSubtitle'),
      amount: t('dashboard.attention.payrollRunsAmount', { count: pendingPayrollRuns }),
      actionLabel: t('dashboard.attention.review'),
      to: '/dashboard/hr/payroll',
    })
  }
  if (attendanceExceptions > 0) {
    attentionItems.push({
      id: 'attendance-exceptions',
      title: t('dashboard.attention.attendanceExceptions'),
      subtitle: t('dashboard.attention.attendanceSubtitle'),
      amount: t('dashboard.attention.exceptionsAmount', { count: attendanceExceptions }),
      actionLabel: t('dashboard.attention.review'),
      to: '/dashboard/hr/time-attendance',
    })
  }

  function downloadReport() {
    const rows = [
      [t('dashboard.report.title'), t('dashboard.report.calendarYear', { year: selectedYear })],
      [t('dashboard.report.metric'), t('dashboard.report.value')],
      ...stats.map(stat => [stat.label, stat.value]),
      [],
      [t('dashboard.report.cashFlowMonth'), t('dashboard.report.netAmountMinor'), t('dashboard.report.currency')],
      ...cashFlowData.map(point => {
        const money = finance.data?.cashFlow?.find(row => row.month === point.monthKey)?.net
        return [point.monthKey, money?.amount ?? '', money?.currency ?? '']
      }),
      [],
      [t('dashboard.report.activeSprint'), t('dashboard.report.completionPct'), t('dashboard.report.endDate')],
      ...sprintItems.filter(sprint => sprint.status === 'ACTIVE').map(sprint => [sprint.name, sprint.completionPct, sprint.endsAt ?? '']),
      [],
      [t('dashboard.report.requiresAttention'), t('dashboard.report.detail'), t('dashboard.report.amountAction')],
      ...attentionItems.map(item => [item.title, item.subtitle, item.amount]),
    ]
    downloadCsv(rows, `dashboard-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
      <h1 className="sr-only">{t('dashboard.overview')}</h1>

      <TopBarActions>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadReport}
            disabled={reportDataLoading}
            aria-busy={reportDataLoading}
            title={reportDataLoading ? t('dashboard.reportWaitingTitle') : undefined}
            className={`h-9 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50 sm:text-sm ${reportDataLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            {t('dashboard.generateReport')}
          </Button>
        </div>
      </TopBarActions>

      {/* ── 1. Row 1: Compact 3-Tier Apple-Glass KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex min-h-[150px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/60 p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl"
            >
              {/* Tier 1: Top Row */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {stat.label}
                </span>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-100/90 text-slate-700">
                  {Icon && <Icon size={16} />}
                </div>
              </div>

              {/* Tier 2: Value and chip keep a fixed rhythm so a long value never resizes the row */}
              <div className="my-1.5 min-w-0">
                <p
                  className="cursor-help truncate text-2xl font-bold leading-8 tracking-tight text-slate-900 tabular-nums"
                  title={stat.fullValue || stat.value}
                >
                  {stat.value}
                </p>
                <div className="mt-1 flex h-5 items-center">
                  {stat.change && (
                    <span
                      className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-slate-200/60 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                      title={stat.change}
                    >
                      {stat.change}
                    </span>
                  )}
                </div>
              </div>

              {/* Tier 3: Bottom Row Recessed Subtext Footer */}
              <div className="truncate border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                {stat.subtitle || t('dashboard.stats.noDetailsYet')}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2. Row 2: Cash Flow Analysis (lg:col-span-8) & Requires Attention (lg:col-span-4) ── */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:h-[272px] lg:grid-cols-12">

        {/* Left Card: Cash Flow Analysis */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/60 p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl lg:col-span-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                <TrendingUp size={16} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('dashboard.cashFlow.title')}</h2>
                <p className="text-xs text-slate-500">{t('dashboard.cashFlow.calendarYear', { year: selectedYear })}</p>
              </div>
            </div>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger
                aria-label={t('dashboard.cashFlow.yearAria')}
                className="h-8.5 w-auto cursor-pointer gap-1.5 rounded-xl border border-slate-200/70 bg-slate-100/80 px-3 text-xs font-semibold text-slate-700 shadow-none hover:bg-slate-100"
              >
                <SelectValue placeholder={t('dashboard.cashFlow.year')} />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>{t('dashboard.cashFlow.yearValue', { year })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chart or Compact Structured Empty State */}
          {finance.isLoading || finance.isError ? (
            <div className="flex min-h-[180px] flex-1 items-center justify-center text-xs font-medium text-slate-500">
              {finance.isLoading ? t('dashboard.cashFlow.loading') : t('dashboard.cashFlow.error')}
            </div>
          ) : cashFlowData.length === 0 ? (
            <div className="flex min-h-[180px] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200/80 bg-slate-50/70 p-6 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-slate-400 shadow-sm">
                <BarChart3 size={18} />
              </div>
              <p className="text-xs font-medium text-slate-500">
                {t('dashboard.cashFlow.empty', { year: selectedYear })}
              </p>
            </div>
          ) : (
            <div className="relative min-h-[180px] w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashFlowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-secondary)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--color-chart-secondary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--color-chart-axis)', fontWeight: 500 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--color-chart-axis-muted)', fontWeight: 500 }}
                    tickFormatter={(v) => formatCompactMoney(v, finance.data?.cashFlow?.[0]?.net?.currency || 'USD')}
                    dx={-4}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid var(--color-chart-tooltip-border)',
                      boxShadow: 'var(--shadow-chart-tooltip)',
                      fontSize: 12,
                      backgroundColor: 'var(--color-chart-tooltip-bg)',
                      backdropFilter: 'blur(8px)',
                    }}
                    formatter={(value) => [formatCompactMoney(value, finance.data?.cashFlow?.[0]?.net?.currency || 'USD'), t('dashboard.cashFlow.net')]}
                    labelStyle={{ fontWeight: 600, color: 'var(--color-chart-label)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-chart-secondary)"
                    strokeWidth={2.5}
                    fill="url(#cashFlowGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: 'var(--color-chart-secondary)', strokeWidth: 2, stroke: 'var(--color-chart-dot-stroke)' }}
                    animationDuration={1200}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right Card: Requires Attention */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/60 p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl sm:p-5 lg:col-span-4">
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">{t('dashboard.attention.title')}</h2>
            </div>

            {[receivables, products, payroll, attendance].some(query => query.isLoading) && attentionItems.length === 0 ? (
              <p className="text-xs text-slate-400">{t('dashboard.attention.loading')}</p>
            ) : [receivables, products, payroll, attendance].some(query => query.isError) && attentionItems.length === 0 ? (
              <p className="text-xs text-amber-600">{t('dashboard.attention.error')}</p>
            ) : attentionItems.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs font-medium text-slate-400">{t('dashboard.attention.empty')}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[receivables, products, payroll, attendance].some(query => query.isError) && (
                  <p role="status" className="text-xs text-amber-600">{t('dashboard.attention.someError')}</p>
                )}
                {attentionItems.map((item) => (
                  <div
                    key={item.id}
                    className="space-y-1.5 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 transition-all hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold leading-snug text-slate-900 sm:text-sm">
                        {item.title}
                      </p>
                      <span
                        className="shrink-0 cursor-help text-xs font-bold text-slate-900 tabular-nums sm:text-sm"
                        title={item.fullAmount || item.amount}
                      >
                        {item.amount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] leading-tight text-slate-500">
                        {item.subtitle}
                      </p>
                      <Link
                        to={item.to}
                        aria-label={`${item.actionLabel} ${item.title}`}
                        className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                      >
                        {item.actionLabel}
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
      <div className="grid grid-cols-1 items-stretch gap-4 lg:h-[330px] lg:grid-cols-12">

        {/* Left Card: Active Sprints */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/60 p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl lg:col-span-8">
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">{t('dashboard.sprints.title')}</h2>
              </div>
              <Link to="/dashboard/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                {t('dashboard.sprints.viewBoard')}
                <ArrowRight size={13} className="rtl:-scale-x-100" />
              </Link>
            </div>

            {sprints.isLoading ? (
              <p className="text-xs text-slate-400">{t('dashboard.sprints.loading')}</p>
            ) : sprints.isError ? (
              <p className="text-xs text-slate-400">{t('dashboard.sprints.error')}</p>
            ) : sprintItems.filter(sprint => sprint.status === 'ACTIVE').length === 0 ? (
              <p className="text-xs text-slate-400">{t('dashboard.sprints.empty')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {sprintItems
                  .filter(sprint => sprint.status === 'ACTIVE')
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
                  .map((sprint) => (
                    <Link
                      to="/dashboard/projects"
                      key={sprint.id}
                      className="group flex cursor-pointer flex-col justify-between gap-1.5 rounded-xl border border-slate-200/70 bg-slate-50/80 p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              sprint.completionPct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                          />
                          <p className="truncate text-xs font-bold text-slate-900 transition-colors group-hover:text-indigo-600 sm:text-sm">
                            {sprint.name}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-slate-800 tabular-nums">
                          {sprint.completionPct}%
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, sprint.completionPct))}%` }}
                          />
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {sprintSubtitle(sprint, t)}
                        </p>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Activity Feed */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/60 p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl lg:col-span-4">
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3.5 flex items-center gap-2">
              <Clock size={16} className="text-slate-500" />
              <h2 className="text-base font-bold text-slate-900">{t('dashboard.activity.title')}</h2>
            </div>

            {auditLogs.isLoading ? (
              <div className="py-4">
                <p className="text-xs text-slate-400">{t('dashboard.activity.loading')}</p>
              </div>
            ) : auditLogs.isError ? (
              <div className="py-4">
                <p className="text-xs text-amber-600">{t('dashboard.activity.error')}</p>
              </div>
            ) : auditLogs.data?.items?.length > 0 ? (
              <div className="ms-2 space-y-3 border-s-2 border-slate-200/80 ps-3.5">
                {auditLogs.data.items.map((log) => (
                  <div key={log.id} className="group relative">
                    <div className="absolute -start-[19px] top-1.5 h-2 w-2 rounded-full bg-indigo-600 ring-4 ring-white" />
                    <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                      {log.action}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {log.actorName} • {formatDate(log.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Clock size={20} className="mb-1.5 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">{t('dashboard.activity.empty')}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{t('dashboard.activity.emptyBody')}</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
