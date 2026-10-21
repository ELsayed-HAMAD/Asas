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
    success: 'bg-success-light text-success-text border-success-border',
    danger: 'bg-danger-light text-danger-text border-danger-border',
    muted: 'bg-surface-muted text-muted border-border-default',
  }
  return <Badge variant="outline" className={styles[state.tone]}>{state.label}</Badge>
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
      <section aria-labelledby="readiness-title" className="glass-strong mb-8 rounded-card border border-border-default/80 p-6 shadow-glass sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${apiState.tone === 'success' ? 'bg-success-light text-success' : apiState.tone === 'danger' ? 'bg-danger-light text-danger' : 'bg-surface-muted text-muted'}`}>
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <h2 id="readiness-title" className="text-xl font-bold text-heading">{overall}</h2>
              <p className="mt-1 text-xs text-caption">Refreshes automatically every 30 seconds.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill state={apiState} />
            <Button variant="outline" size="sm" onClick={() => readyQuery.refetch()} disabled={readyQuery.isFetching} className="gap-1.5 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${readyQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="services-title" className="mb-10">
        <h3 id="services-title" className="mb-4 text-lg font-bold text-heading">Reported service configuration</h3>
        <div className="glass-strong divide-y divide-border-subtle/80 overflow-hidden rounded-card border border-border-default/80 shadow-glass">
          {rows.map((row) => {
            const Icon = row.icon
            return (
              <div key={row.name} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                <div className="flex items-center gap-3.5">
                  <span className="rounded-button bg-surface-muted p-2 text-body"><Icon className="h-5 w-5" /></span>
                  <div>
                    <h4 className="text-sm font-bold text-heading">{row.name}</h4>
                    <p className="mt-0.5 text-xs text-caption">{row.detail}</p>
                  </div>
                </div>
                <StatusPill state={row.state} />
              </div>
            )
          })}
        </div>
      </section>

      {readyQuery.isError && (
        <p role="alert" className="mb-8 text-sm text-danger-text">Could not load live readiness information. Check the API connection and try again.</p>
      )}

      <div className="flex items-center gap-2 text-sm text-body-light">
        <HardDrive className="h-4 w-4 text-accent" />
        <span>For security and accuracy, historical uptime and incident records are shown only when backed by a monitoring service.</span>
      </div>
      <p className="mt-6 text-xs text-caption">Need help? Read the <Link to="/documentation" className="font-semibold text-accent hover:underline">platform documentation</Link>.</p>
    </MarketingPageFrame>
  )
}
