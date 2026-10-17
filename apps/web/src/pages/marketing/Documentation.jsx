import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpenCheck } from 'lucide-react'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'

const guides = [
  {
    id: 'getting-started', title: '1. Set up a workspace',
    text: 'Create your account, finish the workspace setup, and confirm the organization details and base currency before recording financial activity. Invite colleagues after setup and assign access that matches their responsibilities.',
    links: [{ label: 'Create an account', to: '/register' }, { label: 'Members and roles', to: '/dashboard/settings/members' }],
  },
  {
    id: 'finance', title: '2. Record and review finances',
    text: 'Add customers and vendors, record invoices and expenses, and use the finance pages to review amounts due and recorded settlements. Import a bank statement to reconcile its rows against ledger entries. Opening balances belong in Trial Balance before the first ledger journal.',
    links: [{ label: 'Finance overview', to: '/dashboard/finance' }, { label: 'Bank reconciliation', to: '/dashboard/finance/reconciliation' }, { label: 'Trial balance', to: '/dashboard/finance/trial-balance' }],
  },
  {
    id: 'people-payroll', title: '3. Manage people and payroll',
    text: 'Keep employee details current, then use attendance and leave tools to review recorded work time. Payroll runs use the salary, pay period, and tax-rate information available to the workspace. Review a run before approval; only authorized roles can approve or pay runs.',
    links: [{ label: 'Employee directory', to: '/dashboard/hr/employees' }, { label: 'Time and attendance', to: '/dashboard/hr/time-attendance' }, { label: 'Payroll', to: '/dashboard/hr/payroll' }],
  },
  {
    id: 'crm', title: '4. Follow deals and sales activity',
    text: 'Create deals in the CRM pipeline and move them through the available stages as work progresses. Record a note, call, or email activity to keep a history with the deal. Email activity is logged in Asas; it does not send an email. Reports use recorded deal outcomes and dates, so undated legacy records may be excluded from dated metrics.',
    links: [{ label: 'CRM overview', to: '/dashboard/crm' }, { label: 'Deals pipeline', to: '/dashboard/crm/deals' }, { label: 'Sales performance', to: '/dashboard/crm/sales-performance' }, { label: 'Revenue forecast', to: '/dashboard/crm/revenue-forecast' }],
  },
  {
    id: 'projects', title: '5. Plan project work',
    text: 'Create a project, organize issues, and use a sprint to schedule and review a focused set of work. Record estimates and completion dates as work happens; the portfolio and burndown views are based on those recorded values.',
    links: [{ label: 'Project portfolio', to: '/dashboard/projects' }, { label: 'Roadmap', to: '/dashboard/projects/roadmap' }, { label: 'Active sprints', to: '/dashboard/projects/sprints' }],
  },
  {
    id: 'inventory', title: '6. Track inventory',
    text: 'Add products to the catalog, review stock by warehouse, and use Stock Movements to record receipts or issues. Movement history preserves the quantity changes and their notes. Recording movements requires an authorized workspace role.',
    links: [{ label: 'Product catalog', to: '/dashboard/inventory' }, { label: 'Stock movements', to: '/dashboard/inventory/movements' }],
  },
  {
    id: 'workspace-settings', title: '7. Configure and export workspace data',
    text: 'Workspace administrators can manage integrations, notification preferences, data exports, and subscription billing in Settings. Export controls download the data available to your role; sensitive payroll records have additional access restrictions.',
    links: [{ label: 'Settings', to: '/dashboard/settings' }, { label: 'Integrations', to: '/dashboard/settings/integrations' }, { label: 'Data export', to: '/dashboard/settings/data-export' }, { label: 'Billing and plans', to: '/dashboard/settings/billing' }],
  },
]

export default function Documentation() {
  return (
    <MarketingPageFrame
      eyebrow="Documentation"
      title="A practical guide to Asas"
      description="Use this guide to set up a workspace and find the main workflows for finance, people, CRM, projects, inventory, and administration. Some actions are limited by workspace role."
    >
      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit rounded-card border border-border-subtle bg-surface-raised p-5 shadow-card lg:sticky lg:top-28">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-heading"><BookOpenCheck size={16} className="text-accent" /> In this guide</h2>
          <nav aria-label="Documentation sections" className="flex flex-wrap gap-x-4 gap-y-2 lg:flex-col">
            {guides.map(guide => <a key={guide.id} href={`#${guide.id}`} className="text-sm text-muted transition-colors hover:text-heading">{guide.title.replace(/^\d+\. /, '')}</a>)}
          </nav>
        </aside>
        <div className="space-y-5">
          {guides.map(guide => (
            <section id={guide.id} key={guide.id} className="scroll-mt-28 rounded-card border border-border-subtle bg-surface-raised p-6 shadow-card">
              <h2 className="text-lg font-bold text-heading">{guide.title}</h2>
              <p className="mt-3 text-sm leading-6 text-body-light">{guide.text}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {guide.links.map(link => <Link key={link.to} to={link.to} className="inline-flex items-center gap-1.5 rounded-input border border-border-default px-3 py-2 text-xs font-semibold text-body transition-colors hover:bg-surface-muted">{link.label}<ArrowUpRight size={13} /></Link>)}
              </div>
            </section>
          ))}
          <section id="security" className="scroll-mt-28 rounded-card border border-border-subtle bg-surface-raised p-6 shadow-card">
            <h2 className="text-lg font-bold text-heading">Security and access</h2>
            <p className="mt-3 text-sm leading-6 text-body-light">Asas checks workspace access on the server for protected operations. Member roles control access to sensitive actions, payroll records have additional role restrictions, and important financial changes are recorded in the workspace audit log. Use Members and Roles to review who can access each workflow.</p>
            <Link to="/dashboard/settings/members" className="mt-5 inline-flex items-center gap-1.5 rounded-input border border-border-default px-3 py-2 text-xs font-semibold text-body transition-colors hover:bg-surface-muted">Review members and roles <ArrowUpRight size={13} /></Link>
          </section>
          <p className="px-1 text-xs leading-5 text-muted">Dashboard links require sign-in and are subject to your workspace permissions. Financial and payroll reports show recorded values; historical data without enough provenance is not estimated.</p>
        </div>
      </div>
    </MarketingPageFrame>
  )
}
