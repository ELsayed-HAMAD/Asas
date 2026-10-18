import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MoreHorizontal,
  Loader2,
  Mail,
  Phone,
  Circle,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatDate, formatMoney, formatPercent, moneyToMajor } from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';
import EmptyState from '../../../components/common/EmptyState';
import FormDialog from '../../../components/common/FormDialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

// Chart-only number formatters (axis ticks / tooltips). Money arrives as
// { amount: minor units, currency } — reduce to a major-unit number for the scale.
const toMajor = (money) => (money == null ? 0 : moneyToMajor(money));
const formatCompact = (v, currency) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1,
}).format(v);

export default function CRMOverview() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const [agendaTitle, setAgendaTitle] = useState('')
  const [dealOpen, setDealOpen] = useState(false)
  const [dealForm, setDealForm] = useState({ name: '', value: '', stage: 'LEADS', closeDate: '' })
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.crm.overview(),
    queryFn: () => crmApi.getOverview(),
  });

  // Revenue forecast uses open pipeline grouped by close month; outcome trend uses closed deals
  // grouped by their recorded close month from the overview endpoint.
  const { data: forecast } = useQuery({
    queryKey: queryKeys.crm.forecast(),
    queryFn: () => crmApi.getForecast(),
  })
  // Current-year closed-won from recorded actual closures — the quota bar must compare
  // this year's won value with this year's quota, not the all-time stage inventory.
  const currentYear = String(new Date().getFullYear())
  const { data: perf } = useQuery({
    queryKey: queryKeys.crm.salesPerformance(currentYear),
    queryFn: () => crmApi.getSalesPerformance(currentYear),
  });
  const { data: agenda } = useQuery({ queryKey: queryKeys.crm.agenda(), queryFn: () => crmApi.listAgenda() })
  const { data: recentActivitiesData, isLoading: activitiesLoading } = useQuery({
    queryKey: queryKeys.crm.activities({ limit: 10 }),
    queryFn: () => crmApi.listRecentActivities({ limit: 10 }),
  })
  const recentActivities = recentActivitiesData?.items || []
  const createAgenda = useMutation({
    mutationFn: () => crmApi.createAgenda({ title: agendaTitle.trim() }),
    onSuccess: () => { setAgendaTitle(''); queryClient.invalidateQueries({ queryKey: queryKeys.crm.agenda() }) },
  })
  const createDeal = useMutation({
    mutationFn: () => crmApi.createDeal({ ...dealForm, value: dealForm.value || null, closeDate: dealForm.closeDate || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() })
      setDealOpen(false)
      setDealForm({ name: '', value: '', stage: 'LEADS', closeDate: '' })
    },
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
      <div className="flex flex-col h-full items-center justify-center gap-2 bg-surface text-danger">
        <p className="text-sm font-medium">{error?.message || 'Failed to load CRM overview.'}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const pipeline = data.pipeline || { openTotal: null, openCount: 0, wonTotal: null, wonCount: 0 };
  const funnel = data.funnel || [];
  const byStage = (stage) => funnel.find((row) => row.stage === stage) || { count: 0, value: null, share: null };
  const s = {
    leads: byStage('LEADS'),
    proposal: byStage('PROPOSAL'),
    negotiation: byStage('NEGOTIATION'),
    closedWon: byStage('CLOSED_WON'),
    closedLost: byStage('CLOSED_LOST'),
  };

  // Historical cohort conversion is computed from recorded stage-entry events, not current inventory.
  const conversion = (fromStage, toStage) => data.stageConversions?.find(row => row.fromStage === fromStage && row.toStage === toStage)?.rate ?? null;
  const proposalConv = conversion('LEADS', 'PROPOSAL');
  const negotiationConv = conversion('PROPOSAL', 'NEGOTIATION');
  const closedConv = conversion('NEGOTIATION', 'CLOSED_WON');
  const formatConversion = rate => rate == null ? '—' : `${Math.round(rate)}%`;

  const monthly = (forecast?.monthlyPipeline || []).map((row) => ({ month: row.month, value: toMajor(row.value) }));
  const pipelineSpark = monthly.map((row) => ({ v: row.value }));
  const pipelineValueLabel = formatMoney(pipeline.openTotal);
  const closedWonValueLabel = perf ? formatMoney(perf.yearWonTotal) : '…';
  const metricFontSize = label => `clamp(0.75rem, ${Math.min(14, 130 / Math.max(1, (label || '').length))}cqw, 1.5rem)`
  const winRateSpark = (data.monthlyWinRate || []).filter((row) => row.rate != null).map((row) => ({ v: row.rate }));
  const currentPeriodWinRate = data.winRateComparison?.current?.rate ?? null;
  const previousPeriodWinRate = data.winRateComparison?.previous?.rate ?? null;
  const monthlyWinRateDelta = currentPeriodWinRate != null && previousPeriodWinRate != null
    ? Math.round((currentPeriodWinRate - previousPeriodWinRate) * 10) / 10
    : null;
  const currency = pipeline.openTotal?.currency || forecast?.summary?.totalPipeline?.currency || 'USD';

  // Closed-Won progress bar: this year's actual closed-won value against the stored quota
  // goal (when any). Legacy undated closures stay excluded, as on Sales Performance.
  const quotaMajor = toMajor(forecast?.summary?.totalQuota);
  const closedPctOfQuota = quotaMajor > 0 && perf ? (toMajor(perf.yearWonTotal) / quotaMajor) * 100 : null;

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-0">

      <TopBarActions>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
            <Input
              type="text"
              placeholder="Search deals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  navigate(`/dashboard/crm/deals?search=${encodeURIComponent(search.trim())}`)
                }
              }}
              className="ps-9 pe-3 h-9 text-xs bg-surface-muted hover:bg-surface focus:bg-surface-raised w-[260px] max-w-full"
            />
          </div>

          <Button
            type="button"
            onClick={() => setDealOpen(true)}
            className="h-9 px-4 text-sm font-semibold shrink-0"
          >
            New Deal
          </Button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-4">

        {/* ── KPIs Grid (4 cards, CSS grid, 4 columns, gap 16px, min-height 104px, equal height) ── */}
        <div className="grid grid-cols-2 min-[1100px]:grid-cols-4 gap-4 items-stretch">

          {/* Card 1: Total Pipeline */}
          <div className="@container relative overflow-hidden bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[104px] flex flex-col">
            {/* Background Chart */}
            <div className="absolute inset-inline-0 bottom-0 h-[22px] pointer-events-none z-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pipelineSpark} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <YAxis hide domain={([min, max]) => [min - (max - min) * 3, max]} />
                  <defs>
                    <linearGradient id="pipelineSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5} fill="url(#pipelineSparkGrad)" dot={false} activeDot={false} animationDuration={1500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Foreground */}
            <div className="relative z-10 flex flex-col pointer-events-none">
              <div className="flex items-center justify-between min-h-[16px]">
                <p className="text-xs font-bold text-muted uppercase tracking-wider leading-none">Total Pipeline</p>
              </div>
              <div className="pointer-events-auto mt-1 flex items-baseline">
                <p
                  className="min-w-0 text-2xl font-bold text-heading tracking-tight leading-tight tabular-nums truncate"
                  style={{ fontSize: metricFontSize(pipelineValueLabel) }}
                  title={pipelineValueLabel}
                >
                  {pipelineValueLabel}
                </p>
              </div>
              <p
                className="mt-1 text-xs text-muted truncate leading-tight pointer-events-auto"
                title={`Prior-month value (as of ${pipeline.openTotalComparison?.previousAsOfDate ?? pipeline.openCountComparison?.previousAsOfDate}) ${pipeline.openTotalComparison?.previousTotal == null ? 'unavailable' : formatMoney(pipeline.openTotalComparison.previousTotal)}`}
              >
                Prior-month value (as of {pipeline.openTotalComparison?.previousAsOfDate ?? pipeline.openCountComparison?.previousAsOfDate}) {pipeline.openTotalComparison?.previousTotal == null
                  ? 'unavailable'
                  : formatMoney(pipeline.openTotalComparison.previousTotal)}
              </p>
            </div>
          </div>

          {/* Card 2: Win Rate */}
          <div className="relative overflow-hidden bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[104px] flex flex-col">
            {/* Background Chart */}
            <div className="absolute inset-inline-0 bottom-0 h-[22px] pointer-events-none z-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={winRateSpark} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <YAxis hide domain={[0, 100]} />
                  <defs>
                    <linearGradient id="winrateSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#f43f5e" strokeWidth={1.5} fill="url(#winrateSparkGrad)" dot={false} activeDot={false} animationDuration={1500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Foreground */}
            <div className="relative z-10 flex flex-col pointer-events-none">
              <div className="flex items-center justify-between min-h-[16px]">
                <p className="text-xs font-bold text-muted uppercase tracking-wider leading-none">Win Rate</p>
              </div>
              <div className="pointer-events-auto mt-1 flex items-baseline">
                <p className="min-w-0 text-2xl font-bold text-heading tracking-tight leading-tight tabular-nums truncate">
                  {formatPercent(data.winRate)}
                </p>
              </div>
              <p
                className="mt-1 text-xs text-muted truncate leading-tight pointer-events-auto"
                title={`MTD ${formatPercent(currentPeriodWinRate)} · Prior period ${monthlyWinRateDelta == null ? formatPercent(previousPeriodWinRate) : `${monthlyWinRateDelta > 0 ? '+' : ''}${monthlyWinRateDelta.toFixed(1)} pts`}`}
              >
                MTD {formatPercent(currentPeriodWinRate)} · Prior period {monthlyWinRateDelta == null ? formatPercent(previousPeriodWinRate) : `${monthlyWinRateDelta > 0 ? '+' : ''}${monthlyWinRateDelta.toFixed(1)} pts`}
              </p>
            </div>
          </div>

          {/* Card 3: Active Deals */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[104px] flex flex-col">
            <div className="flex items-center justify-between min-h-[16px]">
              <p className="text-xs font-bold text-muted uppercase tracking-wider leading-none">Active Deals</p>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="min-w-0 text-2xl font-bold text-heading tracking-tight leading-tight tabular-nums truncate">
                {pipeline.openCount}
              </p>
              <Badge variant="outline" className="bg-surface-active text-body-light border-border-default px-2 py-0.5 text-[11px] font-medium leading-none shrink-0 whitespace-nowrap">
                +{data.createdLast7Days} this week
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted leading-tight select-none invisible">
              &nbsp;
            </div>
          </div>

          {/* Card 4: Closed Won */}
          <div className="@container bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[104px] flex flex-col">
            <div className="flex items-center justify-between min-h-[16px]">
              <p className="text-xs font-bold text-muted uppercase tracking-wider truncate leading-none">
                Closed Won ({perf?.year ?? currentYear})
              </p>
              <p className="text-xs text-muted font-medium shrink-0 leading-none">
                {perf ? `${perf.summary.totalWonCount} deals` : '…'}
              </p>
            </div>
            <div className="mt-1 flex items-baseline">
              <p
                className="min-w-0 text-2xl font-bold text-heading tracking-tight leading-tight tabular-nums truncate"
                style={perf ? { fontSize: metricFontSize(closedWonValueLabel) } : undefined}
                title={closedWonValueLabel}
              >
                {closedWonValueLabel}
              </p>
            </div>
            <div className="mt-1 flex flex-col justify-end">
              <Progress
                value={closedPctOfQuota == null ? 0 : Math.min(100, closedPctOfQuota)}
                className="h-[3px] bg-surface-active"
                indicatorClassName="bg-accent"
              />
            </div>
          </div>

        </div>

        {/* ── Main Charts Row (grid 3fr 2fr, gap 16px, min-height 320px) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[320px] items-stretch">

          {/* Revenue Forecast Area Chart (3fr ~60%) */}
          <div className="col-span-1 lg:col-span-3 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-5 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-heading leading-tight">Revenue Forecast</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/crm/forecast')}
                title="View full revenue forecast"
                className="text-caption hover:text-body ms-auto h-8 w-8"
              >
                <MoreHorizontal size={18} />
              </Button>
            </div>

            <div className="relative flex-1 w-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="crmRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-caption)', fontWeight: 500 }} tickFormatter={(value) => formatCompact(value, currency)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                    formatter={(value) => [formatCompact(value, currency), 'Revenue']}
                    labelStyle={{ fontWeight: 600, color: 'var(--color-heading)' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fill="url(#crmRevGrad)" dot={false} activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} animationDuration={1200} />
                </AreaChart>
              </ResponsiveContainer>
              {monthly.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
                  No open deals with a close date yet.
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Conversion Funnel (2fr ~40%) */}
          <div className="col-span-1 lg:col-span-2 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-5 flex flex-col min-h-[320px]">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-heading leading-tight">Pipeline Conversion</h2>
              <p className="mt-1 text-[13px] text-muted line-clamp-2 leading-snug">
                All-time cohorts from recorded stage history. Deals without recorded history are excluded.
              </p>
            </div>

            <div className="flex flex-col items-center justify-between flex-1 w-full gap-2">

              {/* Leads (100% width) */}
              <div className="w-full min-h-[36px] bg-[#dbeafe] text-[#1e3a8a] py-2 px-3 flex justify-between items-center rounded-input relative transition-all">
                <span className="text-sm font-semibold whitespace-nowrap text-start">Leads</span>
                <span className="text-sm font-bold tabular-nums text-end shrink-0">{formatMoney(s.leads.value)}</span>
              </div>
              <div className="z-10 h-4 px-2 -my-1 inline-flex items-center justify-center bg-surface-raised border border-border-strong rounded-input text-[10px] font-bold text-heading shadow-sm leading-none shrink-0">
                {formatConversion(proposalConv)}
              </div>

              {/* Proposal (94% width) */}
              <div className="w-[94%] min-h-[36px] bg-[#ffedd5] text-[#9a3412] py-2 px-3 flex justify-between items-center rounded-input relative transition-all">
                <span className="text-sm font-semibold whitespace-nowrap text-start">Proposal</span>
                <span className="text-sm font-bold tabular-nums text-end shrink-0">{formatMoney(s.proposal.value)}</span>
              </div>
              <div className="z-10 h-4 px-2 -my-1 inline-flex items-center justify-center bg-surface-raised border border-border-strong rounded-input text-[10px] font-bold text-heading shadow-sm leading-none shrink-0">
                {formatConversion(negotiationConv)}
              </div>

              {/* Negotiation (88% width) */}
              <div className="w-[88%] min-h-[36px] bg-[#fee2e2] text-[#991b1b] py-2 px-3 flex justify-between items-center rounded-input relative transition-all">
                <span className="text-sm font-semibold whitespace-nowrap text-start">Negotiation</span>
                <span className="text-sm font-bold tabular-nums text-end shrink-0">{formatMoney(s.negotiation.value)}</span>
              </div>
              <div className="z-10 h-4 px-2 -my-1 inline-flex items-center justify-center bg-surface-raised border border-border-strong rounded-input text-[10px] font-bold text-heading shadow-sm leading-none shrink-0">
                {formatConversion(closedConv)}
              </div>

              {/* Closed Won (82% width) */}
              <div className="w-[82%] min-h-[36px] bg-success-light text-success-text py-2 px-3 flex justify-between items-center rounded-input relative transition-all">
                <span className="text-sm font-semibold whitespace-nowrap text-start">Closed Won</span>
                <span className="text-sm font-bold tabular-nums text-end shrink-0">{formatMoney(s.closedWon.value)}</span>
              </div>

              {/* Closed Lost (76% width >= 75%) */}
              <div className="w-[76%] min-h-[36px] bg-danger-light text-danger-text py-2 px-3 flex justify-between items-center rounded-input relative transition-all">
                <span className="text-sm font-semibold whitespace-nowrap text-start">Closed Lost</span>
                <span className="text-sm font-bold tabular-nums text-end shrink-0">{formatMoney(s.closedLost.value)}</span>
              </div>

            </div>
          </div>

        </div>

        {/* ── Bottom Row (grid 3fr 2fr matching charts row, height auto, min-height 180px, items-start) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

          {/* Daily agenda (3fr ~60%) */}
          <div className="col-span-1 lg:col-span-3 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-5 flex flex-col min-h-[180px]">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-heading leading-tight">Daily Agenda</h2>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Input
                value={agendaTitle}
                onChange={event => setAgendaTitle(event.target.value)}
                placeholder="Add an agenda item"
                className="min-w-0 flex-1 h-9 text-xs bg-surface-raised"
              />
              <Button
                type="button"
                disabled={!agendaTitle.trim() || createAgenda.isPending}
                onClick={() => createAgenda.mutate()}
                className="h-9 px-4 text-sm font-semibold shrink-0"
              >
                Add
              </Button>
            </div>
            {agenda?.items?.length ? (
              <div className="space-y-2.5">
                {agenda.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 border-b border-border-subtle pb-2.5">
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={() => crmApi.updateAgenda(item.id, { done: !item.done }).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.crm.agenda() }))}
                    />
                    <span className={item.done ? 'text-sm text-muted line-through' : 'text-sm font-medium text-heading'}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No agenda items"
                description="Add a task for this workspace."
                className="py-6 [&_p:first-child]:text-sm [&_p:first-child]:font-semibold [&_p:last-child]:text-[13px]"
              />
            )}
          </div>

          {/* Recent Activity (2fr ~40%) */}
          <div className="col-span-1 lg:col-span-2 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-5 flex flex-col min-h-[180px]">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-heading leading-tight">Recent Activity</h2>
            </div>

            {activitiesLoading ? (
              <p className="text-sm text-muted py-6">Loading activity…</p>
            ) : recentActivities.length === 0 ? (
              <div className="py-6 flex items-center gap-3">
                <div className="w-2.5 h-2.5 bg-surface-muted rounded-full shrink-0" />
                <p className="text-sm font-medium text-muted">No recent activity to show yet.</p>
              </div>
            ) : (
              <div className="relative ps-3 space-y-4">
                <div className="absolute inset-inline-start-[15px] top-2 bottom-4 w-px bg-surface-strong" />
                {recentActivities.map(activity => (
                  <div key={activity.id} className="relative z-10 flex gap-3">
                    <div className="bg-surface-raised ring-4 ring-white dark:ring-surface-raised mt-0.5 shrink-0">
                      {activity.type === 'EMAIL' ? (
                        <Mail size={16} className="text-caption" />
                      ) : activity.type === 'CALL' ? (
                        <Phone size={16} className="text-caption" />
                      ) : (
                        <Circle size={16} className="text-caption" strokeWidth={2.5} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-heading truncate">
                        {activity.title} {activity.dealName ? <span className="font-normal text-muted">· {activity.dealName}</span> : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {activity.type === 'EMAIL' ? 'Email' : activity.type === 'CALL' ? 'Call' : 'Note'} · {activity.actorName || 'Unknown author'} · {formatDate(activity.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {activity.body && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-body line-clamp-2">
                          {activity.body}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
      <FormDialog open={dealOpen} onClose={() => setDealOpen(false)} title="New deal" subtitle="Add a deal to the CRM pipeline." busy={createDeal.isPending} onConfirm={() => createDeal.mutate()} confirmLabel="Create deal">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Deal name</label>
            <Input
              required
              value={dealForm.name}
              onChange={event => setDealForm(current => ({ ...current, name: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Value</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={dealForm.value}
              onChange={event => setDealForm(current => ({ ...current, value: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Stage</label>
            <Select
              value={dealForm.stage}
              onValueChange={val => setDealForm(current => ({ ...current, stage: val }))}
            >
              <SelectTrigger className="w-full bg-surface-muted">
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEADS">Leads</SelectItem>
                <SelectItem value="PROPOSAL">Proposal</SelectItem>
                <SelectItem value="NEGOTIATION">Negotiation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Expected close date</label>
            <Input
              type="date"
              value={dealForm.closeDate}
              onChange={event => setDealForm(current => ({ ...current, closeDate: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
