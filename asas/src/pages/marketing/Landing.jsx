import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'

// ── Mini previews inside feature cards ─────────────────────

function TaskPreview() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] text-gray-400">Active Sprint • Alpha Team</span>
        <span className="text-[10px] font-semibold text-blue-600">3 Days Left</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-2 py-1.5">
          <div className="w-3.5 h-3.5 rounded border-2 border-blue-500 flex-shrink-0 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-sm" />
          </div>
          <span className="text-[10px] text-gray-700 flex-1">Optimize database queries</span>
          <div className="w-4 h-4 rounded-full bg-gray-800 flex-shrink-0" />
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-blue-200">
          <div className="w-3.5 h-3.5 rounded border-2 border-gray-200 flex-shrink-0" />
          <span className="text-[10px] text-gray-700 flex-1">Implement OAuth2.0 Flow</span>
          <span className="text-[9px] bg-red-50 text-red-500 font-medium px-1.5 py-0.5 rounded">High</span>
        </div>
      </div>
    </div>
  )
}

function FinancialPreview() {
  return (
    <div className="rounded-xl overflow-hidden bg-gradient-to-br from-teal-400 to-cyan-500 p-4 h-24 flex items-end">
      <svg viewBox="0 0 140 50" className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.3" />
            <stop offset="100%" stopColor="white" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d="M0 40 Q15 30 30 33 Q50 37 70 20 Q90 5 110 12 Q125 17 140 8"
          fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
        <path d="M0 40 Q15 30 30 33 Q50 37 70 20 Q90 5 110 12 Q125 17 140 8 L140 50 L0 50Z"
          fill="url(#waveGrad)" />
      </svg>
    </div>
  )
}

function RoutingPreview() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm space-y-2">
      <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100">
        <div className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center flex-shrink-0 text-white text-[9px] font-bold">✦</div>
        <span className="text-[10px] text-gray-700 font-medium flex-1">New Lead Created</span>
        <div className="w-8 h-4 bg-blue-500 rounded-full flex items-center justify-end px-0.5 flex-shrink-0">
          <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
        </div>
      </div>
      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
        <div className="w-5 h-5 rounded-md bg-blue-500 flex items-center justify-center flex-shrink-0 text-white text-[9px]">→</div>
        <span className="text-[10px] text-gray-600">Route to Sales Pod A</span>
      </div>
    </div>
  )
}

function SecurityPreview() {
  const badges = [
    { label: 'SOC2 Type II', sub: 'Certified' },
    { label: 'ISO & SAML',   sub: 'Enabled'   },
    { label: 'RBAC',         sub: 'Granular'  },
    { label: '99.99%',       sub: 'Uptime SLA' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {badges.map(b => (
        <div key={b.label} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 text-center">
          <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center mx-auto mb-1.5">
            <span className="text-white text-[10px]">✓</span>
          </div>
          <p className="text-[9px] font-semibold text-gray-900 leading-tight">{b.label}</p>
          <p className="text-[8px] text-gray-400 mt-0.5">{b.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Dashboard browser mockup ────────────────────────────────
function DashboardMockup() {
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-2xl shadow-gray-200/80 bg-white">
      {/* Browser chrome */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-white rounded-md border border-gray-200 text-[10px] text-gray-400 px-3 py-1 mx-2 text-center">
          app.asas.io/dashboard
        </div>
      </div>

      {/* App shell */}
      <div className="flex h-64">
        {/* Mini sidebar */}
        <div className="w-28 bg-white border-r border-gray-100 flex flex-col p-2 gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-1.5 py-1.5 mb-1">
            <div className="w-5 h-5 rounded-md bg-gray-900 flex items-center justify-center text-[8px] text-white font-bold flex-shrink-0">A</div>
            <div>
              <p className="text-[8px] font-semibold text-gray-900 leading-tight">Asas</p>
              <p className="text-[7px] text-gray-400">Enterprise ERP</p>
            </div>
          </div>
          {['Dashboard','HR','Finance','CRM','Inventory','Projects'].map((item, i) => (
            <div key={item} className={`px-2 py-1 rounded-md text-[8px] ${i === 0 ? 'bg-gray-100 text-gray-900 font-semibold' : 'text-gray-400'}`}>
              {item}
            </div>
          ))}
        </div>

        {/* Mini dashboard content */}
        <div className="flex-1 bg-gray-50 p-3 overflow-hidden">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Total Revenue', value: '$2.4M', color: 'text-gray-900' },
              { label: 'Active Deals',  value: '42',    color: 'text-gray-900' },
              { label: 'Win Rate',      value: '24.8%', color: 'text-emerald-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg p-2 border border-gray-100">
                <p className="text-[7px] text-gray-400 mb-0.5">{s.label}</p>
                <p className={`text-[11px] font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Mini chart */}
          <div className="bg-white rounded-lg p-2.5 border border-gray-100 mb-2">
            <p className="text-[7px] text-gray-400 mb-2">Revenue Forecast</p>
            <svg viewBox="0 0 200 40" className="w-full h-8">
              <path d="M0 35 Q30 30 50 25 Q80 18 100 22 Q130 27 150 10 Q170 -2 200 5"
                fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M0 35 Q30 30 50 25 Q80 18 100 22 Q130 27 150 10 Q170 -2 200 5 L200 40 L0 40Z"
                fill="#3B82F6" opacity="0.08" />
            </svg>
          </div>

          {/* Mini table */}
          <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-3 px-2 py-1 bg-gray-50 border-b border-gray-100">
              {['Employee', 'Dept', 'Status'].map(h => (
                <p key={h} className="text-[7px] text-gray-400 font-medium">{h}</p>
              ))}
            </div>
            {[
              ['Sarah Jenkins', 'Engineering', 'Active'],
              ['Marcus Chen',   'DevOps',      'Active'],
              ['Elena R.',      'Engineering', 'Active'],
            ].map(([name, dept, status]) => (
              <div key={name} className="grid grid-cols-3 px-2 py-1 border-b border-gray-50">
                <p className="text-[7px] text-gray-700 font-medium">{name}</p>
                <p className="text-[7px] text-gray-400">{dept}</p>
                <span className="text-[6px] text-emerald-600 font-medium">{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Features data ───────────────────────────────────────────
const FEATURES = [
  {
    title: 'Surgical Task Execution',
    desc:  'Break down complex initiatives into actionable sprints with micro-precision tracking.',
    preview: <TaskPreview />,
  },
  {
    title: 'Real-time Financials',
    desc:  'Instant visibility into burn rate, revenue, and forecasts.',
    preview: <FinancialPreview />,
  },
  {
    title: 'Event-Based Routing',
    desc:  'Build complex logic without writing a single line of code.',
    preview: <RoutingPreview />,
  },
  {
    title: 'Enterprise-Grade Security',
    desc:  'Bank-level encryption, SOC2 compliance, and granular role-based access control.',
    preview: <SecurityPreview />,
  },
]

const COMPANIES = ['AcmeCorp', 'Globex', 'Soylent', 'Initech', 'MassiveDynamic']

// ── Landing page ────────────────────────────────────────────
export default function Landing() {
  return (
    <div className="bg-white min-h-screen">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center text-white text-xs font-bold">A</div>
            <span className="text-sm font-semibold text-gray-900">Asas Enterprise</span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-7">
            {['Features', 'Solutions', 'Pricing', 'Documentation'].map(link => (
              <a key={link} href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                {link}
              </a>
            ))}
          </nav>

          {/* CTA */}
          <Link
            to="/register"
            className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Book a Demo
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-600 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Asas OS v2.0 is now available
          <ChevronRight size={12} className="text-gray-400" />
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-[1.08] tracking-tight mb-6">
          The operating system<br />
          for modern enterprise.
        </h1>

        {/* Subheading */}
        <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-10">
          Unify your projects, financials, and workforce in one
          pristine, high-performance platform built for scale.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Start Free Trial
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Explore the Platform
          </Link>
        </div>
      </section>

      {/* ── Dashboard mockup ── */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <DashboardMockup />
      </div>

      {/* ── Trusted by ── */}
      <section className="border-y border-gray-100 py-10 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-7">
            Trusted by industry leaders globally
          </p>
          <div className="flex items-center justify-center gap-10 flex-wrap">
            {COMPANIES.map(name => (
              <span key={name} className="text-sm font-semibold text-gray-300 hover:text-gray-500 transition-colors cursor-default">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Everything you need. Nothing you don't.
          </h2>
          <p className="text-gray-500 text-base max-w-lg mx-auto">
            A suite of unified tools engineered to eliminate friction, reduce cognitive load,
            and provide total operational visibility.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="bg-white border border-gray-100 rounded-2xl p-6 hover:border-gray-200 hover:shadow-sm transition-all"
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{f.title}</h3>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">{f.desc}</p>
              {f.preview}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA (dark) ── */}
      <section className="bg-gray-900 py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-4">
            Ready to upgrade your<br />infrastructure?
          </h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            Join forward-thinking teams operating at the highest level of efficiency.
            Deployment takes minutes, not months.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-white text-gray-900 text-sm font-semibold px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Deploy Asas Today
          </Link>
          <p className="text-gray-600 text-xs mt-4">No credit card required for 14-day trial</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 border-t border-gray-800 px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white text-[10px] font-bold">A</div>
            <span className="text-sm font-medium text-gray-400">Asas Enterprise</span>
            <span className="text-gray-700 text-xs">© {new Date().getFullYear()} Asas Enterprise. All rights reserved.</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            {['Privacy Policy', 'Terms of Service', 'Security', 'Status'].map(link => (
              <a key={link} href="#" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>

    </div>
  )
}