import { useEffect, useRef, useState } from 'react'
import { listCurrencies } from '@asas/domain/money'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Check,
  Upload,
  X,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import SettingsTabs from './SettingsTabs'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import FormDialog from '../../../components/common/FormDialog'
import TwoFactorSettings from './TwoFactorSettings'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import { http } from '../../../lib/api/http'
import { onboardingApi } from '../../../lib/api/onboarding'
import { settingsApi } from '../../../lib/api/settings'
import { queryKeys } from '../../../lib/queryKeys'
import { useActiveMemberRole, useActiveOrganization } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'

const AVAILABLE_TIMEZONES = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Singapore']

export default function SettingsGeneral() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data: memberRole } = useActiveMemberRole()
  const roleName = getMemberRoleName(memberRole)
  const isOwner = roleName === 'OWNER'
  const canManageSettings = roleName === 'OWNER' || roleName === 'ADMIN'
  const { data: activeOrg } = useActiveOrganization()

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.general(),
    queryFn: () => http.get('/settings/general'),
  })

  const { data: onboarding } = useQuery({
    queryKey: queryKeys.onboarding.status(),
    queryFn: onboardingApi.status,
  })

  const { data: billingData } = useQuery({
    queryKey: queryKeys.settings.billing(),
    queryFn: settingsApi.getBilling,
  })
  const activeSubscription = billingData?.subscriptions?.find(s => s.status === 'ACTIVE') ?? billingData?.subscriptions?.[0]

  const exchangeRateQuery = { page: 1, limit: 20 }
  const { data: exchangeRates } = useQuery({
    queryKey: queryKeys.settings.exchangeRates(exchangeRateQuery),
    queryFn: () => settingsApi.listExchangeRates(exchangeRateQuery),
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  // Form fields are seeded from the server response (the old page used uncontrolled
  // defaultValue + a no-op Save button; now Save is a real PATCH).
  const [form, setForm] = useState({ name: '', supportEmail: '', logoUrl: '', timezone: '', currency: '', dateFormat: '', overtimeThresholdHours: '8' })
  const [saved, setSaved] = useState(false)
  const [rateForm, setRateForm] = useState({ currency: '', rateToBase: '', effectiveAt: '', reference: '' })
  const fileInputRef = useRef(null)

  const handleLogoFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Image must be under 2MB.')
        return
      }
      const reader = new FileReader()
      reader.onload = (event) => {
        setForm((curr) => ({ ...curr, logoUrl: event.target?.result || '' }))
      }
      reader.readAsDataURL(file)
    }
  }

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name ?? '',
        supportEmail: settings.supportEmail ?? '',
        logoUrl: settings.logoUrl ?? '',
        timezone: settings.timezone ?? '',
        currency: settings.currency ?? '',
        dateFormat: settings.dateFormat ?? '',
        overtimeThresholdHours: String(settings.overtimeThresholdHours ?? 8),
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    // Blank fields: `supportEmail` and `logoUrl` are nullable (clears them); the rest are non-nullable, so a
    // blank value is omitted rather than sent as '' (the API's Zod schema rejects empty strings).
    mutationFn: () => http.patch('/settings/general', {
      body: {
        name: form.name.trim() ? form.name : undefined,
        supportEmail: form.supportEmail.trim() ? form.supportEmail.trim() : null,
        logoUrl: form.logoUrl.trim() ? form.logoUrl.trim() : null,
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

  const deleteMutation = useMutation({
    mutationFn: () => settingsApi.deleteWorkspace(),
    onSuccess: () => {
      localStorage.removeItem('asas.lastActiveOrgId')
      queryClient.clear()
      navigate('/choose-workspace', { replace: true })
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
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden min-w-0 relative">

      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canManageSettings || saveMutation.isPending}
            title={!canManageSettings ? 'Only workspace admins and owners can change settings' : undefined}
            className="px-5 py-1.5 h-8 text-sm font-semibold whitespace-nowrap"
          >
            {saved ? <Check size={14} /> : saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            {saved ? 'Saved' : 'Save Changes'}
          </Button>
          {saveMutation.isError && <p role="alert" className="text-xs text-danger">{saveMutation.error?.message || 'Unable to save settings.'}</p>}
          {!canManageSettings && <span className="text-xs text-muted">View only — admin access is required to change workspace settings.</span>}
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden relative">

        {/* Left: Settings Content Area */}
        <div className="w-full min-w-0 xl:flex-1 xl:min-h-0 xl:overflow-y-auto p-4 sm:p-8 space-y-6 relative">

          <TwoFactorSettings />

          {/* Organization Profile Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Organization Profile</h2>
            <p className="text-sm text-muted mb-6">Manage your workspace identity and basic contact information.</p>

            <div className="flex items-start gap-6">
              {/* Logo Upload */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoFileChange}
                  disabled={!canManageSettings}
                  className="hidden"
                />
                <div
                  role="button"
                  tabIndex={canManageSettings ? 0 : -1}
                  aria-disabled={!canManageSettings}
                  onClick={() => canManageSettings && fileInputRef.current?.click()}
                  onKeyDown={event => { if (canManageSettings && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); fileInputRef.current?.click() } }}
                  className={`w-32 h-32 rounded-button border-2 border-dashed border-border-strong bg-surface-muted flex flex-col items-center justify-center text-caption transition-colors shrink-0 overflow-hidden relative group ${canManageSettings ? 'hover:bg-surface-active hover:border-caption cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                  title="Click to select logo image"
                >
                  {form.logoUrl ? (
                    <>
                      <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity">
                        Change File
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 bg-surface-strong rounded-full flex items-center justify-center mb-2">
                        <Upload size={18} className="text-muted" />
                      </div>
                      <span className="text-xs font-semibold text-body-light">Upload File</span>
                      <span className="text-[10px] text-caption mt-0.5">PNG, JPG, SVG</span>
                    </>
                  )}
                </div>

                {form.logoUrl && (
                  <button
                    type="button"
                    disabled={!canManageSettings}
                    onClick={() => setForm((curr) => ({ ...curr, logoUrl: '' }))}
                    className="text-[11px] text-danger hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <X size={12} />
                    <span>Remove logo</span>
                  </button>
                )}
              </div>

              {/* Form Fields */}
              <div className="flex-1 space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">Workspace Name</label>
                  <Input
                    type="text"
                    value={form.name}
                    onChange={setField('name')}
                    disabled={!canManageSettings}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">Support Email</label>
                  <Input
                    type="email"
                    value={form.supportEmail}
                    onChange={setField('supportEmail')}
                    disabled={!canManageSettings}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">Logo URL</label>
                  <Input
                    type="url"
                    value={form.logoUrl}
                    onChange={setField('logoUrl')}
                    disabled={!canManageSettings}
                    placeholder="https://example.com/logo.png"
                    className="w-full"
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
                <label htmlFor="settings-timezone" className="block text-xs font-bold text-heading mb-1.5">Timezone</label>
                <Select
                  value={form.timezone || localTimezone}
                  onValueChange={val => setForm(current => ({ ...current, timezone: val }))}
                  disabled={!canManageSettings}
                >
                  <SelectTrigger id="settings-timezone" className="w-full text-sm bg-surface-raised">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC (Universal Coordinated Time)</SelectItem>
                    {localTimezone && localTimezone !== 'UTC' && (
                      <SelectItem value={localTimezone}>Local System Timezone ({localTimezone})</SelectItem>
                    )}
                    {AVAILABLE_TIMEZONES.filter(tz => tz !== 'UTC' && tz !== localTimezone).map(tz => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="settings-currency" className="block text-xs font-bold text-heading mb-1.5">Currency</label>
                <Select
                  value={form.currency || 'USD'}
                  onValueChange={val => setForm(current => ({ ...current, currency: val }))}
                  disabled={!canManageSettings || Boolean(settings.currencyLockedAt)}
                >
                  <SelectTrigger
                    id="settings-currency"
                    className="w-full text-sm bg-surface-raised disabled:opacity-60"
                    title={settings.currencyLockedAt ? 'Base currency is fixed once monetary data exists; relabeling is not FX conversion.' : 'Choose the base currency before entering monetary data.'}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {listCurrencies().map(({ code }) => (
                      <SelectItem key={code} value={code}>
                        {code === 'USD' ? 'USD ($)' : code === 'EUR' ? 'EUR (€)' : code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted">{settings.currencyLockedAt ? 'Base currency is fixed to protect existing monetary records. Currency conversion requires an explicit FX workflow.' : 'Choose your base currency before adding salaries, invoices, products or budgets.'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-date-format" className="block text-xs font-bold text-heading mb-1.5">Date Format</label>
                <Select
                  value={form.dateFormat || 'MMM d, yyyy'}
                  onValueChange={val => setForm(current => ({ ...current, dateFormat: val }))}
                  disabled={!canManageSettings}
                >
                  <SelectTrigger id="settings-date-format" className="w-full text-sm bg-surface-raised">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MMM d, yyyy">{format1}</SelectItem>
                    <SelectItem value="yyyy-MM-dd">{format2}</SelectItem>
                    <SelectItem value="dd/MM/yyyy">{format3}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Overtime After (Hours per Day)</label>
                <Input
                  type="number"
                  min="1"
                  max="24"
                  step="0.25"
                  value={form.overtimeThresholdHours}
                  onChange={setField('overtimeThresholdHours')}
                  disabled={!canManageSettings}
                  className="w-full"
                />
                <p className="mt-1.5 text-xs text-muted">New weekly timesheets use this threshold. Existing weeks keep their recorded threshold.</p>
              </div>
            </div>
          </div>

          {/* FX Rate History Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Exchange Rates</h2>
            <p className="text-sm text-muted mb-5">Enter how many {settings.currency} one unit of foreign currency is worth. Rates are timestamped and retained for audit; adding a quote does not revalue existing records.</p>
            <form className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 items-end mb-5" onSubmit={(event) => { event.preventDefault(); rateMutation.mutate() }}>
              <div>
                <label htmlFor="rate-currency" className="block text-xs font-bold text-heading mb-1.5">Currency</label>
              <Select
                  value={rateForm.currency || listCurrencies().find(({ code }) => code !== settings.currency)?.code || ''}
                  onValueChange={val => setRateForm((current) => ({ ...current, currency: val }))}
                disabled={!canManageSettings}
                >
                  <SelectTrigger id="rate-currency" className="w-full text-sm bg-surface-raised">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {listCurrencies().filter(({ code }) => code !== settings.currency).map(({ code }) => (
                      <SelectItem key={code} value={code}>{code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Rate to {settings.currency}</label>
              <Input required type="text" inputMode="decimal" value={rateForm.rateToBase} onChange={(event) => setRateForm((current) => ({ ...current, rateToBase: event.target.value }))} placeholder="e.g. 1.0875" className="w-full" disabled={!canManageSettings} />
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Effective at</label>
              <Input required type="datetime-local" value={rateForm.effectiveAt} onChange={(event) => setRateForm((current) => ({ ...current, effectiveAt: event.target.value }))} className="w-full" disabled={!canManageSettings} />
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Reference</label>
              <Input type="text" value={rateForm.reference} onChange={(event) => setRateForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Source or note" className="w-full" disabled={!canManageSettings} />
              </div>
              <Button type="submit" disabled={!canManageSettings || rateMutation.isPending} className="w-full">{rateMutation.isPending ? 'Saving…' : 'Add Rate'}</Button>
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
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canManageSettings || clearMutation.isPending}
                  className="whitespace-nowrap"
                >
                  <RefreshCw size={14} className={clearMutation.isPending ? 'animate-spin' : ''} />
                  Reset sample data...
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-heading">Delete Workspace</h3>
                <p className="text-sm text-body-light mt-0.5">Permanently remove all data, projects, and users.</p>
              </div>
              <Button
                variant="destructive"
                type="button"
                onClick={() => { setDeleteConfirmName(''); setDeleteDialogOpen(true) }}
                disabled={!isOwner || deleteMutation.isPending}
                title={!isOwner ? 'Only workspace owners can delete this workspace' : undefined}
              >
                Delete Workspace...
              </Button>
            </div>
          </div>

        </div>

        {/* Right: Subscription Inspector Panel */}
        <div className="w-full xl:w-[360px] xl:flex-shrink-0 bg-surface-raised border-t xl:border-t-0 xl:border-l border-border-default flex flex-col shadow-panel z-10">

          <div className="xl:flex-1 xl:overflow-y-auto p-8">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-6">Subscription Inspector</h3>

            {/* Current Plan Card */}
            <div className="bg-surface-muted border border-border-default rounded-card-sm p-5 mb-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-body-light">Current Plan</span>
                <Badge variant="default" className="text-[10px] font-bold tracking-wider uppercase">
                  {activeSubscription?.planName || 'Standard Tier'}
                </Badge>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-extrabold text-heading tracking-tight">
                  {activeSubscription?.priceMonthly != null ? `$${Number(activeSubscription.priceMonthly).toLocaleString()}` : '$0'}
                </span>
                <span className="text-sm font-medium text-muted">/ month</span>
              </div>
              <p className="text-[11px] font-medium text-muted">
                {activeSubscription?.renewsOn
                  ? `Next billing date: ${new Date(activeSubscription.renewsOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : 'Active · Continuous'}
              </p>
            </div>

            {/* Usage Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card space-y-6">

              {/* Active Seats */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-heading">Active Seats</span>
                  <span className="text-[11px] font-medium text-body-light">
                    {activeSubscription?.seatsUsed != null && activeSubscription?.seatLimit != null
                      ? `${activeSubscription.seatsUsed.toLocaleString()} / ${activeSubscription.seatLimit.toLocaleString()}`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        activeSubscription?.seatLimit
                          ? Math.round(((activeSubscription.seatsUsed || 0) / activeSubscription.seatLimit) * 100)
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Storage */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-heading">Storage</span>
                  <span className="text-[11px] font-medium text-body-light">
                    {activeSubscription?.storageUsedGb != null && activeSubscription?.storageLimitGb != null
                      ? `${activeSubscription.storageUsedGb < 0.001 ? `${Math.round(activeSubscription.storageUsedGb * 1_000_000)} KB` : activeSubscription.storageUsedGb < 1 ? `${(activeSubscription.storageUsedGb * 1000).toFixed(1)} MB` : `${activeSubscription.storageUsedGb.toFixed(2)} GB`} / ${activeSubscription.storageLimitGb} GB`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div
                    hidden={activeSubscription?.storageUsedGb == null}
                    className="bg-primary h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        activeSubscription?.storageLimitGb
                          ? Math.round(((activeSubscription.storageUsedGb || 0) / activeSubscription.storageLimitGb) * 100)
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="p-8 bg-surface-raised border-t border-border-subtle flex flex-col gap-4 mt-auto">
            <Button
              type="button"
              onClick={() => navigate('/dashboard/settings/billing')}
              className="w-full"
            >
              Manage Billing
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => navigate('/dashboard/settings/billing')}
              className="w-full text-body-light hover:text-heading"
            >
              View Invoices
            </Button>
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

      <FormDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Workspace"
        subtitle="This action is permanent and cannot be undone."
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Permanently Delete'}
        confirmVariant="danger"
        isConfirmDisabled={deleteConfirmName !== (settings?.name || activeOrg?.name) || deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        error={deleteMutation.error?.message}
      >
        <div className="space-y-4">
          <p className="text-sm text-body leading-relaxed">
            This will permanently delete <strong className="text-heading">{settings?.name || activeOrg?.name}</strong>, including all projects, employees, financial records, and settings.
          </p>
          <div className="p-3 bg-danger-surface border border-danger-border rounded-input text-xs text-danger">
            To confirm deletion, please type the workspace name below:
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Workspace Name ({settings?.name || activeOrg?.name})
            </label>
            <Input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={settings?.name || activeOrg?.name}
              className="w-full bg-surface-muted"
            />
          </div>
        </div>
      </FormDialog>
    </div>
  )
}

