import { Link } from 'react-router-dom'
import { 
  ArrowUpRight, ArrowDownRight, DollarSign, Users, 
  AlertCircle, Clock, TrendingUp, CreditCard
} from 'lucide-react'

// ── Mock Data ───────────────────────────────────────────────

const STATS = [
  {
    label: 'Total Cash Balance',
    value: '$2.45M',
    change: '+4.2%',
    trend: 'up',
    icon: DollarSign,
  },
  {
    label: 'Total Pipeline',
    value: '$1.2M',
    change: '75% of goal',
    trend: 'neutral',
    icon: TrendingUp,
  },
  {
    label: 'Total Headcount',
    value: '142',
    change: '+3 this month',
    trend: 'up',
    icon: Users,
  },
  {
    label: 'Accounts Payable',
    value: '$145,200',
    change: 'Outstanding',
    trend: 'down',
    icon: CreditCard,
  },
]

const ACTION_ITEMS = [
  {
    id: 1,
    title: 'Amazon Web Services',
    subtitle: 'Invoice #INV-2026-06 • Pending',
    amount: '$15,200.00',
    type: 'finance',
  },
  {
    id: 2,
    title: 'Jane Doe',
    subtitle: 'Frontend Dev • Tech Interview',
    amount: 'Review',
    type: 'hr',
  },
  {
    id: 3,
    title: 'Acme Corp ERP Upgrade',
    subtitle: 'Proposal Stage • 85% Likelihood',
    amount: '$218,500',
    type: 'crm',
  },
]

const RECENT_ACTIVITY = [
  {
    id: 1,
    user: 'Mark D.',
    action: 'opened PR #402 in',
    target: 'asas-backend',
    time: '2 hours ago',
  },
  {
    id: 2,
    user: 'System',
    action: 'marked issue as',
    target: 'In Progress',
    time: 'Yesterday',
  },
  {
    id: 3,
    user: 'Marcus',
    action: 'added feedback for',
    target: 'Jane Doe',
    time: '2h ago',
  },
]

// ── Components ──────────────────────────────────────────────

function StatCard({ stat }) {
  const isUp = stat.trend === 'up'
  const isDown = stat.trend === 'down'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
          <stat.icon size={18} className="text-gray-600" />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${
          isUp ? 'text-emerald-700 bg-emerald-50' : 
          isDown ? 'text-blue-700 bg-blue-50' : 
          'text-gray-600 bg-gray-100'
        }`}>
          {isUp && <ArrowUpRight size={14} />}
          {isDown && <ArrowDownRight size={14} />}
          {stat.change}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{stat.label}</p>
        <p className="text-2xl font-bold text-gray-900 tracking-tight">{stat.value}</p>
      </div>
    </div>
  )
}

export default function DashboardOverview() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
            Overview
          </h1>
          <p className="text-sm text-gray-500">
            Here is what's happening across your workspace today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Generate Report
          </button>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {STATS.map((stat, i) => (
          <StatCard key={i} stat={stat} />
        ))}
      </div>

      {/* ── Main Bento Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        
        {/* Left Column (Charts & Sprints) - Spans 2 cols */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          
          {/* Revenue Chart Box */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Cash Flow Analysis</h2>
                <p className="text-xs text-gray-500 mt-1">Year to Date</p>
              </div>
              <select className="bg-gray-50 border border-gray-200 text-xs font-medium text-gray-700 rounded-md px-3 py-1.5 focus:outline-none">
                <option>FY 2026</option>
                <option>FY 2025</option>
              </select>
            </div>
            
            {/* Mock SVG Chart */}
            <div className="h-64 w-full relative flex items-end">
              <div className="absolute inset-0 flex flex-col justify-between pt-2 pb-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-full border-t border-gray-100 border-dashed" />
                ))}
              </div>
              
              <svg viewBox="0 0 1000 250" className="w-full h-full absolute inset-0 preserve-3d" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path 
                  d="M0 180 Q 150 150 250 100 T 500 120 T 750 80 T 1000 90" 
                  fill="none" 
                  stroke="#1E1B4B" 
                  strokeWidth="4" 
                  strokeLinecap="round" 
                />
              </svg>

              <div className="absolute bottom-0 w-full flex justify-between text-[10px] font-medium text-gray-400 px-2">
                <span>Jan</span>
                <span>Feb</span>
                <span>Mar</span>
                <span>Apr</span>
                <span>May</span>
                <span>Jun</span>
              </div>
            </div>
          </div>

          {/* Active Sprints Box */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-gray-900">Active Sprints</h2>
              <Link to="/dashboard/projects" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View Board &rarr;
              </Link>
            </div>
            
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between gap-4 hover:border-gray-200 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Sprint 42: Warehouse Automation</p>
                    <p className="text-xs text-gray-500 mt-0.5">3 Days Remaining • 68% Complete</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 rounded-xl border border-gray-100 flex items-center justify-between gap-4 hover:border-gray-200 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Q3 Financial Audit</p>
                    <p className="text-xs text-gray-500 mt-0.5">On Track • Operations Dept</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column (Actions & Activity) - Spans 1 col */}
        <div className="space-y-4 md:space-y-6">
          
          {/* Requires Attention */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                <h2 className="text-base font-semibold text-gray-900">Requires Attention</h2>
              </div>
            </div>

            <div className="space-y-4">
              {ACTION_ITEMS.map((item) => (
                <div key={item.id} className="group flex items-start justify-between gap-3 border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors cursor-pointer">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-900">{item.amount}</p>
                    <button className="text-[10px] font-medium text-blue-600 hover:text-blue-800 mt-1">
                      Action
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-6">
              <Clock size={16} className="text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">Activity Feed</h2>
            </div>

            <div className="space-y-5">
              {RECENT_ACTIVITY.map((log, i) => (
                <div key={log.id} className="flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5" />
                    {i !== RECENT_ACTIVITY.length - 1 && (
                      <div className="w-px h-full bg-gray-100 absolute top-3.5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      <span className="font-semibold text-gray-900">{log.user}</span>{' '}
                      {log.action}{' '}
                      <span className="font-medium text-gray-900">{log.target}</span>
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{log.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}