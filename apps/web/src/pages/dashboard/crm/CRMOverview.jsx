import React, { useState } from 'react';
import {
  Search,
  Bell,
  Moon,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatPercent } from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';
import EmptyState from '../../../components/common/EmptyState';

// Chart-only number formatters (axis ticks / tooltips). Money arrives as
// { amount: minor units, currency } — reduce to a major-unit number for the scale.
const toMajor = (money) => (money == null ? 0 : money.amount / 100);
const formatCompact = (v) => {
  if (v >= 1000000) {
    return `$${(v / 1000000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  } else if (v >= 1000) {
    return `$${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}k`;
  }
  return `$${v}`;
};

export default function CRMOverview() {
  const queryClient = useQueryClient()
  const [agendaTitle, setAgendaTitle] = useState('')
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.overview(),
    queryFn: crmApi.getOverview,
  });

  // The old page's "Revenue Forecast" area chart and the Total-Pipeline sparkline had no
  // counterpart in /crm/overview; the real feed for both is /crm/forecast's monthlyPipeline
  // (open deals grouped by close-date month). No win-rate time series exists on the server,
  // so the Win Rate sparkline keeps its markup but renders an empty series.
  const { data: forecast } = useQuery({
    queryKey: queryKeys.crm.forecast(),
    queryFn: crmApi.getForecast,
  });
  const { data: agenda } = useQuery({ queryKey: queryKeys.crm.agenda(), queryFn: crmApi.listAgenda })
  const createAgenda = useMutation({
    mutationFn: () => crmApi.createAgenda({ title: agendaTitle.trim() }),
    onSuccess: () => { setAgendaTitle(''); queryClient.invalidateQueries({ queryKey: queryKeys.crm.agenda() }) },
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
      <div className="flex h-full items-center justify-center bg-surface text-danger">
        Failed to load CRM overview.
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

  // Stage-to-stage conversion (count-based), same ratio positions as the old page.
  const conv = (from, to) => (from.count ? Math.round((to.count / from.count) * 100) : 0);
  const proposalConv = conv(s.leads, s.proposal);
  const negotiationConv = conv(s.proposal, s.negotiation);
  const closedConv = conv(s.negotiation, s.closedWon);

  const monthly = (forecast?.monthlyPipeline || []).map((row) => ({ month: row.month, value: toMajor(row.value) }));
  const pipelineSpark = monthly.map((row) => ({ v: row.value }));

  // Closed-Won progress bar: closed-won value against the stored quota goal (when any).
  const quotaMajor = toMajor(forecast?.summary?.totalQuota);
  const closedPctOfQuota = quotaMajor > 0 ? (toMajor(pipeline.wonTotal) / quotaMajor) * 100 : null;

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button className="text-muted hover:text-heading transition-colors">
            <Bell size={18} />
          </button>
          <button className="text-muted hover:text-heading transition-colors">
            <Moon size={18} />
          </button>

          <button disabled className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60">
            New Deal
          </button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── KPIs Grid ── */}
        <div className="grid grid-cols-4 gap-4">

          {/* Total Pipeline */}
          <div className="relative overflow-hidden bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card h-28">
            {/* Background Chart */}
            <div className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none z-0">
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

            {/* Text Foreground */}
            <div className="relative z-10 h-full flex flex-col justify-between pointer-events-none">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Total Pipeline</p>
              <p className="text-3xl font-bold text-heading tracking-tight leading-none pointer-events-auto">{formatMoney(pipeline.openTotal)}</p>
            </div>
          </div>

          {/* Win Rate */}
          <div className="relative overflow-hidden bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card h-28">
            {/* Background Chart — no win-rate time series exists server-side; empty series */}
            <div className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none z-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[]} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <YAxis hide domain={([min, max]) => [min - (max - min) * 3, max]} />
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

            {/* Text Foreground */}
            <div className="relative z-10 h-full flex flex-col justify-between pointer-events-none">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Win Rate</p>
              <p className="text-3xl font-bold text-heading tracking-tight leading-none pointer-events-auto">{formatPercent(data.winRate)}</p>
            </div>
          </div>

          {/* Active Deals — the "+3 this week" delta had no data source in the old UI; kept as-is */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Active Deals</p>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-bold text-heading tracking-tight">{pipeline.openCount}</p>
              <span className="bg-surface-active text-body-light border border-border-default px-2 py-0.5 rounded text-[11px] font-medium mt-1">
                +3 this week
              </span>
            </div>
          </div>

          {/* Closed Won */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Closed Won</p>
              <p className="text-[11px] text-muted font-medium">{pipeline.wonCount} deals</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-heading tracking-tight mb-2">{formatMoney(pipeline.wonTotal)}</p>
              <div className="w-full bg-surface-active rounded-full h-1.5 overflow-hidden">
                <div className="bg-accent h-1.5 rounded-full" style={{ width: `${closedPctOfQuota == null ? 0 : Math.min(100, closedPctOfQuota)}%` }}></div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Main Charts Row ── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Revenue Forecast Area Chart — real open-pipeline value by close month */}
          <div className="col-span-3 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6 flex flex-col min-h-[340px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-heading">Revenue Forecast</h2>
              <button className="text-caption hover:text-body transition-colors">
                <MoreHorizontal size={20} />
              </button>
            </div>

            <div className="relative flex-1 w-full mt-2" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={monthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="crmRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 500 }} tickFormatter={formatCompact} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                    formatter={(value) => [formatCompact(value), 'Revenue']}
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

          {/* Pipeline Conversion Funnel — real 5-stage funnel from the server */}
          <div className="col-span-2 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6 flex flex-col min-h-[340px]">
            <h2 className="text-lg font-bold text-heading mb-8">Pipeline Conversion</h2>

            <div className="flex flex-col items-center flex-1 w-full px-4">

              {/* Leads */}
              <div className="w-full bg-[#dbeafe] text-[#1e3a8a] py-3 px-4 flex justify-between items-center rounded-input relative transition-all duration-1000">
                <span className="text-sm font-semibold">Leads</span>
                <span className="text-sm font-bold">{formatMoney(s.leads.value)}</span>
              </div>
              <div className="relative -my-2.5 z-10 bg-surface-raised border border-border-strong rounded-input px-2 py-0.5 text-[10px] font-bold text-heading shadow-md">
                {proposalConv}%
              </div>

              {/* Proposal */}
              <div className="w-[85%] bg-[#ffedd5] text-[#9a3412] py-3 px-4 flex justify-between items-center rounded-input relative transition-all duration-1000">
                <span className="text-sm font-semibold">Proposal</span>
                <span className="text-sm font-bold">{formatMoney(s.proposal.value)}</span>
              </div>
              <div className="relative -my-2.5 z-10 bg-surface-raised border border-border-strong rounded-input px-2 py-0.5 text-[10px] font-bold text-heading shadow-md">
                {negotiationConv}%
              </div>

              {/* Negotiation */}
              <div className="w-[70%] bg-[#fee2e2] text-[#991b1b] py-3 px-4 flex justify-between items-center rounded-input relative transition-all duration-1000">
                <span className="text-sm font-semibold">Negotiation</span>
                <span className="text-sm font-bold">{formatMoney(s.negotiation.value)}</span>
              </div>
              <div className="relative -my-2.5 z-10 bg-surface-raised border border-border-strong rounded-input px-2 py-0.5 text-[10px] font-bold text-heading shadow-md">
                {closedConv}%
              </div>

              {/* Closed Won */}
              <div className="w-[55%] bg-success-light text-success-text py-3 px-4 flex justify-between items-center rounded-input relative transition-all duration-1000">
                <span className="text-sm font-semibold">Closed Won</span>
                <span className="text-sm font-bold">{formatMoney(s.closedWon.value)}</span>
              </div>

              {/* Closed Lost */}
              <div className="w-[45%] bg-danger-light text-danger-text py-3 px-4 flex justify-between items-center rounded-input relative transition-all duration-1000">
                <span className="text-sm font-semibold">Closed Lost</span>
                <span className="text-sm font-bold">{formatMoney(s.closedLost.value)}</span>
              </div>

            </div>
          </div>

        </div>

        {/* ── Bottom Row ── */}
        <div className="grid grid-cols-2 gap-4">

          {/* Daily agenda backed by tenant-scoped AgendaItem records. */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6">
            <h2 className="text-lg font-bold text-heading mb-6">Daily Agenda</h2>
            <div className="mb-5 flex gap-2">
              <input value={agendaTitle} onChange={event => setAgendaTitle(event.target.value)} placeholder="Add an agenda item" className="min-w-0 flex-1 rounded-input border border-border-default px-3 py-2 text-sm" />
              <button type="button" disabled={!agendaTitle.trim() || createAgenda.isPending} onClick={() => createAgenda.mutate()} className="rounded-input bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Add</button>
            </div>
            {agenda?.items?.length ? <div className="space-y-3">{agenda.items.map(item => <div key={item.id} className="flex items-center gap-3 border-b border-border-subtle pb-3"><input type="checkbox" checked={item.done} onChange={() => crmApi.updateAgenda(item.id, { done: !item.done }).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.crm.agenda() }))} /><span className={item.done ? 'text-sm text-muted line-through' : 'text-sm font-medium text-heading'}>{item.title}</span></div>)}</div> : <EmptyState title="No agenda items" description="Add a task for this workspace." />}
          </div>

          {/* Recent Activity — the CRM API has no activity feed; honest empty state */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6">
            <h2 className="text-lg font-bold text-heading mb-6">Recent Activity</h2>

            <div className="relative pl-3 space-y-6">
              {/* Continuous Line */}
              <div className="absolute left-[15px] top-2 bottom-4 w-px bg-surface-strong"></div>

              {/* Timeline Item */}
              <div className="relative z-10 flex gap-4">
                <div className="bg-surface-raised ring-4 ring-white mt-1 relative left-0.5">
                  <div className="w-2.5 h-2.5 bg-surface-muted0 rounded-full"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted">No recent activity to show yet.</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
