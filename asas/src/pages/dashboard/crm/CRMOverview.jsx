import React from 'react';
import { 
  ChevronRight, 
  Search, 
  Bell, 
  Moon, 
  MoreHorizontal, 
  Square, 
  CheckSquare 
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

import TopBarActions from '../../../components/TopBarActions';

// ── Chart Data ──────────────────────────────────────────────────────
const PIPELINE_SPARK = [
  { v: 800 }, { v: 850 }, { v: 820 }, { v: 950 }, { v: 1100 }, { v: 1200 },
]
const WINRATE_SPARK = [
  { v: 32 }, { v: 30 }, { v: 28 }, { v: 27 }, { v: 26 }, { v: 24.8 },
]
const CRM_REVENUE_DATA = [
  { month: 'Jan', value: 85000 },
  { month: 'Feb', value: 92000 },
  { month: 'Mar', value: 145000 },
  { month: 'Apr', value: 120000 },
  { month: 'May', value: 190000 },
  { month: 'Jun', value: 175000 },
]

export default function CRMOverview() {
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
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-muted">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
          </div>
          
          <button className="text-muted hover:text-heading transition-colors">
            <Bell size={18} />
          </button>
          <button className="text-muted hover:text-heading transition-colors">
            <Moon size={18} />
          </button>
          
          <button className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            New Deal
          </button>
        </div>
      </TopBarActions>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        
        {/* ── KPIs Grid ── */}
        <div className="grid grid-cols-4 gap-4">
          
          {/* Total Pipeline */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Total Pipeline</p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold text-heading tracking-tight">$1.2M</p>
              {/* Green Sparkline */}
              <div className="w-12 h-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={PIPELINE_SPARK} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <Area type="monotone" dataKey="v" stroke="#22c55e" strokeWidth={1.5} fill="#22c55e" fillOpacity={0.15} dot={false} animationDuration={800} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Win Rate */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Win Rate</p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold text-heading tracking-tight">24.8%</p>
              {/* Red Sparkline */}
              <div className="w-12 h-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={WINRATE_SPARK} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <Area type="monotone" dataKey="v" stroke="#ef4444" strokeWidth={1.5} fill="#ef4444" fillOpacity={0.15} dot={false} animationDuration={800} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Active Deals */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Active Deals</p>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-bold text-heading tracking-tight">42</p>
              <span className="bg-surface-active text-body-light border border-border-default px-2 py-0.5 rounded text-[11px] font-medium mt-1">
                +3 this week
              </span>
            </div>
          </div>

          {/* MTD Revenue */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28">
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">MTD Revenue</p>
              <p className="text-[11px] text-muted font-medium">75% of goal</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-heading tracking-tight mb-2">$124,500</p>
              <div className="w-full bg-surface-active rounded-full h-1.5 overflow-hidden">
                <div className="bg-accent h-1.5 rounded-full" style={{ width: '75%' }}></div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Main Charts Row ── */}
        <div className="grid grid-cols-5 gap-4">
          
          {/* Revenue Forecast Area Chart */}
          <div className="col-span-3 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6 flex flex-col min-h-[340px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-heading">Revenue Forecast</h2>
              <button className="text-caption hover:text-body transition-colors">
                <MoreHorizontal size={20} />
              </button>
            </div>
            
            <div className="flex-1 w-full mt-2" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={CRM_REVENUE_DATA} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="crmRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-muted)', fontWeight: 500 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)', fontWeight: 500 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card-hover)', fontSize: 13 }}
                    formatter={(value) => [`$${(value / 1000).toFixed(0)}k`, 'Revenue']}
                    labelStyle={{ fontWeight: 600, color: 'var(--color-heading)' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fill="url(#crmRevGrad)" dot={false} activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} animationDuration={1200} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pipeline Conversion Funnel */}
          <div className="col-span-2 bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6 flex flex-col min-h-[340px]">
            <h2 className="text-lg font-bold text-heading mb-8">Pipeline Conversion</h2>
            
            <div className="flex flex-col items-center flex-1 w-full px-4">
              
              {/* Leads */}
              <div className="w-full bg-[#dbeafe] text-[#1e3a8a] py-3 px-4 flex justify-between items-center rounded-input relative">
                <span className="text-sm font-semibold">Leads</span>
                <span className="text-sm font-bold">$450k</span>
              </div>
              <div className="relative -my-2.5 z-10 bg-surface-raised border border-border-default rounded-input px-2 py-0.5 text-[10px] font-bold text-body-light shadow-card">
                71%
              </div>

              {/* Proposal */}
              <div className="w-[85%] bg-[#ffedd5] text-[#9a3412] py-3 px-4 flex justify-between items-center rounded-input relative">
                <span className="text-sm font-semibold">Proposal</span>
                <span className="text-sm font-bold">$320k</span>
              </div>
              <div className="relative -my-2.5 z-10 bg-surface-raised border border-border-default rounded-input px-2 py-0.5 text-[10px] font-bold text-body-light shadow-card">
                56%
              </div>

              {/* Negotiation */}
              <div className="w-[70%] bg-[#fee2e2] text-[#991b1b] py-3 px-4 flex justify-between items-center rounded-input relative">
                <span className="text-sm font-semibold">Negotiation</span>
                <span className="text-sm font-bold">$180k</span>
              </div>
              <div className="relative -my-2.5 z-10 bg-surface-raised border border-border-default rounded-input px-2 py-0.5 text-[10px] font-bold text-body-light shadow-card">
                47%
              </div>

              {/* Closed */}
              <div className="w-[55%] bg-success-light text-success-text py-3 px-4 flex justify-between items-center rounded-input relative">
                <span className="text-sm font-semibold">Closed</span>
                <span className="text-sm font-bold">$85k</span>
              </div>

            </div>
          </div>

        </div>

        {/* ── Bottom Row ── */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Daily Agenda */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6">
            <h2 className="text-lg font-bold text-heading mb-6">Daily Agenda</h2>
            <div className="space-y-6">
              
              <div className="flex items-start gap-4">
                <Square size={18} className="text-faint mt-0.5 cursor-pointer" />
                <div>
                  <p className="text-sm font-medium text-heading mb-1">Call Jane Doe regarding Q3 Proposal</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted font-medium">10:00 AM</span>
                    <span className="bg-surface-active border border-border-default text-muted text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">High</span>
                  </div>
                </div>
              </div>
              
              <div className="w-full h-px bg-surface-active"></div>
              
              <div className="flex items-start gap-4">
                <Square size={18} className="text-faint mt-0.5 cursor-pointer" />
                <div>
                  <p className="text-sm font-medium text-heading mb-1">Send updated contract to Acme Corp</p>
                  <span className="text-xs text-muted font-medium">1:30 PM</span>
                </div>
              </div>

              <div className="w-full h-px bg-surface-active"></div>
              
              <div className="flex items-start gap-4 opacity-50">
                <CheckSquare size={18} className="text-muted mt-0.5 cursor-pointer" fill="#f3f4f6" />
                <div>
                  <p className="text-sm font-medium text-muted mb-1 line-through">Review weekly pipeline report</p>
                  <span className="text-xs text-caption font-medium">9:00 AM</span>
                </div>
              </div>

            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card p-6">
            <h2 className="text-lg font-bold text-heading mb-6">Recent Activity</h2>
            
            <div className="relative pl-3 space-y-6">
              {/* Continuous Line */}
              <div className="absolute left-[15px] top-2 bottom-4 w-px bg-surface-strong"></div>
              
              {/* Timeline Item 1 */}
              <div className="relative z-10 flex gap-4">
                <div className="bg-surface-raised ring-4 ring-white mt-1 relative left-0.5">
                  <div className="w-2.5 h-2.5 bg-accent rounded-full"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-heading mb-0.5">New Deal Created: TechCorp Enterprise</p>
                  <p className="text-[11px] font-medium text-muted">John Smith • 2h ago</p>
                </div>
              </div>

              {/* Timeline Item 2 */}
              <div className="relative z-10 flex gap-4">
                <div className="bg-surface-raised ring-4 ring-white mt-1 relative left-0.5">
                  <div className="w-2.5 h-2.5 bg-surface-muted0 rounded-full"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-heading mb-0.5">Meeting Completed: Initial Discovery Call</p>
                  <p className="text-[11px] font-medium text-muted">Sarah Jenkins • 4h ago</p>
                </div>
              </div>

              {/* Timeline Item 3 */}
              <div className="relative z-10 flex gap-4">
                <div className="bg-surface-raised ring-4 ring-white mt-1 relative left-0.5">
                  <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-heading mb-0.5">Stage Changed: Global Industries moved to Negotiation</p>
                  <p className="text-[11px] font-medium text-muted">Jane Doe • Yesterday</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}