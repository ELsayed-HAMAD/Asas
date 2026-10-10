import React, { useState } from 'react';
import {
  Search,
  Calendar,
  ChevronDown,
  Download,
  Target,
  TrendingUp,
  Clock,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell, Tooltip
} from 'recharts'
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatPercent, moneyToMajor } from '../../../lib/format';
import { downloadCsv } from '../../../lib/csv';
import TopBarActions from '../../../components/TopBarActions';

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
  const [repMenuOpen, setRepMenuOpen] = useState(false)
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
      <div className="flex h-full items-center justify-center bg-surface">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger">
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
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={event => { setSearch(event.target.value); setTopDealsPage(1) }}
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-56 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <label className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium">
            <Calendar size={14} className="text-muted" />
            <select aria-label="Sales performance year" value={year} onChange={event => setYear(event.target.value)} className="bg-transparent outline-none">
              {[...new Set([year, String(new Date().getUTCFullYear()), ...(forecast?.availableYears || []), ...Array.from({ length: 5 }, (_, index) => String(new Date().getUTCFullYear() - index))])].sort().reverse().map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <button onClick={() => { setDealsPeriod(value => value === 'MONTH' ? 'ALL' : 'MONTH'); setShowAllDeals(false); setTopDealsPage(1) }} className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Calendar size={14} className="text-muted" />
            {dealsPeriod === 'MONTH' ? monthLabel : 'All Dates'}
            <ChevronDown size={14} className="text-caption" />
          </button>

          <button onClick={downloadReport} className="p-1.5 text-muted hover:text-heading transition-colors" aria-label="Download sales report">
            <Download size={18} />
          </button>

          <button onClick={downloadReport} className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Download Report
          </button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        <p className="text-xs text-muted">Closed outcomes: {year} (UTC). Open pipeline: current snapshot. Weekly activity counts recorded stage moves, not calls or emails.{data.undatedClosedCount > 0 ? ` ${data.undatedClosedCount} legacy closed deals have no recorded actual close date and are excluded from dated metrics.` : ''}</p>

        {/* ── KPIs Grid ── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Team Quota Attainment */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Team Quota Attainment</p>
              <Target size={16} className="text-caption" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-heading tracking-tight mb-2">{formatPercent(attainmentPct)}</p>
              <div className="w-full bg-surface-strong rounded-full h-2 overflow-hidden">
                <div className="bg-accent h-full rounded-full" style={{ width: `${attainmentWidth}%` }}></div>
              </div>
            </div>
          </div>

          {/* Total Closed Won */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Total Closed Won</p>
              <TrendingUp size={16} className="text-success-dot" />
            </div>
              <div className="relative z-10">
                <p className="text-3xl font-extrabold text-heading tracking-tight">{formatMoney(data.yearWonTotal)}</p>
                <p className="text-[10px] font-semibold text-muted mt-1">
                  {yearWonDeltaPct == null
                    ? `No ${Number(year) - 1} baseline`
                    : `${yearWonDeltaPct > 0 ? '+' : ''}${yearWonDeltaPct.toFixed(1)}% vs ${Number(year) - 1}`}
                </p>
              </div>
            {/* Sparkline Area Chart — real closed-won value by month */}
            <div className="absolute bottom-0 left-0 w-full h-14">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={closedSpark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="closedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5} fill="url(#closedGrad)" dot={false} animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Average time from deal creation to last update for closed-won deals. */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Avg Sales Cycle</p>
              <Clock size={16} className="text-caption" />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-extrabold text-heading tracking-tight">{summary.averageSalesCycleDays == null ? '—' : `${Math.round(summary.averageSalesCycleDays)} Days`}</p>
              <span className="bg-success-light text-success-text px-2 py-0.5 rounded text-[10px] font-bold tracking-wider mt-1.5">
                Closed won
              </span>
            </div>
          </div>

        </div>

        {/* ── Middle Row ── */}
        <div className="grid grid-cols-12 gap-4">

          {/* Rep Leaderboard */}
          <div className="col-span-7 bg-surface-raised border border-border-default rounded-card-sm shadow-card flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
              <h2 className="text-lg font-bold text-heading">Rep Leaderboard</h2>
              <div className="relative">
                <button type="button" aria-label="Sort rep leaderboard" aria-expanded={repMenuOpen} onClick={() => setRepMenuOpen(open => !open)} className="text-caption hover:text-body transition-colors">
                  <MoreHorizontal size={20} />
                </button>
                {repMenuOpen && <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-input border border-border-default bg-surface-raised p-1 shadow-card">
                  {[
                    ['PIPELINE', 'Highest pipeline'],
                    ['REVENUE', 'Highest revenue'],
                    ['WIN_RATE', 'Highest win rate'],
                  ].map(([value, label]) => <button key={value} type="button" role="menuitemradio" aria-checked={repSort === value} onClick={() => { setRepSort(value); setRepMenuOpen(false) }} className="block w-full rounded px-3 py-2 text-left text-xs font-medium text-body hover:bg-surface-muted">{label}</button>)}
                </div>}
              </div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default w-16">Rank</th>
                  <th className="px-2 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Rep</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-right">Win Rate</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-right">Revenue</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-right w-24">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredReps.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted">
                      No rep data yet.
                    </td>
                  </tr>
                ) : (
                  filteredReps.map((rep, idx) => (
                    <tr key={rep.ownerEmployeeId || `unassigned-${idx}`} className="hover:bg-surface-muted">
                      <td className="px-6 py-4 text-sm text-body-light font-semibold">{idx + 1}</td>
                      <td className="px-2 py-4 flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-bold tracking-wider ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                          {initials(rep.ownerName)}
                        </div>
                        <span className="text-sm font-semibold text-heading">{rep.ownerName || 'Unassigned'}</span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-body-light font-semibold">{formatPercent(rep.winRate)}</td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-heading tabular-nums">{formatMoney(rep.wonValue)}</td>
                      <td className="px-6 py-4 text-right">
                        {/* Recent weekly deal updates for this representative, aggregated server-side. */}
                        <div className="w-10 h-5 inline-block">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={(rep.weeklyActivity || []).map(week => ({ v: week.active + week.won + week.lost }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                              <Area type="monotone" dataKey="v" stroke={REP_SPARK_COLORS[idx % REP_SPARK_COLORS.length]} strokeWidth={1.5} fill={REP_SPARK_COLORS[idx % REP_SPARK_COLORS.length]} fillOpacity={0.15} dot={false} animationDuration={600} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Activity Breakdown — weekly counts come from tenant-scoped SQL aggregates. */}
          <div className="col-span-5 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-heading">Activity Breakdown</h2>
              <div className="flex items-center gap-3 text-[10px] text-muted font-medium uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary"></div> Open</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-300"></div> Won</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-accent"></div> Lost</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-end">
              <div className="flex items-end justify-around h-48 border-b border-border-subtle pb-2 relative">

                {/* Horizontal Grid lines (Optional/Decorative) */}
                <div className="absolute top-1/4 w-full border-t border-border-subtle z-0"></div>
                <div className="absolute top-2/4 w-full border-t border-border-subtle z-0"></div>
                <div className="absolute top-3/4 w-full border-t border-border-subtle z-0"></div>

                {weeklyActivity.map(week => {
                  const scale = 176 / maxWeeklyActivity
                  return <div key={week.week} className="flex flex-col justify-end w-10 h-full relative z-10" title={`${week.active + week.won + week.lost} deal updates`}>
                    <div className="w-full bg-primary" style={{ height: `${week.active * scale}px` }} />
                    <div className="w-full bg-gray-300" style={{ height: `${week.won * scale}px` }} />
                    <div className="w-full bg-accent" style={{ height: `${week.lost * scale}px` }} />
                  </div>
                })}
              </div>
              <div className="flex justify-around text-[10px] font-semibold text-muted pt-3 uppercase tracking-wider">
                {weeklyActivity.map(week => <span key={week.week}>{week.week.slice(5)}</span>)}
              </div>
            </div>
          </div>

        </div>

        {/* ── Bottom Row ── */}
        <div className="grid grid-cols-12 gap-4">

          {/* Win/Loss Analysis — real won/lost counts from the summary */}
          <div className="col-span-7 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6 flex flex-col">
            <h2 className="text-lg font-bold text-heading mb-6">Win/Loss Analysis</h2>
            <div className="flex-1 flex items-center justify-center gap-16">

              {/* Recharts Donut Chart */}
              <div className="relative w-44 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossData}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={70}
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
                  <span className="text-3xl font-extrabold text-heading">{closedTotal}</span>
                  <span className="text-[11px] font-semibold text-muted mt-0.5">Deals</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-col gap-4">
                {winLossData.length === 0 ? (
                  <span className="text-sm text-muted">No closed deals yet.</span>
                ) : (
                  winLossData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between w-28">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                        <span className="text-sm font-semibold text-body-light">{item.name}</span>
                      </div>
                      <span className="text-sm font-bold text-heading">{item.value}%</span>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>

          {/* Top Deals This Month — real deals, highest stored value first */}
          <div className="col-span-5 bg-surface-raised border border-border-default rounded-card-sm shadow-card flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
              <h2 className="text-lg font-bold text-heading">{dealsPeriod === 'MONTH' ? `Top Deals · ${monthLabel}` : 'Top Deals · All Dates'}</h2>
              <button onClick={() => { setShowAllDeals(current => !current); setTopDealsPage(1) }} className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors">
                {showAllDeals ? 'Show Top 3' : 'View All'}
              </button>
            </div>

            <div className="p-6 space-y-4">
              {dealsLoading ? (
                <div className="text-sm text-muted">Loading closed-won deals…</div>
              ) : dealsError ? (
                <div role="alert" className="text-sm text-danger">Could not load top deals.</div>
              ) : topDeals.length === 0 ? (
                <div className="text-sm text-muted">No closed-won deals match this search and period.</div>
              ) : (
                topDeals.map((deal, idx) => (
                  <div key={deal.id} className="flex items-center justify-between p-4 border border-border-default rounded-button shadow-card hover:shadow-card-hover transition-shadow cursor-pointer bg-surface-raised">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 ${idx === 0 ? 'bg-primary text-white' : 'bg-surface-strong text-body-light'} rounded flex items-center justify-center text-lg font-bold`}>
                        {(deal.company || deal.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-heading leading-tight">{deal.name}</h3>
                        <p className="text-[11px] font-medium text-muted mt-0.5">{deal.productLine || deal.company || 'General'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-heading tabular-nums">{formatMoney(deal.value)}</span>
                      <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold tracking-wider ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                        {initials(deal.owner?.name)}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {showAllDeals && dealsData?.pagination && <div className="flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-muted">
                <span>Showing {dealsData.pagination.total === 0 ? 0 : (topDealsPage - 1) * dealsData.pagination.limit + 1}–{Math.min(topDealsPage * dealsData.pagination.limit, dealsData.pagination.total)} of {dealsData.pagination.total}</span>
                {dealsData.pagination.pages > 1 && <div className="flex items-center gap-2">
                  <button type="button" disabled={topDealsPage <= 1} onClick={() => setTopDealsPage(page => page - 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Previous</button>
                  <span>Page {topDealsPage} of {dealsData.pagination.pages}</span>
                  <button type="button" disabled={topDealsPage >= dealsData.pagination.pages} onClick={() => setTopDealsPage(page => page + 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Next</button>
                </div>}
              </div>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
