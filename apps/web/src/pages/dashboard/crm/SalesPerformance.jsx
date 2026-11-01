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
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatCompactTableMoney, formatMoney, formatPercent, moneyToMajor } from '../../../lib/format';
import { EMPTY } from '../../../lib/emptyText';
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

const REP_SPARK_COLORS = ['var(--color-chart-emerald)', 'var(--color-chart-blue-soft)', 'var(--color-chart-red)'];

// Avatar backgrounds cycle through the old page's three accent tints.
const AVATAR_STYLES = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700'];

const initials = (name) => {
  const parts = (name || '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const toMajor = (money) => (money == null ? 0 : moneyToMajor(money));

export default function SalesPerformance() {
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const [dealsPeriod, setDealsPeriod] = useState('MONTH');
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [topDealsPage, setTopDealsPage] = useState(1);
  const [repSort, setRepSort] = useState('PIPELINE');
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

  const month = new Date().getUTCMonth();
  const monthStart = new Date(Date.UTC(Number(year), month, 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(Number(year), month + 1, 1)).toISOString().slice(0, 10);
  const monthLabel = new Date(`${monthStart}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Search and value ranking happen on the full server-side set before each page is returned.
  const dealFilters = {
    page: topDealsPage,
    limit: showAllDeals ? 10 : 3,
    stage: 'CLOSED_WON',
    sort: 'VALUE_DESC',
    ...(search.trim() && { search: search.trim() }),
    ...(dealsPeriod === 'MONTH' && { closedFrom: monthStart, closedBefore: monthEnd }),
  };
  const { data: dealsData, isLoading: dealsLoading, isError: dealsError } = useQuery({
    queryKey: queryKeys.crm.deals.list(dealFilters),
    queryFn: () => crmApi.listDeals(dealFilters),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <h1 className="sr-only">Sales Performance</h1>
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        <h1 className="sr-only">Sales Performance</h1>
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
    { name: 'Won', value: Math.round(summary.overallWinRate), color: 'var(--color-chart-emerald)' },
    { name: 'Lost', value: Math.round(100 - summary.overallWinRate), color: 'var(--color-chart-negative)' },
  ];
  const weeklyActivity = data.weeklyActivity || [];
  const maxWeeklyActivity = Math.max(1, ...weeklyActivity.map(week => week.active + week.won + week.lost));

  const matchesSearch = (value) => !search.trim() || String(value || '').toLowerCase().includes(search.trim().toLowerCase());
  const filteredReps = (byRep || [])
    .filter(rep => matchesSearch(rep.ownerName || 'Unassigned'))
    .slice()
    .sort((a, b) => {
      if (repSort === 'REVENUE') return b.wonValue.amount - a.wonValue.amount;
      if (repSort === 'WIN_RATE') return (b.winRate ?? -1) - (a.winRate ?? -1);
      return b.openValue.amount - a.openValue.amount;
    });
  const topDeals = dealsData?.items || [];

  function downloadReport() {
    const rows = [
      ['Section', 'Period / Owner', 'Metric', 'Value'],
      ...monthlyClosedWon.map(row => ['Closed won', row.month, 'Count', row.count]),
      ...monthlyClosedWon.map(row => ['Closed won', row.month, 'Value', formatMoney(row.value)]),
      ...weeklyActivity.map(row => ['Weekly activity', row.week, 'Open / won / lost', `${row.active} / ${row.won} / ${row.lost}`]),
      ...byRep.map(rep => ['Representative', rep.ownerName || 'Unassigned', 'Won value', formatMoney(rep.wonValue)]),
      ...byRep.map(rep => ['Representative', rep.ownerName || 'Unassigned', 'Win rate', formatPercent(rep.winRate)]),
    ];
    downloadCsv(rows, 'sales-performance.csv');
  }

  const isActivityEmpty = weeklyActivity.every(w => (w.active + w.won + w.lost) === 0);

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">
      <h1 className="sr-only">Sales Performance</h1>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">

          {/* ── 1. Unified 2-Tier Apple-Glass Command Card ── */}
          <div className="bg-white/85 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-2.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] space-y-2 shrink-0">
            {/* Row 1 — Interactive Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Left Cluster: Search + Year select + Month select */}
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 max-[899px]:w-full">
                <SearchInput
                  placeholder="Search..."
                  value={search}
                  onChange={event => { setSearch(event.target.value); setTopDealsPage(1); }}
                  wrapperClassName="w-full sm:w-[240px] shrink-0"
                  className="h-9 pl-9 pr-3.5 rounded-xl text-xs sm:text-sm"
                />

                <Select value={String(year)} onValueChange={val => setYear(val)}>
                  <SelectTrigger
                    aria-label="Sales performance year"
                    className="flex items-center gap-2 h-9 w-[112px] min-w-[112px] px-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs text-slate-700 text-xs font-medium shrink-0 hover:bg-slate-50/50"
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

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setDealsPeriod(value => value === 'MONTH' ? 'ALL' : 'MONTH'); setShowAllDeals(false); setTopDealsPage(1); }}
                  className="flex items-center justify-between gap-2 h-9 min-w-[168px] px-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs text-slate-700 text-xs font-medium shrink-0 hover:bg-slate-50/50"
                >
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Calendar size={15} className="text-slate-400 shrink-0" />
                    <span className="whitespace-nowrap">{dealsPeriod === 'MONTH' ? monthLabel : 'All Dates'}</span>
                  </div>
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                </Button>
              </div>

              {/* Right Cluster: Export icon button + Download Report primary button */}
              <div className="flex items-center gap-2 shrink-0 max-[899px]:w-full max-[899px]:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={downloadReport}
                  aria-label="Download sales report"
                  className="w-9 h-9 min-w-[36px] bg-white border border-slate-200/80 rounded-xl shadow-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50/50 shrink-0 inline-flex items-center justify-center"
                  title="Download sales report"
                >
                  <Download size={15} />
                </Button>

                <Button
                  type="button"
                  onClick={downloadReport}
                  className="h-9 px-4 text-xs font-semibold text-white bg-surface-inverse-strong hover:bg-slate-800 rounded-xl shadow-xs shrink-0 inline-flex items-center justify-center whitespace-nowrap"
                >
                  Download Report
                </Button>
              </div>
            </div>

            {/* Row 2 — Docked Telemetry & Methodology Bar */}
            <div className="px-3 py-1 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-start sm:items-center gap-2.5">
              <Info size={16} className="text-slate-400 shrink-0 mt-3 sm:mt-0" />
              <p className="pt-3 pb-3 text-xs text-slate-500 leading-relaxed">
                Closed outcomes: {year} (UTC). Open pipeline: current snapshot. Weekly activity counts recorded stage moves, not calls or emails.{data.undatedClosedCount > 0 ? ` ${data.undatedClosedCount} legacy closed deals have no recorded actual close date and are excluded from dated metrics.` : ''}
              </p>
            </div>
          </div>

          {/* ── 2. Row 1: 3-Tier Apple-Glass KPI Cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">

            {/* Card 1: Team Quota Attainment */}
            <div className="relative overflow-hidden bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
              <div className="flex items-center justify-between gap-2 h-8">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 leading-none">Team Quota Attainment</p>
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
                  <Target size={16} />
                </div>
              </div>
              <div className="my-1 flex items-baseline">
                <p className="min-w-0 text-2xl font-bold tracking-tight text-slate-900 tabular-nums truncate">
                  {formatPercent(attainmentPct)}
                </p>
              </div>
              <div className="h-4 min-h-[16px] flex items-center">
                <Progress
                  value={attainmentWidth}
                  className="w-full h-[6px] rounded-full bg-slate-100"
                  indicatorClassName="bg-indigo-600"
                />
              </div>
            </div>

            {/* Card 2: Total Closed Won */}
            <div className="relative overflow-hidden bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
              {/* Background Subtle Sparkline */}
              <div className="absolute inset-x-0 bottom-0 h-6 pointer-events-none z-0 overflow-hidden opacity-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={closedSpark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="closedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-emerald)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--color-chart-emerald)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke="var(--color-chart-emerald)" strokeWidth={1.5} fill="url(#closedGrad)" dot={false} activeDot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="relative z-10 flex items-center justify-between gap-2 h-8">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 leading-none">Total Closed Won</p>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                  <TrendingUp size={16} />
                </div>
              </div>
              <div className="relative z-10 my-1 flex items-baseline">
                <p
                  className="min-w-0 text-2xl font-bold tracking-tight text-slate-900 tabular-nums truncate cursor-help"
                  title={formatMoney(data.yearWonTotal)}
                >
                  {formatMoney(data.yearWonTotal)}
                </p>
              </div>
              <div className="relative z-10 h-4 min-h-[16px] flex items-center pt-1.5 border-t border-slate-100">
                <p className="text-[11px] text-slate-500 truncate leading-tight">
                  {yearWonDeltaPct == null
                    ? `No ${Number(year) - 1} baseline`
                    : `${yearWonDeltaPct > 0 ? '+' : ''}${yearWonDeltaPct.toFixed(1)}% vs ${Number(year) - 1}`}
                </p>
              </div>
            </div>

            {/* Card 3: Avg Sales Cycle */}
            <div className="relative overflow-hidden bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[124px]">
              <div className="flex items-center justify-between gap-2 h-8">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 leading-none">Avg Sales Cycle</p>
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock size={16} />
                </div>
              </div>
              <div className="my-1 flex items-baseline justify-between gap-2">
                <p className="min-w-0 text-2xl font-bold tracking-tight text-slate-900 tabular-nums truncate">
                  {summary.averageSalesCycleDays == null ? EMPTY.data : `${Math.round(summary.averageSalesCycleDays)} Days`}
                </p>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200/60 px-2 py-0.5 text-[10px] font-bold tracking-wider leading-none shrink-0 whitespace-nowrap">
                  Closed won
                </Badge>
              </div>
              <div className="h-4 min-h-[16px] flex items-center pt-1.5 border-t border-slate-100">
                <p className="text-[11px] text-slate-500 truncate leading-tight">
                  {summary.averageSalesCycleDays == null ? 'Based on closed-won deals' : 'Average time to close'}
                </p>
              </div>
            </div>

          </div>

          {/* ── 3. Row 2: Rep Leaderboard (lg:col-span-8) & Activity Breakdown (lg:col-span-4) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

            {/* Left Card: Rep Leaderboard */}
            <div className="lg:col-span-8 bg-surface-raised border border-border-default rounded-2xl shadow-card overflow-hidden flex flex-col justify-between">
              <div className="px-5 py-3.5 border-b border-border-default flex items-center justify-between shrink-0">
                <h2 className="text-base font-bold text-heading">Rep Leaderboard</h2>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Sort rep leaderboard"
                      className="w-8 h-8 rounded-xl text-caption hover:text-body flex items-center justify-center shrink-0"
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

              <div className="flex-1 overflow-x-auto">
                <Table className="w-full table-fixed border-collapse">
                  <colgroup>
                    <col className="w-[48px]" style={{ width: '48px' }} />
                    <col className="min-w-[200px]" />
                    <col className="w-[96px]" style={{ width: '96px' }} />
                    <col className="w-[110px]" style={{ width: '110px' }} />
                    <col className="w-[140px]" style={{ width: '140px' }} />
                  </colgroup>
                  <TableHeader className="bg-transparent border-0">
                    <TableRow className="h-10 min-h-[40px] bg-slate-50/90 border-b border-border-default text-[11px] font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-50/90">
                      <TableHead className="h-10 px-3 text-start text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[48px]">Rank</TableHead>
                      <TableHead className="h-10 px-3 text-start text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">Rep</TableHead>
                      <TableHead className="h-10 px-3 text-end rtl:text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[96px]">Win Rate</TableHead>
                      <TableHead className="h-10 px-3 text-end rtl:text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[110px]">Revenue</TableHead>
                      <TableHead className="h-10 px-3 pe-4 text-end rtl:text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[140px]">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {filteredReps.length === 0 ? (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={5} className="px-3 py-10 text-center text-sm text-muted">
                          {search.trim()
                            ? 'No reps match this search. Clear it to see the full leaderboard.'
                            : 'No rep activity yet. Assign deals in Deals Pipeline to populate this leaderboard.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredReps.map((rep, idx) => {
                        const isZeroRevenue = !rep.wonValue?.amount || rep.wonValue.amount === 0;
                        const sparkColor = isZeroRevenue ? 'var(--color-chart-empty)' : REP_SPARK_COLORS[idx % REP_SPARK_COLORS.length];
                        const sparkFill = isZeroRevenue ? 'var(--color-chart-grid)' : REP_SPARK_COLORS[idx % REP_SPARK_COLORS.length];

                        return (
                          <TableRow key={rep.ownerEmployeeId || `unassigned-${idx}`} className="h-[52px] min-h-[52px] hover:bg-surface-muted/60 transition-colors border-0">
                            <TableCell className="h-[52px] px-3 align-middle w-[48px]">
                              <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center justify-center tabular-nums">
                                {idx + 1}
                              </span>
                            </TableCell>
                            <TableCell className="h-[52px] px-3 align-middle min-w-[200px]">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0 text-xs font-bold tracking-wider ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                                  {initials(rep.ownerName)}
                                </div>
                                <span className="text-xs sm:text-sm font-semibold text-heading truncate whitespace-nowrap leading-tight" title={rep.ownerName || 'Unassigned'}>
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
                                    <Area
                                      type="monotone"
                                      dataKey="v"
                                      stroke={sparkColor}
                                      strokeWidth={1.5}
                                      fill={sparkFill}
                                      fillOpacity={isZeroRevenue ? 0.3 : 0.15}
                                      dot={false}
                                      animationDuration={600}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Right Card: Activity Breakdown */}
            <div className="lg:col-span-4 bg-surface-raised border border-border-default rounded-2xl p-5 shadow-card flex flex-col justify-between">
              {/* Header with clean separation to prevent collision */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900 whitespace-nowrap">Activity Breakdown</h2>
                <div className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200/70 inline-flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 shrink-0">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" /> Open</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" aria-hidden="true" /> Won</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden="true" /> Lost</span>
                </div>
              </div>

              {/* Soft Recessed Glass Well for Chart */}
              <div className="flex-1 my-3 rounded-xl bg-slate-50/60 border border-slate-200/60 p-4 flex flex-col justify-between relative min-h-[220px]">
                {/* Horizontal dashed reference lines */}
                <div className="absolute top-1/4 inset-x-4 border-t border-dashed border-slate-200/80 z-0 pointer-events-none" />
                <div className="absolute top-2/4 inset-x-4 border-t border-dashed border-slate-200/80 z-0 pointer-events-none" />
                <div className="absolute top-3/4 inset-x-4 border-t border-dashed border-slate-200/80 z-0 pointer-events-none" />

                {isActivityEmpty ? (
                  <div className="flex-1 flex items-center justify-center relative z-10">
                    <span className="px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200/80 text-xs text-slate-400 font-medium shadow-2xs text-center">
                      No stage activity recorded in this period
                    </span>
                  </div>
                ) : (
                  <div className="flex-1 w-full flex items-end justify-around pb-2 relative z-10 min-h-[160px]">
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
                            className="w-full flex flex-col justify-end overflow-hidden rounded-t-[3px]"
                            style={{ height: `${totalPct}%` }}
                          >
                            <div className="w-full bg-primary" style={{ height: `${activePct}%` }} />
                            <div className="w-full bg-slate-300" style={{ height: `${wonPct}%` }} />
                            <div className="w-full bg-accent" style={{ height: `${lostPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* X-Axis Dates */}
                <div className="flex justify-around text-[11px] font-semibold text-slate-500 pt-3 border-t border-slate-200/60 uppercase tracking-wider shrink-0 tabular-nums relative z-10">
                  {(weeklyActivity.length > 0 ? weeklyActivity.map(w => w.week.slice(5)) : ['09-28', '10-05', '10-12', '10-19']).map((label, idx) => (
                    <span key={idx}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* ── 4. Row 3: Win/Loss Analysis (lg:col-span-8) & Top Deals (lg:col-span-4) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

            {/* Win/Loss Analysis */}
            <div className="lg:col-span-8 bg-surface-raised border border-border-default rounded-2xl p-5 shadow-card min-h-[200px] flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
                <h2 className="text-base font-bold text-heading">Win/Loss Analysis</h2>
              </div>

              {winLossData.length === 0 ? (
                <div className="flex-1 min-h-[110px] rounded-xl bg-slate-50/60 border border-dashed border-slate-200/80 p-5 flex items-center justify-center gap-4">
                  <div className="px-4 py-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs text-center min-w-[72px]">
                    <span className="block text-2xl font-bold text-heading tabular-nums leading-none">{closedTotal}</span>
                    <span className="block text-xs text-slate-500 font-medium mt-1">Deals</span>
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-500">No closed deals yet. Close a deal in Deals Pipeline to populate this analysis.</span>
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

            {/* Top Deals */}
            <div className="lg:col-span-4 bg-surface-raised border border-border-default rounded-2xl p-5 shadow-card min-h-[200px] flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
                <h2 className="text-base font-bold text-heading">
                  {dealsPeriod === 'MONTH' ? `Top Deals · ${monthLabel}` : 'Top Deals · All Dates'}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowAllDeals(current => !current); setTopDealsPage(1); }}
                  className="text-xs font-semibold text-accent hover:text-accent-hover h-7 px-2 cursor-pointer"
                >
                  {showAllDeals ? 'Show Top 3' : 'View All'}
                </Button>
              </div>

              {dealsLoading ? (
                <div className="py-8 text-sm text-muted text-center">Loading closed-won deals…</div>
              ) : dealsError ? (
                <div role="alert" className="py-8 text-sm text-danger text-center">Could not load top deals.</div>
              ) : topDeals.length === 0 ? (
                <div className="flex-1 min-h-[110px] rounded-xl bg-slate-50/60 border border-dashed border-slate-200/80 p-5 flex items-center justify-center text-center text-xs font-medium text-slate-500">
                  {search.trim()
                    ? 'No closed-won deals match this search. Clear it or choose another period.'
                    : dealsPeriod === 'MONTH'
                    ? 'No closed-won deals in this period. Choose All Dates or close a deal in Deals Pipeline.'
                    : 'No closed-won deals yet. Close a deal in Deals Pipeline to populate this list.'}
                </div>
              ) : (
                <div className="space-y-3 flex-1">
                  {topDeals.map((deal, idx) => (
                    <div key={deal.id} className="flex items-center justify-between p-3.5 border border-border-default rounded-button shadow-card hover:shadow-card-hover transition-shadow cursor-pointer bg-surface-raised">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 ${idx === 0 ? 'bg-primary text-white' : 'bg-surface-strong text-body-light'} rounded-xl flex items-center justify-center text-base font-bold shrink-0`}>
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
