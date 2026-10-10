import { useEffect, useState } from 'react'
import { listCurrencies } from '@asas/domain/money'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Search,
  Cloud,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Check,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import SettingsTabs from './SettingsTabs'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import { http } from '../../../lib/api/http'
import { onboardingApi } from '../../../lib/api/onboarding'
import { settingsApi } from '../../../lib/api/settings'
import { queryKeys } from '../../../lib/queryKeys'

export default function SettingsGeneral() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.general(),
    queryFn: () => http.get('/settings/general'),
  })

  const { data: onboarding } = useQuery({
    queryKey: queryKeys.onboarding.status(),
    queryFn: onboardingApi.status,
  })

  const exchangeRateQuery = { page: 1, limit: 20 }
  const { data: exchangeRates } = useQuery({
    queryKey: queryKeys.settings.exchangeRates(exchangeRateQuery),
    queryFn: () => settingsApi.listExchangeRates(exchangeRateQuery),
  })

  // Form fields are seeded from the server response (the old page used uncontrolled
  // defaultValue + a no-op Save button; now Save is a real PATCH).
  const [form, setForm] = useState({ name: '', supportEmail: '', timezone: '', currency: '', dateFormat: '', overtimeThresholdHours: '8' })
  const [saved, setSaved] = useState(false)
  const [rateForm, setRateForm] = useState({ currency: '', rateToBase: '', effectiveAt: '', reference: '' })

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name ?? '',
        supportEmail: settings.supportEmail ?? '',
        timezone: settings.timezone ?? '',
        currency: settings.currency ?? '',
        dateFormat: settings.dateFormat ?? '',
        overtimeThresholdHours: String(settings.overtimeThresholdHours ?? 8),
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    // Blank fields: `supportEmail` is nullable (clears it); the rest are non-nullable, so a
    // blank value is omitted rather than sent as '' (the API's Zod schema rejects empty strings).
    mutationFn: () => http.patch('/settings/general', {
      body: {
        name: form.name.trim() ? form.name : undefined,
        supportEmail: form.supportEmail.trim() ? form.supportEmail.trim() : null,
        timezone: form.timezone.trim() ? form.timezone : undefined,
        currency: !settings?.currencyLockedAt && form.currency.trim() ? form.currency : undefined,
        dateFormat: form.dateFormat.trim() ? form.dateFormat : undefined,
        overtimeThresholdHours: form.overtimeThresholdHours.trim() ? Number(form.overtimeThresholdHours) : undefined,
      },
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.settings.general(), updated)
      // Empty workspaces can change denomination; invalidate money/date displays in other modules.
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'asas' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.general() }),
  })

  const clearMutation = useMutation({
    mutationFn: () => onboardingApi.clearSampleData(),
    onSuccess: () => {
      // Invalidate every business module (the sweep touched all of them) + onboarding.
      // The active organization's status becomes PENDING, so the dashboard shell
      // redirects to /onboarding for the 3-choice flow.
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'asas' })
      navigate('/onboarding', { replace: true })
    },
  })

  const rateMutation = useMutation({
    mutationFn: () => settingsApi.createExchangeRate({
      currency: rateForm.currency || listCurrencies().find(({ code }) => code !== settings.currency)?.code,
      rateToBase: rateForm.rateToBase.trim(),
      effectiveAt: new Date(rateForm.effectiveAt).toISOString(),
      reference: rateForm.reference.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.exchangeRates() })
      setRateForm((current) => ({ ...current, rateToBase: '', reference: '' }))
    },
  })

  const [confirmOpen, setConfirmOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface flex-1">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    )
  }

  if (isError || !settings) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger flex-1">
        Failed to load general settings.
      </div>
    )
  }

  // Compute dynamic current dates and local timezone for the date-format previews.
  const now = new Date()
  const format1 = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const format2 = now.toISOString().split('T')[0]
  const format3 = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const isSampleLoaded = onboarding?.onboardingStatus === 'SAMPLE_LOADED'

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search settings..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-primary text-on-primary px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap disabled:opacity-60 flex items-center gap-2"
          >
            {saved ? <Check size={14} /> : saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            {saved ? 'Saved' : 'Save Changes'}
          </button>
          {saveMutation.isError && <p role="alert" className="text-xs text-danger">{saveMutation.error?.message || 'Unable to save settings.'}</p>}
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Settings Content Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">

          {/* Organization Profile Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Organization Profile</h2>
            <p className="text-sm text-muted mb-6">Manage your workspace identity and basic contact information.</p>

            <div className="flex items-start gap-6">
              {/* Logo Upload */}
              <div className="w-32 h-32 rounded-button border-2 border-dashed border-border-strong bg-surface-muted flex flex-col items-center justify-center text-caption hover:bg-surface-active hover:border-caption transition-colors cursor-pointer shrink-0">
                <div className="w-10 h-10 bg-surface-strong rounded-full flex items-center justify-center mb-2">
                  <Cloud size={20} className="text-muted" />
                </div>
                <span className="text-xs font-semibold text-body-light">Upload Logo</span>
              </div>

              {/* Form Fields */}
              <div className="flex-1 space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">Workspace Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={setField('name')}
                    className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">Support Email</label>
                  <input
                    type="email"
                    value={form.supportEmail}
                    onChange={setField('supportEmail')}
                    className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Localization Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Localization</h2>
            <p className="text-sm text-muted mb-6">Configure regional settings for all users in this workspace.</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Timezone</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.timezone || localTimezone}
                    onChange={setField('timezone')}
                  >
                    <option value="UTC">(GMT+00:00) UTC</option>
                    <option value="PST">(GMT-08:00) Pacific Time</option>
                    {localTimezone !== 'UTC' && localTimezone !== 'PST' && (
                      <option value={localTimezone}>Local ({localTimezone})</option>
                    )}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Currency</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.currency || 'USD'}
                    onChange={setField('currency')}
                    disabled={Boolean(settings.currencyLockedAt)}
                    title={settings.currencyLockedAt ? 'Base currency is fixed once monetary data exists; relabeling is not FX conversion.' : 'Choose the base currency before entering monetary data.'}
                  >
                    {listCurrencies().map(({ code }) => <option key={code} value={code}>{code === 'USD' ? 'USD ($)' : code === 'EUR' ? 'EUR (€)' : code}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                </div>
                <p className="mt-1.5 text-xs text-muted">{settings.currencyLockedAt ? 'Base currency is fixed to protect existing monetary records. Currency conversion requires an explicit FX workflow.' : 'Choose your base currency before adding salaries, invoices, products or budgets.'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Date Format</label>
                <div className="relative">
                <select
                  className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.dateFormat || 'MMM d, yyyy'}
                  onChange={setField('dateFormat')}
                >
                  <option value="MMM d, yyyy">{format1}</option>
                  <option value="yyyy-MM-dd">{format2}</option>
                  <option value="dd/MM/yyyy">{format3}</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Overtime After (Hours per Day)</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="0.25"
                  value={form.overtimeThresholdHours}
                  onChange={setField('overtimeThresholdHours')}
                  className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="mt-1.5 text-xs text-muted">New weekly timesheets use this threshold. Existing weeks keep their recorded threshold.</p>
              </div>
            </div>
          </div>

          {/* FX Rate History Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Exchange Rates</h2>
            <p className="text-sm text-muted mb-5">Enter how many {settings.currency} one unit of foreign currency is worth. Rates are timestamped and retained for audit; adding a quote does not revalue existing records.</p>
            <form className="grid grid-cols-5 gap-3 items-end mb-5" onSubmit={(event) => { event.preventDefault(); rateMutation.mutate() }}>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Currency</label>
                <select required value={rateForm.currency || listCurrencies().find(({ code }) => code !== settings.currency)?.code || ''} onChange={(event) => setRateForm((current) => ({ ...current, currency: event.target.value }))} className="w-full border border-border-strong rounded-input px-3 py-2 text-sm bg-surface-raised">
                  {listCurrencies().filter(({ code }) => code !== settings.currency).map(({ code }) => <option key={code} value={code}>{code}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Rate to {settings.currency}</label>
                <input required type="text" inputMode="decimal" value={rateForm.rateToBase} onChange={(event) => setRateForm((current) => ({ ...current, rateToBase: event.target.value }))} placeholder="e.g. 1.0875" className="w-full border border-border-strong rounded-input px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Effective at</label>
                <input required type="datetime-local" value={rateForm.effectiveAt} onChange={(event) => setRateForm((current) => ({ ...current, effectiveAt: event.target.value }))} className="w-full border border-border-strong rounded-input px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Reference</label>
                <input type="text" value={rateForm.reference} onChange={(event) => setRateForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Source or note" className="w-full border border-border-strong rounded-input px-3 py-2 text-sm" />
              </div>
              <button type="submit" disabled={rateMutation.isPending} className="bg-primary text-on-primary px-4 py-2 rounded-input text-sm font-semibold disabled:opacity-60">{rateMutation.isPending ? 'Saving…' : 'Add Rate'}</button>
            </form>
            {rateMutation.isError && <p role="alert" className="text-xs text-danger mb-3">{rateMutation.error?.message || 'Unable to save exchange rate.'}</p>}
            <div className="divide-y divide-border-default">
              {(exchangeRates?.items ?? []).map((rate) => <div key={rate.id} className="flex items-center justify-between py-2 text-sm"><span className="font-medium text-heading">1 {rate.currency} = {rate.rateToBase} {rate.baseCurrency}</span><span className="text-xs text-muted">{new Date(rate.effectiveAt).toLocaleString()} · {rate.reference || 'Manual'} · {rate.createdById || 'System'}</span></div>)}
              {!exchangeRates?.items?.length && <p className="py-2 text-sm text-muted">No FX quotes recorded yet.</p>}
            </div>
          </div>

          {/* Danger Zone Card */}
          <div className="bg-danger-light border border-danger-border rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-danger-hover mb-1">Danger Zone</h2>
            <p className="text-sm text-danger mb-6">Irreversible destructive actions for this workspace.</p>

            {isSampleLoaded && (
              <div className="flex items-center justify-between pb-5 mb-5 border-b border-danger-border">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-danger-hover mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-heading">Reset sample data</h3>
                    <p className="text-sm text-body-light mt-0.5">
                      Remove the sample dataset and go back to the setup screen. Your account and
                      workspace stay intact — you can start empty or upload your own data.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={clearMutation.isPending}
                  className="flex items-center gap-2 bg-danger-hover text-on-primary px-5 py-2.5 rounded-input text-sm font-semibold hover:bg-danger-text transition-colors shadow-card disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw size={14} className={clearMutation.isPending ? 'animate-spin' : ''} />
                  Reset sample data...
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-heading">Delete Workspace</h3>
                <p className="text-sm text-body-light mt-0.5">Permanently remove all data, projects, and users.</p>
              </div>
              <button className="bg-danger-hover text-on-primary px-5 py-2.5 rounded-input text-sm font-semibold hover:bg-danger-text transition-colors shadow-card">
                Delete Workspace...
              </button>
            </div>
          </div>

        </div>

        {/* Right: Subscription Inspector Panel */}
        <div className="w-[360px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 shadow-panel z-10">

          <div className="flex-1 overflow-y-auto p-8">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-6">Subscription Inspector</h3>

            {/* Current Plan Card */}
            <div className="bg-surface-muted border border-border-default rounded-card-sm p-5 mb-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-body-light">Current Plan</span>
                <span className="bg-primary text-on-primary px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase">
                  Enterprise Tier
                </span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-extrabold text-heading tracking-tight">$2,400</span>
                <span className="text-sm font-medium text-muted">/ month</span>
              </div>
              <p className="text-[11px] font-medium text-muted">Next billing date: Sept 22</p>
            </div>

            {/* Usage Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card space-y-6">

              {/* Active Seats */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-heading">Active Seats</span>
                  <span className="text-[11px] font-medium text-body-light">1,240 / 1,500</span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: '82.6%' }}></div>
                </div>
              </div>

              {/* Storage */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-heading">Storage</span>
                  <span className="text-[11px] font-medium text-body-light">450GB / 1TB</span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: '45%' }}></div>
                </div>
              </div>

            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="p-8 bg-surface-raised border-t border-border-subtle flex flex-col gap-4 mt-auto">
            <button className="w-full bg-primary text-on-primary py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
              Manage Billing
            </button>
            <button className="w-full text-sm font-semibold text-body-light hover:text-heading transition-colors">
              View Invoices
            </button>
          </div>

        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => clearMutation.mutate()}
        title="Reset sample data?"
        description="This permanently removes the sample dataset from this workspace — employees, deals, invoices, projects, and stock. Your account and workspace are kept. You'll return to the setup screen where you can start empty or upload your own data."
        confirmLabel="Reset sample data"
        busy={clearMutation.isPending}
        danger
      />
    </div>
  )
}
