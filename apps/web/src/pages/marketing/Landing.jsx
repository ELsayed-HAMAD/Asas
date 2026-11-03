import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  Code2,
  DollarSign,
  Layers3,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useSession } from '../../lib/authClient'
import { PLATFORM_PLANS } from '../../../../../packages/contracts/src/billing/catalog.ts'
import { Button } from '../../components/ui/button'
import { AsasLogo } from '../../components/common/AsasLogo'
import CookieSettingsButton from '../../components/common/CookieSettingsButton'
import MarketingNavbar from '../../components/marketing/MarketingNavbar'
import LandingFX from './LandingFX'

const GLASS_PANEL = 'border border-white/80 bg-white/55 shadow-[0_24px_80px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl'

const PLATFORM_CAPABILITIES = [
  { id: 'finance', name: 'Finance', icon: DollarSign },
  { id: 'hr', name: 'People', icon: Users },
  { id: 'crm', name: 'CRM', icon: TrendingUp },
  { id: 'inventory', name: 'Inventory', icon: Boxes },
  { id: 'engineering', name: 'Projects', icon: Code2 },
]

const WORKFLOWS = [
  {
    id: 'finance',
    label: 'Finance',
    icon: DollarSign,
    eyebrow: 'Finance workflow',
    title: 'From invoice to reconciliation.',
    description: 'Customer balances, recorded payments, and balanced journal entries stay connected.',
    steps: [
      { label: 'Customer invoice', detail: 'Receivable recorded' },
      { label: 'Payment received', detail: 'Ready to reconcile' },
      { label: 'Journal entry', detail: 'Debit and credit balanced' },
    ],
  },
  {
    id: 'hr',
    label: 'People',
    icon: Users,
    eyebrow: 'People workflow',
    title: 'People operations, clearly organized.',
    description: 'Employee records, attendance, leave, and payroll review in one calm workflow.',
    steps: [
      { label: 'Employee record', detail: 'Workspace directory' },
      { label: 'Attendance & leave', detail: 'Requests ready for review' },
      { label: 'Payroll run', detail: 'Prepare and approve' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: TrendingUp,
    eyebrow: 'Customer workflow',
    title: 'Every relationship has a next step.',
    description: 'Accounts and deals move through a pipeline your whole team can understand.',
    steps: [
      { label: 'Qualified account', detail: 'Shared customer context' },
      { label: 'Proposal', detail: 'Deal activity in one place' },
      { label: 'Closed won', detail: 'Ready for delivery' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Boxes,
    eyebrow: 'Inventory workflow',
    title: 'Stock movements without the mystery.',
    description: 'Catalog records, quantities, and stock movements stay visible to the teams that need them.',
    steps: [
      { label: 'Product catalog', detail: 'Shared item records' },
      { label: 'Stock movement', detail: 'Incoming and outgoing activity' },
      { label: 'Available stock', detail: 'Current workspace view' },
    ],
  },
  {
    id: 'engineering',
    label: 'Projects',
    icon: Code2,
    eyebrow: 'Project workflow',
    title: 'Delivery connected to the business.',
    description: 'Portfolios, roadmaps, sprint issues, and delivery progress share the wider business context.',
    steps: [
      { label: 'Roadmap', detail: 'Priorities aligned' },
      { label: 'Sprint', detail: 'Work clearly assigned' },
      { label: 'Delivery', detail: 'Progress ready to review' },
    ],
  },
]

const PERSONAS = [
  {
    id: 'cfo',
    role: 'Finance lead',
    icon: DollarSign,
    title: 'Review cash, receivables, and ledger activity in one workspace.',
    focus: 'A finance workflow for tracking invoices, settlements, reconciliation, and journal balances.',
    metrics: [
      { label: 'Payables and receivables', value: 'Review and reconcile' },
      { label: 'Bank reconciliation', value: 'Match ledger entries' },
      { label: 'Trial balance', value: 'Review account totals' },
    ],
  },
  {
    id: 'coo',
    role: 'Operations lead',
    icon: Layers3,
    title: 'Keep people, approvals, and operational work visible together.',
    focus: 'A workspace for managing team records, attendance, stock, and project activity.',
    metrics: [
      { label: 'Team records', value: 'Maintain directory' },
      { label: 'Inventory', value: 'Record movements' },
      { label: 'Projects', value: 'Plan sprints' },
    ],
  },
  {
    id: 'vpe',
    role: 'Engineering lead',
    icon: Code2,
    title: 'Give teams clear access boundaries and a shared view of work.',
    focus: 'Server-side sessions, workspace roles, tenant scoping, and an API for connected workflows.',
    metrics: [
      { label: 'Workspace access', value: 'Assign roles' },
      { label: 'Data access', value: 'Check permissions' },
      { label: 'API', value: 'Review endpoints' },
    ],
  },
  {
    id: 'hr',
    role: 'People lead',
    icon: Users,
    title: 'Keep employee records and payroll workflows organized.',
    focus: 'A people operations view for employee data, attendance, leave, and payroll runs.',
    metrics: [
      { label: 'Employee records', value: 'Maintain records' },
      { label: 'Attendance and leave', value: 'Review requests' },
      { label: 'Payroll', value: 'Prepare and approve runs' },
    ],
  },
]

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-action">{children}</p>
  )
}

export default function Landing() {
  const { data: session } = useSession()
  const location = useLocation()
  const pageRef = useRef(null)
  const heroRef = useRef(null)
  const previewRef = useRef(null)
  const previewTiltRef = useRef(null)
  const workflowPanelRef = useRef(null)
  const personaPanelRef = useRef(null)
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0)
  const [activePersona, setActivePersona] = useState(PERSONAS[0])
  const activeWorkflow = WORKFLOWS[activeWorkflowIndex]
  const ActiveWorkflowIcon = activeWorkflow.icon
  const ActivePersonaIcon = activePersona.icon

  useEffect(() => {
    const hadDarkTheme = document.documentElement.classList.contains('dark')
    document.documentElement.classList.remove('dark')
    const restoreTheme = () => {
      if (hadDarkTheme) document.documentElement.classList.add('dark')
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return restoreTheme

    let cancelled = false
    let animationContext
    let magneticCleanup = []
    const loadAnimations = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ])
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)
      animationContext = gsap.context(() => {
        gsap.set('[data-hero-line] > span', { transformOrigin: '0% 100%' })
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
        intro
          .fromTo('[data-hero-eyebrow]', { autoAlpha: 0, y: 14, scale: 0.94 }, {
            autoAlpha: 1, y: 0, scale: 1, duration: 0.65, ease: 'expo.out',
          })
          .fromTo('[data-hero-line] > span', { yPercent: 118, rotate: 2.2 }, {
            yPercent: 0, rotate: 0, duration: 1.15, stagger: 0.12, ease: 'expo.out',
          }, '-=0.32')
          .fromTo('[data-hero-copy]', { autoAlpha: 0, y: 22 }, {
            autoAlpha: 1, y: 0, duration: 0.8,
          }, '-=0.62')
          .fromTo('[data-hero-actions]', { autoAlpha: 0, y: 16 }, {
            autoAlpha: 1, y: 0, duration: 0.7,
          }, '-=0.5')
          .fromTo(previewRef.current, {
            autoAlpha: 0, y: 60, scale: 0.955, rotationX: 9, transformPerspective: 1400,
          }, {
            autoAlpha: 1, y: 0, scale: 1, rotationX: 0, duration: 1.35, ease: 'expo.out',
          }, '-=0.55')
          .fromTo('[data-preview-shine]', { xPercent: -220, autoAlpha: 0 }, {
            xPercent: 220, autoAlpha: 0.55, duration: 1.2, ease: 'power2.inOut',
          }, '-=0.7')
          .to('[data-preview-shine]', { autoAlpha: 0, duration: 0.35 }, '-=0.12')

        gsap.utils.toArray('[data-reveal]', pageRef.current).forEach((element) => {
          gsap.fromTo(element, { autoAlpha: 0, y: 38, scale: 0.985, filter: 'blur(9px)' }, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
            duration: 0.95,
            ease: 'power3.out',
            scrollTrigger: { trigger: element, start: 'top 88%', once: true },
            onComplete: () => gsap.set(element, { clearProps: 'filter,transform' }),
          })
        })

        gsap.utils.toArray('[data-reveal-group]', pageRef.current).forEach((group) => {
          gsap.fromTo(group.children, { autoAlpha: 0, y: 28, filter: 'blur(6px)' }, {
            autoAlpha: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.7,
            stagger: 0.09,
            ease: 'power3.out',
            scrollTrigger: { trigger: group, start: 'top 88%', once: true },
            onComplete: () => gsap.set(group.children, { clearProps: 'filter,transform' }),
          })
        })

        gsap.to('[data-ambient]', {
          yPercent: 20,
          scale: 1.08,
          rotation: 5,
          ease: 'none',
          scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 1.2 },
        })

        gsap.to('[data-ambient-secondary]', {
          xPercent: -8,
          yPercent: -14,
          rotation: -6,
          ease: 'none',
          scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 1.4 },
        })

        gsap.to('[data-preview-motion]', {
          y: -44,
          ease: 'none',
          scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 1.1 },
        })

        magneticCleanup = gsap.utils.toArray('[data-magnetic]', pageRef.current).map((element) => {
          const strength = Number(element.dataset.magnetic) || 0.12
          const moveX = gsap.quickTo(element, 'x', { duration: 0.45, ease: 'power3.out' })
          const moveY = gsap.quickTo(element, 'y', { duration: 0.45, ease: 'power3.out' })
          const handleMove = (event) => {
            if (event.pointerType !== 'mouse') return
            const rect = element.getBoundingClientRect()
            moveX((event.clientX - rect.left - rect.width / 2) * strength)
            moveY((event.clientY - rect.top - rect.height / 2) * strength)
          }
          const handleLeave = () => {
            moveX(0)
            moveY(0)
          }
          element.addEventListener('pointermove', handleMove, { passive: true })
          element.addEventListener('pointerleave', handleLeave)
          return () => {
            element.removeEventListener('pointermove', handleMove)
            element.removeEventListener('pointerleave', handleLeave)
            gsap.set(element, { clearProps: 'transform' })
          }
        })
      }, pageRef)
    }
    void loadAnimations()

    return () => {
      cancelled = true
      magneticCleanup.forEach(cleanup => cleanup())
      animationContext?.revert()
      restoreTheme()
    }
  }, [])

  useEffect(() => {
    const surface = previewTiltRef.current
    const anchor = previewRef.current
    if (!surface || !anchor) return undefined
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ) {
      return undefined
    }

    const glare = surface.querySelector('[data-preview-glare]')
    let frame = 0
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0

    const animate = () => {
      frame = 0
      currentX += (targetX - currentX) * 0.12
      currentY += (targetY - currentY) * 0.12
      surface.style.transform = `rotateX(${currentX.toFixed(3)}deg) rotateY(${currentY.toFixed(3)}deg)`
      if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
        frame = window.requestAnimationFrame(animate)
      }
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(animate)
    }

    const handleMove = (event) => {
      if (event.pointerType !== 'mouse') return
      const rect = anchor.getBoundingClientRect()
      const relativeX = (event.clientX - rect.left) / rect.width - 0.5
      const relativeY = (event.clientY - rect.top) / rect.height - 0.5
      targetX = relativeY * -8
      targetY = relativeX * 8
      if (glare) {
        glare.style.setProperty('--glare-x', `${(relativeX + 0.5) * 100}%`)
        glare.style.setProperty('--glare-y', `${(relativeY + 0.5) * 100}%`)
        glare.style.opacity = '1'
      }
      schedule()
    }

    const handleLeave = () => {
      targetX = 0
      targetY = 0
      if (glare) glare.style.opacity = '0'
      schedule()
    }

    surface.addEventListener('pointermove', handleMove, { passive: true })
    surface.addEventListener('pointerleave', handleLeave)
    return () => {
      window.cancelAnimationFrame(frame)
      surface.removeEventListener('pointermove', handleMove)
      surface.removeEventListener('pointerleave', handleLeave)
      surface.style.transform = ''
      if (glare) glare.style.opacity = '0'
    }
  }, [])

  useEffect(() => {
    if (!workflowPanelRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let cancelled = false
    let transitionContext
    void import('gsap').then(({ gsap }) => {
      if (cancelled || !workflowPanelRef.current) return
      transitionContext = gsap.context(() => {
        gsap.fromTo('[data-workflow-content]', { autoAlpha: 0, y: 14, filter: 'blur(6px)' }, {
          autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.45, ease: 'power2.out', clearProps: 'filter,transform',
        })
        gsap.fromTo('[data-workflow-step]', { autoAlpha: 0, y: 16, filter: 'blur(5px)' }, {
          autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5, stagger: 0.07, ease: 'power2.out', clearProps: 'filter,transform',
        })
      }, workflowPanelRef)
    })
    return () => {
      cancelled = true
      transitionContext?.revert()
    }
  }, [activeWorkflowIndex])

  useEffect(() => {
    if (!personaPanelRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let cancelled = false
    let transitionContext
    void import('gsap').then(({ gsap }) => {
      if (cancelled || !personaPanelRef.current) return
      transitionContext = gsap.context(() => {
        gsap.fromTo(personaPanelRef.current, { autoAlpha: 0.8, y: 12, scale: 0.992, filter: 'blur(5px)' }, {
          autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.4, ease: 'power2.out', clearProps: 'transform,opacity,visibility,filter',
        })
      }, personaPanelRef)
    })
    return () => {
      cancelled = true
      transitionContext?.revert()
    }
  }, [activePersona.id])

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

  return (
    <div ref={pageRef} className="min-h-screen overflow-clip bg-canvas font-sans text-ink selection:bg-info-soft selection:text-action-text-deep">
        <LandingFX />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-70 focus:rounded-full focus:bg-white focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-slate-950 focus:shadow-lg">
        Skip to content
      </a>

      <MarketingNavbar />
      <div className="h-20" aria-hidden="true" />

      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <section ref={heroRef} className="relative isolate px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:pb-32">
          <div data-ambient className="absolute left-1/2 top-[-420px] -z-10 h-[820px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(174,210,255,0.55),rgba(221,214,254,0.28)_42%,transparent_72%)] blur-2xl" aria-hidden="true" />
          <div data-ambient-secondary className="absolute right-[-8%] top-[18%] -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(221,214,254,0.42),transparent_70%)] blur-3xl" aria-hidden="true" />

          <div className="mx-auto max-w-6xl text-center">
            <div data-hero-eyebrow className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/50 px-4 py-2 text-xs font-medium text-ink-muted-strong shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-action" aria-hidden="true" />
              One connected business workspace
            </div>

            <h1 data-hero-title className="mx-auto mt-8 max-w-6xl text-[clamp(3rem,7.6vw,7rem)] font-semibold leading-[0.96] tracking-[-0.065em]">
              <span data-hero-line className="block overflow-hidden pb-[0.08em]"><span className="inline-block">Everything connected.</span></span>
              <span data-hero-line className="block overflow-hidden pb-[0.1em] text-ink-soft"><span className="inline-block">Nothing complicated.</span></span>
            </h1>

            <p data-hero-copy className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-ink-secondary sm:text-xl sm:leading-9">
              Finance, people, customers, projects, and inventory in one thoughtful workspace, so your team always knows what matters next.
            </p>

            <div data-hero-actions className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild className="h-12 rounded-full bg-action px-7 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover hover:shadow-[0_14px_36px_rgba(0,113,227,0.28)]">
                <Link to={session?.user ? '/dashboard' : '/register'} data-magnetic="0.16">
                  {session?.user ? 'Open your workspace' : 'Get started free'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Link to="/#features" data-magnetic="0.08" className="group inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-action transition-colors hover:bg-white/60">
                Explore the platform
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
            <p className="mt-5 text-xs text-ink-soft">Free workspace · All current product areas</p>
          </div>

          <div data-preview-motion className="mx-auto mt-16 max-w-6xl sm:mt-20" style={{ perspective: '1400px' }}>
            <div ref={previewTiltRef} data-preview-tilt className="[transform-style:preserve-3d] will-change-transform">
              <div ref={previewRef} data-preview className={`${GLASS_PANEL} relative overflow-hidden rounded-[32px] p-2`}>
                <span data-preview-shine aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/2 z-20 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 mix-blend-soft-light" />
                <span
                  data-preview-glare
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 rounded-[32px] opacity-0 mix-blend-soft-light transition-opacity duration-300"
                  style={{ background: 'radial-gradient(420px circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255,255,255,0.42), transparent 62%)' }}
                />
                <div className="overflow-hidden rounded-[26px] border border-black/[0.04] bg-white/65">
              <div className="flex h-14 items-center justify-between border-b border-black/[0.06] px-5 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5" aria-hidden="true">
                    <span className="h-2 w-2 rounded-full bg-surface-silver" />
                    <span className="h-2 w-2 rounded-full bg-surface-silver" />
                    <span className="h-2 w-2 rounded-full bg-surface-silver" />
                  </div>
                  <span className="ml-1 text-xs font-medium text-ink-secondary">Asas workspace</span>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">Interactive preview</span>
              </div>

              <div className="p-5 sm:p-8 lg:p-10">
                <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Choose a product workflow">
                  <div className="mx-auto flex w-max rounded-full border border-black/[0.05] bg-canvas-muted/80 p-1">
                    {WORKFLOWS.map((workflow, index) => {
                      const active = index === activeWorkflowIndex
                      return (
                        <button
                          key={workflow.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setActiveWorkflowIndex(index)}
                          className={`whitespace-nowrap rounded-full px-2.5 py-2 text-[11px] font-medium transition-all sm:px-5 sm:text-xs ${active ? 'bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,0.08)]' : 'text-ink-muted hover:text-ink'}`}
                        >
                          {workflow.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div ref={workflowPanelRef} data-testid="workflow-panel" className="mt-9 sm:mt-11">
                  <div data-workflow-content className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-action">{activeWorkflow.eyebrow}</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">{activeWorkflow.title}</h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">{activeWorkflow.description}</p>
                    </div>
                    <span className="hidden h-12 w-12 items-center justify-center rounded-2xl border border-black/[0.05] bg-white text-action shadow-[0_8px_24px_rgba(0,0,0,0.05)] lg:flex">
                      <ActiveWorkflowIcon className="h-5 w-5" />
                    </span>
                  </div>

                  <div className="mt-8 grid gap-3 md:grid-cols-3">
                    {activeWorkflow.steps.map((step, index) => (
                      <div data-workflow-step key={step.label} className="rounded-2xl border border-black/[0.04] bg-canvas/80 p-5 transition-transform duration-300 hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-ink-faint-soft">0{index + 1}</span>
                          <CheckCircle2 className="h-4 w-4 text-action" />
                        </div>
                        <p className="mt-6 text-sm font-semibold text-ink-strong">{step.label}</p>
                        <p className="mt-1.5 text-xs leading-5 text-ink-soft">{step.detail}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-[10px] text-ink-faint-soft">Illustrative workflow · no live business figures</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

          <nav aria-label="Product areas" className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-x-7 gap-y-4 sm:gap-x-10">
            {PLATFORM_CAPABILITIES.map((capability) => (
              <Link key={capability.id} to={`/solutions?area=${capability.id}`} className="text-sm font-medium text-ink-muted transition-colors hover:text-action">
                {capability.name}
              </Link>
            ))}
          </nav>
        </section>

        <section id="features" className="scroll-mt-24 border-y border-black/[0.06] bg-white px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <div data-reveal className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <SectionLabel>Why Asas</SectionLabel>
                <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl">Complex operations.<br />Made to feel simple.</h2>
              </div>
              <p className="max-w-lg text-base leading-7 text-ink-muted lg:justify-self-end">A focused workspace for the work your team already does, without extra layers of noise.</p>
            </div>

            <div data-reveal-group className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
              {[
                { number: '01', title: 'One shared context', copy: 'Finance, people, customer, project, and inventory records stay connected inside the same workspace.' },
                { number: '02', title: 'Clear team workflows', copy: 'Each area has a purpose and a clear next step, so handoffs feel natural instead of fragmented.' },
                { number: '03', title: 'Control without clutter', copy: 'Workspace roles, tenant-scoped access, and audit history protect your data behind the scenes.' },
              ].map((item) => (
                <article key={item.number} className="border-t border-black/10 pt-6 transition-[transform,border-color] duration-500 ease-out hover:-translate-y-1 hover:border-action/30">
                  <span className="font-mono text-[10px] text-action">{item.number}</span>
                  <h3 className="mt-8 text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-ink-muted">{item.copy}</p>
                </article>
              ))}
            </div>

            <div data-reveal className="mt-14 flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-6 text-xs text-ink-muted">
              <ShieldCheck className="h-4 w-4 shrink-0 text-action" />
              <span>Server-side access controls and tenant-scoped data access.</span>
              <Link to="/documentation#security" className="ml-auto shrink-0 font-medium text-action hover:underline">Security details</Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <div data-reveal className="mx-auto max-w-3xl text-center">
              <SectionLabel>Built around your team</SectionLabel>
              <h2 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl">A clearer view<br />for every team.</h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-ink-muted">Different responsibilities, with the same shared context.</p>
            </div>

            <div data-reveal className="mt-12 flex flex-wrap justify-center gap-2" role="group" aria-label="Choose a team view">
              {PERSONAS.map((persona) => {
                const active = activePersona.id === persona.id
                return (
                  <button key={persona.id} type="button" aria-pressed={active} onClick={() => setActivePersona(persona)} className={`rounded-full px-4 py-2.5 text-xs font-medium transition-all sm:px-5 ${active ? 'bg-inverse-ink text-white shadow-[0_8px_24px_rgba(0,0,0,0.14)]' : 'border border-black/[0.06] bg-white/50 text-ink-muted hover:bg-white hover:text-ink'}`}>
                    {persona.role}
                  </button>
                )
              })}
            </div>

            <div ref={personaPanelRef} data-testid="persona-panel" aria-live="polite" data-reveal className={`${GLASS_PANEL} mx-auto mt-8 max-w-5xl rounded-[28px] p-6 sm:p-10`}>
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-action">{activePersona.role}</p>
                  <h3 className="mt-5 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{activePersona.title}</h3>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-ink-muted">{activePersona.focus}</p>
                </div>
                <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white bg-white/70 text-action sm:flex"><ActivePersonaIcon className="h-5 w-5" /></span>
              </div>
              <div className="mt-9 grid border-t border-black/[0.07] pt-6 sm:grid-cols-3">
                {activePersona.metrics.map((metric) => (
                  <div key={metric.label} className="border-b border-black/[0.06] py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-ink-subtle">{metric.label}</p>
                    <p className="mt-2 text-xs font-semibold text-ink-body">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 border-y border-black/[0.06] bg-white px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <div data-reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <SectionLabel>Simple pricing</SectionLabel>
                <h2 className="mt-5 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Start free.<br />Grow when ready.</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-ink-muted">Every workspace starts on Free. Paid checkout depends on Stripe being configured for your deployment.</p>
            </div>

            <div data-reveal className="mt-14 overflow-hidden rounded-[28px] border border-black/[0.07] bg-canvas-soft">
              <div className="grid md:grid-cols-2 xl:grid-cols-4">
                {PLATFORM_PLANS.map((plan) => {
                  const isFree = plan.id === 'free'
                  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency, maximumFractionDigits: 0 }).format(plan.priceMonthly)
                  return (
                    <article key={plan.id} className="flex flex-col border-b border-black/[0.07] p-6 transition-colors duration-300 last:border-b-0 hover:bg-white/55 md:border-r md:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0">
                      <div className="flex min-h-6 items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">{plan.name}</h3>
                        {plan.popular && <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-action">Most popular</span>}
                      </div>
                      <p className="mt-2 min-h-10 text-xs leading-5 text-ink-soft">{plan.tagline}</p>
                      <div className="mt-7 flex items-end gap-2">
                        <span className="text-4xl font-semibold tracking-[-0.04em]">{price}</span>
                        <span className="pb-1 text-[10px] text-ink-soft">/ month</span>
                      </div>
                      <ul className="mt-7 space-y-3 text-xs text-ink-muted-soft">
                        <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-action" />Up to {plan.seatLimit.toLocaleString()} members</li>
                        <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-action" />{plan.storageLimitGb.toLocaleString()} GB storage</li>
                        <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-action" />Current product modules</li>
                      </ul>
                      <Button asChild variant={isFree ? 'default' : 'outline'} className={`mt-8 h-10 w-full rounded-full text-xs font-medium ${isFree ? 'bg-action text-white hover:bg-action-hover' : 'border-black/10 bg-transparent text-ink shadow-none hover:bg-white'}`}>
                        <Link to="/register">{isFree ? 'Start free' : 'Start on Free'}</Link>
                      </Button>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden px-4 py-24 sm:px-6 sm:py-32">
          <div className="absolute left-1/2 top-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(174,210,255,0.4),transparent_68%)] blur-2xl" aria-hidden="true" />
          <div data-reveal className={`${GLASS_PANEL} mx-auto max-w-5xl rounded-[32px] px-6 py-16 text-center sm:px-12 sm:py-20`}>
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white bg-white/65 text-ink shadow-sm"><AsasLogo className="h-4.5 w-4.5" /></span>
            <h2 className="mx-auto mt-7 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl">Bring your business<br />into focus.</h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-ink-muted">Set up your workspace and give every team a clearer next step. All current product areas are available on Free.</p>
            <Button asChild className="mt-8 h-12 rounded-full bg-action px-7 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover">
              <Link to={session?.user ? '/dashboard' : '/register'} data-magnetic="0.12">{session?.user ? 'Open your workspace' : 'Create your free workspace'}<ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[0.07] px-4 py-12 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 sm:gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex w-fit items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-inverse-ink text-white"><AsasLogo className="h-4 w-4" /></span>
              <span className="text-base font-semibold tracking-tight">Asas</span>
            </Link>
            <p className="mt-4 max-w-xs text-xs leading-6 text-ink-soft">One thoughtful workspace for finance, people, customers, projects, and inventory.</p>
            <p className="mt-6 text-[11px] text-ink-faint-soft">© {new Date().getFullYear()} Asas Technologies Inc. All rights reserved.</p>
          </div>
          <div>
            <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">Product</h3>
            <ul className="space-y-3 text-xs text-ink-soft">
              <li><Link to="/#features" className="transition-colors hover:text-action">Features</Link></li>
              <li><Link to="/solutions" className="transition-colors hover:text-action">Solutions</Link></li>
              <li><Link to="/pricing" className="transition-colors hover:text-action">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">Resources</h3>
            <ul className="space-y-3 text-xs text-ink-soft">
              <li><Link to="/documentation" className="transition-colors hover:text-action">Documentation</Link></li>
              <li><Link to="/documentation#api-reference" className="transition-colors hover:text-action">API reference</Link></li>
              <li><Link to="/documentation#security" className="transition-colors hover:text-action">Access & data handling</Link></li>
            </ul>
          </div>
          <div className="col-span-2 md:col-span-1">
            <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">Legal & trust</h3>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs text-ink-soft md:block md:space-y-3">
              <li><Link to="/privacy" className="transition-colors hover:text-action">Privacy policy</Link></li>
              <li><CookieSettingsButton className="transition-colors hover:text-action" /></li>
              <li><Link to="/terms" className="transition-colors hover:text-action">Terms of service</Link></li>
              <li><Link to="/documentation#security" className="transition-colors hover:text-action">Security practices</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}
