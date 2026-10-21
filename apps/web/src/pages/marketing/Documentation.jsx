import { BookOpenCheck, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'

const SECTIONS = [
  { id: 'getting-started', label: '1. Getting started' },
  { id: 'finance-core', label: '2. Finance records' },
  { id: 'api-reference', label: '3. API reference' },
  { id: 'security', label: '4. Access & data' },
]

export default function Documentation() {
  return (
    <MarketingPageFrame
      eyebrow="Product guide"
      title="Get started with Asas"
      description="A practical guide to creating a workspace, using finance tools, and finding the API reference available for your deployment."
    >
      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit rounded-card border border-border-default/80 glass-strong p-5 shadow-glass lg:sticky lg:top-24">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border-subtle/80">
            <BookOpenCheck className="w-5 h-5 text-accent" />
            <h2 className="text-sm font-bold text-heading">Guide index</h2>
          </div>
          <nav aria-label="Documentation sections" className="flex flex-col gap-1">
            {SECTIONS.map(section => (
              <a key={section.id} href={`#${section.id}`} className="px-3 py-2 rounded-button text-xs font-medium text-body hover:text-heading hover:bg-surface-muted/80 transition-colors">
                {section.label}
              </a>
            ))}
          </nav>
          <div className="mt-6 pt-4 border-t border-border-subtle/80">
            <p className="text-[11px] text-caption mb-2">Compare workspace plans</p>
            <Button asChild variant="outline" size="sm" className="w-full text-xs">
              <Link to="/pricing">View pricing</Link>
            </Button>
          </div>
        </aside>

        <div className="space-y-6">
          <section id="getting-started" className="scroll-mt-28 rounded-card border border-border-default/80 bg-surface-raised p-6 sm:p-8 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs text-accent border-accent-muted bg-accent-light">Setup</Badge>
              <h2 className="text-xl font-bold text-heading">Create a workspace</h2>
            </div>
            <p className="text-sm text-body-light leading-relaxed mb-5">
              Create an account, complete the workspace setup prompts, and invite teammates from settings when you are ready.
              The available setup fields and member roles are shown in the application for your deployment.
            </p>
            <div className="rounded-card-sm bg-surface-muted border border-border-default p-4 text-sm text-body-light">
              Review billing, notifications, integrations, and data export settings before relying on an external provider or scheduled operation.
              A setting being visible does not mean the related provider or background service is configured.
            </div>
            <Button asChild size="sm" className="mt-5"><Link to="/register">Create an account</Link></Button>
          </section>

          <section id="finance-core" className="scroll-mt-28 rounded-card border border-border-default bg-surface-raised p-6 sm:p-8 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs text-accent border-accent-muted bg-accent-light">Finance</Badge>
              <h2 className="text-xl font-bold text-heading">Finance records</h2>
            </div>
            <p className="text-sm text-body-light leading-relaxed">
              Use the finance workspace to manage accounts, journal entries, and customer receivables. Exchange-rate records are
              managed in workspace settings; Asas does not provide a live market-rate feed. Confirm rates, tax treatment, and
              accounting decisions with your finance team before posting transactions.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5"><Link to="/solutions">Explore product areas</Link></Button>
          </section>

          <section id="api-reference" className="scroll-mt-28 rounded-card border border-border-default bg-surface-raised p-6 sm:p-8 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs text-accent border-accent-muted bg-accent-light">Developers</Badge>
              <h2 className="text-xl font-bold text-heading">API reference</h2>
            </div>
            <p className="text-sm text-body-light leading-relaxed">
              The API reference is generated from the running API and is available at <code>/docs</code> on the API deployment
              when API documentation is enabled. It describes the actual routes, request schemas, and authentication available
              in that deployment. This site does not publish a separate API token or webhook guide.
            </p>
          </section>

          <section id="security" className="scroll-mt-28 rounded-card border border-border-default bg-surface-raised p-6 sm:p-8 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs text-success-text border-success-border bg-success-light">Workspace</Badge>
              <h2 className="text-xl font-bold text-heading">Access & data handling</h2>
            </div>
            <p className="text-sm text-body-light leading-relaxed mb-4">
              The application uses authenticated sessions and workspace-scoped access checks. Some administrative and business
              actions are recorded in activity or audit logs; these records are not described as tamper-proof. Retention cleanup
              and backups depend on the deployment configuration, so confirm backup arrangements with its operator.
            </p>
            <div className="flex items-start gap-3 rounded-card-sm bg-surface-muted border border-border-default p-4 text-xs text-body-light">
              <ShieldCheck className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              <span>Use the application’s settings and the API reference served by your deployment to check which controls are available and active.</span>
            </div>
          </section>
        </div>
      </div>
    </MarketingPageFrame>
  )
}
