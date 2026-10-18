import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
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
  Target,
  Trash2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import TopBarActions from '../../../components/TopBarActions';
import { moneyToMajor, formatCompactMoney, formatMoney } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
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
      <div className="flex h-full items-center justify-center bg-[#fafafa]">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-[#fafafa] text-red-500">
        Failed to load revenue forecast.
      </div>
    );
  }

  const { forecastByRep, quotas, monthlyPipeline, summary } = data;
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

  // Quota row per rep, joined by repName (the only rep identity forecastByRep carries).
  const availableYears = [...new Set([selectedYear, ...(data.availableYears || [])])].sort((a, b) => b.localeCompare(a))
  const formatCurrency = (num) => formatCompactMoney(num, currency)
  const formatExactCurrency = (num) => formatMoney(num, { currency })
  const visibleReps = forecastByRep.filter(rep => rep.repName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const displayedReps = showAllReps || search.trim() ? visibleReps : visibleReps.slice(0, 5)
  const exportCsv = () => {
    const rows = [
      ['Rep', 'Period', `Closed (${currency})`, `Commit (${currency})`, `Best Case (${currency})`, 'Quota attainment (%)'],
      ...visibleReps.map(rep => [rep.repName, rep.period, toMajor(rep.closed), toMajor(rep.commit), toMajor(rep.bestCase), rep.quotaPct]),
    ]
    downloadCsv(rows, `revenue-forecast-${new Date().toISOString().slice(0, 10)}.csv`)
  }
  const shareForecast = async () => {
    const text = `Revenue forecast: ${formatCurrency(committedTotal)} committed, ${formatCurrency(bestCaseTotal)} best case.`
    if (navigator.share) await navigator.share({ title: 'Revenue forecast', text })
    else await navigator.clipboard.writeText(text)
  }

  return (
    <div className="flex h-full flex-col bg-[#fafafa] overflow-hidden min-w-0">

      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search reps..."
              className="ps-9 pe-4 h-9 text-xs w-56 bg-white border-gray-200"
            />
          </div>

          <div className="h-6 w-px bg-gray-200 mx-1"></div>

          <Select value={String(selectedYear)} onValueChange={val => setSelectedYear(val)}>
            <SelectTrigger aria-label="Forecast calendar year" className="h-9 w-auto gap-2 bg-white text-gray-700 border-gray-200 text-sm font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={String(year)}>Year {year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={exportCsv}
            aria-label="Download forecast CSV"
            title="Download forecast CSV"
            className="h-8 w-8 text-gray-500 hover:text-gray-900"
          >
            <Download size={18} />
          </Button>
          {canManageQuotas && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openQuotaManager}
              className="h-9 px-3 text-sm font-medium bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Target size={14} className="mr-1.5" /> Manage Quotas
            </Button>
          )}

          <Button
            onClick={shareForecast}
            className="h-9 px-4 text-sm font-semibold shadow-sm"
          >
            <Share2 size={14} className="mr-1.5" />
            Share Forecast
          </Button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {summary.excludedQuotaCount > 0 && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <AlertDescription className="text-xs font-medium">
              {summary.excludedQuotaCount} quota row(s) with a nonannual period or unknown/foreign currency are excluded from annual base-currency totals.
            </AlertDescription>
          </Alert>
        )}

        {/* ── KPIs Grid ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

          {/* Closed Won */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[8.5rem] h-full">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Closed Won ({selectedYear})</p>
              <CheckCircle2 size={16} className="text-gray-400" />
            </div>
            <div className="mt-auto pt-2">
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{closedWon == null ? '—' : formatCurrency(wonMajor)}</p>
              <Progress
                value={wonPctToQuota == null ? 0 : Math.min(100, wonPctToQuota)}
                className="w-full bg-gray-200 h-1.5 mb-1.5"
                indicatorClassName="bg-[#10b981]"
              />
              <div className="flex justify-between items-center text-[10px] text-gray-500 font-medium">
                <span>{wonPctToQuota == null ? 'No quota set' : `${Math.round(wonPctToQuota)}% to Quota`}</span>
                <span>{quotaMajor === 0 ? 'No goal' : `${formatCurrency(quotaMajor)} Goal`}</span>
              </div>
            </div>
          </div>

          {/* Committed */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[8.5rem] h-full">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Committed</p>
              <Handshake size={16} className="text-[#3b82f6]" />
            </div>
            <div className="mt-auto pt-2">
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{committedTotal === 0 ? '—' : formatCurrency(committedTotal)}</p>
              <Badge className="bg-[#eff6ff] text-[#1d4ed8] border-transparent font-bold text-[10px] px-2.5 py-1">
                <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full mr-1.5 shrink-0" />
                High Confidence · {summary.dealCommitCount} {summary.dealCommitCount === 1 ? 'deal' : 'deals'}
              </Badge>
            </div>
          </div>

          {/* Best Case */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[8.5rem] h-full">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Best Case (Upside)</p>
              <TrendingUp size={16} className="text-[#eab308]" />
            </div>
            <div className="mt-auto pt-2">
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{bestCaseTotal === 0 ? '—' : formatCurrency(bestCaseTotal)}</p>
              <Badge className="bg-[#fefce8] text-[#a16207] border-transparent font-bold text-[10px] px-2.5 py-1">
                <div className="w-1.5 h-1.5 bg-[#eab308] rounded-full mr-1.5 shrink-0" />
                Medium Confidence · {summary.dealBestCaseCount} {summary.dealBestCaseCount === 1 ? 'deal' : 'deals'}
              </Badge>
            </div>
          </div>

          {/* Pipeline Coverage */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[8.5rem] h-full">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Pipeline Coverage</p>
              <Filter size={16} className="text-gray-400" />
            </div>
            <div className="mt-auto pt-2">
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{coverage == null ? '—' : `${coverage.toFixed(1)}x`}</p>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                <Info size={12} className="text-gray-400" />
                {coverage == null ? 'Set a quota to measure coverage' : 'Open pipeline ÷ quota'}
              </span>
              <span className="block text-[10px] text-gray-500 font-medium">
                Weighted pipeline: {formatCurrency(weightedTotal)}
                {summary.unweightedDealCount > 0 && ` · ${summary.unweightedDealCount} deal(s), ${formatCurrency(toMajor(summary.unweightedPipeline))}, excluded (missing/invalid probability)`}
              </span>
            </div>
          </div>

        </div>

        {/* ── Main Chart: Closed Won and Open Pipeline ── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col w-full overflow-x-auto">

          {/* Chart Header & Legend */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900">Revenue by Close Month</h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-gray-600">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#0f172a]"></div> Closed Won</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#a5b4fc]"></div> Commit</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#e5e7eb]"></div> Other Open</div>
            </div>
          </div>

          {/* Closed won, committed, and remaining open deals grouped by close month. */}
          <div className="w-full h-[360px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 500 }} tickFormatter={(v) => formatCompactMoney(v, summary.totalQuota?.currency || 'USD')} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 13 }}
                  formatter={(value, name) => {
                    if (value === 0) return [null, name === 'closed' ? 'Closed' : name === 'commit' ? 'Commit' : 'Pipeline'];
                    const label = name === 'closed' ? 'Closed' : name === 'commit' ? 'Commit' : 'Pipeline'
                    return [formatCompactMoney(value, summary.totalQuota?.currency || 'USD'), label]
                  }}
                  labelStyle={{ fontWeight: 600, color: '#111827' }}
                />
                <Bar dataKey="closed" stackId="a" fill="#0f172a" radius={[0, 0, 0, 0]} animationDuration={1000} />
                <Bar dataKey="commit" stackId="a" fill="#a5b4fc" radius={[0, 0, 0, 0]} animationDuration={1000} />
                <Bar dataKey="pipeline" stackId="a" fill="#e5e7eb" radius={[4, 4, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
            {chartData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                No open deals with a close date yet.
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom Row ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* Forecast by Rep Table — real ForecastSnapshot rows */}
          <div className="col-span-1 xl:col-span-8 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-x-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Forecast by Rep</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllReps(value => !value)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 h-7 px-2"
              >
                {showAllReps ? 'Show Top 5' : `View All (${visibleReps.length})`}
              </Button>
            </div>
            <Table className="w-full min-w-[650px] text-left border-collapse">
              <TableHeader className="bg-white border-0">
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className="px-6 py-3 h-auto text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 rtl:text-left">Rep</TableHead>
                  <TableHead className="px-6 py-3 h-auto text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right">Closed</TableHead>
                  <TableHead className="px-6 py-3 h-auto text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right">Commit</TableHead>
                  <TableHead className="px-6 py-3 h-auto text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right">Best Case</TableHead>
                  <TableHead className="px-6 py-3 h-auto text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right w-32">To Quota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100">
                {displayedReps.length === 0 ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                      No forecast snapshots recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedReps.map((rep) => {
                    const quotaRow = quotas.find(q => q.repName === rep.repName && q.period === rep.period && q.quota?.currency === currency);
                    const quotaVal = quotaRow ? toMajor(quotaRow.quota) : null;
                    const repQuotaPct = rep.quotaPct != null ? rep.quotaPct : (quotaVal && toMajor(rep.closed) > 0 ? Math.min(100, (toMajor(rep.closed) / quotaVal) * 100) : null);
                    return (
                      <TableRow key={rep.id} className="hover:bg-gray-50 border-0">
                        <TableCell className="px-6 py-4 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200">
                            <span className="text-[10px] font-bold text-gray-500">
                              {rep.repName.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{rep.repName}</span>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right text-sm font-bold text-gray-900 tabular-nums" title={formatExactCurrency(toMajor(rep.closed))}>{formatCurrency(toMajor(rep.closed))}</TableCell>
                        <TableCell className="px-6 py-4 text-right text-sm text-gray-600 font-medium tabular-nums" title={formatExactCurrency(toMajor(rep.commit))}>{formatCurrency(toMajor(rep.commit))}</TableCell>
                        <TableCell className="px-6 py-4 text-right text-sm text-gray-600 font-medium tabular-nums" title={formatExactCurrency(toMajor(rep.bestCase))}>{formatCurrency(toMajor(rep.bestCase))}</TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Progress
                              value={repQuotaPct == null ? 0 : Math.min(100, repQuotaPct)}
                              className="w-12 bg-gray-200 h-1.5"
                              indicatorClassName={repQuotaPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}
                            />
                            <span className="text-xs font-semibold text-gray-600 w-8 text-right">{repQuotaPct == null ? '—' : `${Math.round(repQuotaPct)}%`}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Alerts & Shortfall */}
          <div className="col-span-1 xl:col-span-4 flex flex-col gap-4">

            {expectedShortfall > 0 && (
              <Alert className="border-[#fde047] bg-[#fef9c3] text-[#854d0e] flex items-center gap-3 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-[#a16207] shrink-0" />
                <AlertDescription className="text-sm font-bold">
                  Pipeline is below quota by {formatCurrency(expectedShortfall)}.
                </AlertDescription>
              </Alert>
            )}

            {/* Expected Shortfall Card — real: quota − closed-won */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex-1 flex flex-col justify-center relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 relative z-10">
                <TrendingDown size={16} className="text-gray-400" />
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Expected Shortfall</h3>
              </div>
              <div className="flex items-baseline gap-2 relative z-10">
                <p className="text-5xl font-black text-[#dc2626] tracking-tight tabular-nums">{expectedShortfall == null ? '—' : formatCurrency(expectedShortfall)}</p>
                <span className="text-xs font-semibold text-gray-500 mb-1">vs Quota</span>
              </div>

              {/* Subtle background decoration to match image flair */}
              <div className="absolute -bottom-4 -left-4 opacity-10">
                 <TrendingDown size={100} className="text-[#dc2626]" />
              </div>
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
