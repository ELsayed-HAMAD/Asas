import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { GeneralSettingsUpdateInput } from '@asas/contracts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Toaster, toast } from '@/components/ui/toast'
import { settingsApi } from '@/lib/api/settings.js'
import { queryKeys } from '@/lib/queryKeys.js'

/**
 * Ports the legacy `SettingsGeneral` (asas/src/pages/dashboard/settings/SettingsGeneral.jsx) onto
 * the shadcn component set and the real `/api/v1/settings/general` endpoint.
 *
 * The old page rendered a "Save Changes" button with no handler and only two working-looking
 * fields; here every control is wired: `useQuery` loads the tenant's current values, the form
 * tracks local edits, and Save calls `updateTenantSettings` via `useMutation`, invalidating the
 * cache and firing a success/error toast. Currency is validated server-side against the ISO 4217
 * registry, so a bad code surfaces as a toast rather than a broken number downstream.
 */
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AED', 'EGP', 'SAR', 'INR', 'AUD', 'CAD', 'CHF']
const TIMEZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai']
const DATE_FORMATS = ['MMM d, yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy', 'dd MMMM yyyy']

export function SettingsGeneralPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.general(),
    queryFn: () => settingsApi.getGeneral(),
  })

  const [form, setForm] = useState({
    name: '',
    supportEmail: '',
    logoUrl: '',
    timezone: 'UTC',
    currency: 'USD',
    dateFormat: 'MMM d, yyyy',
  })
  const [initialized, setInitialized] = useState(false)

  // Seed the form once from the server value, so re-renders (or a refetch after save) do not
  // clobber in-progress edits, and so the form starts blank rather than flashing stale state.
  if (data && !initialized) {
    setInitialized(true)
    setForm({
      name: data.name,
      supportEmail: data.supportEmail ?? '',
      logoUrl: data.logoUrl ?? '',
      timezone: data.timezone,
      currency: data.currency,
      dateFormat: data.dateFormat,
    })
  }

  const saveMutation = useMutation({
    mutationFn: (input: GeneralSettingsUpdateInput) => settingsApi.updateGeneral(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.general() })
      toast({ title: 'General settings saved', description: 'Your workspace profile was updated.' })
    },
    onError: error => {
      toast({
        variant: 'error',
        title: 'Could not save settings',
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    },
  })

  const isDirty = useMemo(() => {
    if (!data) return false
    return (
      form.name !== data.name ||
      form.supportEmail !== (data.supportEmail ?? '') ||
      form.logoUrl !== (data.logoUrl ?? '') ||
      form.timezone !== data.timezone ||
      form.currency !== data.currency ||
      form.dateFormat !== data.dateFormat
    )
  }, [form, data])

  function save() {
    const input: Record<string, unknown> = {}
    if (data) {
      if (form.name !== data.name) input.name = form.name
      if (form.supportEmail !== (data.supportEmail ?? '')) input.supportEmail = form.supportEmail || null
      if (form.logoUrl !== (data.logoUrl ?? '')) input.logoUrl = form.logoUrl || null
      if (form.timezone !== data.timezone) input.timezone = form.timezone
      if (form.currency !== data.currency) input.currency = form.currency
      if (form.dateFormat !== data.dateFormat) input.dateFormat = form.dateFormat
    }
    saveMutation.mutate(input as Parameters<typeof settingsApi.updateGeneral>[0])
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
        <h1 className="text-xl font-semibold text-[var(--color-heading)]">General Settings</h1>
        <p className="text-sm text-[var(--color-danger)]">Could not load general settings.</p>
        <Toaster />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">General Settings</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Workspace identity, branding, and regional defaults.
          </p>
        </div>
        <Button onClick={save} disabled={saveMutation.isPending || !isDirty || !data}>
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization Profile</CardTitle>
          <CardDescription>Manage your workspace identity and basic contact information.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--color-heading)]">Workspace Name</label>
            <Input
              value={form.name}
              disabled={isLoading}
              onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
              placeholder="Acme Inc."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--color-heading)]">Support Email</label>
            <Input
              type="email"
              value={form.supportEmail}
              disabled={isLoading}
              onChange={event => setForm(prev => ({ ...prev, supportEmail: event.target.value }))}
              placeholder="support@acme.com"
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-[var(--color-heading)]">Logo URL</label>
            <Input
              value={form.logoUrl}
              disabled={isLoading}
              onChange={event => setForm(prev => ({ ...prev, logoUrl: event.target.value }))}
              placeholder="https://acme.com/logo.png"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Localization</CardTitle>
          <CardDescription>Configure regional settings applied to every user in this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--color-heading)]">Timezone</label>
            <Select
              value={form.timezone}
              onValueChange={value => setForm(prev => ({ ...prev, timezone: value }))}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(zone => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--color-heading)]">Currency</label>
            <Select
              value={form.currency}
              onValueChange={value => setForm(prev => ({ ...prev, currency: value }))}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(code => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--color-heading)]">Date Format</label>
            <Select
              value={form.dateFormat}
              onValueChange={value => setForm(prev => ({ ...prev, dateFormat: value }))}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map(format => (
                  <SelectItem key={format} value={format}>
                    {format}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Toaster />
    </div>
  )
}
