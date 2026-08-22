import React from 'react';
import { 
  ChevronRight, 
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
import { crmService } from '../../../services/crm.service';
import TopBarActions from '../../../components/TopBarActions';

const REP_SPARK_COLORS = ['#10b981', '#3b82f6', '#ef4444']

export default function SalesPerformance() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm', 'sales-performance'],
    queryFn: crmService.getSalesPerformance,
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

  const { closedSpark, repSparks, winLossData } = data;

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
          
          <button className="p-1.5 text-muted hover:text-heading transition-colors">
            <Download size={18} />
          </button>
          
          <button className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
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
              <p className="text-3xl font-extrabold text-heading tracking-tight mb-2">82%</p>
              <div className="w-full bg-surface-strong rounded-full h-2 overflow-hidden">
                <div className="bg-accent h-full rounded-full" style={{ width: '82%' }}></div>
              </div>
            </div>
          </div>

          {/* Total Closed Won */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Total Closed Won</p>
              <TrendingUp size={16} className="text-success-dot" />
            </div>
            <p className="text-3xl font-extrabold text-heading tracking-tight relative z-10">$1.25M</p>
            {/* Sparkline Area Chart */}
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

          {/* Avg Sales Cycle */}
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
                {/* Rep 1 */}
                <tr className="hover:bg-surface-muted">
                  <td className="px-6 py-4 text-sm text-body-light font-semibold">1</td>
                  <td className="px-2 py-4 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-bold tracking-wider">
                      SJ
                    </div>
                    <span className="text-sm font-semibold text-heading">Sarah Jenkins</span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-body-light font-semibold">68%</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-heading tabular-nums">$450k</td>
                  <td className="px-6 py-4 text-right">
                    <div className="w-10 h-5 inline-block">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={repSparks[0]} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                          <Area type="monotone" dataKey="v" stroke={REP_SPARK_COLORS[0]} strokeWidth={1.5} fill={REP_SPARK_COLORS[0]} fillOpacity={0.15} dot={false} animationDuration={600} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </td>
                </tr>
                {/* Rep 2 */}
                <tr className="hover:bg-surface-muted">
                  <td className="px-6 py-4 text-sm text-body-light font-semibold">2</td>
                  <td className="px-2 py-4 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-bold tracking-wider">
                      MC
                    </div>
                    <span className="text-sm font-semibold text-heading">Marcus Chen</span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-body-light font-semibold">54%</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-heading tabular-nums">$350k</td>
                  <td className="px-6 py-4 text-right">
                    <div className="w-10 h-5 inline-block">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={repSparks[1]} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                          <Area type="monotone" dataKey="v" stroke={REP_SPARK_COLORS[1]} strokeWidth={1.5} fill={REP_SPARK_COLORS[1]} fillOpacity={0.15} dot={false} animationDuration={600} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </td>
                </tr>
                {/* Rep 3 */}
                <tr className="hover:bg-surface-muted">
                  <td className="px-6 py-4 text-sm text-body-light font-semibold">3</td>
                  <td className="px-2 py-4 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-bold tracking-wider">
                      JD
                    </div>
                    <span className="text-sm font-semibold text-heading">Jane Doe</span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-body-light font-semibold">49%</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-heading tabular-nums">$280k</td>
                  <td className="px-6 py-4 text-right">
                    <div className="w-10 h-5 inline-block">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={repSparks[2]} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                          <Area type="monotone" dataKey="v" stroke={REP_SPARK_COLORS[2]} strokeWidth={1.5} fill={REP_SPARK_COLORS[2]} fillOpacity={0.15} dot={false} animationDuration={600} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Activity Breakdown */}
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
          
          {/* Win/Loss Analysis */}
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
                  <span className="text-3xl font-extrabold text-heading">124</span>
                  <span className="text-[11px] font-semibold text-muted mt-0.5">Deals</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-col gap-4">
                {winLossData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between w-28">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-sm font-semibold text-body-light">{item.name}</span>
                    </div>
                    <span className="text-sm font-bold text-heading">{item.value}%</span>
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* Top Deals This Month */}
          <div className="col-span-5 bg-surface-raised border border-border-default rounded-card-sm shadow-card flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
              <h2 className="text-lg font-bold text-heading">Top Deals This Month</h2>
              <button className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors">
                View All
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              
              {/* Deal 1 */}
              <div className="flex items-center justify-between p-4 border border-border-default rounded-button shadow-card hover:shadow-card-hover transition-shadow cursor-pointer bg-surface-raised">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary text-white rounded flex items-center justify-center text-lg font-bold">
                    A
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-heading leading-tight">Acme Corp Enterprise</h3>
                    <p className="text-[11px] font-medium text-muted mt-0.5">Software Implementation</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-heading tabular-nums">$125,000</span>
                  <div className="w-6 h-6 rounded-full shrink-0 bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold tracking-wider">
                    SJ
                  </div>
                </div>
              </div>

              {/* Deal 2 */}
              <div className="flex items-center justify-between p-4 border border-border-default rounded-button shadow-card hover:shadow-card-hover transition-shadow cursor-pointer bg-surface-raised">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-surface-strong text-body-light rounded flex items-center justify-center text-lg font-bold">
                    G
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-heading leading-tight">Global Tech Ltd.</h3>
                    <p className="text-[11px] font-medium text-muted mt-0.5">Annual Subscription Renewal</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-heading tabular-nums">$85,500</span>
                  <div className="w-6 h-6 rounded-full shrink-0 bg-purple-100 text-purple-700 flex items-center justify-center text-[9px] font-bold tracking-wider">
                    MC
                  </div>
                </div>
              </div>

              {/* Deal 3 */}
              <div className="flex items-center justify-between p-4 border border-border-default rounded-button shadow-card hover:shadow-card-hover transition-shadow cursor-pointer bg-surface-raised">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-surface-strong text-body-light rounded flex items-center justify-center text-lg font-bold">
                    S
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-heading leading-tight">Stark Industries</h3>
                    <p className="text-[11px] font-medium text-muted mt-0.5">Consulting Retainer</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-heading tabular-nums">$60,000</span>
                  <div className="w-6 h-6 rounded-full shrink-0 bg-orange-100 text-orange-700 flex items-center justify-center text-[9px] font-bold tracking-wider">
                    JD
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}