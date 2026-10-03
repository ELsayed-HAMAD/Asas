import React from 'react';
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
import { formatMoney, formatPercent } from '../../../lib/format';
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

const toMajor = (money) => (money == null ? 0 : money.amount / 100);

export default function SalesPerformance() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.salesPerformance(),
    queryFn: crmApi.getSalesPerformance,
  });

  // Team quota attainment has no source in /crm/sales-performance; the real
  // aggregate lives in /crm/forecast's summary.
  const { data: forecast } = useQuery({
    queryKey: queryKeys.crm.forecast(),
    queryFn: crmApi.getForecast,
  });

  // Top deals this month: the API has no top-deals endpoint, so the rows come from
  // the deal list (highest stored value first, display-only selection).
  const { data: dealsData } = useQuery({
    queryKey: queryKeys.crm.deals.list({ limit: 100 }),
    queryFn: () => crmApi.listDeals({ limit: 100 }),
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
  const attainmentPct = quotaMajor > 0 ? (toMajor(summary.totalWon) / quotaMajor) * 100 : null;
  const attainmentWidth = attainmentPct == null ? 0 : Math.min(100, attainmentPct);

  const closedTotal = summary.totalWonCount + summary.totalLostCount;
  const winLossData = summary.overallWinRate == null ? [] : [
    { name: 'Won', value: Math.round(summary.overallWinRate), color: '#10b981' },
    { name: 'Lost', value: Math.round(100 - summary.overallWinRate), color: '#f87171' },
  ];

  const topDeals = ((dealsData?.items || [])
    .slice()
    .sort((a, b) => (b.value?.amount ?? 0) - (a.value?.amount ?? 0)))
    .slice(0, 3);

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-56 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Calendar size={14} className="text-muted" />
            This Month
            <ChevronDown size={14} className="text-caption" />
          </button>

          <button disabled className="p-1.5 text-muted hover:text-heading transition-colors disabled:opacity-60">
            <Download size={18} />
          </button>

          <button disabled className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60">
            Download Report
          </button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

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
            <p className="text-3xl font-extrabold text-heading tracking-tight relative z-10">{formatMoney(summary.totalWon)}</p>
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

          {/* Avg Sales Cycle — no server source; kept as the old page had it */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Avg Sales Cycle</p>
              <Clock size={16} className="text-caption" />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-extrabold text-heading tracking-tight">18 Days</p>
              <span className="bg-success-light text-success-text px-2 py-0.5 rounded text-[10px] font-bold tracking-wider mt-1.5">
                ↓ 2 days faster
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
              <button className="text-caption hover:text-body transition-colors">
                <MoreHorizontal size={20} />
              </button>
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
                {(byRep || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted">
                      No rep data yet.
                    </td>
                  </tr>
                ) : (
                  (byRep || []).map((rep, idx) => (
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
                        {/* No per-rep time series exists server-side — empty series */}
                        <div className="w-10 h-5 inline-block">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[]} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
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

          {/* Activity Breakdown — no server source; kept as the old page had it */}
          <div className="col-span-5 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-heading">Activity Breakdown</h2>
              <div className="flex items-center gap-3 text-[10px] text-muted font-medium uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary"></div> Meetings</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-300"></div> Emails</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-accent"></div> Calls</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-end">
              <div className="flex items-end justify-around h-48 border-b border-border-subtle pb-2 relative">

                {/* Horizontal Grid lines (Optional/Decorative) */}
                <div className="absolute top-1/4 w-full border-t border-border-subtle z-0"></div>
                <div className="absolute top-2/4 w-full border-t border-border-subtle z-0"></div>
                <div className="absolute top-3/4 w-full border-t border-border-subtle z-0"></div>

                {/* Bar W1 */}
                <div className="flex flex-col justify-end w-10 h-full relative z-10">
                  <div className="w-full bg-primary h-12"></div>
                  <div className="w-full bg-gray-300 h-16"></div>
                  <div className="w-full bg-accent h-12"></div>
                </div>
                {/* Bar W2 */}
                <div className="flex flex-col justify-end w-10 h-full relative z-10">
                  <div className="w-full bg-primary h-6"></div>
                  <div className="w-full bg-gray-300 h-14"></div>
                  <div className="w-full bg-accent h-10"></div>
                </div>
                {/* Bar W3 */}
                <div className="flex flex-col justify-end w-10 h-full relative z-10">
                  <div className="w-full bg-primary h-16"></div>
                  <div className="w-full bg-gray-300 h-[72px]"></div>
                  <div className="w-full bg-accent h-[52px]"></div>
                </div>
                {/* Bar W4 */}
                <div className="flex flex-col justify-end w-10 h-full relative z-10">
                  <div className="w-full bg-primary h-10"></div>
                  <div className="w-full bg-gray-300 h-20"></div>
                  <div className="w-full bg-accent h-12"></div>
                </div>
              </div>
              <div className="flex justify-around text-[10px] font-semibold text-muted pt-3 uppercase tracking-wider">
                <span>W1</span>
                <span>W2</span>
                <span>W3</span>
                <span>W4</span>
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
              <h2 className="text-lg font-bold text-heading">Top Deals This Month</h2>
              <button className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors">
                View All
              </button>
            </div>

            <div className="p-6 space-y-4">
              {topDeals.length === 0 ? (
                <div className="text-sm text-muted">No deals yet.</div>
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
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
