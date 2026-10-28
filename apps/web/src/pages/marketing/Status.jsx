import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Database, HardDrive, Mail, RefreshCw, Server } from 'lucide-react'
import { Link } from 'react-router-dom'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { http } from '../../lib/api/http'

function serviceState(value, { healthy = [], disabled = [] } = {}) {
  if (healthy.includes(value)) return { label: value === 'configured' ? 'Configured' : 'Connected', tone: 'success' }
  if (disabled.includes(value)) return { label: 'Not configured', tone: 'muted' }
  if (value === 'disconnected') return { label: 'Disconnected', tone: 'danger' }
  return { label: 'Unknown', tone: 'muted' }
}

function StatusPill({ state }) {
  const styles = {
    success: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700',
    danger: 'border-red-200/80 bg-red-50/80 text-red-700',
    muted: 'border-black/[0.07] bg-black/[0.035] text-[#737378]',
  }
  return <Badge variant="outline" className={`${styles[state.tone]} rounded-full px-3 py-1 text-[10px] font-medium shadow-none`}>{state.label}</Badge>
}

export default function Status() {
  const readyQuery = useQuery({
    queryKey: ['system', 'ready'],
    queryFn: () => http.get('/ready'),
    refetchInterval: 30000,
    retry: 1,
  })

  const ready = readyQuery.data
  const apiState = readyQuery.isLoading
    ? { label: 'Checking', tone: 'muted' }
    : readyQuery.isError
      ? { label: 'Unavailable', tone: 'danger' }
      : ready?.status === 'ok'
        ? { label: 'Operational', tone: 'success' }
        : { label: 'Unhealthy', tone: 'danger' }
  const rows = [
    {
      name: 'Application API',
      detail: 'Live readiness response from this deployment.',
      icon: Server,
      state: apiState,
    },
    {
      name: 'Database',
      detail: 'Connectivity check reported by the API.',
      icon: Database,
      state: serviceState(ready?.database, { healthy: ['connected'], disabled: ['disabled'] }),
    },
    {
      name: 'Email delivery',
      detail: ready?.emailDelivery === 'configured'
        ? 'Provider credentials are configured; this probe does not send a test email.'
        : 'No delivery provider is configured for this deployment.',
      icon: Mail,
      state: serviceState(ready?.emailDelivery, { healthy: ['configured'], disabled: ['disabled'] }),
    },
    {
      name: 'File storage',
      detail: ready?.objectStorage ? `Configured driver: ${ready.objectStorage}. The readiness endpoint does not test writes.` : 'Storage driver was not reported.',
      icon: HardDrive,
      state: ready?.objectStorage ? { label: ready.objectStorage === 's3' ? 'Configured' : 'Local storage', tone: 'muted' } : { label: 'Unknown', tone: 'muted' },
    },
  ]

  const overall = readyQuery.isLoading ? 'Checking live readiness…'
    : readyQuery.isError ? 'The readiness endpoint could not be reached.'
      : ready?.status === 'ok' ? 'The API readiness check passed.'
        : 'The API reported that it is unhealthy.'

  return (
    <MarketingPageFrame
      eyebrow="Deployment readiness"
      title="Platform status"
      description="This page displays the live readiness fields exposed by the current Asas API deployment. It does not show uptime history or provider checks the API does not perform."
    >
      <section aria-labelledby="readiness-title" className="rounded-[28px] border border-white/80 bg-white/60 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${apiState.tone === 'success' ? 'bg-emerald-50 text-emerald-600' : apiState.tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-black/[0.04] text-[#737378]'}`}>
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <h2 id="readiness-title" className="text-xl font-semibold tracking-[-0.025em] text-[#1d1d1f] sm:text-2xl">{overall}</h2>
              <p className="mt-1.5 text-xs text-[#929297]">Refreshes automatically every 30 seconds.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill state={apiState} />
            <Button variant="outline" size="sm" onClick={() => readyQuery.refetch()} disabled={readyQuery.isFetching} className="h-9 gap-1.5 rounded-full border-black/10 bg-white/60 px-4 text-xs text-[#1d1d1f] shadow-none hover:bg-white">
              <RefreshCw className={`h-3.5 w-3.5 ${readyQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="services-title" className="mt-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#0071e3]">Current deployment</p>
            <h3 id="services-title" className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#1d1d1f]">Reported service configuration</h3>
          </div>
          <span className="hidden text-[10px] text-[#929297] sm:inline">Live API fields only</span>
        </div>
        <div className="divide-y divide-black/[0.06] overflow-hidden rounded-[24px] border border-black/[0.06] bg-white/55 shadow-[0_16px_50px_rgba(0,0,0,0.04)] backdrop-blur-xl">
          {rows.map((row) => {
            const Icon = row.icon
            return (
              <div key={row.name} className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6">
                <div className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.05] bg-white/75 text-[#626267] shadow-sm"><Icon className="h-4.5 w-4.5" /></span>
                  <div>
                    <h4 className="text-sm font-semibold text-[#1d1d1f]">{row.name}</h4>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-[#86868b]">{row.detail}</p>
                  </div>
                </div>
                <StatusPill state={row.state} />
              </div>
            )
          })}
        </div>
      </section>

      {readyQuery.isError && <p role="alert" className="mt-6 rounded-2xl border border-red-200/70 bg-red-50/70 p-4 text-sm text-red-700">Could not load live readiness information. Check the API connection and try again.</p>}

      <div className="mt-10 flex items-start gap-3 border-t border-black/[0.07] pt-6 text-xs leading-5 text-[#737378]">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-[#0071e3]" />
        <span>For security and accuracy, historical uptime and incident records are shown only when backed by a monitoring service.</span>
      </div>
      <p className="mt-5 text-xs text-[#86868b]">Need help? Read the <Link to="/documentation" className="font-semibold text-[#0071e3] hover:underline">platform documentation</Link>.</p>
    </MarketingPageFrame>
  )
}
