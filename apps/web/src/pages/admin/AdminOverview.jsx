import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CreditCard,
  HardDrive,
  ScrollText,
  TrendingUp,
  Users,
} from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { formatMoney } from '../../lib/format'
import {
  AdminError,
  AdminKpiCard,
  AdminLoading,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/ui'

function shortDate(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminOverview() {
  const overviewQuery = useQuery({ queryKey: ['platform', 'overview'], queryFn: platformApi.overview })
  const healthQuery = useQuery({ queryKey: ['platform', 'health'], queryFn: platformApi.health })

  if (overviewQuery.isLoading) return <AdminLoading label="Loading platform overview..." />
  if (overviewQuery.isError || !overviewQuery.data) {
    return <AdminError message={overviewQuery.error?.message} onRetry={() => overviewQuery.refetch()} />
  }

  const data = overviewQuery.data
  const health = healthQuery.data
  const mrr = formatMoney(data.mrr, { currency: data.currency })
  const maxPlan = Math.max(1, ...data.planMix.map(row => row.count))

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Platform overview"
        description="A live view across every workspace. Use the sections on the left to inspect workspaces, users, billing, health, and platform controls."
        actions={(
          <Link to="/admin/workspaces" className="inline-flex items-center gap-1.5 rounded-full bg-[#1e1b4b] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#312e81]">
            Browse workspaces <ArrowRight size={13} />
          </Link>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AdminKpiCard label="Workspaces" value={data.workspaceCount.toLocaleString()} detail={`${data.activeWorkspaceCount} active · ${data.suspendedWorkspaceCount} suspended`} icon={Building2} />
        <AdminKpiCard label="Users" value={data.userCount.toLocaleString()} detail={`${data.newUsers30d} joined in the last 30 days`} icon={Users} tone="slate" />
        <AdminKpiCard label="Active subscriptions" value={data.activeSubscriptionCount.toLocaleString()} detail={`${data.pastDueSubscriptionCount} past due`} icon={CreditCard} tone={data.pastDueSubscriptionCount ? 'amber' : 'emerald'} />
        <AdminKpiCard label="Monthly recurring revenue" value={mrr} detail="Active local subscriptions only; Stripe remains the billing source of truth." icon={TrendingUp} tone="emerald" />
        <AdminKpiCard label="Reported storage" value={`${data.reportedStorageGb.toFixed(1)} GB`} detail="Reported across current subscriptions." icon={HardDrive} tone="slate" />
        <AdminKpiCard label="New workspaces (30d)" value={data.newWorkspaces30d.toLocaleString()} detail="Created in the last 30 days." icon={Activity} tone="indigo" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-heading">Plan mix</h2>
              <p className="mt-0.5 text-xs text-muted">Current workspace plan distribution.</p>
            </div>
            <Link to="/admin/billing" className="text-[11px] font-semibold text-accent hover:underline">Billing</Link>
          </div>
          <div className="mt-5 space-y-3">
            {data.planMix.length === 0 && <p className="text-xs text-muted">No plans recorded yet.</p>}
            {data.planMix.map(row => (
              <div key={row.planName} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-3 text-xs">
                <span className="truncate font-medium text-heading">{row.planName}</span>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-[#1e1b4b]" style={{ width: `${Math.max(4, (row.count / maxPlan) * 100)}%` }} />
                </div>
                <span className="w-8 text-right font-semibold tabular-nums text-body">{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-heading">System health</h2>
              <p className="mt-0.5 text-xs text-muted">Live service signals from the platform.</p>
            </div>
            <Link to="/admin/health" className="text-[11px] font-semibold text-accent hover:underline">Details</Link>
          </div>
          {healthQuery.isLoading ? (
            <p className="mt-5 text-xs text-muted">Checking services...</p>
          ) : healthQuery.isError || !health ? (
            <p className="mt-5 text-xs text-rose-700">Health data is unavailable.</p>
          ) : (
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Database</span>
                <AdminStatusBadge status={health.database === 'connected' ? 'ACTIVE' : 'FAILED'} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Overall</span>
                <AdminStatusBadge status={health.status === 'ok' ? 'ACTIVE' : 'FAILED'} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Export queue</span>
                <span className="font-semibold text-heading">{health.exportJobs.failed} failed · {health.queueMode}</span>
              </div>
              {health.exportJobs.failed > 0 && (
                <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] leading-4 text-rose-800">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Review failed export jobs on the Health page.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-heading">Recent platform activity</h2>
            <p className="mt-0.5 text-xs text-muted">Writes performed through the platform console.</p>
          </div>
          <Link to="/admin/audit" className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline">
            <ScrollText size={12} /> Full audit
          </Link>
        </div>
        {data.recentAudit.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted">No platform actions have been recorded yet.</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {data.recentAudit.map(item => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-semibold text-heading">{item.action}</span>
                  {item.targetType && <span className="text-muted">{item.targetType}</span>}
                </div>
                <span className="text-[11px] text-muted">{shortDate(item.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
