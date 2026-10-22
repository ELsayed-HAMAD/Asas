import React, { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Download,
  Target,
  TrendingUp,
  Clock,
  MoreHorizontal,
  Loader2,
  Info
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell, Tooltip
} from 'recharts'
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatCompactTableMoney, formatMoney, formatPercent, moneyToMajor } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import { Button } from '../../../components/ui/button';
import SearchInput from '../../../components/common/SearchInput';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../../../components/ui/dropdown-menu';
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

const REP_SPARK_COLORS = ['#10b981', '#3b82f6', '#ef4444']

// Avatar backgrounds cycle through the old page's three accent tints.
const AVATAR_STYLES = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700']

const initials = (name) => {
  const parts = (name || '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const toMajor = (money) => (money == null ? 0 : moneyToMajor(money));

export default function SalesPerformance() {
  const [search, setSearch] = useState('')
  const [year, setYear] = useState(String(new Date().getUTCFullYear()))
  const [dealsPeriod, setDealsPeriod] = useState('MONTH')
  const [showAllDeals, setShowAllDeals] = useState(false)
  const [topDealsPage, setTopDealsPage] = useState(1)
  const [repSort, setRepSort] = useState('PIPELINE')
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.salesPerformance(year),
    queryFn: () => crmApi.getSalesPerformance(year),
  });

  // Team quota attainment has no source in /crm/sales-performance; the real
  // aggregate lives in /crm/forecast's summary.
  const { data: forecast } = useQuery({
    queryKey: queryKeys.crm.forecast(year),
    queryFn: () => crmApi.getForecast(year),
  });

  const month = new Date().getUTCMonth()
  const monthStart = new Date(Date.UTC(Number(year), month, 1)).toISOString().slice(0, 10)
  const monthEnd = new Date(Date.UTC(Number(year), month + 1, 1)).toISOString().slice(0, 10)
  const monthLabel = new Date(`${monthStart}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  // Search and value ranking happen on the full server-side set before each page is returned.
  const dealFilters = {
    page: topDealsPage,
    limit: showAllDeals ? 10 : 3,
    stage: 'CLOSED_WON',
    sort: 'VALUE_DESC',
    ...(search.trim() && { search: search.trim() }),
    ...(dealsPeriod === 'MONTH' && { closedFrom: monthStart, closedBefore: monthEnd }),
  }
  const { data: dealsData, isLoading: dealsLoading, isError: dealsError } = useQuery({
    queryKey: queryKeys.crm.deals.list(dealFilters),
    queryFn: () => crmApi.listDeals(dealFilters),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        Failed to load sales performance.
      </div>
    );
  }

  const { monthlyClosedWon, byRep, summary } = data;

  const closedSpark = (monthlyClosedWon || []).map((row) => ({ v: toMajor(row.value) }));

  // Team quota attainment = closed-won ÷ stored quota (both server aggregates;
  // forecast.summary.quotaAttainmentPct is pipeline ÷ quota, i.e. coverage — not attainment).
  const quotaMajor = toMajor(forecast?.summary?.totalQuota);
  const attainmentPct = quotaMajor > 0 ? (toMajor(data.yearWonTotal) / quotaMajor) * 100 : null;
  const attainmentWidth = attainmentPct == null ? 0 : Math.min(100, attainmentPct);
  const previousYearWonMajor = toMajor(data.previousYearWonTotal);
  const yearWonMajor = toMajor(data.yearWonTotal);
  const yearWonDeltaPct = previousYearWonMajor > 0 ? ((yearWonMajor - previousYearWonMajor) / previousYearWonMajor) * 100 : null;

  const closedTotal = summary.totalWonCount + summary.totalLostCount;
  const winLossData = summary.overallWinRate == null ? [] : [
    { name: 'Won', value: Math.round(summary.overallWinRate), color: '#10b981' },
    { name: 'Lost', value: Math.round(100 - summary.overallWinRate), color: '#f87171' },
  ];
  const weeklyActivity = data.weeklyActivity || []
  const maxWeeklyActivity = Math.max(1, ...weeklyActivity.map(week => week.active + week.won + week.lost))

  const matchesSearch = (value) => !search.trim() || String(value || '').toLowerCase().includes(search.trim().toLowerCase())
  const filteredReps = (byRep || [])
    .filter(rep => matchesSearch(rep.ownerName || 'Unassigned'))
    .slice()
    .sort((a, b) => {
      if (repSort === 'REVENUE') return b.wonValue.amount - a.wonValue.amount
      if (repSort === 'WIN_RATE') return (b.winRate ?? -1) - (a.winRate ?? -1)
      return b.openValue.amount - a.openValue.amount
    })
  const topDeals = dealsData?.items || []

  function downloadReport() {
    const rows = [
      ['Section', 'Period / Owner', 'Metric', 'Value'],
      ...monthlyClosedWon.map(row => ['Closed won', row.month, 'Count', row.count]),
      ...monthlyClosedWon.map(row => ['Closed won', row.month, 'Value', formatMoney(row.value)]),
      ...weeklyActivity.map(row => ['Weekly activity', row.week, 'Open / won / lost', `${row.active} / ${row.won} / ${row.lost}`]),
      ...byRep.map(rep => ['Representative', rep.ownerName || 'Unassigned', 'Won value', formatMoney(rep.wonValue)]),
      ...byRep.map(rep => ['Representative', rep.ownerName || 'Unassigned', 'Win rate', formatPercent(rep.winRate)]),
    ]
    downloadCsv(rows, 'sales-performance.csv')
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">

          {/* ── Filter Bar Controls ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Left group: search, year, month */}
            <div className="flex items-center gap-3 shrink-0 max-[899px]:w-full max-[899px]:flex-wrap">
              {/* Search input */}
              <SearchInput
                placeholder="Search..."
                value={search}
                onChange={event => { setSearch(event.target.value); setTopDealsPage(1); }}
                wrapperClassName="w-[240px] shrink-0"
              />

              {/* Year select */}
              <Select value={String(year)} onValueChange={val => setYear(val)}>
                <SelectTrigger
                  aria-label="Sales performance year"
                  className="flex items-center gap-2 h-9 w-[112px] min-w-[112px] px-3 bg-white border border-slate-200/80 rounded-xl shadow-xs text-slate-700 text-sm font-medium shrink-0 hover:bg-slate-50/50"
                >
                  <Calendar size={15} className="text-slate-400 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([year, String(new Date().getUTCFullYear()), ...(forecast?.availableYears || []), ...Array.from({ length: 5 }, (_, index) => String(new Date().getUTCFullYear() - index))])].sort().reverse().map(value => (
                    <SelectItem key={value} value={String(value)} className="text-xs">{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Month select */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setDealsPeriod(value => value === 'MONTH' ? 'ALL' : 'MONTH'); setShowAllDeals(false); setTopDealsPage(1); }}
                className="flex items-center justify-between gap-2.5 h-9 min-w-[168px] px-3 bg-white border border-slate-200/80 rounded-xl shadow-xs text-slate-700 text-sm font-medium shrink-0 hover:bg-slate-50/50"
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Calendar size={15} className="text-slate-400 shrink-0" />
                  <span className="whitespace-nowrap">{dealsPeriod === 'MONTH' ? monthLabel : 'All Dates'}</span>
                </div>
                <ChevronDown size={14} className="text-slate-400 shrink-0" />
              </Button>
            </div>

            {/* Right group: download icon button + Download Report button */}
            <div className="flex items-center gap-3 shrink-0 max-[899px]:w-full max-[899px]:justify-end">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={downloadReport}
                aria-label="Download sales report"
                className="w-9 h-9 min-w-[36px] bg-white border border-slate-200/80 rounded-xl shadow-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50/50 shrink-0"
                title="Download sales report"
              >
                <Download size={16} />
              </Button>

              <Button
                type="button"
                onClick={downloadReport}
                className="h-9 px-4 text-sm font-semibold text-white bg-[#0f172a] hover:bg-slate-800 rounded-xl shadow-xs whitespace-nowrap"
              >
                Download Report
              </Button>
            </div>
          </div>

          {/* ── Info / Disclaimer Card ── */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs px-4 py-1 flex items-start sm:items-center gap-3">
            <Info size={18} className="text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
            <p className="pt-3 pb-3 text-xs text-slate-500 leading-relaxed">
              Closed outcomes: {year} (UTC). Open pipeline: current snapshot. Weekly activity counts recorded stage moves, not calls or emails.{data.undatedClosedCount > 0 ? ` ${data.undatedClosedCount} legacy closed deals have no recorded actual close date and are excluded from dated metrics.` : ''}
            </p>
          </div>

          {/* ── 4) KPIs Row (3 equal cards, grid 3 columns, gap 16px, equal height 104px) ── */}
          <div className="grid grid-cols-1 min-[1100px]:grid-cols-3 gap-4 items-stretch">

          {/* Team Quota Attainment */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[104px] flex flex-col justify-between">
            <div className="flex items-center justify-between min-h-[16px]">
              <p className="text-xs font-bold text-muted uppercase tracking-wider leading-none">Team Quota Attainment</p>
              <Target size={16} className="text-caption shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline">
              <p className="min-w-0 text-2xl font-bold text-heading tracking-tight leading-tight tabular-nums truncate">
                {formatPercent(attainmentPct)}
              </p>
            </div>
            <div className="mt-1 h-4 min-h-[16px] flex items-center">
              <Progress
                value={attainmentWidth}
                className="w-full h-[6px] bg-surface-strong"
                indicatorClassName="bg-accent"
              />
            </div>
          </div>

          {/* Total Closed Won */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[104px] flex flex-col justify-between relative overflow-hidden">
            {/* Background sparkline */}
            <div className="absolute inset-inline-0 bottom-0 h-6 pointer-events-none z-0 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={closedSpark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="closedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5} fill="url(#closedGrad)" dot={false} animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Foreground 3-row content */}
            <div className="flex items-center justify-between min-h-[16px] relative z-10 pointer-events-none">
              <p className="text-xs font-bold text-muted uppercase tracking-wider leading-none">Total Closed Won</p>
              <TrendingUp size={16} className="text-success-dot shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline relative z-10 pointer-events-none">
              <p className="min-w-0 text-2xl font-bold text-heading tracking-tight leading-tight tabular-nums truncate pointer-events-auto">
                {formatMoney(data.yearWonTotal)}
              </p>
            </div>
            <div className="mt-1 h-4 min-h-[16px] flex items-center relative z-10 pointer-events-none">
              <p className="text-xs text-muted truncate leading-tight pointer-events-auto">
                {yearWonDeltaPct == null
                  ? `No ${Number(year) - 1} baseline`
                  : `${yearWonDeltaPct > 0 ? '+' : ''}${yearWonDeltaPct.toFixed(1)}% vs ${Number(year) - 1}`}
              </p>
            </div>
          </div>

          {/* Avg Sales Cycle */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[104px] flex flex-col justify-between">
            <div className="flex items-center justify-between min-h-[16px]">
              <p className="text-xs font-bold text-muted uppercase tracking-wider leading-none">Avg Sales Cycle</p>
              <Clock size={16} className="text-caption shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="min-w-0 text-2xl font-bold text-heading tracking-tight leading-tight tabular-nums truncate">
                {summary.averageSalesCycleDays == null ? '—' : `${Math.round(summary.averageSalesCycleDays)} Days`}
              </p>
              <Badge variant="outline" className="bg-success-light text-success-text border-border-default/40 px-2 py-0.5 text-[10px] font-bold tracking-wider leading-none shrink-0 whitespace-nowrap">
                Closed won
              </Badge>
            </div>
            <div className="mt-1 h-4 min-h-[16px] flex items-center select-none invisible" aria-hidden="true">
              &nbsp;
            </div>
          </div>

        </div>

        {/* ── 5) Middle Row (grid 3fr 2fr, gap 16px, align-items: stretch) ── */}
        <div className="grid grid-cols-1 min-[1100px]:grid-cols-[3fr_2fr] gap-4 items-stretch">

          {/* Rep Leaderboard */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col">
            <div className="h-10 min-h-[40px] flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-heading">Rep Leaderboard</h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Sort rep leaderboard"
                    className="h-8 w-8 text-caption hover:text-body"
                  >
                    <MoreHorizontal size={18} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup value={repSort} onValueChange={setRepSort}>
                    <DropdownMenuRadioItem value="PIPELINE">Highest pipeline</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="REVENUE">Highest revenue</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="WIN_RATE">Highest win rate</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[48px]" style={{ width: '48px' }} />
                <col className="min-w-[200px]" />
                <col className="w-[96px]" style={{ width: '96px' }} />
                <col className="w-[110px]" style={{ width: '110px' }} />
                <col className="w-[140px]" style={{ width: '140px' }} />
              </colgroup>
              <TableHeader className="bg-transparent border-0">
                <TableRow className="h-10 min-h-[40px] bg-surface-muted/90 border-b border-border-default text-[11px] font-semibold text-muted uppercase tracking-[0.06em] hover:bg-surface-muted/90">
                  <TableHead className="h-10 px-3 text-start text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap w-[48px]">Rank</TableHead>
                  <TableHead className="h-10 px-3 text-start text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap min-w-[200px]">Rep</TableHead>
                  <TableHead className="h-10 px-3 text-end rtl:text-left text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap w-[96px]">Win Rate</TableHead>
                  <TableHead className="h-10 px-3 text-end rtl:text-left text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap w-[110px]">Revenue</TableHead>
                  <TableHead className="h-10 px-3 pe-4 text-end rtl:text-left text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap w-[140px]">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border-subtle">
                {filteredReps.length === 0 ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell colSpan={5} className="px-3 py-10 text-center text-sm text-muted">
                      No rep data yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReps.map((rep, idx) => (
                    <TableRow key={rep.ownerEmployeeId || `unassigned-${idx}`} className="h-[52px] min-h-[52px] hover:bg-surface-muted/60 transition-colors border-0">
                      <TableCell className="h-[52px] px-3 text-sm text-body-light font-semibold align-middle w-[48px]">{idx + 1}</TableCell>
                      <TableCell className="h-[52px] px-3 align-middle min-w-[200px]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0 text-xs font-bold tracking-wider ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                            {initials(rep.ownerName)}
                          </div>
                          <span className="text-sm font-medium text-heading truncate whitespace-nowrap leading-tight" title={rep.ownerName || 'Unassigned'}>
                            {rep.ownerName || 'Unassigned'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="h-[52px] px-3 text-end text-sm text-body-light font-medium tabular-nums align-middle w-[96px]">
                        {formatPercent(rep.winRate)}
                      </TableCell>
                      <TableCell className="h-[52px] px-3 text-end text-sm font-semibold text-heading tabular-nums align-middle w-[110px]" title={formatMoney(rep.wonValue)}>
                        {formatCompactTableMoney(rep.wonValue)}
                      </TableCell>
                      <TableCell className="h-[52px] px-3 pe-4 text-end align-middle w-[140px]">
                        <div className="w-full h-6 flex items-center justify-end">
                          <ResponsiveContainer width="100%" height={24}>
                            <AreaChart data={(rep.weeklyActivity || []).map(week => ({ v: week.active + week.won + week.lost }))} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                              <Area type="monotone" dataKey="v" stroke={REP_SPARK_COLORS[idx % REP_SPARK_COLORS.length]} strokeWidth={1.5} fill={REP_SPARK_COLORS[idx % REP_SPARK_COLORS.length]} fillOpacity={0.15} dot={false} animationDuration={600} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Activity Breakdown */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col">
            <div className="h-10 min-h-[40px] flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-heading">Activity Breakdown</h2>
              <div className="flex items-center gap-3 text-xs text-muted font-medium uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" /> Open</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" aria-hidden="true" /> Won</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden="true" /> Lost</span>
              </div>
            </div>

            <div className="flex-1 min-h-[240px] flex flex-col justify-end">
              {weeklyActivity.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted">
                  No recent deal activity is available yet.
                </div>
              ) : (
                <div className="flex-1 min-h-[200px] w-full flex items-end justify-around border-b border-border-subtle pb-2 relative">
                  {/* Horizontal Grid lines */}
                  <div className="absolute top-1/4 inset-inline-0 border-t border-border-subtle z-0 pointer-events-none" />
                  <div className="absolute top-2/4 inset-inline-0 border-t border-border-subtle z-0 pointer-events-none" />
                  <div className="absolute top-3/4 inset-inline-0 border-t border-border-subtle z-0 pointer-events-none" />

                  {weeklyActivity.map(week => {
                    const total = week.active + week.won + week.lost;
                    const totalPct = maxWeeklyActivity > 0 ? (total / maxWeeklyActivity) * 100 : 0;
                    const activePct = total > 0 ? (week.active / total) * 100 : 0;
                    const wonPct = total > 0 ? (week.won / total) * 100 : 0;
                    const lostPct = total > 0 ? (week.lost / total) * 100 : 0;

                    return (
                      <div
                        key={week.week}
                        className="flex flex-col justify-end w-10 relative z-10 h-full"
                        title={`${total} deal updates`}
                      >
                        <div
                          className="w-full flex flex-col justify-end overflow-hidden rounded-t-[2px]"
                          style={{ height: `${totalPct}%` }}
                        >
                          <div className="w-full bg-primary" style={{ height: `${activePct}%` }} />
                          <div className="w-full bg-gray-300" style={{ height: `${wonPct}%` }} />
                          <div className="w-full bg-accent" style={{ height: `${lostPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-around text-xs font-semibold text-muted pt-3 uppercase tracking-wider shrink-0">
                {weeklyActivity.map(week => (
                  <span key={week.week}>{week.week.slice(5)}</span>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* ── 6) Bottom Row (grid 3fr 2fr, gap 16px, items-start, min-height 200px) ── */}
        <div className="grid grid-cols-1 min-[1100px]:grid-cols-[3fr_2fr] gap-4 items-start">

          {/* Win/Loss Analysis */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[200px] flex flex-col">
            <div className="h-10 min-h-[40px] flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-heading">Win/Loss Analysis</h2>
            </div>

            {winLossData.length === 0 ? (
              <div className="flex items-center gap-4 py-4">
                <div className="flex flex-col items-center justify-center min-w-[72px]">
                  <span className="text-2xl font-bold text-heading tabular-nums">{closedTotal}</span>
                  <span className="text-xs text-muted font-medium">Deals</span>
                </div>
                <span className="text-sm text-muted">No closed deals yet.</span>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-12 py-2">
                {/* Recharts Donut Chart */}
                <div className="relative w-40 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={winLossData}
                        cx="50%" cy="50%"
                        innerRadius={48} outerRadius={68}
                        paddingAngle={3}
                        dataKey="value"
                        animationDuration={1000}
                        stroke="none"
                      >
                        {winLossData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                        formatter={(value, name) => [`${value}%`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-heading tabular-nums">{closedTotal}</span>
                    <span className="text-xs font-semibold text-muted mt-0.5">Deals</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-col gap-3">
                  {winLossData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between w-28">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-sm font-semibold text-body-light">{item.name}</span>
                      </div>
                      <span className="text-sm font-bold text-heading tabular-nums">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top Deals This Month */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card min-h-[200px] flex flex-col">
            <div className="h-10 min-h-[40px] flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-heading">
                {dealsPeriod === 'MONTH' ? `Top Deals · ${monthLabel}` : 'Top Deals · All Dates'}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowAllDeals(current => !current); setTopDealsPage(1); }}
                className="text-[13px] font-semibold text-accent hover:text-accent-hover h-7 px-2"
              >
                {showAllDeals ? 'Show Top 3' : 'View All'}
              </Button>
            </div>

            {dealsLoading ? (
              <div className="py-4 text-sm text-muted">Loading closed-won deals…</div>
            ) : dealsError ? (
              <div role="alert" className="py-4 text-sm text-danger">Could not load top deals.</div>
            ) : topDeals.length === 0 ? (
              <div className="py-4 text-sm text-muted">No closed-won deals match this search and period.</div>
            ) : (
              <div className="space-y-3">
                {topDeals.map((deal, idx) => (
                  <div key={deal.id} className="flex items-center justify-between p-3.5 border border-border-default rounded-button shadow-card hover:shadow-card-hover transition-shadow cursor-pointer bg-surface-raised">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 ${idx === 0 ? 'bg-primary text-white' : 'bg-surface-strong text-body-light'} rounded flex items-center justify-center text-base font-bold shrink-0`}>
                        {(deal.company || deal.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-heading leading-tight truncate">{deal.name}</h3>
                        <p className="text-xs font-medium text-muted mt-0.5 truncate">{deal.productLine || deal.company || 'General'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ms-2">
                      <span className="text-sm font-bold text-heading tabular-nums">{formatMoney(deal.value)}</span>
                      <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold tracking-wider ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                        {initials(deal.owner?.name)}
                      </div>
                    </div>
                  </div>
                ))}
                {showAllDeals && dealsData?.pagination && (
                  <div className="flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-muted">
                    <span>Showing {dealsData.pagination.total === 0 ? 0 : (topDealsPage - 1) * dealsData.pagination.limit + 1}–{Math.min(topDealsPage * dealsData.pagination.limit, dealsData.pagination.total)} of {dealsData.pagination.total}</span>
                    {dealsData.pagination.pages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={topDealsPage <= 1}
                          onClick={() => setTopDealsPage(page => page - 1)}
                          className="h-6 px-2 text-xs"
                        >
                          Previous
                        </Button>
                        <span>Page {topDealsPage} of {dealsData.pagination.pages}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={topDealsPage >= dealsData.pagination.pages}
                          onClick={() => setTopDealsPage(page => page + 1)}
                          className="h-6 px-2 text-xs"
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  </div>
);
}
