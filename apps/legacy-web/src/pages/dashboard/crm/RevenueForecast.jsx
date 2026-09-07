import React from 'react';
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
  Loader2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import TopBarActions from '../../../components/TopBarActions';

const toMajor = (money) => (money == null ? 0 : money.amount / 100);

const formatCurrency = (num) => {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
  return `$${num}`;
};

export default function RevenueForecast() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.forecast(),
    queryFn: crmApi.getForecast,
  });

  // Real closed-won total (the forecast endpoint itself has no closed amount —
  // its `quotaAttainmentPct` is pipeline ÷ quota, i.e. coverage).
  const { data: perf } = useQuery({
    queryKey: queryKeys.crm.salesPerformance(),
    queryFn: crmApi.getSalesPerformance,
  });

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
  const closedWon = perf?.summary?.totalWon ?? null;

  // ── KPIs from the server summary ──
  const quotaMajor = toMajor(summary.totalQuota);
  const wonMajor = toMajor(closedWon);
  const wonPctToQuota = quotaMajor > 0 && closedWon != null ? (wonMajor / quotaMajor) * 100 : null;

  // Committed / Best Case: summed from the real ForecastSnapshot rows (— when the
  // tenant has no forecast snapshots).
  const committedTotal = forecastByRep.reduce((sum, rep) => sum + toMajor(rep.commit), 0);
  const bestCaseTotal = forecastByRep.reduce((sum, rep) => sum + toMajor(rep.bestCase), 0);

  // Pipeline coverage — the server's `quotaAttainmentPct` is exactly totalPipeline ÷ totalQuota
  // (a percentage), so coverage in "×" is that value / 100.
  const coverage = summary.quotaAttainmentPct == null ? null : summary.quotaAttainmentPct / 100;

  // ── Chart: real open-pipeline months; the quota reference line amortizes the
  // total stored quota across the months shown (no per-month quota exists server-side). ──
  const monthCount = Math.max(monthlyPipeline.length, 1);
  const quotaPerMonth = quotaMajor > 0 ? quotaMajor / monthCount : null;
  const chartData = monthlyPipeline.map((row) => ({
    month: row.month,
    closed: 0,
    commit: 0,
    pipeline: toMajor(row.value),
  }));

  // Expected shortfall = quota − closed-won (display arithmetic on two server aggregates).
  const expectedShortfall = quotaMajor > 0 && closedWon != null ? Math.max(0, quotaMajor - wonMajor) : null;

  // Quota row per rep, joined by repName (the only rep identity forecastByRep carries).
  const quotaByName = (name) => quotas.find((q) => q.repName === name);

  return (
    <div className="flex h-full flex-col bg-[#fafafa] overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-gray-200 rounded-md bg-white w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="h-6 w-px bg-gray-200 mx-1"></div>

          <button className="flex items-center gap-2 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors bg-white">
            FY 2026
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          <button disabled className="p-1.5 text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-60">
            <Download size={18} />
          </button>

          <button disabled className="flex items-center gap-2 bg-black text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-60">
            <Share2 size={14} />
            Share Forecast
          </button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── KPIs Grid ── */}
        <div className="grid grid-cols-4 gap-4">

          {/* Closed Won */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Closed Won (YTD)</p>
              <CheckCircle2 size={16} className="text-gray-400" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{closedWon == null ? '—' : formatCurrency(wonMajor)}</p>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5 overflow-hidden">
                <div className="bg-[#10b981] h-full rounded-full" style={{ width: `${wonPctToQuota == null ? 0 : Math.min(100, wonPctToQuota)}%` }}></div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-500 font-medium">
                <span>{wonPctToQuota == null ? 'No quota set' : `${Math.round(wonPctToQuota)}% to Quota`}</span>
                <span>{quotaMajor === 0 ? 'No goal' : `${formatCurrency(quotaMajor)} Goal`}</span>
              </div>
            </div>
          </div>

          {/* Committed */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Committed</p>
              <Handshake size={16} className="text-[#3b82f6]" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{committedTotal === 0 ? '—' : formatCurrency(committedTotal)}</p>
              <span className="inline-flex items-center gap-1.5 bg-[#eff6ff] text-[#1d4ed8] px-2.5 py-1 rounded text-[10px] font-bold">
                <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full"></div>
                High Confidence
              </span>
            </div>
          </div>

          {/* Best Case */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Best Case (Upside)</p>
              <TrendingUp size={16} className="text-[#eab308]" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{bestCaseTotal === 0 ? '—' : formatCurrency(bestCaseTotal)}</p>
              <span className="inline-flex items-center gap-1.5 bg-[#fefce8] text-[#a16207] px-2.5 py-1 rounded text-[10px] font-bold">
                <div className="w-1.5 h-1.5 bg-[#eab308] rounded-full"></div>
                Medium Confidence
              </span>
            </div>
          </div>

          {/* Pipeline Coverage */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Pipeline Coverage</p>
              <Filter size={16} className="text-gray-400" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{coverage == null ? '—' : `${coverage.toFixed(1)}x`}</p>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                <Info size={12} className="text-gray-400" />
                {coverage == null ? 'Set a quota to measure coverage' : 'Open pipeline ÷ quota'}
              </span>
            </div>
          </div>

        </div>

        {/* ── Main Chart: Revenue Projection ── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col w-full overflow-x-auto">

          {/* Chart Header & Legend */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900">Revenue Projection vs. Target</h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-gray-600">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#0f172a]"></div> Closed</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#a5b4fc]"></div> Commit</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#e5e7eb]"></div> Pipeline</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 border-t-2 border-dashed border-[#ef4444]"></div> Quota</div>
            </div>
          </div>

          {/* Recharts Stacked Bar Chart — real open-deal close months; the Closed/Commit
              stacks have no per-month server series and stay at 0. */}
          <div className="w-full h-[360px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 500 }} tickFormatter={(v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 13 }}
                  formatter={(value, name) => {
                    if (value === 0) return [null, name === 'closed' ? 'Closed' : name === 'commit' ? 'Commit' : 'Pipeline'];
                    const label = name === 'closed' ? 'Closed' : name === 'commit' ? 'Commit' : 'Pipeline'
                    return [value >= 1000000 ? `$${(value/1000000).toFixed(1)}M` : `$${(value/1000).toFixed(0)}k`, label]
                  }}
                  labelStyle={{ fontWeight: 600, color: '#111827' }}
                />
                <Bar dataKey="closed" stackId="a" fill="#0f172a" radius={[0, 0, 0, 0]} animationDuration={1000} />
                <Bar dataKey="commit" stackId="a" fill="#a5b4fc" radius={[0, 0, 0, 0]} animationDuration={1000} />
                <Bar dataKey="pipeline" stackId="a" fill="#e5e7eb" radius={[4, 4, 0, 0]} animationDuration={1000} />
                {quotaPerMonth != null && (
                  <ReferenceLine y={quotaPerMonth} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" label={{ value: 'Quota', position: 'right', fill: '#ef4444', fontSize: 11, fontWeight: 600 }} />
                )}
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
        <div className="grid grid-cols-12 gap-4">

          {/* Forecast by Rep Table — real ForecastSnapshot rows */}
          <div className="col-span-8 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Forecast by Rep</h2>
              <button className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                View All
              </button>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">Rep</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right">Closed</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right">Commit</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right">Best Case</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-right w-32">To Quota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {forecastByRep.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                      No forecast snapshots recorded yet.
                    </td>
                  </tr>
                ) : (
                  forecastByRep.map((rep) => {
                    const quotaRow = quotaByName(rep.repName);
                    const quotaVal = quotaRow ? toMajor(quotaRow.quota) : null;
                    const repQuotaPct = rep.quotaPct != null ? rep.quotaPct : (quotaVal && toMajor(rep.closed) > 0 ? Math.min(100, (toMajor(rep.closed) / quotaVal) * 100) : null);
                    return (
                      <tr key={rep.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200">
                            <span className="text-[10px] font-bold text-gray-500">
                              {rep.repName.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{rep.repName}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(toMajor(rep.closed))}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-600 font-medium tabular-nums">{formatCurrency(toMajor(rep.commit))}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-600 font-medium tabular-nums">{formatCurrency(toMajor(rep.bestCase))}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div className={`h-full rounded-full ${repQuotaPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${repQuotaPct == null ? 0 : Math.min(100, repQuotaPct)}%` }}></div>
                            </div>
                            <span className="text-xs font-semibold text-gray-600 w-8 text-right">{repQuotaPct == null ? '—' : `${Math.round(repQuotaPct)}%`}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Alerts & Shortfall */}
          <div className="col-span-4 flex flex-col gap-4">

            {/* Warning Banner — marketing-style element with no data source in the old UI; kept as-is */}
            <div className="bg-[#fef9c3] border border-[#fde047] rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <AlertTriangle size={20} className="text-[#a16207]" />
              <p className="text-sm font-bold text-[#854d0e]">
                At Risk: Acme Corp Upgrade ($218k) stalled.
              </p>
            </div>

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
    </div>
  );
}
