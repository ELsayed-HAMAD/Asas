import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  DollarSign,
  Sparkles,
  Briefcase,
  Users,
  BarChart3,
  Boxes,
  Code2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Loader2,
  Check,
} from 'lucide-react'
import { http } from '../../lib/api/http'
import { useActiveOrganization, useListOrganizations, useSession, authClient } from '../../lib/authClient'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)' },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (GBP)' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal (SAR)' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham (AED)' },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar (CAD)' },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar (AUD)' },
  { code: 'SGD', symbol: '$', name: 'Singapore Dollar (SGD)' },
]

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (US & Canada) — UTC-5' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada) — UTC-6' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada) — UTC-8' },
  { value: 'Europe/London', label: 'London, Dublin (GMT) — UTC+0' },
  { value: 'Europe/Paris', label: 'Central European Time (Paris, Berlin) — UTC+1' },
  { value: 'Asia/Riyadh', label: 'Arabia Standard Time (Riyadh, Doha) — UTC+3' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai, Abu Dhabi) — UTC+4' },
  { value: 'Asia/Singapore', label: 'Singapore, Hong Kong — UTC+8' },
  { value: 'Asia/Tokyo', label: 'Tokyo, Seoul — UTC+9' },
]

const MODULES = [
  {
    id: 'finance',
    name: 'Finance & Treasury',
    description: 'Accounts, journal entries, receivables, and workspace-managed exchange rates.',
    icon: DollarSign,
  },
  {
    id: 'hr',
    name: 'Human Capital & Payroll',
    description: 'Employee records, attendance, leave requests, and payroll records for review.',
    icon: Users,
  },
  {
    id: 'crm',
    name: 'Executive CRM & Pipeline',
    description: 'Customer, contact, and sales opportunity records.',
    icon: BarChart3,
  },
  {
    id: 'projects',
    name: 'Engineering & Agile Sprints',
    description: 'Project, task, and milestone tracking.',
    icon: Code2,
  },
  {
    id: 'inventory',
    name: 'Supply Chain & Inventory',
    description: 'Inventory items and recorded stock movements.',
    icon: Boxes,
  },
]

function authFailureMessage(error, fallback) {
  const status = Number(error?.status)
  const safeMessage = status >= 500
    ? (error?.statusText || error?.code)
    : (error?.message || error?.body?.message || error?.statusText || error?.code)

  if (safeMessage) return `${fallback} ${safeMessage}`
  if (status) return `${fallback} (HTTP ${status}).`
  return fallback
}

export default function Onboarding() {
  const { data: activeOrganization } = useActiveOrganization()
  const { data: organizations, isPending: organizationsPending } = useListOrganizations()
  const { data: session } = useSession()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState('')

  // Step 1: Profile
  const [companyName, setCompanyName] = useState(
    activeOrganization?.name || (session?.user?.name ? `${session.user.name}'s Workspace` : '')
  )
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('America/New_York')

  // Sample data is explicit opt-in for a real workspace.
  const [dataMode, setDataMode] = useState('empty')

  useEffect(() => {
    const suggestedName = activeOrganization?.name || (session?.user?.name ? `${session.user.name}'s Workspace` : '')
    if (suggestedName) setCompanyName(current => current || suggestedName)
  }, [activeOrganization?.name, session?.user?.name])

  if (activeOrganization && activeOrganization.onboardingStatus !== 'PENDING') {
    return <Navigate to="/dashboard" replace />
  }

  const handleNext = () => {
    setError('')
    if (step === 1) {
      if (!companyName.trim()) {
        setError('Please provide a legal company or organization name.')
        return
      }
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  const finishOnboarding = async () => {
    setError('')
    setLoading(true)
    setLoadingMessage('Configuring executive workspace...')
    try {
      // A session can retain an activeOrganizationId after that membership is removed.
      // Only reuse an ID that still appears in Better Auth's current membership list.
      const orgList = Array.isArray(organizations) ? organizations : []
      const sessionOrganizationId = session?.session?.activeOrganizationId
      const verifiedSessionOrganizationId = orgList.some(org => org.id === sessionOrganizationId)
        ? sessionOrganizationId
        : null
      const pendingOrganizations = orgList.filter(org => org.onboardingStatus === 'PENDING')
      const resumableOrganizationId = pendingOrganizations.length === 1
        ? pendingOrganizations[0].id
        : orgList.length === 1
          ? orgList[0].id
          : null
      let currentOrgId = activeOrganization?.id || verifiedSessionOrganizationId || resumableOrganizationId

      if (!currentOrgId) {
        setLoadingMessage('Registering organization...')
        const nameToUse = companyName.trim() || 'Enterprise Workspace'
        const slug = nameToUse.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `org-${Date.now()}`

        let createRes = await authClient.organization.create({
          name: nameToUse,
          slug,
        })

        const createError = createRes?.error
        const createErrorDetails = [createError?.message, createError?.statusText, createError?.code]
          .filter(Boolean)
          .join(' ')
        const isSlugConflict = createError?.status === 409 ||
          /slug.{0,40}(already exists|already taken)|already exists/i.test(createErrorDetails)

        if (createError && isSlugConflict) {
          const uniqueSlug = `${slug}-${Math.random().toString(36).substring(2, 6)}`
          createRes = await authClient.organization.create({
            name: nameToUse,
            slug: uniqueSlug,
          })
        }

        if (createRes?.error) throw new Error(authFailureMessage(createRes.error, 'Could not provision workspace.'))
        if (!createRes?.data?.id) throw new Error('Workspace service returned success without a workspace ID.')

        currentOrgId = createRes.data.id
        const activation = await authClient.organization.setActive({ organizationId: currentOrgId })
        if (activation?.error) throw new Error(activation.error.message || 'Could not activate the new workspace.')
      } else if (!activeOrganization?.id) {
        const activation = await authClient.organization.setActive({ organizationId: currentOrgId })
        if (activation?.error) {
          const status = activation.error.status ? ` (HTTP ${activation.error.status})` : ''
          throw new Error(activation.error.message || activation.error.statusText || `Could not activate the selected workspace${status}.`)
        }
      }

      // Update General Settings (Currency, Timezone, Company Name)
      setLoadingMessage('Setting base currency & reporting parameters...')
      await http.patch('/settings/general', {
        body: {
          name: companyName.trim(),
          currency,
          timezone,
        },
      })

      // Provision the default plan before finalizing workspace onboarding. If billing setup
      // fails, the organization remains PENDING and the owner can retry this flow safely.
      setLoadingMessage('Starting your Free plan...')
      await http.post('/billing/switch-plan', { body: { planId: 'free' } })

      // Apply Data Mode last. Both initializers persist onboardingStatus, so there must be no
      // later setup step that can fail after this transition.
      try {
        if (dataMode === 'sample') {
          setLoadingMessage('Seeding enterprise dataset across ledgers, HR & CRM...')
          await http.post('/onboarding/sample', { body: {} })
        } else {
          setLoadingMessage('Initializing clean enterprise slate...')
          await http.post('/onboarding/empty', { body: {} })
        }
      } catch (applyErr) {
        // An interrupted response may follow a committed initializer. Verify the persisted state
        // before treating a retry as successful; never swallow an unrelated 409 or service error.
        const status = await http.get('/onboarding/status')
        const expectedStatus = dataMode === 'sample' ? 'SAMPLE_LOADED' : 'EMPTY'
        if (status?.onboardingStatus !== expectedStatus) throw applyErr
      }

      setLoadingMessage('Redirecting to executive dashboard...')
      window.location.href = '/dashboard'
    } catch (err) {
      const msg = err?.message || 'Unable to complete workspace configuration.'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-surface text-body flex flex-col justify-between p-4 sm:p-8 overflow-hidden selection:bg-primary-light selection:text-primary">
      {/* Subtle ambient orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-accent/5 rounded-full blur-3xl pointer-events-none -z-10 animate-float" />
      <div className="absolute bottom-10 right-1/4 w-[350px] h-[250px] bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6 border-b border-border-subtle/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card-sm bg-primary flex items-center justify-center font-bold text-on-primary shadow-card">
            A
          </div>
          <div>
            <h1 className="text-sm font-semibold text-heading leading-tight">Asas Enterprise Suite</h1>
            <p className="text-xs text-caption">Executive Workspace Setup</p>
          </div>
        </div>

        {/* Stepper Indicator */}
        <div className="flex items-center gap-2">
          {[
            { num: 1, label: 'Profile' },
            { num: 2, label: 'Capabilities' },
            { num: 3, label: 'Deployment' },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-micro ${
                  step === s.num
                    ? 'bg-primary text-on-primary ring-4 ring-primary-light shadow-card'
                    : step > s.num
                    ? 'bg-success-light text-success-text border border-success-border'
                    : 'bg-surface-muted text-muted border border-border-default'
                }`}
              >
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${step === s.num ? 'text-heading font-semibold' : 'text-caption'}`}>
                {s.label}
              </span>
              {s.num < 3 && <span className="text-caption hidden sm:inline">/</span>}
            </div>
          ))}
        </div>
      </header>

      {/* Main Form Container */}
      <main className="max-w-2xl w-full mx-auto my-auto py-8">
        <div className="glass-strong border border-border-default/70 rounded-card p-6 sm:p-8 shadow-glass transition-premium animate-fade-in-up">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* STEP 1: Enterprise Profile */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Badge variant="outline" className="mb-2 text-accent border-accent-muted bg-accent-light">
                  Step 1 of 3
                </Badge>
                <h2 className="text-2xl font-bold tracking-tight text-heading">Configure your enterprise profile</h2>
                <p className="text-sm text-body-light mt-1">
                  Establish your organization's legal identity, operating timezone, and base reporting currency.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                    Company / Organization Name
                  </label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Global Holdings Inc."
                    className="bg-surface border-border-default text-heading placeholder:text-caption focus:border-accent h-11"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                      Base Reporting Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full bg-surface border border-border-default rounded-button text-sm text-heading px-3 h-11 focus:outline-none focus:border-accent"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-surface text-heading">
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                      Headquarters Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-surface border border-border-default rounded-button text-sm text-heading px-3 h-11 focus:outline-none focus:border-accent"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value} className="bg-surface text-heading">
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button
                  onClick={handleNext}
                  className="bg-primary hover:bg-primary-hover text-on-primary font-medium px-6 h-11 rounded-button shadow-card flex items-center gap-2 cursor-pointer"
                >
                  <span>Review workspace areas</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Strategic Capabilities Focus */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Badge variant="outline" className="mb-2 text-accent border-accent-muted bg-accent-light">
                  Step 2 of 3
                </Badge>
                <h2 className="text-2xl font-bold tracking-tight text-heading">Workspace areas</h2>
                <p className="text-sm text-body-light mt-1">
                  All current product areas are available on the Free plan. Your selection here does not enable or disable access.
                </p>
              </div>

              <div className="space-y-3">
                {MODULES.map((mod) => {
                  const Icon = mod.icon
                  const active = true
                  return (
                    <div
                      key={mod.id}
                      className="w-full p-4 rounded-button border bg-accent-light border-accent ring-1 ring-accent text-left flex items-start gap-4"
                    >
                      <div
                        className={`p-2.5 rounded-card-sm flex-shrink-0 ${
                          active ? 'bg-accent text-on-primary' : 'bg-surface-muted text-muted'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-heading">{mod.name}</h3>
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-xs transition-colors ${
                              active ? 'bg-accent text-on-primary' : 'border border-border-default text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        <p className="text-xs text-body-light mt-1 leading-relaxed">{mod.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="border-border-default text-body hover:bg-surface-muted h-11 rounded-button flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>
                <Button
                  onClick={handleNext}
                  className="bg-primary hover:bg-primary-hover text-on-primary font-medium px-6 h-11 rounded-button shadow-card flex items-center gap-2 cursor-pointer"
                >
                  <span>Choose how to start</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Workspace Initialization Mode */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <Badge variant="outline" className="mb-2 text-accent border-accent-muted bg-accent-light">
                  Step 3 of 3
                </Badge>
                <h2 className="text-2xl font-bold tracking-tight text-heading">Choose how to start</h2>
                <p className="text-sm text-body-light mt-1">
                  Your workspace starts on the Free plan. Choose a clean workspace or opt into clearly identified sample records.
                </p>
              </div>

              <div className="space-y-4">
                {/* Sample data is an explicit opt-in. */}
                <button
                  type="button"
                  onClick={() => setDataMode('sample')}
                  className={`w-full p-5 rounded-card-sm border text-left flex items-start gap-4 transition-all cursor-pointer ${
                    dataMode === 'sample'
                      ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                      : 'bg-surface border-border-default hover:border-border-strong'
                  }`}
                >
                  <div className="p-3 rounded-card-sm bg-accent text-on-primary flex-shrink-0 mt-0.5">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-heading">Load sample data</h3>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          dataMode === 'sample' ? 'bg-accent text-on-primary' : 'border border-border-default'
                        }`}
                      >
                        {dataMode === 'sample' && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                    <p className="text-xs text-body-light mt-1.5 leading-relaxed">
                      Adds demonstration records to the new workspace so you can explore the available areas. Do not choose
                      this for a workspace you intend to use with real business records.
                    </p>
                  </div>
                </button>

                {/* Option 2: Clean Slate */}
                <button
                  type="button"
                  onClick={() => setDataMode('empty')}
                  className={`w-full p-5 rounded-card-sm border text-left flex items-start gap-4 transition-all cursor-pointer ${
                    dataMode === 'empty'
                      ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                      : 'bg-surface border-border-default hover:border-border-strong'
                  }`}
                >
                  <div className="p-3 rounded-card-sm bg-surface-muted text-muted flex-shrink-0 mt-0.5">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-heading">Start with a clean workspace</h3>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-success-light text-success-text border border-success-border">Recommended</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          dataMode === 'empty' ? 'bg-accent text-on-primary' : 'border border-border-default'
                        }`}
                      >
                        {dataMode === 'empty' && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                    <p className="text-xs text-body-light mt-1.5 leading-relaxed">
                      Starts without demonstration records. You can then enter business information through the available
                      workflows or use the supported data export and import tools.
                    </p>
                  </div>
                </button>
              </div>

              {/* Summary pill */}
              <div className="bg-surface-muted rounded-card-sm p-4 border border-border-default text-xs text-caption space-y-1">
                <div className="flex justify-between text-body font-medium">
                  <span>Workspace:</span>
                  <span className="text-heading font-semibold">{companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Reporting Currency & Timezone:</span>
                  <span>{currency} • {timezone.split('/')[1] || timezone}</span>
                </div>
                <div className="flex justify-between">
                  <span>Available areas:</span>
                  <span>{MODULES.length} available areas</span>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="border-border-default text-body hover:bg-surface-muted h-11 rounded-button flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>
                <Button
                  onClick={finishOnboarding}
                  disabled={loading || organizationsPending}
                  className="bg-primary hover:bg-primary-hover text-on-primary font-medium px-7 h-11 rounded-button shadow-card flex items-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{loadingMessage || 'Initializing...'}</span>
                    </>
                  ) : (
                    <>
                      <span>Launch Enterprise Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto text-center text-xs text-caption pt-6">
        Review your organization’s security, retention, and backup requirements with your platform administrator before using production data.
      </footer>
    </div>
  )
}
