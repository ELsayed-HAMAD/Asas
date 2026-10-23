import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
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
      'Manage sign-in and session settings',
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
  const [activeSolutionId, setActiveSolutionId] = useState(SOLUTIONS[0].id)
  const currentSolution = SOLUTIONS.find((s) => s.id === activeSolutionId) || SOLUTIONS[0]
  const Icon = currentSolution.icon

  return (
    <MarketingPageFrame
      eyebrow="Enterprise Solutions Architecture"
      title="Business workflows in one workspace"
      description="Explore the current Asas product areas, the records they manage, and the practical limits to confirm before using them in production."
    >
      {/* Solution Vertical Selector Tabs */}
      <div className="flex flex-wrap gap-2 mb-10 pb-2 border-b border-border-default/80">
        {SOLUTIONS.map((s) => {
          const TabIcon = s.icon
          const active = s.id === activeSolutionId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSolutionId(s.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-button text-xs font-semibold hover-lift transition-micro cursor-pointer active:scale-[0.98] ${
                active
                  ? 'bg-primary text-on-primary shadow-card hover:shadow-glow'
                  : 'glass text-body hover:bg-surface-raised hover:text-heading border border-border-default/80'
              }`}
            >
              <TabIcon className="w-4 h-4" />
              <span>{s.badge}</span>
            </button>
          )
        })}
      </div>

      {/* Featured Architecture Canvas */}
      <div className="glass-strong rounded-card border border-border-default/80 p-6 sm:p-10 shadow-glass mb-16 hover-lift transition-premium">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          <div className="lg:col-span-2 space-y-5">
            <div className="flex items-center gap-2">
              <div className="p-2.5 rounded-button bg-accent-light text-accent shadow-xs">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <Badge variant="outline" className="text-xs text-accent border-accent-muted bg-accent-light shadow-xs">
                  {currentSolution.badge}
                </Badge>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-heading mt-1">
                  {currentSolution.title}
                </h2>
              </div>
            </div>

            <p className="text-base font-medium text-body">{currentSolution.subtitle}</p>
            <p className="text-sm text-body-light leading-relaxed">{currentSolution.description}</p>

            {/* Core Capabilities Checklist */}
            <div className="pt-2 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-caption">Key Capabilities</h3>
              {currentSolution.capabilities.map((cap) => (
                <div key={cap} className="flex items-start gap-2.5 text-xs text-body">
                  <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Architecture Flow Box */}
          <div className="bg-primary text-on-primary p-6 rounded-card border border-primary-hover shadow-glass hover:shadow-glow transition-premium space-y-4">
            <div className="flex items-center gap-2 text-primary-subtle text-xs font-bold uppercase tracking-wider">
              <Cpu className="w-4 h-4" />
              <span>Example workflow</span>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3 rounded-button bg-primary-hover border border-primary-subtle/30 shadow-xs">
                <span className="text-[10px] font-semibold text-primary-subtle uppercase">Input</span>
                <p className="text-xs font-semibold text-on-primary mt-0.5">{currentSolution.architecture.input}</p>
              </div>

              <div className="flex justify-center text-primary-subtle">
                <span>↓</span>
              </div>

              <div className="p-3 rounded-button bg-primary-hover border border-accent shadow-xs">
                <span className="text-[10px] font-semibold text-accent-muted uppercase">Workspace workflow</span>
                <p className="text-xs font-semibold text-on-primary mt-0.5">{currentSolution.architecture.process}</p>
              </div>

              <div className="flex justify-center text-primary-subtle">
                <span>↓</span>
              </div>

              <div className="p-3 rounded-button bg-primary-hover border border-success-border shadow-xs">
                <span className="text-[10px] font-semibold text-success-bright uppercase">Saved records and views</span>
                <p className="text-xs font-semibold text-on-primary mt-0.5">{currentSolution.architecture.output}</p>
              </div>
            </div>

            <Button asChild className="w-full mt-4 bg-accent hover:bg-accent-hover text-on-primary text-xs h-10 rounded-button shadow-card hover-lift transition-micro active:scale-[0.98]">
              <Link to="/register">Deploy This Solution Free</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Grid of All Solutions */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-heading">Complete Module Directory</h2>
        <p className="text-xs text-caption mt-1">Explore the current product areas included in Asas.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SOLUTIONS.map((item) => {
          const CardIcon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveSolutionId(item.id)
                window.scrollTo({ top: 200, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
              }}
              className="w-full text-left bg-surface-raised rounded-card border border-border-default/80 p-6 flex flex-col justify-between hover:border-accent/40 shadow-card hover:shadow-card-hover hover-lift transition-premium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-button bg-accent-light text-accent">
                    <CardIcon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-heading text-sm">{item.title}</h3>
                </div>
                <p className="text-xs text-body-light leading-relaxed mb-4">{item.subtitle}</p>
              </div>

              <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-accent font-semibold">
                <span>View workflow</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          )
        })}
      </div>
    </MarketingPageFrame>
  )
}
