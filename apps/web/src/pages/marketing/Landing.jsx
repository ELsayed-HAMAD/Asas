import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useSession } from '../../lib/authClient'
import { PLATFORM_PLANS } from '../../../../../packages/contracts/src/billing/catalog.ts'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import MarketingNavbar from '../../components/marketing/MarketingNavbar'

const PLATFORM_CAPABILITIES = [
  { name: 'Finance', domain: 'Payables · receivables · ledger' },
  { name: 'People', domain: 'Employees · payroll · attendance' },
  { name: 'Customer work', domain: 'Accounts · deals · forecasts' },
  { name: 'Projects', domain: 'Portfolios · sprints · roadmaps' },
  { name: 'Operations', domain: 'Catalog · stock · movements' },
]

const PERSONAS = [
  {
    id: 'cfo',
    role: 'Chief Financial Officer',
    title: 'Review cash, receivables, and ledger activity in one workspace.',
    focus: 'A finance workflow for tracking invoices, settlements, reconciliation, and journal balances.',
    metrics: [
      { label: 'Payables and receivables', value: 'Track and review' },
      { label: 'Bank reconciliation', value: 'Match ledger entries' },
      { label: 'Trial balance', value: 'Review account totals' },
    ],
  },
  {
    id: 'coo',
    role: 'Chief Operating Officer',
    title: 'Keep people, approvals, and operational work visible together.',
    focus: 'A workspace for managing team records, attendance, stock, and project activity.',
    metrics: [
      { label: 'Team records', value: 'Employee directory' },
      { label: 'Inventory', value: 'Stock and movements' },
      { label: 'Projects', value: 'Roadmaps and sprints' },
    ],
  },
  {
    id: 'vpe',
    role: 'VP of Engineering',
    title: 'Give teams clear access boundaries and a shared view of work.',
    focus: 'Server-side sessions, workspace roles, tenant scoping, and an API for connected workflows.',
    metrics: [
      { label: 'Workspace access', value: 'Role checked' },
      { label: 'Data access', value: 'Tenant scoped' },
      { label: 'API', value: 'Documented endpoints' },
    ],
  },
  {
    id: 'hr',
    role: 'Chief People Officer',
    title: 'Keep employee records and payroll workflows organized.',
    focus: 'A people operations view for employee data, attendance, leave, and payroll runs.',
    metrics: [
      { label: 'Employee records', value: 'One directory' },
      { label: 'Attendance and leave', value: 'Review requests' },
      { label: 'Payroll', value: 'Prepare and approve runs' },
    ],
  },
]

export default function Landing() {
  const { data: session } = useSession()
  const location = useLocation()

  // Animation Refs
  const pageRef = useRef(null)
  const heroRef = useRef(null)
  const badgeRef = useRef(null)
  const headlineRef = useRef(null)
  const subtitleRef = useRef(null)
  const ctaRef = useRef(null)
  const mockupRef = useRef(null)
  // Interactive States
  const [activeCurrency, setActiveCurrency] = useState('USD')
  const [activePersona, setActivePersona] = useState(PERSONAS[0])

  useEffect(() => {
    // Keep marketing pages in light clean theme for universal brand presentation
    const hadDarkTheme = document.documentElement.classList.contains('dark')
    document.documentElement.classList.remove('dark')
    const restoreTheme = () => {
      if (hadDarkTheme) document.documentElement.classList.add('dark')
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return restoreTheme

    let cancelled = false
    let animationContext
    const loadAnimations = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ])
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)
      animationContext = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

        tl.fromTo(badgeRef.current, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6 })
          .fromTo(headlineRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.3')
          .fromTo(subtitleRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7 }, '-=0.5')
          .fromTo(ctaRef.current, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.6 }, '-=0.4')
          .fromTo(mockupRef.current, { opacity: 0, y: 40, rotateX: 6 }, { opacity: 1, y: 0, rotateX: 0, duration: 1 }, '-=0.4')

        gsap.utils.toArray('[data-gsap-reveal]', pageRef.current).forEach((element) => {
          gsap.fromTo(element,
            { autoAlpha: 0, y: 20 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.65,
              ease: 'power2.out',
              scrollTrigger: { trigger: element, start: 'top 88%', once: true },
            },
          )
        })

        gsap.utils.toArray('[data-gsap-parallax]', heroRef.current).forEach((element, index) => {
          gsap.to(element, {
            yPercent: index === 0 ? 18 : -12,
            ease: 'none',
            scrollTrigger: {
              trigger: heroRef.current,
              start: 'top top',
              end: 'bottom top',
              scrub: 0.7,
            },
          })
        })
      }, pageRef)
    }
    void loadAnimations()

    return () => {
      cancelled = true
      animationContext?.revert()
      restoreTheme()
    }
  }, [])

  useEffect(() => {
    if (!location.hash) return undefined
    let targetId
    try {
      targetId = decodeURIComponent(location.hash.slice(1))
    } catch {
      return undefined
    }
    const target = document.getElementById(targetId)
    if (!target) return undefined
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname, location.hash])

  // Currency calculations for interactive treasury card
  const currencyValues = {
    USD: { cash: '$2,840,500', inflow: '+$420,000', rate: 'USD Base' },
    EUR: { cash: '€2,612,400', inflow: '+€386,400', rate: '1 USD = 0.92 EUR' },
    SAR: { cash: '﷼10,651,800', inflow: '+﷼1,575,000', rate: '1 USD = 3.75 SAR' },
  }

  return (
    <div ref={pageRef} className="min-h-screen bg-surface text-body selection:bg-primary-light selection:text-primary">
      {/* ── Floating Glass Navbar ── */}
      <div className="pt-4">
        <MarketingNavbar />
      </div>

      {/* ── Hero Section ── */}
      <section
        ref={heroRef}
        className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-20 text-center overflow-hidden"
      >
        {/* Subtle Ambient Background Orbs */}
        <div data-gsap-parallax className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-accent/5 rounded-full blur-3xl pointer-events-none -z-10 animate-float" />
        <div data-gsap-parallax className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Release Pill */}
        <div ref={badgeRef} className="inline-block mb-6">
          <Badge
            variant="outline"
            className="inline-flex items-center gap-2 glass border border-border-default/80 text-heading shadow-glass rounded-full px-4 py-1.5 text-xs font-medium hover:border-accent/40 transition-micro cursor-default"
          >
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span>Asas Enterprise OS 2.0 • Multi-Currency Ledger Released</span>
            <ChevronRight className="w-3.5 h-3.5 text-caption" />
          </Badge>
        </div>

        {/* Hero Title */}
        <h1
          ref={headlineRef}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-heading leading-[1.08] max-w-4xl mx-auto"
        >
          The unified operating system for{' '}
          <span className="text-accent">
            modern enterprise.
          </span>
        </h1>

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          className="text-base sm:text-xl text-body-light max-w-2xl mx-auto mt-6 leading-relaxed"
        >
          Bring finance, workforce records, customer relationships, projects, and inventory into a shared
          workspace with clear controls for your team.
        </p>

        {/* CTA Actions */}
        <div
          ref={ctaRef}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          {session?.user ? (
            <Button
              asChild
              className="bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm h-12 px-7 rounded-button shadow-card hover:shadow-glow hover-lift transition-micro flex items-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <Link to="/dashboard">
                <span>Enter Enterprise Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                className="bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm h-12 px-7 rounded-button shadow-card hover:shadow-glow hover-lift transition-micro flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <Link to="/register">
                  <span>Start Free Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="glass hover:bg-surface-muted/80 border-border-default/80 text-heading font-medium text-sm h-12 px-6 rounded-button shadow-card hover-lift transition-micro cursor-pointer active:scale-[0.98]"
              >
                <Link to="/solutions">Explore Solutions</Link>
              </Button>
            </>
          )}
        </div>

        {/* Interactive Executive Mockup */}
        <div
          ref={mockupRef}
          className="mt-14 max-w-5xl mx-auto rounded-card border border-border-default/80 glass-strong shadow-glass overflow-hidden text-left hover-lift transition-premium"
        >
          {/* Browser Chrome Header */}
          <div className="glass-subtle border-b border-border-subtle/80 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-danger/80" />
              <div className="w-3 h-3 rounded-full bg-warning/80" />
              <div className="w-3 h-3 rounded-full bg-success/80" />
              <span className="text-xs font-mono text-caption ml-2">app.asas.io/dashboard</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span className="text-[10px] text-caption">Illustrative product preview · sample workspace and figures</span>
            </div>
          </div>

          {/* Mockup Dashboard Body */}
          <div className="grid grid-cols-1 md:grid-cols-4 min-h-[380px]">
            {/* Sidebar nav preview */}
            <div className="hidden md:block border-r border-border-subtle bg-surface-muted/70 p-4 space-y-1 text-xs">
              <div className="flex items-center gap-2 px-2 py-2 mb-3 bg-surface-raised border border-border-default rounded-button shadow-card">
                <div className="w-6 h-6 rounded-card-sm bg-primary text-on-primary flex items-center justify-center font-bold text-xs">
                  A
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-heading truncate">Acme Global</p>
                  <p className="text-[10px] text-caption truncate">Enterprise Tier</p>
                </div>
              </div>

              {[
                { label: 'Executive Overview', icon: BarChart3, active: true },
                { label: 'Treasury & Ledger', icon: DollarSign },
                { label: 'Human Capital', icon: Users },
                { label: 'Deal Pipeline', icon: TrendingUp },
                { label: 'Engineering Sprints', icon: Code2 },
                { label: 'Global Inventory', icon: Boxes },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-button font-medium transition-colors ${
                      item.active
                        ? 'bg-primary-light text-primary font-semibold'
                        : 'text-body hover:bg-surface-active'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-muted" />
                    <span>{item.label}</span>
                  </div>
                )
              })}
            </div>

            {/* Dashboard Workspace Canvas */}
            <div className="md:col-span-3 p-6 bg-surface-muted/30 flex flex-col justify-between">
              <div>
                {/* Metric Strip */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-surface-raised p-3.5 rounded-card-sm border border-border-default shadow-card">
                    <p className="text-[11px] font-medium text-caption">Consolidated Liquidity</p>
                    <p className="text-xl font-bold text-heading mt-1">$2,840,500</p>
                    <span className="text-[10px] font-medium text-success">↑ 14.8% vs last quarter</span>
                  </div>
                  <div className="bg-surface-raised p-3.5 rounded-card-sm border border-border-default shadow-card">
                    <p className="text-[11px] font-medium text-caption">Active Enterprise Seats</p>
                    <p className="text-xl font-bold text-heading mt-1">428 Members</p>
                    <span className="text-[10px] font-medium text-accent">Across 6 Countries</span>
                  </div>
                  <div className="bg-surface-raised p-3.5 rounded-card-sm border border-border-default shadow-card">
                    <p className="text-[11px] font-medium text-caption">Sprint Delivery Velocity</p>
                    <p className="text-xl font-bold text-heading mt-1">94.2%</p>
                    <span className="text-[10px] font-medium text-caption">Illustrative sample figures</span>
                  </div>
                </div>

                {/* Live Animated Cash Wave SVG */}
                <div className="bg-surface-raised p-4 rounded-card-sm border border-border-default shadow-card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs font-semibold text-heading">Revenue & Operating Cash Flow</p>
                    <p className="text-[10px] text-caption">Illustrative dashboard preview · sample figures</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-surface-muted text-muted border-border-default">
                      Q1 - Q4 Continuous
                    </Badge>
                  </div>
                  <svg viewBox="0 0 500 120" className="w-full h-24 overflow-visible">
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 90 Q60 50 120 70 T240 40 T360 65 T480 20 L500 25"
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0 90 Q60 50 120 70 T240 40 T360 65 T480 20 L500 25 L500 120 L0 120 Z"
                      fill="url(#chartGradient)"
                    />
                    <circle cx="480" cy="20" r="4" fill="#4f46e5" />
                  </svg>
                </div>
              </div>

              {/* Bottom live event ticker */}
              <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] text-caption">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success animate-ping" />
                  <span>Sample activity: journal entry approved</span>
                </div>
                <span className="font-mono text-caption">Illustrative preview</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Enterprise Social Proof ── */}
      <section data-gsap-reveal className="border-y border-border-default bg-surface-raised py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-caption mb-8">
            One workspace for connected business operations
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14">
            {PLATFORM_CAPABILITIES.map((client) => (
              <div key={client.name} className="flex flex-col items-center">
                <span className="text-base sm:text-lg font-bold text-body tracking-tight hover:text-heading transition-colors">
                  {client.name}
                </span>
                <span className="text-[10px] text-caption">{client.domain}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Interactive Bento Grid Section ── */}
      <section id="features" data-gsap-reveal className="max-w-6xl mx-auto px-4 sm:px-6 py-24 scroll-mt-20">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-3 text-accent border-accent-muted bg-accent-light">
            Engineered For Scale
          </Badge>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-heading tracking-tight">
            Comprehensive control over your entire enterprise.
          </h2>
          <p className="text-body-light text-base sm:text-lg max-w-2xl mx-auto mt-4 leading-relaxed">
            Eliminate fragmented point solutions. Asas unifies your financial ledger, payroll, CRM,
            and agile engineering into a single source of truth.
          </p>
          <p className="mt-3 text-xs text-caption">Screens and figures below are illustrative sample data.</p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Multi-Currency Treasury (Spans 2 columns) */}
          <div className="md:col-span-2 bg-surface-raised rounded-card border border-border-default/80 p-6 sm:p-8 shadow-card hover:shadow-card-hover hover-lift transition-premium flex flex-col justify-between hover:border-accent/40">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-button bg-accent-light text-accent shadow-xs">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-heading">Multi-Currency Treasury & FX</h3>
                </div>
                {/* Currency Switcher */}
                <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-button border border-border-default/80 shadow-xs">
                  {['USD', 'EUR', 'SAR'].map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setActiveCurrency(curr)}
                      className={`px-2.5 py-1 rounded-button text-xs font-semibold transition-micro cursor-pointer active:scale-[0.98] ${
                        activeCurrency === curr
                          ? 'bg-surface-raised text-accent shadow-card'
                          : 'text-body hover:text-heading hover:bg-surface-active/60'
                      }`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-sm text-body-light leading-relaxed">
                Manage invoices, recorded payments, reconciliation, ledger balances, and workspace FX rates together.
              </p>
              <p className="mt-2 text-[11px] text-caption">Illustrative sample figures and rates; the currency selector does not fetch live exchange rates.</p>

              {/* Dynamic Currency Display */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-6">
                <div className="bg-surface-muted/70 p-4 rounded-card-sm border border-border-default/80 hover-lift transition-micro">
                  <p className="text-xs text-caption font-medium">Consolidated Cash</p>
                  <p className="text-2xl font-extrabold text-heading mt-1">
                    {currencyValues[activeCurrency].cash}
                  </p>
                  <p className="text-[11px] text-caption mt-1">{currencyValues[activeCurrency].rate}</p>
                </div>
                <div className="bg-surface-muted/70 p-4 rounded-card-sm border border-border-default/80 hover-lift transition-micro">
                  <p className="text-xs text-caption font-medium">Monthly Inflow</p>
                  <p className="text-2xl font-extrabold text-success mt-1">
                    {currencyValues[activeCurrency].inflow}
                  </p>
                  <p className="text-[11px] text-caption mt-1">Illustrative sample figure</p>
                </div>
                <div className="hidden sm:block bg-surface-muted/70 p-4 rounded-card-sm border border-border-default/80 hover-lift transition-micro">
                  <p className="text-xs text-caption font-medium">Next Payroll Cycle</p>
                  <p className="text-2xl font-extrabold text-accent mt-1">Ready</p>
                  <p className="text-[11px] text-caption mt-1">Payroll run status preview</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-caption border-t border-border-subtle">
              <span>Workspace-maintained exchange rates</span>
              <Link to="/solutions" className="text-accent font-semibold hover:underline flex items-center gap-1 group">
                <span>Explore Treasury Features</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Card 2: Security & Tenant Isolation */}
          <div className="bg-surface-raised rounded-card border border-border-default/80 p-6 sm:p-8 shadow-card hover:shadow-card-hover hover-lift transition-premium flex flex-col justify-between hover:border-accent/40">
            <div>
              <div className="p-2 w-fit rounded-button bg-primary-light text-primary mb-4 shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-heading mb-2">Workspace security and access</h3>
              <p className="text-sm text-body-light leading-relaxed mb-6">
                Sign-in, workspace membership, server-side role checks, and tenant-scoped database access protect business data.
              </p>

              <div className="space-y-2.5">
                {[
                  { label: 'Google and Apple sign-in when configured', ok: true },
                  { label: 'Workspace roles and permissions', ok: true },
                  { label: 'Audit history for key actions', ok: true },
                  { label: 'Tenant-scoped data access', ok: true },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs text-body">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-border-subtle mt-6">
              <Link to="/documentation" className="text-xs text-accent font-semibold hover:underline flex items-center gap-1 group">
                <span>Read Security Whitepaper</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Card 3: Agile Engineering Sprints */}
          <div className="bg-surface-raised rounded-card border border-border-default/80 p-6 sm:p-8 shadow-card hover:shadow-card-hover hover-lift transition-premium flex flex-col justify-between hover:border-accent/40">
            <div>
              <div className="p-2 w-fit rounded-button bg-accent-light text-accent mb-4 shadow-xs">
                <Code2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-heading mb-2">Projects & Delivery</h3>
              <p className="text-sm text-body-light leading-relaxed mb-4">
                Organize project portfolios, roadmaps, sprint issues, and delivery progress.
              </p>

              {/* Mini Sprint Board */}
              <div className="space-y-2 bg-surface-muted/70 p-3 rounded-card-sm border border-border-default/80 text-xs">
                <div className="flex justify-between font-semibold text-heading pb-1 border-b border-border-subtle">
                  <span>Sprint Alpha • Velocity 94%</span>
                  <span className="text-accent font-mono">18 Points</span>
                </div>
                <div className="bg-surface-raised p-2 rounded-button border border-border-default shadow-card flex justify-between items-center transition-micro hover:scale-[1.01]">
                  <span className="truncate text-body">Postgres connection pooling</span>
                  <Badge variant="outline" className="text-[10px] bg-success-light text-success-text border-success-border">Done</Badge>
                </div>
                <div className="bg-surface-raised p-2 rounded-button border border-border-default shadow-card flex justify-between items-center transition-micro hover:scale-[1.01]">
                  <span className="truncate text-body">Review team permissions</span>
                  <Badge variant="outline" className="text-[10px] bg-accent-light text-accent border-accent-muted">In Review</Badge>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border-subtle mt-6">
              <Link to="/solutions" className="text-xs text-accent font-semibold hover:underline flex items-center gap-1 group">
                <span>Explore Engineering Suite</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Card 4: Executive CRM & Deals (Spans 2 columns) */}
          <div className="md:col-span-2 bg-surface-raised rounded-card border border-border-default/80 p-6 sm:p-8 shadow-card hover:shadow-card-hover hover-lift transition-premium flex flex-col justify-between hover:border-accent/40">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-button bg-success-light text-success shadow-xs">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-heading">High-Value Deal Pipeline</h3>
              </div>

              <p className="text-sm text-body-light leading-relaxed mb-6">
                Track customer relationships and deal stages alongside finance and project workflows.
              </p>

              {/* Deal Stages Pipeline */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs mb-4">
                {[
                  { stage: 'Prospecting', value: '$840K', count: '14 Deals' },
                  { stage: 'Security Review', value: '$1.4M', count: '6 Deals' },
                  { stage: 'Negotiation', value: '$2.1M', count: '4 Deals' },
                  { stage: 'Closed Won', value: '$4.8M', count: '28 Deals' },
                ].map((s) => (
                  <div key={s.stage} className="p-3 rounded-card-sm border border-border-default/80 bg-surface-muted/70 hover-lift transition-micro">
                    <p className="font-semibold text-heading">{s.stage}</p>
                    <p className="text-base font-bold text-heading mt-1">{s.value}</p>
                    <p className="text-[10px] text-caption mt-0.5">{s.count}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-border-subtle flex items-center justify-between text-xs text-caption">
              <span>Illustrative deal pipeline · sample figures</span>
              <Link to="/solutions" className="text-accent font-semibold hover:underline flex items-center gap-1 group">
                <span>Explore CRM Workflows</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Executive Persona Switcher ── */}
      <section data-gsap-reveal className="bg-surface-muted border-y border-border-default py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-accent border-accent-muted bg-accent-light">
              Executive Alignment
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-heading tracking-tight">
              Built for every seat in the boardroom.
            </h2>
            <p className="text-body-light text-base sm:text-lg max-w-2xl mx-auto mt-4">
              Explore how Asas delivers tailored operational leverage to each C-suite leader.
            </p>

            {/* Persona Tabs */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePersona(p)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-micro cursor-pointer active:scale-[0.98] ${
                    activePersona.id === p.id
                      ? 'bg-primary text-on-primary shadow-card hover:shadow-glow'
                      : 'glass text-body hover:bg-surface-raised hover:text-heading border border-border-default/80 hover-lift'
                  }`}
                >
                  {p.role}
                </button>
              ))}
            </div>
          </div>

          {/* Active Persona Showcase */}
          <div className="glass-strong border border-border-default/80 rounded-card p-6 sm:p-10 shadow-glass transition-premium">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
              <div className="lg:col-span-2 space-y-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                  {activePersona.role}
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-heading leading-tight">
                  "{activePersona.title}"
                </h3>
                <p className="text-body-light text-base leading-relaxed pt-2">
                  {activePersona.focus}
                </p>
                <div className="pt-2 text-xs text-caption">Illustrative workflow description</div>
                </div>

              {/* Metric Pillars */}
              <div className="space-y-3">
                {activePersona.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="bg-surface-muted/80 border border-border-default/80 p-4 rounded-card-sm flex items-center justify-between hover-lift transition-micro"
                  >
                    <span className="text-xs text-caption">{m.label}</span>
                    <span className="text-lg font-bold text-success">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Interactive Pricing Matrix & Calculator ── */}
      <section id="pricing" data-gsap-reveal className="max-w-6xl mx-auto px-4 sm:px-6 py-24 scroll-mt-20">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-3 text-accent border-accent-muted bg-accent-light">
            Transparent Pricing
          </Badge>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-heading tracking-tight">
            Plans that scale with your team and storage.
          </h2>
          <p className="text-body-light text-base sm:text-lg max-w-2xl mx-auto mt-4">
            Every workspace starts with the <strong className="text-heading font-semibold">Free plan</strong>.
            Prices below are monthly; paid checkout depends on Stripe being configured.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {PLATFORM_PLANS.map((plan) => {
            const highlighted = Boolean(plan.popular)
            const isFree = plan.id === 'free'
            const price = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: plan.currency,
              maximumFractionDigits: 0,
            }).format(plan.priceMonthly)

            return (
              <div
                key={plan.id}
                className={`rounded-card p-6 flex flex-col justify-between hover-lift transition-premium relative ${
                  highlighted
                    ? 'bg-primary text-on-primary border-2 border-accent shadow-glass hover:shadow-glow'
                    : 'bg-surface-raised border border-border-default/80 hover:border-border-strong shadow-card hover:shadow-card-hover'
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-on-primary text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-card">
                    Most Popular
                  </span>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`font-bold text-lg ${highlighted ? 'text-on-primary' : 'text-heading'}`}>{plan.name}</h3>
                    {isFree && (
                      <Badge variant="outline" className="bg-surface-muted text-body text-[10px] border-border-default shadow-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className={`text-xs mb-6 ${highlighted ? 'text-primary-subtle' : 'text-caption'}`}>{plan.tagline}</p>
                  <div className="mb-6">
                    <span className={`text-4xl font-extrabold ${highlighted ? 'text-on-primary' : 'text-heading'}`}>{price}</span>
                    <span className={`text-xs ml-1 ${highlighted ? 'text-primary-subtle' : 'text-caption'}`}>
                      {isFree ? '/ month forever' : '/ month'}
                    </span>
                  </div>
                  <ul className={`space-y-3 text-xs ${highlighted ? 'text-primary-light' : 'text-body-light'}`}>
                    <li className="flex items-center gap-2">
                      <Check className={`w-4 h-4 flex-shrink-0 ${highlighted ? 'text-success-bright' : 'text-success'}`} />
                      <span>Up to {plan.seatLimit.toLocaleString()} team members</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className={`w-4 h-4 flex-shrink-0 ${highlighted ? 'text-success-bright' : 'text-success'}`} />
                      <span>{plan.storageLimitGb.toLocaleString()} GB storage allowance</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className={`w-4 h-4 flex-shrink-0 ${highlighted ? 'text-success-bright' : 'text-success'}`} />
                      <span>Access to current product modules</span>
                    </li>
                  </ul>
                </div>
                <Button
                  asChild
                  variant={highlighted ? 'default' : isFree ? 'default' : 'outline'}
                  className={`w-full mt-8 text-xs h-10 rounded-button shadow-card hover-lift transition-micro active:scale-[0.98] ${
                    highlighted || isFree ? 'bg-accent hover:bg-accent-hover text-on-primary' : 'border-border-default/80 bg-surface-raised hover:bg-surface-muted text-heading'
                  }`}
                >
                  <Link to="/register">{isFree ? 'Start Free Now' : 'Start on Free'}</Link>
                </Button>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Call to Action Banner ── */}
      <section data-gsap-reveal className="bg-primary text-on-primary py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="outline" className="mb-4 text-on-primary border-primary-subtle bg-primary-hover">
            Immediate Board-Ready Deployment
          </Badge>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Ready to upgrade your enterprise infrastructure?
          </h2>
          <p className="text-primary-subtle text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Join enterprise leaders orchestrating high-velocity operations with total clarity and zero downtime.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              asChild
              className="bg-accent hover:bg-accent-hover text-on-primary font-medium text-sm h-12 px-8 rounded-button shadow-card"
            >
              <Link to="/register">Deploy Free Workspace</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-primary-subtle text-on-primary hover:bg-primary-hover text-sm h-12 px-6 rounded-button"
            >
              <Link to="/solutions">Explore product workflows</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Enterprise Footer ── */}
      <footer className="bg-primary text-on-primary border-t border-primary-hover py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-card-sm bg-accent text-on-primary flex items-center justify-center font-bold text-xs shadow-card">
                A
              </div>
              <span className="text-base font-bold text-on-primary">Asas Enterprise</span>
            </div>
            <p className="text-xs text-primary-subtle max-w-xs leading-relaxed mb-4">
              The high-performance operating system designed for modern multi-currency enterprises.
            </p>
            <p className="text-[11px] text-primary-subtle">
              © {new Date().getFullYear()} Asas Technologies Inc. All rights reserved.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-on-primary mb-3">Product</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/#features" className="text-primary-subtle hover:text-on-primary transition-colors">Features</Link></li>
              <li><Link to="/solutions" className="text-primary-subtle hover:text-on-primary transition-colors">Solutions</Link></li>
              <li><Link to="/pricing" className="text-primary-subtle hover:text-on-primary transition-colors">Pricing</Link></li>
              <li><Link to="/status" className="text-primary-subtle hover:text-on-primary transition-colors">System Status</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-on-primary mb-3">Resources</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/documentation" className="text-primary-subtle hover:text-on-primary transition-colors">Documentation</Link></li>
              <li><Link to="/documentation#api-reference" className="text-primary-subtle hover:text-on-primary transition-colors">API Reference</Link></li>
              <li><Link to="/documentation#security" className="text-primary-subtle hover:text-on-primary transition-colors">Access & data handling</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-on-primary mb-3">Legal & Trust</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/privacy" className="text-primary-subtle hover:text-on-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-primary-subtle hover:text-on-primary transition-colors">Terms of Service</Link></li>
              <li><Link to="/documentation#security" className="text-primary-subtle hover:text-on-primary transition-colors">Security practices</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}
