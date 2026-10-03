import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertCircle, ArrowDownRight, ArrowUpRight, CreditCard, FolderKanban, Package, TrendingUp, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { financeApi } from '@/lib/api/finance.js'
import { crmApi } from '@/lib/api/crm.js'
import { hrApi } from '@/lib/api/hr.js'
import { inventoryApi } from '@/lib/api/inventory.js'
import { projectsApi } from '@/lib/api/projects.js'
import { formatMoney } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

interface StatCardProps {
  label: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
  icon: typeof Users
  to: string
}

function StatCard({ label, value, change, trend, icon: Icon, to }: StatCardProps) {
  return (
    <Link to={to} className="block rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-card-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)]">
          <Icon size={18} className="text-[var(--color-body-light)]" />
        </div>
        <div className="flex items-center gap-1 rounded-[var(--radius-input)] bg-[var(--color-surface-muted)] px-2 py-1 text-xs font-medium text-[var(--color-body-light)]">
          {trend === 'up' && <ArrowUpRight size={14} className="text-[var(--color-success)]" />}
          {trend === 'down' && <ArrowDownRight size={14} className="text-[var(--color-info)]" />}
          {change}
        </div>
      </div>
      <p className="mb-1 text-sm font-medium text-[var(--color-muted)]">{label}</p>
      <p className="text-3xl font-bold tracking-tight text-[var(--color-heading)]">{value}</p>
    </Link>
  )
}

function Panel({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4 shadow-[var(--shadow-card)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">{title}</h2>
        {to && <Link to={to} className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">View all -&gt;</Link>}
      </div>
      {children}
    </section>
  )
}

export function LegacyDashboardOverviewPage() {
  const finance = useQuery({ queryKey: queryKeys.finance.all(), queryFn: () => financeApi.getOverview() })
  const crm = useQuery({ queryKey: queryKeys.crm.overview(), queryFn: () => crmApi.getOverview() })
  const hr = useQuery({ queryKey: queryKeys.hr.employees.list({ page: 1, limit: 1 }), queryFn: () => hrApi.listEmployees({ page: 1, limit: 1 }) })
  const inventory = useQuery({ queryKey: queryKeys.inventory.products.list({ page: 1, limit: 1 }), queryFn: () => inventoryApi.listProducts({ page: 1, limit: 1 }) })
  const projects = useQuery({ queryKey: queryKeys.projects.portfolio.all(), queryFn: () => projectsApi.getPortfolioUtilization() })

  const cashFlow = (finance.data?.cashFlow ?? []).map(point => ({
    month: point.month.slice(5),
    value: point.net.amount,
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-[var(--spacing-section)] p-[var(--spacing-page)]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-heading)]">Dashboard</h1>
        <p className="text-sm text-[var(--color-muted)]">Good morning. Here is what is happening across your workspace.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard to="/finance" label="Payable outstanding" value={finance.data ? formatMoney(finance.data.payableOutstanding, { compact: true }) : '...'} change="Outstanding" trend="down" icon={CreditCard} />
        <StatCard to="/crm" label="Total pipeline" value={crm.data ? formatMoney(crm.data.pipeline.openTotal, { compact: true }) : '...'} change={crm.data ? `${crm.data.pipeline.openCount} open deals` : 'Loading'} trend="up" icon={TrendingUp} />
        <StatCard to="/hr/employees" label="Total headcount" value={hr.data ? String(hr.data.summary.totalHeadcount) : '...'} change={hr.data ? `${hr.data.summary.onLeaveCount} on leave` : 'Loading'} trend="up" icon={Users} />
        <StatCard to="/projects" label="Budget spent" value={projects.data ? formatMoney(projects.data.summary.totalSpent, { compact: true }) : '...'} change={projects.data ? `${projects.data.summary.activeProjects} active projects` : 'Loading'} trend="neutral" icon={FolderKanban} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-[var(--spacing-grid-lg)]">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Cash flow" to="/finance">
            {cashFlow.length === 0 ? (
              <p className="flex h-64 items-center justify-center text-sm text-[var(--color-muted)]">No cash-flow snapshots yet.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlow} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs><linearGradient id="legacyCashFlow" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-chart-primary)" stopOpacity={0.15} /><stop offset="95%" stopColor="var(--color-chart-primary)" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} tickFormatter={value => formatMoney(Number(value), { compact: true })} />
                    <Tooltip formatter={value => [formatMoney(Number(value), { compact: true }), 'Net cash flow']} contentStyle={{ borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border-default)' }} />
                    <Area type="monotone" dataKey="value" stroke="var(--color-chart-primary)" strokeWidth={3} fill="url(#legacyCashFlow)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Projects portfolio" to="/projects">
            <div className="space-y-3">
              {(projects.data?.items ?? []).slice(0, 3).map(project => (
                <Link key={project.projectId} to="/projects" className="flex items-center justify-between rounded-[var(--radius-card-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-4 transition-colors hover:border-[var(--color-border-default)]">
                  <div><p className="text-sm font-semibold text-[var(--color-heading)]">{project.name}</p><p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatMoney(project.spent, { compact: true })}{project.budget ? ` of ${formatMoney(project.budget, { compact: true })}` : ''}</p></div>
                  <Badge variant={project.status === 'ON_TRACK' ? 'success' : project.status === 'AT_RISK' ? 'warning' : 'secondary'}>{project.status.replace(/_/g, ' ')}</Badge>
                </Link>
              ))}
              {projects.data && projects.data.items.length === 0 && <p className="text-sm text-[var(--color-muted)]">No projects yet.</p>}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Requires attention" to="/finance">
            <div className="space-y-4">
              <Link to="/finance/payables" className="flex items-start justify-between gap-3 border-b border-[var(--color-border-faint)] pb-4"><div><p className="text-sm font-semibold text-[var(--color-heading)]">Open vendor invoices</p><p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Accounts payable</p></div><p className="text-xs font-semibold text-[var(--color-heading)]">{finance.data ? formatMoney(finance.data.payableOutstanding, { compact: true }) : '...'}</p></Link>
              <Link to="/hr/employees" className="flex items-start justify-between gap-3 border-b border-[var(--color-border-faint)] pb-4"><div><p className="text-sm font-semibold text-[var(--color-heading)]">Employees on leave</p><p className="mt-0.5 text-[11px] text-[var(--color-muted)]">HR directory</p></div><p className="text-xs font-semibold text-[var(--color-heading)]">{hr.data?.summary.onLeaveCount ?? '...'}</p></Link>
              <Link to="/inventory" className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--color-heading)]">Low-stock products</p><p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Inventory catalog</p></div><p className="text-xs font-semibold text-[var(--color-heading)]">{inventory.data?.summary.lowStockProducts ?? '...'}</p></Link>
            </div>
          </Panel>

          <Panel title="Quick access">
            <div className="grid grid-cols-2 gap-2">
              <Link to="/hr/employees" className="rounded-[var(--radius-input)] bg-[var(--color-surface-muted)] p-3 text-xs font-medium text-[var(--color-heading)] hover:bg-[var(--color-surface-active)]"><Users size={15} className="mb-2 text-[var(--color-accent)]" />Employees</Link>
              <Link to="/crm/deals" className="rounded-[var(--radius-input)] bg-[var(--color-surface-muted)] p-3 text-xs font-medium text-[var(--color-heading)] hover:bg-[var(--color-surface-active)]"><TrendingUp size={15} className="mb-2 text-[var(--color-accent)]" />Deals</Link>
              <Link to="/inventory" className="rounded-[var(--radius-input)] bg-[var(--color-surface-muted)] p-3 text-xs font-medium text-[var(--color-heading)] hover:bg-[var(--color-surface-active)]"><Package size={15} className="mb-2 text-[var(--color-accent)]" />Inventory</Link>
              <Link to="/projects" className="rounded-[var(--radius-input)] bg-[var(--color-surface-muted)] p-3 text-xs font-medium text-[var(--color-heading)] hover:bg-[var(--color-surface-active)]"><FolderKanban size={15} className="mb-2 text-[var(--color-accent)]" />Projects</Link>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-[var(--color-muted)]"><AlertCircle size={14} /> Figures are calculated from live workspace data.</div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
