import { useQuery } from '@tanstack/react-query'
import { Activity, Clock3, Database, HardDrive, Mail, RefreshCw, Server, TriangleAlert } from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { Button } from '../../components/ui/button'
import {
  AdminEmptyState,
  AdminError,
  AdminKpiCard,
  AdminLoading,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/ui'

function uptimeLabel(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function AdminHealth() {
  const query = useQuery({ queryKey: ['platform', 'health'], queryFn: platformApi.health, refetchInterval: 30_000 })

  if (query.isLoading) return <AdminLoading label="Checking platform services..." />
  if (query.isError || !query.data) return <AdminError message={query.error?.message} onRetry={() => query.refetch()} />

  const health = query.data
  const exportTotal = health.exportJobs.queued + health.exportJobs.running + health.exportJobs.failed + health.exportJobs.done

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Health"
        description="Live service signals across the platform. Values come from the API, database, queue, and storage configuration."
        actions={(
          <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} className="rounded-full">
            <RefreshCw size={13} className={query.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiCard label="Overall" value={health.status === 'ok' ? 'Operational' : 'Degraded'} detail={`Checked ${new Date(health.timestamp).toLocaleTimeString()}`} icon={Activity} tone={health.status === 'ok' ? 'emerald' : 'rose'} />
        <AdminKpiCard label="Database" value={health.database === 'connected' ? 'Connected' : 'Unavailable'} detail={health.nodeEnv} icon={Database} tone={health.database === 'connected' ? 'emerald' : 'rose'} />
        <AdminKpiCard label="Uptime" value={uptimeLabel(health.uptimeSeconds)} detail="Process uptime" icon={Clock3} tone="slate" />
        <AdminKpiCard label="Export jobs" value={exportTotal.toLocaleString()} detail={`${health.exportJobs.failed} failed`} icon={Server} tone={health.exportJobs.failed ? 'amber' : 'slate'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-heading">Service configuration</h2>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-muted"><HardDrive size={13} /> Object storage</span><span className="font-semibold capitalize text-heading">{health.storageDriver}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-muted"><Mail size={13} /> Email delivery</span><span className="font-semibold capitalize text-heading">{health.emailDelivery}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-muted"><Server size={13} /> Queue mode</span><span className="font-semibold text-heading">{health.queueMode}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-muted"><Activity size={13} /> Redis fanout</span><span className="font-semibold text-heading">{health.redisConfigured ? 'Configured' : 'In-memory'}</span></div>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-heading">Export queue</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Object.entries(health.exportJobs).map(([status, count]) => (
              <div key={status} className="rounded-xl border border-border-default bg-white/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{status}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-heading">{count}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-heading">Failed export jobs</h2>
            <p className="mt-0.5 text-xs text-muted">The ten most recent failures across every workspace.</p>
          </div>
          {health.exportJobs.failed > 0 && <AdminStatusBadge status="FAILED" />}
        </div>
        {health.failedJobs.length === 0 ? (
          <div className="p-4"><AdminEmptyState icon={TriangleAlert} title="No failed export jobs" description="The queue is clear." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-border-subtle bg-surface-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Job ID</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {health.failedJobs.map(job => (
                  <tr key={job.id} className="hover:bg-white/70">
                    <td className="px-4 py-3 font-medium text-heading">{job.tenantName}</td>
                    <td className="px-4 py-3 text-body">{job.filename}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted">{job.id}</td>
                    <td className="px-4 py-3 text-muted">{new Date(job.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
