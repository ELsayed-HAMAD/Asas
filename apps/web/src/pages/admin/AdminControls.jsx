import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Download, LogIn, Wrench } from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { Switch } from '../../components/ui/switch'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/ui'

const FLAGS = [
  {
    key: 'maintenance_mode',
    field: 'maintenanceMode',
    label: 'Maintenance mode',
    description: 'Blocks every workspace API route except sign-in, health checks, and this console. Use during migrations or incidents.',
    icon: Wrench,
    danger: true,
  },
  {
    key: 'signups_enabled',
    field: 'signupsEnabled',
    label: 'New signups',
    description: 'Controls whether new accounts can be created. Existing users can still sign in.',
    icon: LogIn,
  },
  {
    key: 'exports_enabled',
    field: 'exportsEnabled',
    label: 'Data exports',
    description: 'Controls new export jobs across every workspace. Existing files remain downloadable.',
    icon: Download,
  },
]

export default function AdminControls() {
  const queryClient = useQueryClient()
  const [maintenanceTarget, setMaintenanceTarget] = useState(null)
  const [error, setError] = useState('')

  const query = useQuery({ queryKey: ['platform', 'flags'], queryFn: platformApi.flags })
  const mutation = useMutation({
    mutationFn: ({ key, enabled }) => platformApi.updateFlag(key, enabled),
    onSuccess: async () => {
      setError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform', 'flags'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'public-config'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] }),
      ])
    },
    onError: err => setError(err?.message || 'The platform control could not be updated.'),
  })

  if (query.isLoading) return <AdminLoading label="Loading platform controls..." />
  if (query.isError || !query.data) return <AdminError message={query.error?.message} onRetry={() => query.refetch()} />

  const flags = query.data

  function requestToggle(flag, enabled) {
    if (flag.danger && enabled) {
      setMaintenanceTarget(enabled)
      return
    }
    mutation.mutate({ key: flag.key, enabled })
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Platform controls"
        description="Global switches that affect every workspace. Every change is recorded in the platform audit log."
      />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {FLAGS.map(flag => {
          const Icon = flag.icon
          const enabled = Boolean(flags[flag.field])
          return (
            <section key={flag.key} className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${enabled ? 'bg-[#1e1b4b] text-white' : 'bg-surface-muted text-muted'}`}>
                  <Icon size={16} />
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={value => requestToggle(flag, value)}
                  disabled={mutation.isPending}
                  aria-label={flag.label}
                />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-heading">{flag.label}</h2>
                <AdminStatusBadge status={enabled ? 'ON' : 'OFF'} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{flag.description}</p>
              {flag.danger && enabled && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                  Workspace traffic is currently blocked. Turn maintenance mode off to restore access.
                </p>
              )}
            </section>
          )
        })}
      </div>

      <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
        <h2 className="text-sm font-semibold text-heading">How these controls propagate</h2>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted">
          <li>Maintenance mode is checked by the API request hook and cached for up to 10 seconds.</li>
          <li>Signup controls are enforced in the authentication hook, including social sign-up.</li>
          <li>Export controls are enforced when a new export job is created; existing files remain downloadable.</li>
          <li>All three switches are visible through the public platform configuration used by the app shell.</li>
        </ul>
      </section>

      <ConfirmDialog
        open={Boolean(maintenanceTarget)}
        onClose={() => setMaintenanceTarget(null)}
        title="Enable maintenance mode?"
        description="Every workspace API call will be blocked immediately, except sign-in, health checks, and the platform console. Workspace users will see a maintenance notice."
        confirmLabel="Enable maintenance mode"
        danger
        busy={mutation.isPending}
        onConfirm={() => {
          mutation.mutate({ key: 'maintenance_mode', enabled: true })
          setMaintenanceTarget(null)
        }}
        error={error || undefined}
      />
    </div>
  )
}
