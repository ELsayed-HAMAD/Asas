import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Code2,
  Cpu,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'

const SOLUTIONS = [
  {
    id: 'finance',
    icon: DollarSign,
    badge: 'Finance',
    title: 'Finance & Receivables',
    subtitle: 'Manage accounts, journal entries, and customer receivables in one workspace.',
    description:
      'Asas includes finance workflows for maintaining accounts, recording balanced journal entries, and tracking receivables. Exchange rates are maintained by the workspace; external bank feeds and automatic currency conversion are not currently offered.',
    capabilities: [
      'Create and track customer receivables',
      'Record journal entries with debit and credit balancing',
      'Maintain workspace exchange rates for supported finance workflows',
      'Review finance summaries and account balances',
      'Keep finance records scoped to the active workspace',
    ],
    architecture: {
      input: 'Accounts & Finance Records',
      process: 'Workspace Finance Workflows',
      output: 'Receivables & Account Balances',
    },
  },
  {
    id: 'hr',
    icon: Users,
    badge: 'HR & Payroll',
    title: 'Workforce Management',
    subtitle: 'Organize employee records, attendance, leave, and payroll workflows.',
    description:
      'Use the workspace to manage employee and candidate records, attendance, leave requests, and payroll data. Payroll calculations and exports must be reviewed by your organization before payment; Asas does not submit bank transfers or calculate jurisdiction-specific tax automatically.',
    capabilities: [
      'Comprehensive employee directory with department trees and reporting lines',
      'Maintain employee and candidate records',
      'Submit and review leave requests against workspace policies',
      'Record attendance and review attendance summaries',
      'Prepare and review payroll records',
      'Review payroll outputs before handling payment outside Asas',
    ],
    architecture: {
      input: 'Attendance & Leave Requests',
      process: 'Workspace Payroll Calculations',
      output: 'Payroll Records for Review',
    },
  },
  {
    id: 'crm',
    icon: TrendingUp,
    badge: 'CRM',
    title: 'Customer & Sales Workflows',
    subtitle: 'Keep customer, contact, and opportunity records together.',
    description:
      'Track customer relationships and sales opportunities in the workspace. Review and create finance records through the available workflows; closing a deal does not automatically create an invoice or recognize revenue.',
    capabilities: [
      'Maintain customer and contact records',
      'Track opportunities through workspace sales stages',
      'Record activities and account notes',
      'Review sales summaries and quota records',
      'Create receivables separately through finance workflows',
    ],
    architecture: {
      input: 'Customer & Opportunity Records',
      process: 'Workspace Sales Stages',
      output: 'Pipeline Views & Sales Records',
    },
  },
  {
    id: 'engineering',
    icon: Code2,
    badge: 'Projects',
    title: 'Project Planning & Delivery',
    subtitle: 'Organize project work, tasks, and milestones in the workspace.',
    description:
      'Plan and track project work using the available project boards and task records. The dashboard reflects saved workspace data; it does not promise external engineering system synchronization.',
    capabilities: [
      'Create projects, tasks, and milestones',
      'Assign work and track task status',
      'Organize project work in workspace views',
      'Review project progress from saved records',
      'Use live updates where the connected session supports them',
    ],
    architecture: {
      input: 'Projects & Tasks',
      process: 'Assignment & Status Tracking',
      output: 'Project Progress & Milestones',
    },
  },
  {
    id: 'inventory',
    icon: Boxes,
    badge: 'Inventory',
    title: 'Inventory Records',
    subtitle: 'Track products and stock movements in your workspace.',
    description:
      'Maintain inventory items and record stock activity. Availability, valuation, and reorder decisions depend on the records entered by your team; external warehouse, supplier, and purchasing integrations are not implied.',
    capabilities: [
      'Maintain inventory item records',
      'Record stock movements in the workspace',
      'Review on-hand quantities from saved transactions',
      'Label products with warehouse, aisle, and bin details',
      'Review finance and inventory records separately',
    ],
    architecture: {
      input: 'Inventory Items & Stock Activity',
      process: 'Workspace Inventory Records',
      output: 'Recorded Stock Quantities',
    },
  },
  {
    id: 'governance',
    icon: ShieldCheck,
    badge: 'Workspace Security',
    title: 'Workspace Access & Administration',
    subtitle: 'Manage workspace membership and role-based access.',
    description:
      'Asas authenticates users and scopes application records to the active workspace. Security controls, infrastructure protections, certifications, and retention guarantees depend on the deployed configuration and should be confirmed with the operator.',
    capabilities: [
      'Invite and manage workspace members',
      'Assign supported workspace roles and permissions',
      'Review recorded administrative and business activity where available',
      'Manage two-factor enrollment and account security where supported',
      'Check deployment-specific backup and retention arrangements with your operator',
    ],
    architecture: {
      input: 'Authenticated Workspace Session',
      process: 'Role & Workspace Authorization',
      output: 'Workspace Administration',
    },
  },
]

export default function Solutions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedArea = searchParams.get('area')
  const initialArea = SOLUTIONS.some(solution => solution.id === requestedArea) ? requestedArea : SOLUTIONS[0].id
  const [activeSolutionId, setActiveSolutionId] = useState(initialArea)
  const currentSolution = SOLUTIONS.find((solution) => solution.id === activeSolutionId) || SOLUTIONS[0]
  const Icon = currentSolution.icon

  useEffect(() => {
    if (SOLUTIONS.some(solution => solution.id === requestedArea)) setActiveSolutionId(requestedArea)
  }, [requestedArea])

  const selectSolution = id => {
    setActiveSolutionId(id)
    setSearchParams({ area: id }, { replace: true })
    window.requestAnimationFrame(() => {
      document.getElementById('solution-detail')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  const workflowSteps = [
    { label: 'Input', value: currentSolution.architecture.input },
    { label: 'Workspace workflow', value: currentSolution.architecture.process },
    { label: 'Saved records and views', value: currentSolution.architecture.output },
  ]

  return (
    <MarketingPageFrame
      eyebrow="Workspace solutions"
      title="Business workflows in one workspace"
      description="Explore the current Asas product areas, the records they manage, and the practical limits to confirm before using them in production."
    >
      <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit min-w-0 rounded-[24px] border border-white/80 bg-white/50 p-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.05)] backdrop-blur-xl lg:sticky lg:top-28">
          <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Product areas</p>
          <nav aria-label="Solution areas" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:flex lg:flex-col lg:gap-1">
            {SOLUTIONS.map((solution) => {
              const TabIcon = solution.icon
              const active = solution.id === activeSolutionId
              return (
                <button
                  key={solution.id}
                  type="button"
                  onClick={() => selectSolution(solution.id)}
                  aria-pressed={active}
                  aria-controls="solution-detail"
                  className={`flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[11px] font-medium leading-tight transition-colors sm:px-3.5 sm:py-3 sm:text-xs lg:w-full ${active ? 'bg-white text-ink shadow-[0_4px_16px_rgba(0,0,0,0.07)]' : 'text-ink-muted hover:bg-white/50 hover:text-ink'}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-action-soft text-action' : 'bg-black/[0.035] text-ink-soft'}`}><TabIcon className="h-4 w-4" /></span>
                  <span className="min-w-0">{solution.badge}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section id="solution-detail" className="min-w-0 scroll-mt-28 overflow-hidden rounded-[28px] border border-white/80 bg-white/60 shadow-[0_24px_70px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl">
          <p className="sr-only" role="status">Showing {currentSolution.title}. {currentSolution.subtitle}</p>
          <div key={currentSolution.id} className="animate-fade-in p-6 sm:p-9 lg:p-11">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
              <div>
                <Badge variant="outline" className="border-action-border bg-action-soft text-[10px] font-semibold uppercase tracking-[0.14em] text-action shadow-none">{currentSolution.badge}</Badge>
                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">{currentSolution.title}</h2>
                <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-ink-muted-strong">{currentSolution.subtitle}</p>
              </div>
              <span className="hidden h-13 w-13 shrink-0 items-center justify-center rounded-2xl border border-black/[0.05] bg-white text-action shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:flex"><Icon className="h-6 w-6" /></span>
            </div>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-ink-muted">{currentSolution.description}</p>

            <div className="mt-10 grid gap-9 border-t border-black/[0.07] pt-9 lg:grid-cols-[1fr_0.82fr]">
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-subtle">Key capabilities</h3>
                <div className="mt-5 space-y-4">
                  {currentSolution.capabilities.map((capability) => (
                    <div key={capability} className="flex items-start gap-3 text-sm leading-6 text-ink-muted-strong">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-action" />
                      <span>{capability}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-black/[0.05] bg-canvas/85 p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                  <Cpu className="h-4 w-4 text-action" />
                  <span>Example workflow</span>
                </div>
                <div className="mt-5">
                  {workflowSteps.map((step, index) => (
                    <div key={step.label}>
                      <div className="rounded-2xl border border-black/[0.05] bg-white/80 p-4 shadow-[0_4px_16px_rgba(0,0,0,0.035)]">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-action">{step.label}</span>
                        <p className="mt-1.5 text-xs font-semibold leading-5 text-ink-body">{step.value}</p>
                      </div>
                      {index < workflowSteps.length - 1 && <div className="flex justify-center py-2 text-ink-faint"><ArrowDown className="h-3.5 w-3.5" /></div>}
                    </div>
                  ))}
                </div>
                <Button asChild className="mt-6 h-10 w-full rounded-full bg-action text-xs font-medium text-white shadow-[0_8px_24px_rgba(0,113,227,0.2)] hover:bg-action-hover">
                  <Link to="/register">Start Free Workspace <ArrowRight className="h-3.5 w-3.5" /></Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingPageFrame>
  )
}
