import type { NotificationSettingsUpdateInput } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Toaster, toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/http.js'
import { settingsApi } from '@/lib/api/settings.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'
import { cn } from '@/lib/utils'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

const MODULE_LABELS: Record<string, string> = {
  finance: 'Finance',
  projects: 'Projects',
  system: 'System',
  hr: 'HR',
  crm: 'CRM',
  inventory: 'Inventory',
}

const EVENT_LABELS: Record<string, string> = {
  invoice_overdue: 'Invoice overdue',
  invoice_created: 'Invoice created',
  project_deadline: 'Project deadline',
  project_risk: 'Project at risk',
  payroll_approved: 'Payroll approved',
  deal_stage_change: 'Deal stage changed',
  stock_low: 'Low stock alert',
  system_maintenance: 'System maintenance',
}

function humanizeModule(key: string): string {
  return MODULE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

function humanizeEvent(key: string): string {
  return EVENT_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface ChannelToggle {
  key: 'inApp' | 'email' | 'slack'
  label: string
}

const CHANNELS: ChannelToggle[] = [
  { key: 'inApp', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'slack', label: 'Slack' },
]

/**
 * Notification settings — `GET /settings/notifications` and `PATCH /settings/notifications`.
 * Per-module event preferences with in-app/email/slack toggles and quiet hours.
 */
export function NotificationsPage() {
  const role = useMyRole()
  const canWrite = role === 'ADMIN' || role === 'OWNER'
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.notifications(),
    queryFn: () => settingsApi.getNotifications(),
  })

  const [quietStart, setQuietStart] = useState('')
  const [quietEnd, setQuietEnd] = useState('')
  const [pendingChanges, setPendingChanges] = useState<Record<string, Record<string, { inApp?: boolean; email?: boolean; slack?: boolean }>>>({})

  // Initialize quiet hours from server data
  if (data && quietStart === '' && data.quietHours) {
    setQuietStart(data.quietHours.start)
    setQuietEnd(data.quietHours.end)
  }

  const updateNotifications = useMutation({
    mutationFn: (input: NotificationSettingsUpdateInput) => settingsApi.updateNotifications(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.notifications() })
      toast({ title: 'Notification settings saved' })
      setPendingChanges({})
    },
    onError: e => toast({ variant: 'error', title: 'Failed to save', description: errorMessage(e, 'Try again.') }),
  })

  function toggleChannel(module: string, event: string, channel: 'inApp' | 'email' | 'slack', currentValue: boolean) {
    setPendingChanges(prev => ({
      ...prev,
      [module]: {
        ...(prev[module] ?? {}),
        [event]: {
          ...(prev[module]?.[event] ?? {}),
          [channel]: !currentValue,
        },
      },
    }))
  }

  function getChannelValue(module: string, event: string, channel: 'inApp' | 'email' | 'slack'): boolean {
    const pending = pendingChanges[module]?.[event]?.[channel]
    if (pending !== undefined) return pending
    return data?.modules[module]?.[event]?.[channel] ?? false
  }

  function save() {
    const input: NotificationSettingsUpdateInput = {}
    if (Object.keys(pendingChanges).length > 0) {
      input.modules = pendingChanges
    }
    if (data && (quietStart !== data.quietHours.start || quietEnd !== data.quietHours.end)) {
      input.quietHours = { start: quietStart, end: quietEnd }
    }
    if (Object.keys(input).length === 0) {
      toast({ title: 'No changes to save' })
      return
    }
    updateNotifications.mutate(input)
  }

  const hasChanges = Object.keys(pendingChanges).length > 0 ||
    (data != null && (quietStart !== data.quietHours.start || quietEnd !== data.quietHours.end))

  const moduleEntries = data ? Object.entries(data.modules) : []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-heading)]">Notifications</h1>
          <p className="text-sm text-[var(--color-muted)]">Per-module notification channels and quiet hours</p>
        </div>
        {canWrite && (
          <Button disabled={!hasChanges || updateNotifications.isPending} onClick={save}>
            {updateNotifications.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>

      {isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load notification settings.</p>
      ) : isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : data && (
        <>
          {data.quietHoursDefaulted && (
            <Card className="border-[var(--color-accent)]/30">
              <CardContent className="pt-6">
                <p className="text-sm text-[var(--color-muted)]">
                  No quiet hours have been set yet — the values below are defaults. Save to persist your preferences.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Quiet hours</CardTitle>
              <CardDescription>Suppress notifications during these hours</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-heading)]">Start</label>
                  <Input
                    type="time"
                    value={quietStart}
                    onChange={e => setQuietStart(e.target.value)}
                    disabled={!canWrite}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-heading)]">End</label>
                  <Input
                    type="time"
                    value={quietEnd}
                    onChange={e => setQuietEnd(e.target.value)}
                    disabled={!canWrite}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {moduleEntries.map(([moduleKey, events]) => (
            <Card key={moduleKey}>
              <CardHeader>
                <CardTitle>{humanizeModule(moduleKey)}</CardTitle>
                <CardDescription>Notification channels for {humanizeModule(moduleKey).toLowerCase()} events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(events).map(([eventKey, prefs]) => (
                    <div
                      key={eventKey}
                      className="flex items-center justify-between rounded-[var(--radius-button)] border border-[var(--color-border-default)] px-3 py-2"
                    >
                      <span className="text-sm font-medium text-[var(--color-heading)]">
                        {humanizeEvent(eventKey)}
                      </span>
                      <div className="flex items-center gap-2">
                        {CHANNELS.map(ch => {
                          const value = getChannelValue(moduleKey, eventKey, ch.key)
                          return (
                            <button
                              key={ch.key}
                              type="button"
                              disabled={!canWrite}
                              onClick={() => toggleChannel(moduleKey, eventKey, ch.key, value)}
                              className={cn(
                                'rounded-[var(--radius-badge)] border px-2.5 py-0.5 text-xs font-semibold transition-colors',
                                value
                                  ? 'border-[var(--color-primary-subtle)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                                  : 'border-[var(--color-border-default)] bg-[var(--color-surface-muted)] text-[var(--color-muted)]',
                                canWrite && 'cursor-pointer hover:border-[var(--color-accent)]',
                              )}
                            >
                              {ch.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {moduleEntries.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-[var(--color-muted)]">No notification modules configured yet.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Toaster />
    </div>
  )
}
