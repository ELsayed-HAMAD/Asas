import { BookOpenCheck, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'

const SECTIONS = [
  { id: 'getting-started', label: '1. Getting started' },
  { id: 'dashboard', label: '2. Dashboard' },
  { id: 'people', label: '3. HR' },
  { id: 'finance', label: '4. Finance' },
  { id: 'crm', label: '5. CRM' },
  { id: 'inventory', label: '6. Inventory' },
  { id: 'projects', label: '7. Projects' },
  { id: 'settings', label: '8. Settings' },
  { id: 'api-reference', label: '9. API reference' },
  { id: 'security', label: '10. Access & data' },
]

const DASHBOARD_GUIDE = [
  {
    id: 'dashboard', title: 'Dashboard', intro: 'Use the dashboard home to scan saved activity and move into a team workflow. Dashboard figures reflect the records available in the active workspace; empty or incomplete source data can make summaries incomplete.',
    pages: [
      ['Dashboard', 'Review headcount, open pipeline value, payables outstanding, active sprints, cash flow, and recent activity for the active workspace. Follow a Requires Attention action or an active-sprint link into the affected module, and use Generate Report to download the displayed dashboard summary as a CSV file.'],
    ],
  },
  {
    id: 'people', title: 'HR', intro: 'The HR group covers employee records, payroll preparation, time records, leave workflows, and candidate tracking.',
    pages: [
      ['Employee Directory', 'Search and filter employees, open a profile, add or update employee and compensation details, organize departments, select records, and export directory data. Historical imports are handled through the separate company migration workflow.'],
      ['Payroll', 'Prepare a payroll run for an explicit earning period, review the calculated employee lines, adjust supported inputs, and move runs through the available approval states. Review tax and pay outputs before paying outside Asas; the app does not submit bank transfers or calculate jurisdiction-specific statutory tax automatically.'],
      ['Time & Attendance', 'Review weekly timesheets, filter by department and status, inspect incomplete punches or overtime exceptions, correct recorded punches, and resolve flagged items. These records are not a connected time-clock feed unless your deployment adds one.'],
      ['Time Off & Leave', 'Submit leave requests, review pending and approved requests, filter by employee or leave type, approve or reject requests where permitted, and maintain workspace leave allowances.'],
      ['Recruitment', 'Maintain candidate profiles, track candidates through recruiting stages, review resumes and interview notes, and record activity. Candidate records do not imply a connection to an external applicant tracking system.'],
    ],
  },
  {
    id: 'finance', title: 'Finance', intro: 'Finance provides workspace-managed accounting and invoice workflows. Review currency, counterparty, and posting details before relying on a report as a final company statement.',
    pages: [
      ['Finance overview', 'Review finance summaries and navigate to payables, receivables, expenses, reconciliation, and the trial balance. Summary coverage depends on the records and journals already entered.'],
      ['Accounts Payable', 'Maintain vendors and payable invoices, review pending items, approve or request changes where permitted, and record supported payments. A new bill can optionally link to one fully received, valued, single-line purchase order from the same Finance vendor. A pending or rejected bill can correct or clear that link; approval then clears the exact goods-received-not-invoiced liability posted by that receipt. Partial receipts, multi-line orders, taxes/freight, and price differences are not supported. Invoice recognition and settlement can create ledger journals; inspect status and journal history after each action.'],
      ['Accounts Receivable', 'Maintain finance customers and receivable invoices, review balances, record collections, and log collection notes or calls. When inventory valuation is configured, a new invoice can optionally fulfill lines from valued stock and post cost of goods sold; the invoice amount remains its own total. The action menu exposes an exact-reversal void and an unpaid-only delete. CRM companies are a separate record type and are not automatically linked to finance customers.'],
      ['Expenses', 'Submit and review employee expense claims, update supported approval states, and record reimbursements. Reimbursements and their journals depend on the configured finance workflow.'],
      ['Bank Reconciliation', 'Import a bank statement file, inspect statement lines, match eligible ledger entries, and undo a match when needed. This is a file-based reconciliation workflow, not a live bank feed.'],
      ['Trial Balance', 'Review debit and credit account totals through a selected date, inspect currency/base-currency amounts, and identify incomplete legacy journal coverage disclosed by the page. Opening balances must be reconciled before posting.'],
    ],
  },
  {
    id: 'crm', title: 'CRM', intro: 'CRM records customer relationships, sales opportunities, and sales activity. CRM records and Finance counterparty records remain separate until a user imports or creates the corresponding finance record.',
    pages: [
      ['CRM overview', 'Review deal and sales summaries, open the deals pipeline, and move into revenue forecasting. The summary is based on saved CRM records.'],
      ['Deals Pipeline', 'Create and update opportunities, move active deals between supported stages, inspect deal details, record notes or activities, and archive or restore deals. Closing a deal does not automatically create a finance invoice or recognize revenue.'],
      ['Sales Performance', 'Compare rep activity, deal outcomes, quotas, and win/loss summaries for the selected reporting period. Treat these as operational CRM summaries, not audited financial revenue.'],
      ['Revenue Forecast', 'Review forecast amounts by close month and representative, and maintain supported sales quota records. Forecasts depend on deal stages, values, close dates, and probabilities entered by the team.'],
    ],
  },
  {
    id: 'inventory', title: 'Inventory', intro: 'Inventory maintains products and stock quantities from recorded movements. When a FIFO or weighted-average policy is configured, it also maintains cost layers, valuation events, ledger postings, and a control-account reconciliation report.',
    pages: [
      ['Product Catalog', 'Create, search, edit, archive, or restore products; review reorder thresholds and location labels; and create, approve, receive, or cancel the supported purchase orders. Receiving a purchase order changes quantity and, when valuation is configured, posts a valued receipt using the order line acquisition cost. Without a valuation policy it changes quantity only.'],
      ['Stock Movements', 'Review the movement history and record supported quantity increases or decreases. Quantity is maintained with a movement record; when valuation is configured, inbound and outbound movements also post cost and valuation events. Each manual movement carries a client request key so an unchanged retry returns the original record instead of advancing stock twice. The product selling price is not an inventory cost and is never used to infer financial inventory value.'],
      ['Valuation', 'Configure FIFO or weighted-average costing and its ledger mappings before the first valuation posting. Review stock, subledger, and ledger reconciliation by currency, and post an opening cost for on-hand quantity that has no cost yet. The costing method is locked once valuation postings exist. Quantity-only stock remains unvalued until an opening cost is posted, and a valued opening cannot be combined with Finance\'s unused-ledger cutover without the coordinated opening that remains in development.'],
      ['Company data migration', 'Settings can import product and supplier master records and opening stock into the shared migration project. Opening stock can carry an explicit source unit cost when valuation is configured; quantity-only rows remain unvalued until valued. A valued inventory opening posts journals and consumes the ledger, so it cannot be combined with Finance\'s unused-ledger opening cutover without a coordinated opening that remains in development. Sales-invoice stock/COGS posting is available only as an optional line on a new invoice after valuation is configured. Exact supplier-invoice/GRNI matching is available only for one fully received, valued, single-line purchase order from the same Finance vendor with an exact amount and currency; a pending or rejected bill can correct or clear that link. Broader matching and a coordinated Inventory/Finance cutover remain in development.'],
    ],
  },
  {
    id: 'projects', title: 'Projects', intro: 'Project workflows organize workspace project records, sprint work, and roadmap planning. They do not synchronize with external engineering tools unless a provider integration is implemented and configured.',
    pages: [
      ['Portfolio', 'Create and update projects, inspect portfolio-level progress and budget records, and create sprints for a selected project. Project budget data is maintained in the workspace and is not a finance commitment by itself.'],
      ['Active Sprints', 'Review sprint issues, create work, update issue status, and complete a sprint. Progress depends on issue estimates and status updates entered by the team.'],
      ['Roadmap', 'Organize roadmap phases and tasks, edit timelines and progress, and review task assignments.'],
    ],
  },
  {
    id: 'settings', title: 'Settings', intro: 'Settings uses tabs for workspace controls; Support and Exports open as separate workspace destinations. Some controls require an owner/admin role or deployment credentials, and the UI reports when an external service is not configured.',
    pages: [
      ['General', 'Update workspace profile and localization details, maintain supported exchange rates, and review owner-only workspace controls. Currency rates are workspace-managed; no live market feed is implied. Two-factor enrollment and recovery-code controls are available in the security section when supported.'],
      ['Members & Roles', 'Invite teammates, review pending invitations, manage workspace members, and assign supported roles according to your permissions and plan limits.'],
      ['Billing & Plans', 'Review the current plan and billing history. Paid upgrades and the billing portal work only when Stripe is configured for the deployment; a visible plan option does not mean checkout is available.'],
      ['Integrations', 'Configure and test a custom HTTPS endpoint health check and review its probe logs. A successful endpoint probe is not business-event delivery, ERP synchronization, or a provider integration.'],
      ['Notifications', 'Choose supported in-app notification preferences and quiet hours. Email or Slack delivery requires configured providers and should not be assumed from a saved preference alone.'],
      ['Data Export', 'Request supported asynchronous exports, review job status, and download completed files within the available retention period. An export is not a restorable database backup; automated backup schedules and recovery are not active in this deployment.'],
      ['Exports', 'Open the export workspace from the sidebar to request a module-scoped export, watch its processing state, and download the generated file. It uses the same export service as Settings > Data Export.'],
      ['Data Migration', 'Continue the same company migration project after onboarding. Each area uses a separate typed dataset and validation workflow; Finance open items and opening balances are staged for reconciliation and cutover, while supported master-data and opening-stock imports write operational records directly. Inventory opening stock can be valued when a costing policy is configured. New receivables can optionally issue valued stock and post COGS after valuation is configured. Exact payables matching is available for one fully received, valued, single-line purchase order from the same Finance vendor with an exact amount and currency. Partial, multi-line, tax/freight, and price-variance matching, a coordinated Inventory/Finance cutover, and direct ERP connectors remain in development.'],
      ['Support', 'Create and follow workspace support requests. Responses depend on the support process configured for the deployment.'],
    ],
  },
]

export default function Documentation() {
  return (
    <MarketingPageFrame
      eyebrow="Product guide"
      title="Get started with Asas"
      description="A practical guide to every dashboard area: what each page shows, the actions available there, and the boundaries to understand before relying on business data or external services."
    >
      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-white/80 bg-white/55 p-4 shadow-[0_16px_50px_rgba(0,0,0,0.05)] backdrop-blur-xl lg:sticky lg:top-28">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-black/[0.06]">
            <BookOpenCheck className="w-5 h-5 text-action" />
            <h2 className="text-sm font-bold text-ink">Guide index</h2>
          </div>
          <nav aria-label="Documentation sections" className="flex flex-col gap-1">
            {SECTIONS.map(section => (
              <a key={section.id} href={`#${section.id}`} className="rounded-xl px-3 py-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-black/[0.04] hover:text-ink">
                {section.label}
              </a>
            ))}
          </nav>
          <div className="mt-6 pt-4 border-t border-black/[0.06]">
            <p className="text-[11px] text-ink-subtle mb-2">Compare workspace plans</p>
            <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-full border-black/10 bg-white/60 text-xs text-ink shadow-none hover:bg-white">
              <Link to="/pricing">View pricing</Link>
            </Button>
          </div>
        </aside>

        <div className="space-y-10">
          <section id="getting-started" className="scroll-mt-28 border-b border-black/10 pb-10">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs text-action border-action-border bg-action-soft">Setup</Badge>
              <h2 className="text-xl font-bold text-ink">Create a workspace</h2>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed mb-5">
              Create an account, complete the workspace setup prompts, and invite teammates from settings when you are ready.
              The available setup fields and member roles are shown in the application for your deployment.
            </p>
            <div className="rounded-2xl border border-black/[0.06] bg-white/55 p-4 text-sm text-ink-muted">
              Review billing, notifications, integrations, and data export settings before relying on an external provider or scheduled operation.
              A setting being visible does not mean the related provider or background service is configured.
            </div>
            <Button asChild size="sm" className="mt-5 h-9 rounded-full bg-action px-4 text-xs text-white hover:bg-action-hover"><Link to="/register">Create an account</Link></Button>
          </section>

          {DASHBOARD_GUIDE.map(group => (
            <section key={group.id} id={group.id} className="scroll-mt-28 border-b border-black/10 pb-10">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="outline" className="border-action-border bg-action-soft text-xs text-action">Workspace guide</Badge>
                <h2 className="text-xl font-bold text-ink">{group.title}</h2>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-ink-muted">{group.intro}</p>
              <div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
                {group.pages.map(([title, description]) => (
                  <article key={title} className="border-t border-black/[0.08] pt-4">
                    <h3 className="text-sm font-semibold text-ink">{title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-ink-muted">{description}</p>
                  </article>
                ))}
              </div>
              {group.id === 'finance' && <Button asChild variant="outline" size="sm" className="mt-5 h-9 rounded-full border-black/10 bg-white/60 px-4 text-xs text-ink shadow-none hover:bg-white"><Link to="/solutions?area=finance">Explore Finance workflows</Link></Button>}
              {group.id === 'inventory' && <p className="mt-4 rounded-card-sm border border-warning-border bg-warning-light p-3 text-xs leading-5 text-warning-text">Inventory valuation is available only after a workspace explicitly configures a FIFO or weighted-average policy and its ledger accounts. New receivables can then issue valued stock and post cost of goods sold; the Accounts Receivable action menu exposes the API's exact-reversal void and unpaid-only delete paths. Accounts Payable can match one bill to one fully received, valued, single-line purchase order from the same Finance vendor when the amount and currency are exact; partial, multi-line, tax/freight, and price-variance matching remain unsupported. A coordinated Inventory/Finance cutover remains in development. Never treat stock quantity or selling price as a financial inventory balance.</p>}
            </section>
          ))}

          <section id="api-reference" className="scroll-mt-28 border-b border-black/10 pb-10">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs text-action border-action-border bg-action-soft">Developers</Badge>
              <h2 className="text-xl font-bold text-ink">API reference</h2>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed">
              The API reference is generated from the running API and is available at <code>/docs</code> on the API deployment
              when API documentation is enabled. It describes the actual routes, request schemas, and authentication available
              in that deployment. This site does not publish a separate API token or webhook guide.
            </p>
          </section>

          <section id="security" className="scroll-mt-28 border-b border-black/10 pb-10">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs text-success-text border-success-border bg-success-light">Workspace</Badge>
              <h2 className="text-xl font-bold text-ink">Access & data handling</h2>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed mb-4">
              The application uses authenticated sessions and workspace-scoped access checks. Some administrative and business
              actions are recorded in activity or audit logs; these records are not described as tamper-proof. Retention cleanup
              and backups depend on the deployment configuration, so confirm backup arrangements with its operator.
            </p>
            <div className="flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-white/55 p-4 text-xs text-ink-muted">
              <ShieldCheck className="w-4 h-4 text-action mt-0.5 shrink-0" />
              <span>Use the application’s settings and the API reference served by your deployment to check which controls are available and active.</span>
            </div>
          </section>
        </div>
      </div>
    </MarketingPageFrame>
  )
}
