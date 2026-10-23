import React, { useState } from 'react';
import {
  Download,
  Share2,
  CheckCircle2,
  Handshake,
  TrendingUp,
  Filter,
  AlertTriangle,
  TrendingDown,
  Info,
  Loader2,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { moneyToMajor, formatCompactMoney, formatMoney } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import SearchInput from '../../../components/common/SearchInput';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Alert, AlertDescription } from '../../../components/ui/alert';
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

const toMajor = (money) => (money == null ? 0 : moneyToMajor(money));

export default function RevenueForecast() {
  const [search, setSearch] = useState('')
  const [showAllReps, setShowAllReps] = useState(false)
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false)
  const [quotaEditingId, setQuotaEditingId] = useState('')
  const [quotaForm, setQuotaForm] = useState({ repName: '', period: selectedYear, quota: '' })
  const [quotaToDelete, setQuotaToDelete] = useState(null)
  const queryClient = useQueryClient()
  const { data: activeMemberRole } = useActiveMemberRole()
  const canManageQuotas = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole))
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.forecast(selectedYear),
    queryFn: () => crmApi.getForecast(selectedYear),
  });

  // Real closed-won total (the forecast endpoint itself has no closed amount —
  // its `quotaAttainmentPct` is pipeline ÷ quota, i.e. coverage).
  const { data: perf } = useQuery({
    queryKey: queryKeys.crm.salesPerformance(selectedYear),
    queryFn: () => crmApi.getSalesPerformance(selectedYear),
  });

  const saveQuota = useMutation({
    mutationFn: () => {
      const input = { repName: quotaForm.repName.trim(), period: quotaForm.period.trim(), quota: quotaForm.quota.trim() }
      return quotaEditingId ? crmApi.updateQuota(quotaEditingId, input) : crmApi.createQuota(input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() })
      setQuotaDialogOpen(false)
      setQuotaEditingId('')
    },
  })
  const deleteQuota = useMutation({
    mutationFn: () => crmApi.deleteQuota(quotaToDelete.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() })
      setQuotaToDelete(null)
      setQuotaEditingId('')
      setQuotaForm({ repName: '', period: selectedYear, quota: '' })
    },
    onError: () => setQuotaToDelete(null),
  })

  const openQuotaManager = () => {
    setQuotaEditingId('')
    setQuotaForm({ repName: '', period: selectedYear, quota: '' })
    setQuotaDialogOpen(true)
  }
  const selectQuota = id => {
    setQuotaEditingId(id)
    const quota = data?.quotas?.find(item => item.id === id)
    setQuotaForm(quota ? {
      repName: quota.repName,
      period: quota.period,
      quota: quota.quota?.currency === data.baseCurrency ? String(moneyToMajor(quota.quota)) : '',
    } : { repName: '', period: selectedYear, quota: '' })
    saveQuota.reset()
  }
  const submitQuota = () => {
    if (!quotaForm.repName.trim() || !quotaForm.period.trim() || !quotaForm.quota.trim()) return
    saveQuota.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-red-500">
        Failed to load revenue forecast.
      </div>
    );
  }

  const { liveForecastByRep, quotas, monthlyPipeline, summary } = data;
  const closedWon = perf?.yearWonTotal ?? null;
  const currency = summary.totalQuota?.currency || 'USD'

  // ── KPIs from the server summary ──
  const quotaMajor = toMajor(summary.totalQuota);
  const wonMajor = toMajor(closedWon);
  const wonPctToQuota = quotaMajor > 0 && closedWon != null ? (wonMajor / quotaMajor) * 100 : null;

  const committedTotal = toMajor(summary.dealCommit)
  const bestCaseTotal = toMajor(summary.dealBestCase)
  const weightedTotal = toMajor(summary.weightedPipeline)

  // Pipeline coverage — the server's `quotaAttainmentPct` is exactly totalPipeline ÷ totalQuota
  // (a percentage), so coverage in "×" is that value / 100.
  const coverage = summary.quotaAttainmentPct == null ? null : summary.quotaAttainmentPct / 100;

  // ── Chart: real open-pipeline months; the quota reference line amortizes the
  // total stored quota across the months shown (no per-month quota exists server-side). ──
  const wonByMonth = new Map((perf?.monthlyClosedWon || []).filter(row => row.month.startsWith(selectedYear)).map(row => [row.month, row.value.amount]))
  const commitByMonth = new Map((data.monthlyCommit || []).map(row => [row.month, row.value.amount]))
  const pipelineByMonth = new Map(monthlyPipeline.map(row => [row.month, row.value.amount]))
  const months = [...new Set([...pipelineByMonth.keys(), ...wonByMonth.keys(), ...commitByMonth.keys()])].sort()
  const chartData = months.map(month => {
    const committed = commitByMonth.get(month) || 0
    return {
      month,
      closed: toMajor({ amount: wonByMonth.get(month) || 0, currency }),
      commit: toMajor({ amount: committed, currency }),
      pipeline: toMajor({ amount: Math.max(0, (pipelineByMonth.get(month) || 0) - committed), currency }),
    }
  })

  // Expected shortfall = quota − closed-won (display arithmetic on two server aggregates).
  const expectedShortfall = quotaMajor > 0 && closedWon != null ? Math.max(0, quotaMajor - wonMajor) : null;

  const availableYears = [...new Set([selectedYear, ...(data.availableYears || [])])].sort((a, b) => b.localeCompare(a))
  const formatCurrency = (num) => formatCompactMoney(num, currency)
  const formatExactCurrency = (num) => formatMoney(num, { currency })
  const visibleReps = liveForecastByRep.filter(rep => rep.repName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const displayedReps = showAllReps || search.trim() ? visibleReps : visibleReps.slice(0, 5)
  const exportCsv = () => {
    const rows = [
      ['Rep', 'Period', `Closed (${currency})`, `Commit (${currency})`, `Best Case (${currency})`, 'Quota attainment (%)'],
      ...visibleReps.map(rep => [rep.repName, selectedYear, toMajor(rep.closed), toMajor(rep.commit), toMajor(rep.bestCase), rep.quotaAttainmentPct]),
    ]
    downloadCsv(rows, `revenue-forecast-${new Date().toISOString().slice(0, 10)}.csv`)
  }
  const shareForecast = async () => {
    const text = `Revenue forecast: ${formatCurrency(committedTotal)} committed, ${formatCurrency(bestCaseTotal)} best case.`
    if (navigator.share) await navigator.share({ title: 'Revenue forecast', text })
    else await navigator.clipboard.writeText(text)
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* ── 1. Top Filter & Action Toolbar (Standard Apple-Glass Bar) ── */}
        <div className="bg-white/85 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-2.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Search reps */}
          <SearchInput
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search reps..."
            aria-label="Search reps"
            wrapperClassName="w-full sm:w-64 md:w-72 shrink-0"
            className="h-9 text-sm"
          />

          {/* Right: Year, Download, Manage Quotas, Share Forecast */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            <Select value={String(selectedYear)} onValueChange={val => setSelectedYear(val)}>
              <SelectTrigger
                aria-label="Forecast calendar year"
                className="h-9 w-auto px-3.5 gap-2 bg-slate-100/75 hover:bg-slate-100 text-slate-700 border border-slate-200/70 rounded-xl text-xs sm:text-sm font-medium shadow-none shrink-0 cursor-pointer"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={String(year)}>Year {year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={exportCsv}
              aria-label="Download forecast CSV"
              title="Download forecast CSV"
              className="w-9 h-9 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-sm shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </Button>

            {canManageQuotas && (
              <Button
                type="button"
                variant="outline"
                onClick={openQuotaManager}
                className="h-9 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm gap-2 shrink-0 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                Manage Quotas
              </Button>
            )}

            <Button
              type="button"
              onClick={shareForecast}
              className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold shadow-sm gap-2 shrink-0 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              Share Forecast
            </Button>
          </div>
        </div>

        {summary.excludedQuotaCount > 0 && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 rounded-xl">
            <AlertDescription className="text-xs font-medium">
              {summary.excludedQuotaCount} quota row(s) with a nonannual period or unknown/foreign currency are excluded from annual base-currency totals.
            </AlertDescription>
          </Alert>
        )}

        {/* ── 2. Row 1: Elevate the 4 KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1: Closed Won */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Closed Won ({selectedYear})</p>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 my-1 tabular-nums">
              {closedWon == null ? '—' : formatCurrency(wonMajor)}
            </p>
            <div className="mt-auto pt-1">
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${wonPctToQuota == null ? 0 : Math.min(100, wonPctToQuota)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5 font-medium">
                <span>{wonPctToQuota == null ? 'No quota set' : `${Math.round(wonPctToQuota)}% to Quota`}</span>
                <span>{quotaMajor === 0 ? 'No goal' : `${formatCurrency(quotaMajor)} Goal`}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Committed */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Committed</p>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/60 text-indigo-600 flex items-center justify-center shrink-0">
                <Handshake size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 my-1 tabular-nums">
              {committedTotal === 0 ? '—' : formatCurrency(committedTotal)}
            </p>
            <div className="mt-auto pt-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold w-fit bg-blue-50 text-blue-700 border border-blue-200/60">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
                High Confidence · {summary.dealCommitCount} {summary.dealCommitCount === 1 ? 'deal' : 'deals'}
              </div>
            </div>
          </div>

          {/* Card 3: Best Case */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best Case (Upside)</p>
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-600 flex items-center justify-center shrink-0">
                <TrendingUp size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 my-1 tabular-nums">
              {bestCaseTotal === 0 ? '—' : formatCurrency(bestCaseTotal)}
            </p>
            <div className="mt-auto pt-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold w-fit bg-amber-50 text-amber-800 border border-amber-200/60">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0" />
                Medium Confidence · {summary.dealBestCaseCount} {summary.dealBestCaseCount === 1 ? 'deal' : 'deals'}
              </div>
            </div>
          </div>

          {/* Card 4: Pipeline Coverage */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pipeline Coverage</p>
              <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200/60 text-slate-600 flex items-center justify-center shrink-0">
                <Filter size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 my-1 tabular-nums">
              {coverage == null ? '—' : `${coverage.toFixed(1)}x`}
            </p>
            <div className="mt-auto pt-1">
              <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-500 leading-tight space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Info size={12} className="text-slate-400 shrink-0" />
                  <span>{coverage == null ? 'Set a quota to measure coverage' : 'Open pipeline ÷ quota'}</span>
                </div>
                <div className="truncate">
                  <span className="font-semibold text-slate-700">Weighted pipeline: {formatCurrency(weightedTotal)}</span>
                  {summary.unweightedDealCount > 0 && ` · ${summary.unweightedDealCount} deal(s), ${formatCurrency(toMajor(summary.unweightedPipeline))}, excluded (missing/invalid probability)`}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── 3. Row 2: Fix Revenue by Close Month Chart Proportions & Bar Widths ── */}
        <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col w-full">

          {/* Chart Header & Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-bold text-slate-900">Revenue by Close Month</h2>
            <div className="bg-slate-100/80 border border-slate-200/60 rounded-xl px-3 py-1.5 flex items-center gap-4 text-xs font-medium text-slate-600 shrink-0">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#0f172a]" /> Closed Won</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#a5b4fc]" /> Commit</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#e5e7eb]" /> Other Open</div>
            </div>
          </div>

          {/* Closed won, committed, and remaining open deals grouped by close month */}
          <div className="w-full h-[230px] sm:h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }} maxBarSize={56}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                  tickFormatter={(v) => formatCompactMoney(v, summary.totalQuota?.currency || 'USD')}
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
                  formatter={(value, name) => {
                    if (value === 0) return [null, name === 'closed' ? 'Closed' : name === 'commit' ? 'Commit' : 'Pipeline'];
                    const label = name === 'closed' ? 'Closed' : name === 'commit' ? 'Commit' : 'Pipeline';
                    return [formatCompactMoney(value, summary.totalQuota?.currency || 'USD'), label];
                  }}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Bar dataKey="closed" stackId="a" fill="#0f172a" maxBarSize={56} animationDuration={1000} />
                <Bar dataKey="commit" stackId="a" fill="#a5b4fc" maxBarSize={56} animationDuration={1000} />
                <Bar dataKey="pipeline" stackId="a" fill="#e5e7eb" radius={[6, 6, 0, 0]} maxBarSize={56} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
            {chartData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                No open deals with a close date yet.
              </div>
            )}
          </div>
        </div>

        {/* ── 4. Row 3: Forecast by Rep & Fixed Expected Shortfall Card ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

          {/* Left Card: Forecast by Rep Table */}
          <div className="col-span-1 lg:col-span-8 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900">Forecast by Rep</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllReps(value => !value)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 h-7 px-2 cursor-pointer"
              >
                {showAllReps ? 'Show Top 5' : `View All (${visibleReps.length})`}
              </Button>
            </div>
            <Table className="w-full min-w-[650px] text-left border-collapse">
              <TableHeader className="bg-slate-50/90 border-y border-slate-200/70">
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 rtl:text-left">Rep</TableHead>
                  <TableHead className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">Closed</TableHead>
                  <TableHead className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">Commit</TableHead>
                  <TableHead className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">Best Case</TableHead>
                  <TableHead className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right w-32">To Quota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {displayedReps.length === 0 ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell colSpan={5} className="py-2">
                      <div className="my-2 bg-slate-50/60 border border-dashed border-slate-200/80 rounded-xl py-6 text-center text-xs text-slate-400">
                        No owned deals with a close date in {selectedYear} yet.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedReps.map((rep) => {
                    const repQuotaPct = rep.quotaAttainmentPct;
                    return (
                      <TableRow key={rep.id} className="hover:bg-slate-50/70 border-0 transition-colors">
                        <TableCell className="px-3 py-3 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200/80 text-[10px] font-bold text-slate-600">
                            {rep.repName.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-slate-800">{rep.repName}</span>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-xs sm:text-sm font-bold text-slate-900 tabular-nums" title={formatExactCurrency(toMajor(rep.closed))}>
                          {formatCurrency(toMajor(rep.closed))}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-xs sm:text-sm text-slate-600 font-medium tabular-nums" title={formatExactCurrency(toMajor(rep.commit))}>
                          {formatCurrency(toMajor(rep.commit))}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-xs sm:text-sm text-slate-600 font-medium tabular-nums" title={formatExactCurrency(toMajor(rep.bestCase))}>
                          {formatCurrency(toMajor(rep.bestCase))}
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${repQuotaPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${repQuotaPct == null ? 0 : Math.min(100, repQuotaPct)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 w-8 text-right tabular-nums">
                              {repQuotaPct == null ? '—' : `${Math.round(repQuotaPct)}%`}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Right Column: Alerts & Fixed Expected Shortfall Card */}
          <div className="col-span-1 lg:col-span-4 flex flex-col gap-4 justify-between">

            {expectedShortfall > 0 && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900 rounded-xl p-3 flex items-center gap-3 shadow-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <AlertDescription className="text-xs font-semibold">
                  Pipeline is below quota by {formatCurrency(expectedShortfall)}.
                </AlertDescription>
              </Alert>
            )}

            {/* Expected Shortfall Card */}
            <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] relative overflow-hidden flex flex-col justify-between flex-1 min-h-[180px]">
              {/* Top Header Row */}
              <div className="flex items-center justify-between gap-2 relative z-10">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Expected Shortfall
                </h3>
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center shrink-0">
                  <TrendingDown size={16} />
                </div>
              </div>

              {/* Metric and Pill */}
              <div className="my-2 relative z-10">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-rose-600 tabular-nums">
                    {expectedShortfall == null ? '—' : formatCurrency(expectedShortfall)}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200/60">
                    vs Quota
                  </span>
                </div>
              </div>

              {/* Bottom Recessed Status Bar */}
              <div className="relative z-10 mt-auto pt-2">
                <div className="h-1.5 w-full rounded-full bg-rose-100 overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all"
                    style={{ width: expectedShortfall != null && quotaMajor > 0 ? `${Math.min(100, (expectedShortfall / quotaMajor) * 100)}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Watermark Trend Icon in Bottom-Right */}
              <TrendingDown
                size={96}
                className="pointer-events-none absolute -right-3 -bottom-3 text-rose-500/10 select-none"
              />
            </div>

          </div>

        </div>
      </div>
      {canManageQuotas && <FormDialog
        open={quotaDialogOpen}
        onClose={() => { setQuotaDialogOpen(false); saveQuota.reset() }}
        title={quotaEditingId ? 'Edit sales quota' : 'Add sales quota'}
        subtitle={`Workspace base currency: ${data.baseCurrency}`}
        confirmLabel={quotaEditingId ? 'Save quota' : 'Create quota'}
        busy={saveQuota.isPending}
        onConfirm={submitQuota}
      >
        <div className="space-y-4">
          <div className="max-h-40 space-y-2 overflow-y-auto border-b border-gray-200 pb-3">
            <p className="text-xs font-semibold uppercase text-gray-500">Existing quotas</p>
            {quotas.length === 0 ? <p className="text-sm text-gray-500">No quotas recorded for this year.</p> : quotas.map(quota => <div key={quota.id} className="flex items-center justify-between gap-3 text-sm">
              <Button
                type="button"
                variant="link"
                onClick={() => selectQuota(quota.id)}
                className="min-w-0 flex-1 justify-start h-auto p-0 truncate text-left text-blue-700 hover:underline font-normal"
              >
                {quota.repName} · {quota.period} · {quota.quota ? formatCompactMoney(toMajor(quota.quota), quota.quota.currency) : 'Currency unknown'}
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setQuotaToDelete(quota)} aria-label={`Delete quota for ${quota.repName}`} className="h-6 w-6 text-gray-500 hover:bg-gray-100 hover:text-red-600"><Trash2 size={14} /></Button>
            </div>)}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sales representative</label>
            <Input value={quotaForm.repName} onChange={event => setQuotaForm(value => ({ ...value, repName: event.target.value }))} maxLength={160} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
            <Input value={quotaForm.period} onChange={event => setQuotaForm(value => ({ ...value, period: event.target.value }))} placeholder="2026, 2026-Q1, or 2026-01" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quota amount ({data.baseCurrency})</label>
            <Input type="number" min="0" step="0.01" value={quotaForm.quota} onChange={event => setQuotaForm(value => ({ ...value, quota: event.target.value }))} required />
          </div>
          <p className="text-xs text-gray-500">Annual periods contribute to the annual quota total. Quarter and month quotas remain available for their matching period. Legacy quotas with unknown or different currency are excluded until edited and saved in the workspace base currency.</p>
          {saveQuota.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {saveQuota.error?.message || 'Could not save quota.'}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>}
      {canManageQuotas && <ConfirmDialog
        open={Boolean(quotaToDelete)}
        onClose={() => setQuotaToDelete(null)}
        onConfirm={() => deleteQuota.mutate()}
        title="Delete sales quota?"
        description={quotaToDelete ? `This removes the ${quotaToDelete.period} quota for ${quotaToDelete.repName}.` : ''}
        confirmLabel="Delete quota"
        busy={deleteQuota.isPending}
        danger
      />}
    </div>
  );
}
