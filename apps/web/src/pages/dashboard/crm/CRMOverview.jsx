import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MoreHorizontal,
  Loader2,
  Mail,
  Phone,
  Circle,
  TrendingUp,
  Percent,
  Briefcase,
  Trophy,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import {
  formatDate,
  formatMoney,
  formatPercent,
  moneyToMajor,
  formatCompactCurrency,
} from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';
import SearchInput from '../../../components/common/SearchInput';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Alert, AlertDescription } from '../../../components/ui/alert';
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

  const { data: agenda, isLoading: agendaLoading, isError: agendaError } = useQuery({
    queryKey: queryKeys.crm.agenda(),
    queryFn: () => crmApi.listAgenda(),
  })

  const { data: recentActivitiesData, isLoading: activitiesLoading } = useQuery({
    queryKey: queryKeys.crm.activities({ limit: 10 }),
    queryFn: () => crmApi.listRecentActivities({ limit: 10 }),
  })
  const recentActivities = recentActivitiesData?.items || []

  const createAgenda = useMutation({
    mutationFn: () => crmApi.createAgenda({ title: agendaTitle.trim() }),
    onSuccess: () => {
      setAgendaTitle('');
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.agenda() })
    },
  })

  const updateAgenda = useMutation({
    mutationFn: ({ id, done }) => crmApi.updateAgenda(id, { done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.crm.agenda() }),
  })

  const createDeal = useMutation({
    mutationFn: () => crmApi.createDeal({
      ...dealForm,
      value: dealForm.value || null,
      closeDate: dealForm.closeDate || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() })
      setDealOpen(false)
      setDealForm({ name: '', value: '', stage: 'LEADS', closeDate: '' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 bg-surface-raised text-danger">
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
  const pipelineCompactValue = formatCompactCurrency(pipeline.openTotal);
  const closedWonValueLabel = perf ? formatMoney(perf.yearWonTotal) : '…';
  const closedWonCompactValue = perf ? formatCompactCurrency(perf.yearWonTotal) : '…';
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
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">
      {/* Kept empty to clear the top global bar and avoid search collisions */}
      <TopBarActions><div /></TopBarActions>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 lg:p-6 space-y-4 max-w-[1600px] w-full mx-auto">
        {/* ── Top Standalone Apple-Glass Toolbar ── */}
        <div className="bg-white/85 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-2.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-2.5">
          <SearchInput
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim()) {
                navigate(`/dashboard/crm/deals?search=${encodeURIComponent(search.trim())}`)
              }
            }}
            wrapperClassName="w-full sm:w-72"
          />

          <Button
            type="button"
            onClick={() => setDealOpen(true)}
            className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold shadow-sm inline-flex items-center justify-center shrink-0"
          >
            New Deal
          </Button>
        </div>

        {/* ── Row 1: 3-Tier Apple-Glass KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {/* Card 1: Total Pipeline */}
          <div className="relative overflow-hidden bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            {/* Background Subtle Sparkline */}
            <div className="absolute inset-x-0 bottom-0 h-6 pointer-events-none z-0 opacity-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pipelineSpark} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <YAxis hide domain={([min, max]) => [min - (max - min) * 3, max]} />
                  <defs>
                    <linearGradient id="pipelineSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={1.5} fill="url(#pipelineSparkGrad)" dot={false} activeDot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Pipeline</p>
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
                  <TrendingUp size={16} />
                </div>
              </div>

              <div className="my-1">
                <p
                  className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums cursor-help"
                  title={pipelineValueLabel}
                >
                  {pipelineCompactValue}
                </p>
              </div>

              <p
                className="text-[11px] text-slate-500 leading-tight pt-1.5 border-t border-slate-100"
                title={`Prior-month value (as of ${pipeline.openTotalComparison?.previousAsOfDate ?? pipeline.openCountComparison?.previousAsOfDate}) ${pipeline.openTotalComparison?.previousTotal == null ? 'unavailable' : formatMoney(pipeline.openTotalComparison.previousTotal)}`}
              >
                Prior-month value (as of {pipeline.openTotalComparison?.previousAsOfDate ?? pipeline.openCountComparison?.previousAsOfDate}) {pipeline.openTotalComparison?.previousTotal == null
                  ? 'unavailable'
                  : formatMoney(pipeline.openTotalComparison.previousTotal)}
              </p>
            </div>
          </div>

          {/* Card 2: Win Rate */}
          <div className="relative overflow-hidden bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            {/* Background Subtle Sparkline */}
            <div className="absolute inset-x-0 bottom-0 h-6 pointer-events-none z-0 opacity-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={winRateSpark} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <YAxis hide domain={[0, 100]} />
                  <defs>
                    <linearGradient id="winrateSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5} fill="url(#winrateSparkGrad)" dot={false} activeDot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Win Rate</p>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                  <Percent size={16} />
                </div>
              </div>

              <div className="my-1">
                <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {formatPercent(data.winRate)}
                </p>
              </div>

              <p
                className="text-[11px] text-slate-500 leading-tight pt-1.5 border-t border-slate-100"
                title={`MTD ${formatPercent(currentPeriodWinRate)} · Prior period ${monthlyWinRateDelta == null ? formatPercent(previousPeriodWinRate) : `${monthlyWinRateDelta > 0 ? '+' : ''}${monthlyWinRateDelta.toFixed(1)} pts`}`}
              >
                MTD {formatPercent(currentPeriodWinRate)} · Prior period {monthlyWinRateDelta == null ? formatPercent(previousPeriodWinRate) : `${monthlyWinRateDelta > 0 ? '+' : ''}${monthlyWinRateDelta.toFixed(1)} pts`}
              </p>
            </div>
          </div>

          {/* Card 3: Active Deals */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Active Deals</p>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                <Briefcase size={16} />
              </div>
            </div>

            <div className="my-1 flex items-baseline gap-2">
              <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {pipeline.openCount}
              </p>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60 shrink-0 whitespace-nowrap">
                +{data.createdLast7Days} this week
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-blue-100/80 overflow-hidden" />
          </div>

          {/* Card 4: Closed Won */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                Closed Won ({perf?.year ?? currentYear})
              </p>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                  {perf ? `${perf.summary.totalWonCount} deals` : '0 deals'}
                </span>
                <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200/70 text-slate-600 flex items-center justify-center shrink-0">
                  <Trophy size={16} />
                </div>
              </div>
            </div>

            <div className="my-1 flex items-baseline">
              <p
                className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums cursor-help"
                title={closedWonValueLabel}
              >
                {closedWonCompactValue}
              </p>
            </div>

            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-900 transition-all duration-500"
                style={{ width: `${closedPctOfQuota == null ? 0 : Math.min(100, closedPctOfQuota)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Row 2: Charts Row (Revenue Forecast 7 cols vs Pipeline Conversion 5 cols) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Revenue Forecast Area Chart (lg:col-span-7) */}
          <div className="lg:col-span-7 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900 leading-tight">Revenue Forecast</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/crm/forecast')}
                title="View full revenue forecast"
                className="text-slate-400 hover:text-slate-800 h-8 w-8 rounded-xl hover:bg-slate-100"
              >
                <MoreHorizontal size={18} />
              </Button>
            </div>

            <div className="relative w-full h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="crmRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} tickFormatter={(value) => formatCompact(value, currency)} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid rgba(226, 232, 240, 0.8)',
                      boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.08)',
                      fontSize: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      backdropFilter: 'blur(8px)',
                    }}
                    formatter={(value) => [formatCompact(value, currency), 'Revenue']}
                    labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} fill="url(#crmRevGrad)" dot={false} activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} animationDuration={1200} />
                </AreaChart>
              </ResponsiveContainer>
              {monthly.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs font-medium">
                  No open deals with a close date yet.
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Conversion Funnel (lg:col-span-5) */}
          <div className="lg:col-span-5 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">Pipeline Conversion</h2>
              <p className="mt-0.5 mb-3 text-xs text-slate-500 leading-relaxed">
                All-time cohorts from recorded stage history. Deals without recorded history are excluded.
              </p>
            </div>

            <div className="flex flex-col items-center justify-between flex-1 w-full space-y-1.5 pt-1">
              {/* Leads (100% width) */}
              <div className="w-full h-9 bg-[#dbeafe] text-[#1e3a8a] px-3.5 rounded-xl flex justify-between items-center text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <span className="whitespace-nowrap">Leads</span>
                <span className="tabular-nums shrink-0 cursor-help" title={formatMoney(s.leads.value)}>
                  {formatCompactCurrency(s.leads.value)}
                </span>
              </div>
              <div className="z-10 -my-1 mx-auto px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-slate-200/80 text-slate-500 shadow-xs leading-none shrink-0">
                {formatConversion(proposalConv)}
              </div>

              {/* Proposal (94% width) */}
              <div className="w-[94%] h-9 bg-[#ffedd5] text-[#9a3412] px-3.5 rounded-xl flex justify-between items-center text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <span className="whitespace-nowrap">Proposal</span>
                <span className="tabular-nums shrink-0 cursor-help" title={formatMoney(s.proposal.value)}>
                  {formatCompactCurrency(s.proposal.value)}
                </span>
              </div>
              <div className="z-10 -my-1 mx-auto px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-slate-200/80 text-slate-500 shadow-xs leading-none shrink-0">
                {formatConversion(negotiationConv)}
              </div>

              {/* Negotiation (88% width) */}
              <div className="w-[88%] h-9 bg-[#fee2e2] text-[#991b1b] px-3.5 rounded-xl flex justify-between items-center text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <span className="whitespace-nowrap">Negotiation</span>
                <span className="tabular-nums shrink-0 cursor-help" title={formatMoney(s.negotiation.value)}>
                  {formatCompactCurrency(s.negotiation.value)}
                </span>
              </div>
              <div className="z-10 -my-1 mx-auto px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-slate-200/80 text-slate-500 shadow-xs leading-none shrink-0">
                {formatConversion(closedConv)}
              </div>

              {/* Closed Won (82% width) */}
              <div className="w-[82%] h-9 bg-emerald-100 text-emerald-800 px-3.5 rounded-xl flex justify-between items-center text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <span className="whitespace-nowrap">Closed Won</span>
                <span className="tabular-nums shrink-0 cursor-help" title={formatMoney(s.closedWon.value)}>
                  {formatCompactCurrency(s.closedWon.value)}
                </span>
              </div>

              {/* Closed Lost (76% width) */}
              <div className="w-[76%] h-9 bg-rose-100 text-rose-800 px-3.5 rounded-xl flex justify-between items-center text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <span className="whitespace-nowrap">Closed Lost</span>
                <span className="tabular-nums shrink-0 cursor-help" title={formatMoney(s.closedLost.value)}>
                  {formatCompactCurrency(s.closedLost.value)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 3: Bottom Row (Daily Agenda 7 cols vs Recent Activity 5 cols) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Daily Agenda (lg:col-span-7) */}
          <div className="lg:col-span-7 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col gap-3.5">
            <h2 className="text-base font-bold text-slate-900 leading-tight">Daily Agenda</h2>

            <div className="flex items-center gap-2">
              <Input
                value={agendaTitle}
                onChange={event => setAgendaTitle(event.target.value)}
                placeholder="Add an agenda item"
                className="flex-1 h-9 px-3.5 rounded-xl bg-slate-100/75 border border-slate-200/70 text-xs sm:text-sm focus-visible:ring-1"
              />
              <Button
                type="button"
                disabled={!agendaTitle.trim() || createAgenda.isPending}
                onClick={() => createAgenda.mutate()}
                className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold shrink-0"
              >
                Add
              </Button>
            </div>

            {agendaError && (
              <Alert variant="destructive" className="rounded-xl">
                <AlertDescription>Could not load agenda items. Try refreshing the page.</AlertDescription>
              </Alert>
            )}
            {createAgenda.isError && (
              <Alert variant="destructive" className="rounded-xl">
                <AlertDescription>{createAgenda.error?.message || 'Could not add the agenda item.'}</AlertDescription>
              </Alert>
            )}
            {updateAgenda.isError && (
              <Alert variant="destructive" className="rounded-xl">
                <AlertDescription>{updateAgenda.error?.message || 'Could not update the agenda item.'}</AlertDescription>
              </Alert>
            )}

            {agendaLoading ? (
              <div className="py-6 flex justify-center flex-1 items-center">
                <Loader2 className="animate-spin text-slate-400" size={18} />
              </div>
            ) : agenda?.items?.length ? (
              <div className="space-y-2.5 flex-1">
                {agenda.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 pb-2.5">
                    <Checkbox
                      checked={item.done}
                      disabled={updateAgenda.isPending}
                      onCheckedChange={checked => updateAgenda.mutate({ id: item.id, done: checked === true })}
                    />
                    <span className={item.done ? 'text-sm text-slate-400 line-through' : 'text-sm font-medium text-slate-800'}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 min-h-[120px] bg-slate-50/60 border border-dashed border-slate-200/80 rounded-xl p-5 flex flex-col items-center justify-center text-center gap-1">
                <p className="text-sm font-bold text-slate-800">No agenda items</p>
                <p className="text-xs text-slate-500">Add a task for this workspace.</p>
              </div>
            )}
          </div>

          {/* Recent Activity (lg:col-span-5) */}
          <div className="lg:col-span-5 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col gap-3.5">
            <h2 className="text-base font-bold text-slate-900 leading-tight">Recent Activity</h2>

            {activitiesLoading ? (
              <p className="text-sm text-slate-400 py-6">Loading activity…</p>
            ) : recentActivities.length === 0 ? (
              <div className="flex-1 min-h-[120px] bg-slate-50/60 border border-dashed border-slate-200/80 rounded-xl p-5 flex items-center justify-center text-center text-xs text-slate-500 gap-2">
                <div className="w-2 h-2 bg-slate-300 rounded-full shrink-0" />
                <p>No recent activity to show yet.</p>
              </div>
            ) : (
              <div className="relative ps-3 space-y-4 flex-1">
                <div className="absolute inset-inline-start-[15px] top-2 bottom-4 w-px bg-slate-200" />
                {recentActivities.map(activity => (
                  <div key={activity.id} className="relative z-10 flex gap-3">
                    <div className="bg-white rounded-full p-0.5 ring-2 ring-slate-100 mt-0.5 shrink-0">
                      {activity.type === 'EMAIL' ? (
                        <Mail size={15} className="text-slate-500" />
                      ) : activity.type === 'CALL' ? (
                        <Phone size={15} className="text-slate-500" />
                      ) : (
                        <Circle size={15} className="text-slate-500" strokeWidth={2.5} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {activity.title} {activity.dealName ? <span className="font-normal text-slate-500">· {activity.dealName}</span> : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {activity.type === 'EMAIL' ? 'Email' : activity.type === 'CALL' ? 'Call' : 'Note'} · {activity.actorName || 'Unknown author'} · {formatDate(activity.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {activity.body && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600 line-clamp-2">
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

      {/* ── New Deal Dialog ── */}
      <FormDialog
        open={dealOpen}
        onClose={() => setDealOpen(false)}
        title="New deal"
        subtitle="Add a deal to the CRM pipeline."
        busy={createDeal.isPending}
        onConfirm={() => createDeal.mutate()}
        confirmLabel="Create deal"
      >
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
