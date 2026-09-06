import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { crmApi } from '@/lib/api/crm.js'
import { financeApi } from '@/lib/api/finance.js'
import { hrApi } from '@/lib/api/hr.js'
import { inventoryApi } from '@/lib/api/inventory.js'
import { projectsApi } from '@/lib/api/projects.js'
import { formatMoney } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

interface KpiCardProps {
  to: string
  label: string
  value: string
  subtext?: string | undefined
  loading?: boolean | undefined
  badge?: { text: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'secondary' } | undefined
}

function KpiCard({ to, label, value, subtext, loading, badge }: KpiCardProps) {
  return (
    <Link to={to} className="block transition-transform hover:scale-[1.01]">
      <Card>
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            {loading ? '…' : value}
          </CardTitle>
        </CardHeader>
        {(subtext || badge) && (
          <CardContent>
            <div className="flex items-center gap-2">
              {subtext && <p className="text-xs text-[var(--color-muted)]">{subtext}</p>}
              {badge && <Badge variant={badge.variant}>{badge.text}</Badge>}
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  )
}

function CardSection({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">{title}</h2>
        <Link to={to} className="text-sm text-[var(--color-accent)] hover:underline">
          View all →
        </Link>
      </div>
      {children}
    </div>
  )
}

/**
 * Cross-module dashboard — pulls KPIs from every module's overview endpoint in parallel.
 * Each card links to its module's main page. Each query handles loading and error
 * independently so one failing module doesn't blank the whole dashboard. Every KPI value
 * renders a server-computed `summary` figure — nothing aggregates rows client-side.
 */
export function DashboardOverviewPage() {
  const finance = useQuery({
    queryKey: queryKeys.finance.all(),
    queryFn: () => financeApi.getOverview(),
  })

  const crm = useQuery({
    queryKey: queryKeys.crm.overview(),
    queryFn: () => crmApi.getOverview(),
  })

  const projects = useQuery({
    queryKey: queryKeys.projects.portfolio.all(),
    queryFn: () => projectsApi.getPortfolioUtilization(),
  })

  const hr = useQuery({
    queryKey: queryKeys.hr.employees.list({ page: 1, limit: 1 }),
    queryFn: () => hrApi.listEmployees({ page: 1, limit: 1 }),
  })

  const inventory = useQuery({
    queryKey: queryKeys.inventory.products.list({ page: 1, limit: 1 }),
    queryFn: () => inventoryApi.listProducts({ page: 1, limit: 1 }),
  })

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-heading)]">Dashboard</h1>
        <p className="text-sm text-[var(--color-muted)]">Cross-module overview of your workspace</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          to="/hr/employees"
          label="Headcount"
          value={hr.data ? String(hr.data.summary.totalHeadcount) : '…'}
          subtext={hr.data ? `${hr.data.summary.onLeaveCount} on leave` : undefined}
          loading={hr.isLoading}
        />
        <KpiCard
          to="/finance"
          label="Payable outstanding"
          value={finance.data ? formatMoney(finance.data.payableOutstanding, { compact: true }) : '…'}
          subtext={finance.data ? 'Open vendor invoices' : undefined}
          loading={finance.isLoading}
        />
        <KpiCard
          to="/finance"
          label="Receivable outstanding"
          value={finance.data ? formatMoney(finance.data.receivableOutstanding, { compact: true }) : '…'}
          subtext={finance.data ? 'Open customer invoices' : undefined}
          loading={finance.isLoading}
        />
        <KpiCard
          to="/crm"
          label="Pipeline value"
          value={crm.data ? formatMoney(crm.data.pipeline.openTotal, { compact: true }) : '…'}
          subtext={crm.data ? `${crm.data.pipeline.openCount} open deals` : undefined}
          loading={crm.isLoading}
        />
        <KpiCard
          to="/crm/deals"
          label="Win rate"
          value={crm.data && crm.data.winRate != null
            ? `${Math.round(crm.data.winRate)}%`
            : '—'}
          subtext={crm.data ? `${crm.data.pipeline.wonCount} won, ${crm.data.pipeline.lostCount} lost` : undefined}
          loading={crm.isLoading}
        />
        <KpiCard
          to="/projects"
          label="Active projects"
          value={projects.data ? String(projects.data.summary.activeProjects) : '…'}
          subtext={projects.data ? `${projects.data.summary.totalProjects} total projects` : undefined}
          loading={projects.isLoading}
        />
        <KpiCard
          to="/projects"
          label="Budget spent"
          value={projects.data
            ? formatMoney(projects.data.summary.totalSpent, { compact: true })
            : '…'}
          subtext="Across all projects"
          loading={projects.isLoading}
        />
        <KpiCard
          to="/inventory"
          label="Products"
          value={inventory.data ? String(inventory.data.summary.totalProducts ?? inventory.data.pagination.total) : '…'}
          subtext={inventory.data ? `${inventory.data.summary.lowStockProducts ?? 0} low stock` : undefined}
          loading={inventory.isLoading}
        />
        <KpiCard
          to="/finance"
          label="Expenses pending"
          value={finance.data ? formatMoney(finance.data.expensesPendingTotal, { compact: true }) : '…'}
          subtext={finance.data ? `${finance.data.expensesPendingCount} pending` : undefined}
          loading={finance.isLoading}
        />
      </div>

      <CardSection title="Finance" to="/finance">
        <Card>
          <CardContent className="pt-6">
            {finance.isLoading ? (
              <p className="text-sm text-[var(--color-muted)]">Loading…</p>
            ) : finance.data ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Payable</p>
                  <p className="text-lg font-semibold tabular-nums text-[var(--color-heading)]">
                    {formatMoney(finance.data.payableOutstanding, { compact: true })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Receivable</p>
                  <p className="text-lg font-semibold tabular-nums text-[var(--color-heading)]">
                    {formatMoney(finance.data.receivableOutstanding, { compact: true })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Expenses</p>
                  <p className="text-lg font-semibold tabular-nums text-[var(--color-heading)]">
                    {formatMoney(finance.data.expensesTotal, { compact: true })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Pending expenses</p>
                  <p className="text-lg font-semibold tabular-nums text-[var(--color-heading)]">
                    {finance.data.expensesPendingCount}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-danger)]">Could not load finance data.</p>
            )}
          </CardContent>
        </Card>
      </CardSection>

      <CardSection title="Projects portfolio" to="/projects">
        <Card>
          <CardContent className="pt-6">
            {projects.isLoading ? (
              <p className="text-sm text-[var(--color-muted)]">Loading…</p>
            ) : projects.data ? (
              <div className="space-y-2">
                {projects.data.items.slice(0, 5).map(p => (
                  <div
                    key={p.projectId}
                    className="flex items-center justify-between rounded-[var(--radius-button)] border border-[var(--color-border-default)] px-3 py-2"
                  >
                    <span className="text-sm font-medium text-[var(--color-heading)]">{p.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-[var(--color-muted)]">
                        {formatMoney(p.spent, { compact: true })}
                        {p.budget ? ` / ${formatMoney(p.budget, { compact: true })}` : ''}
                      </span>
                      <Badge variant={
                        p.status === 'ON_TRACK' ? 'success' :
                        p.status === 'AT_RISK' ? 'warning' :
                        p.status === 'DELAYED' ? 'danger' :
                        p.status === 'COMPLETED' ? 'info' : 'secondary'
                      }>
                        {p.status.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
                {projects.data.items.length === 0 && (
                  <p className="text-sm text-[var(--color-muted)]">No projects yet.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-danger)]">Could not load projects.</p>
            )}
          </CardContent>
        </Card>
      </CardSection>
    </div>
  )
}
