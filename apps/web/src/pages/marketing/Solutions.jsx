import { Link } from 'react-router-dom'
import { ArrowRight, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, Boxes, UsersRound, ShieldCheck } from 'lucide-react'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'

const solutions = [
  {
    icon: ChartNoAxesCombined,
    title: 'Finance operations',
    description: 'Manage receivables, payables, expenses, cash movement, reconciliation, and ledger reporting from one workspace.',
    modules: ['Accounts receivable', 'Accounts payable', 'Expenses', 'Bank reconciliation', 'Trial balance'],
  },
  {
    icon: UsersRound,
    title: 'People and payroll',
    description: 'Keep employee records, attendance, leave, payroll runs, payslips, and year-end reviews connected to the same team data.',
    modules: ['Employee directory', 'Time and attendance', 'Payroll', 'Recruitment'],
  },
  {
    icon: BriefcaseBusiness,
    title: 'Sales and customer work',
    description: 'Track deals through their pipeline, keep notes and activity with each deal, and review dated sales outcomes and forecasts.',
    modules: ['CRM pipeline', 'Sales performance', 'Revenue forecast'],
  },
  {
    icon: ClipboardList,
    title: 'Projects and delivery',
    description: 'Connect project portfolios, roadmaps, issues, sprints, and dated completion progress so teams can follow work through delivery.',
    modules: ['Project portfolio', 'Roadmap', 'Active sprints'],
  },
  {
    icon: Boxes,
    title: 'Inventory control',
    description: 'Maintain a product catalog and review the recorded inbound, outbound, and adjustment history for stock.',
    modules: ['Product catalog', 'Stock movements'],
  },
  {
    icon: ShieldCheck,
    title: 'Workspace administration',
    description: 'Give team members role-based access and manage workspace settings, integrations, notifications, exports, and billing.',
    modules: ['Members and roles', 'Integrations', 'Data export', 'Billing and plans'],
  },
]

export default function Solutions() {
  return (
    <MarketingPageFrame
      eyebrow="Solutions"
      title="Connected work across your business"
      description="Asas brings finance, people, sales, projects, and inventory workflows into a shared workspace, with each module keeping its own records and permissions."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {solutions.map(({ icon: Icon, title, description, modules }) => (
          <article key={title} className="rounded-card border border-border-subtle bg-surface-raised p-6 shadow-card">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-button bg-accent/10 text-accent"><Icon size={20} /></div>
            <h2 className="text-lg font-bold text-heading">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
            <ul aria-label={`${title} modules`} className="mt-5 flex flex-wrap gap-2">
              {modules.map(module => <li key={module}><Badge variant="outline">{module}</Badge></li>)}
            </ul>
          </article>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface-muted p-6">
        <div>
          <h2 className="font-bold text-heading">See how the workspace is organized</h2>
          <p className="mt-1 text-sm text-muted">The product guide explains setup and common workflows.</p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/documentation">Read the guide <ArrowRight size={15} /></Link>
        </Button>
      </div>
    </MarketingPageFrame>
  )
}
