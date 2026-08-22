import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'

// ── Mini previews inside feature cards ─────────────────────

function TaskPreview() {
  return (
    <div className="bg-surface-raised rounded-card-sm border border-border-subtle p-3 shadow-card">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] text-caption">Active Sprint • Alpha Team</span>
        <span className="text-[10px] font-semibold text-accent">3 Days Left</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 bg-accent-light rounded-button px-2 py-1.5">
          <div className="w-3.5 h-3.5 rounded border-2 border-accent flex-shrink-0 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-accent-light0 rounded-sm" />
          </div>
          <span className="text-[10px] text-body flex-1">Optimize database queries</span>
          <div className="w-4 h-4 rounded-full bg-gray-800 flex-shrink-0" />
        </div>
        <div className="flex items-center gap-2 bg-surface-raised rounded-button px-2 py-1.5 border border-accent-light">
          <div className="w-3.5 h-3.5 rounded border-2 border-border-default flex-shrink-0" />
          <span className="text-[10px] text-body flex-1">Implement OAuth2.0 Flow</span>
          <span className="text-[9px] bg-danger-light text-danger font-medium px-1.5 py-0.5 rounded">High</span>
        </div>
      </div>
    </div>
  )
}

function FinancialPreview() {
  return (
    <div className="rounded-card-sm overflow-hidden bg-gradient-to-br from-teal-400 to-cyan-500 p-4 h-20 flex items-end">
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
    <div className="bg-surface-raised rounded-card-sm border border-border-subtle p-3 shadow-card space-y-2">
      <div className="flex items-center gap-2 p-2 rounded-button bg-success-light border border-success-border">
        <div className="w-5 h-5 rounded-input bg-success-light0 flex items-center justify-center flex-shrink-0 text-white text-[9px] font-bold">✦</div>
        <span className="text-[10px] text-body font-medium flex-1">New Lead Created</span>
        <div className="w-8 h-4 bg-accent-light0 rounded-full flex items-center justify-end px-0.5 flex-shrink-0">
          <div className="w-3 h-3 bg-surface-raised rounded-full shadow-card" />
        </div>
      </div>
      <div className="flex items-center gap-2 p-2 rounded-button bg-surface-muted">
        <div className="w-5 h-5 rounded-input bg-accent-light0 flex items-center justify-center flex-shrink-0 text-white text-[9px]">→</div>
        <span className="text-[10px] text-body-light">Route to Sales Pod A</span>
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
        <div key={b.label} className="bg-surface-muted rounded-card-sm p-2.5 border border-border-subtle text-center">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center mx-auto mb-1.5">
            <span className="text-white text-[10px]">✓</span>
          </div>
          <p className="text-[9px] font-semibold text-heading leading-tight">{b.label}</p>
          <p className="text-[8px] text-caption mt-0.5">{b.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Dashboard browser mockup ────────────────────────────────
function DashboardMockup() {
  return (
    <div className="rounded-card overflow-hidden border border-border-default shadow-elevated shadow-gray-200/80 bg-surface-raised">
      {/* Browser chrome */}
      <div className="bg-surface-active border-b border-border-default px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-danger" />
          <div className="w-3 h-3 rounded-full bg-warning" />
          <div className="w-3 h-3 rounded-full bg-success-dot" />
        </div>
        <div className="flex-1 bg-surface-raised rounded-input border border-border-default text-[10px] text-caption px-3 py-1 mx-2 text-center">
          app.asas.io/dashboard
        </div>
      </div>

      {/* App shell */}
      <div className="flex h-64">
        {/* Mini sidebar */}
        <div className="w-28 bg-surface-raised border-r border-border-subtle flex flex-col p-2 gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-1.5 py-1.5 mb-1">
            <div className="w-5 h-5 rounded-input bg-primary flex items-center justify-center text-[8px] text-white font-bold flex-shrink-0">A</div>
            <div>
              <p className="text-[8px] font-semibold text-heading leading-tight">Asas</p>
              <p className="text-[7px] text-caption">Enterprise ERP</p>
            </div>
          </div>
          {['Dashboard','HR','Finance','CRM','Inventory','Projects'].map((item, i) => (
            <div key={item} className={`px-2 py-1 rounded-input text-[8px] ${i === 0 ? 'bg-surface-active text-heading font-semibold' : 'text-caption'}`}>
              {item}
            </div>
          ))}
        </div>

        {/* Mini dashboard content */}
        <div className="flex-1 bg-surface-muted p-3 overflow-hidden">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Total Revenue', value: '$2.4M', color: 'text-heading' },
              { label: 'Active Deals',  value: '42',    color: 'text-heading' },
              { label: 'Win Rate',      value: '24.8%', color: 'text-success' },
            ].map(s => (
              <div key={s.label} className="bg-surface-raised rounded-button p-2 border border-border-subtle">
                <p className="text-[7px] text-caption mb-0.5">{s.label}</p>
                <p className={`text-[11px] font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Mini chart */}
          <div className="bg-surface-raised rounded-button p-2.5 border border-border-subtle mb-2">
            <p className="text-[7px] text-caption mb-2">Revenue Forecast</p>
            <svg viewBox="0 0 200 40" className="w-full h-8">
              <path d="M0 35 Q30 30 50 25 Q80 18 100 22 Q130 27 150 10 Q170 -2 200 5"
                fill="none" stroke="var(--color-blue-500)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M0 35 Q30 30 50 25 Q80 18 100 22 Q130 27 150 10 Q170 -2 200 5 L200 40 L0 40Z"
                fill="var(--color-blue-500)" opacity="0.08" />
            </svg>
          </div>

          {/* Mini table */}
          <div className="bg-surface-raised rounded-button border border-border-subtle overflow-hidden">
            <div className="grid grid-cols-3 px-2 py-1 bg-surface-muted border-b border-border-subtle">
              {['Employee', 'Dept', 'Status'].map(h => (
                <p key={h} className="text-[7px] text-caption font-medium">{h}</p>
              ))}
            </div>
            {[
              ['Sarah Jenkins', 'Engineering', 'Active'],
              ['Marcus Chen',   'DevOps',      'Active'],
              ['Elena R.',      'Engineering', 'Active'],
            ].map(([name, dept, status]) => (
              <div key={name} className="grid grid-cols-3 px-2 py-1 border-b border-border-faint">
                <p className="text-[7px] text-body font-medium">{name}</p>
                <p className="text-[7px] text-caption">{dept}</p>
                <span className="text-[6px] text-success font-medium">{status}</span>
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
    title: 'Workspace isolation',
    desc:  'Each company is a separate tenant. Sessions use short-lived JWTs; passwords are hashed. Roles control who can change payroll, settings, and records.',
    preview: <SecurityPreview />,
  },
]

const COMPANIES = ['AcmeCorp', 'Globex', 'Soylent', 'Initech', 'MassiveDynamic']

// ── Landing page ────────────────────────────────────────────
export default function Landing() {
  return (
    <div className="bg-surface-raised min-h-screen">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-surface-raised/90 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-button bg-primary flex items-center justify-center text-white text-xs font-bold">A</div>
            <span className="text-sm font-semibold text-heading">Asas Enterprise</span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-7">
            {['Features', 'Solutions', 'Pricing', 'Documentation'].map(link => (
              <a key={link} href="#" className="text-sm text-muted hover:text-heading transition-colors">
                {link}
              </a>
            ))}
          </nav>

          {/* CTA */}
          <Link
            to="/register"
            className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-button hover:bg-primary-hover transition-colors"
          >
            Book a Demo
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-surface-muted border border-border-default rounded-full px-3 py-1.5 text-xs text-body-light mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-light0 animate-pulse" />
          Asas OS v2.0 is now available
          <ChevronRight size={12} className="text-caption" />
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-extrabold text-heading leading-[1.08] tracking-tight mb-6">
          The operating system<br />
          for modern enterprise.
        </h1>

        {/* Subheading */}
        <p className="text-lg text-muted max-w-xl mx-auto leading-relaxed mb-10">
          Unify your projects, financials, and workforce in one
          pristine, high-performance platform built for scale.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-button hover:bg-primary-hover transition-colors"
          >
            Start Free Trial
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 border border-border-default text-body text-sm font-medium px-5 py-2.5 rounded-button hover:bg-surface-muted transition-colors"
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
      <section className="border-y border-border-subtle py-10 bg-surface-muted">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-center text-[11px] font-semibold text-caption uppercase tracking-widest mb-7">
            Trusted by industry leaders globally
          </p>
          <div className="flex items-center justify-center gap-10 flex-wrap">
            {COMPANIES.map(name => (
              <span key={name} className="text-sm font-semibold text-faint hover:text-muted transition-colors cursor-default">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-2xl md:text-4xl font-extrabold text-heading tracking-tight mb-4">
            Everything you need. Nothing you don't.
          </h2>
          <p className="text-muted text-lg max-w-lg mx-auto">
            A suite of unified tools engineered to eliminate friction, reduce cognitive load,
            and provide total operational visibility.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="bg-surface-raised border border-border-subtle rounded-card p-6 hover:border-border-default hover:shadow-card transition-all"
            >
              <h3 className="text-sm font-semibold text-heading mb-1.5">{f.title}</h3>
              <p className="text-xs text-caption mb-4 leading-relaxed">{f.desc}</p>
              {f.preview}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA (dark) ── */}
      <section className="bg-primary py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight mb-4">
            Ready to upgrade your<br />infrastructure?
          </h2>
          <p className="text-caption text-sm mb-8 leading-relaxed">
            Join forward-thinking teams operating at the highest level of efficiency.
            Deployment takes minutes, not months.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-surface-raised text-heading text-sm font-semibold px-6 py-3 rounded-button hover:bg-surface-active transition-colors"
          >
            Deploy Asas Today
          </Link>
          <p className="text-body-light text-xs mt-4">No credit card required for 14-day trial</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-primary border-t border-primary-hover px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-input bg-surface-raised/10 flex items-center justify-center text-white text-[10px] font-bold">A</div>
            <span className="text-sm font-medium text-caption">Asas Enterprise</span>
            <span className="text-body text-xs">© {new Date().getFullYear()} Asas Enterprise. All rights reserved.</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            {['Privacy Policy', 'Terms of Service', 'Security', 'Status'].map(link => (
              <a key={link} href="#" className="text-xs text-body-light hover:text-caption transition-colors">
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>

    </div>
  )
}