import { useEffect, useRef, useState } from 'react'
import { listCurrencies } from '@asas/domain/money'
import { getAvailableTimeZones } from '../../lib/timeZones'
import { Navigate, useSearchParams } from 'react-router-dom'
import {
  DollarSign,
  Sparkles,
  Briefcase,
  FileSpreadsheet,
  Users,
  BarChart3,
  Boxes,
  Code2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Loader2,
  Check,
  Database,
} from 'lucide-react'
import { http } from '../../lib/api/http'
import { useActiveOrganization, useListOrganizations, useSession, authClient } from '../../lib/authClient'
import { authErrorMessage } from '../../lib/authErrorMessage'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import EmployeeMigration from './EmployeeMigration'

const currencyDisplayNames = new Intl.DisplayNames(undefined, { type: 'currency' })
const CURRENCIES = listCurrencies().map(({ code }) => ({
  code,
  name: `${currencyDisplayNames.of(code) || code} (${code})`,
}))
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const TIMEZONES = getAvailableTimeZones(undefined, [localTimezone]).map(value => ({ value, label: value.replaceAll('_', ' ') }))
const DEFAULT_TIMEZONE = TIMEZONES.some(({ value }) => value === localTimezone) ? localTimezone : 'UTC'

const START_MODE_LABELS = {
  empty: 'Clean workspace',
  sample: 'Sample data',
  import: 'Employee CSV import',
  migration: 'Company migration plan',
}

const MODULES = [
  {
    id: 'finance',
    name: 'Finance & accounting',
    description: 'Invoices, payments, reconciliation, ledger entries, and workspace-managed exchange rates.',
    icon: DollarSign,
  },
  {
    id: 'hr',
    name: 'People & payroll',
    description: 'Employee records, attendance, leave requests, and payroll runs for review.',
    icon: Users,
  },
  {
    id: 'crm',
    name: 'CRM & pipeline',
    description: 'Companies, contacts, deals, and sales activity.',
    icon: BarChart3,
  },
  {
    id: 'projects',
    name: 'Projects & sprints',
    description: 'Projects, sprints, tasks, and roadmap milestones.',
    icon: Code2,
  },
  {
    id: 'inventory',
    name: 'Inventory & stock',
    description: 'Products, stock movements, purchase orders, and reorder thresholds.',
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
  const [searchParams] = useSearchParams()
  const forceCreateWorkspace = searchParams.get('new') === '1'
  const { data: activeOrganization } = useActiveOrganization()
  const {
    data: organizations,
    isPending: organizationsPending,
    error: organizationsError,
    refetch: refetchOrganizations,
  } = useListOrganizations()
  const { data: session } = useSession()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState('')
  const [retryingWorkspaceCheck, setRetryingWorkspaceCheck] = useState(false)
  const [createdOrganizationId, setCreatedOrganizationId] = useState(null)
  const workspaceMembershipUnverified = Boolean(organizationsError) &&
    !forceCreateWorkspace &&
    !activeOrganization &&
    !createdOrganizationId

  // Step 1: Profile
  const [companyName, setCompanyName] = useState(
    forceCreateWorkspace
      ? (session?.user?.name ? `${session.user.name}'s Workspace` : '')
      : activeOrganization?.name || (session?.user?.name ? `${session.user.name}'s Workspace` : '')
  )
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)

  // Sample data is explicit opt-in for a real workspace.
  const [dataMode, setDataMode] = useState('empty')
  const [employeeRows, setEmployeeRows] = useState([])
  const [migrationModules, setMigrationModules] = useState(['hr'])
  const stepHeadingRef = useRef(null)
  const hasRenderedStep = useRef(false)

  useEffect(() => {
    if (!hasRenderedStep.current) {
      hasRenderedStep.current = true
      return
    }
    stepHeadingRef.current?.focus()
  }, [step])

  const chooseDataMode = mode => {
    setDataMode(mode)
    if (mode !== 'import') setEmployeeRows([])
  }

  const toggleMigrationModule = moduleId => {
    if (dataMode === 'import' && moduleId === 'hr') return
    setMigrationModules(current => current.includes(moduleId)
      ? current.filter(value => value !== moduleId)
      : [...current, moduleId])
  }

  useEffect(() => {
    const suggestedName = forceCreateWorkspace
      ? (session?.user?.name ? `${session.user.name}'s Workspace` : '')
      : activeOrganization?.name || (session?.user?.name ? `${session.user.name}'s Workspace` : '')
    if (suggestedName) setCompanyName(current => current || suggestedName)
  }, [activeOrganization?.name, forceCreateWorkspace, session?.user?.name])

  if (!forceCreateWorkspace && activeOrganization && activeOrganization.onboardingStatus !== 'PENDING') {
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

  const retryWorkspaceCheck = async () => {
    setRetryingWorkspaceCheck(true)
    setError('')
    try {
      await refetchOrganizations?.()
    } catch (err) {
      setError(authErrorMessage(err, 'Could not check your existing workspaces. Check your connection and try again.'))
    } finally {
      setRetryingWorkspaceCheck(false)
    }
  }

  const finishOnboarding = async () => {
    setError('')
    setLoading(true)
    setLoadingMessage('Configuring your workspace...')
    let migrationProjectId = null
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
      // If setup failed after creating the workspace, retry the setup on that same workspace
      // instead of creating a duplicate. On a reload, match the pending workspace by name.
      const matchingPendingOrganization = companyName.trim()
        ? orgList.find(org => org.onboardingStatus === 'PENDING' && org.name === companyName.trim())
        : null
      let currentOrgId = createdOrganizationId || matchingPendingOrganization?.id ||
        (forceCreateWorkspace ? null : activeOrganization?.id || verifiedSessionOrganizationId || resumableOrganizationId)

      // A failed membership request must not be treated as "no workspaces". Creating here
      // would silently duplicate a workspace the user already owns. A verified retry or an
      // existing pending workspace is required before provisioning.
      if (!currentOrgId && workspaceMembershipUnverified) {
        throw new Error('We could not check your existing workspaces. Retry the workspace check before creating a new one to avoid a duplicate workspace.')
      }

      if (!currentOrgId) {
        setLoadingMessage('Creating your workspace...')
        const nameToUse = companyName.trim() || 'My Workspace'
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
        setCreatedOrganizationId(currentOrgId)
      }

      // Always verify the target workspace is the active one before writing settings or
      // applying the selected start mode. This also repairs a failed activation on retry.
      if (activeOrganization?.id !== currentOrgId) {
        setLoadingMessage('Activating your workspace...')
        const activation = await authClient.organization.setActive({ organizationId: currentOrgId })
        if (activation?.error) {
          throw new Error(authErrorMessage(activation.error, 'Could not activate the selected workspace.'))
        }
      }

      // Update General Settings (Currency, Timezone, Company Name)
      setLoadingMessage('Saving currency and timezone...')
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

      if (dataMode === 'import' || dataMode === 'migration') {
        if (migrationModules.length === 0) throw new Error('Select at least one company area for the migration plan.')
        setLoadingMessage('Saving your company migration plan...')
        const migrationProject = await http.post('/onboarding/migration-project', {
          body: {
            name: `${companyName.trim()} data migration`,
            modules: migrationModules.map(module => module.toUpperCase()),
          },
        })
        migrationProjectId = migrationProject.id
      }

      // Apply Data Mode last. Both initializers persist onboardingStatus, so there must be no
      // later setup step that can fail after this transition.
      try {
        if (dataMode === 'sample') {
          setLoadingMessage('Loading sample data for exploration...')
          await http.post('/onboarding/sample', { body: {} })
        } else if (dataMode === 'import') {
          setLoadingMessage(`Importing ${employeeRows.length} employee records...`)
          await http.post('/onboarding/import', { body: { employees: employeeRows, migrationProjectId } })
        } else {
          setLoadingMessage(dataMode === 'migration' ? 'Preparing your workspace for the migration plan...' : 'Preparing your clean workspace...')
          await http.post('/onboarding/empty', { body: {} })
        }
      } catch (applyErr) {
        // An interrupted response may follow a committed initializer. Verify the persisted state
        // before treating a retry as successful; never swallow an unrelated 409 or service error.
        const status = await http.get('/onboarding/status')
        const expectedStatus = dataMode === 'sample' ? 'SAMPLE_LOADED' : dataMode === 'import' ? 'IMPORTED' : 'EMPTY'
        if (status?.onboardingStatus !== expectedStatus) throw applyErr
      }

      setLoadingMessage('Opening your dashboard...')
      window.location.href = '/dashboard'
    } catch (err) {
      const msg = authErrorMessage(err, 'Unable to complete workspace configuration.')
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
            <p className="text-sm font-semibold text-heading leading-tight">Asas</p>
            <p className="text-xs text-caption">Workspace setup</p>
          </div>
        </div>

        {/* Stepper Indicator */}
        <div className="flex items-center gap-2" role="group" aria-label="Workspace setup progress">
          {[
            { num: 1, label: 'Profile' },
            { num: 2, label: 'Areas' },
            { num: 3, label: 'Start' },
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
          {workspaceMembershipUnverified && (
            <Alert variant="warning" className="mb-6">
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>We could not check your existing workspaces. Retry before creating a new one to avoid a duplicate workspace.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retryWorkspaceCheck}
                  disabled={retryingWorkspaceCheck}
                  className="shrink-0 border-warning-border bg-surface-raised text-heading hover:bg-surface-muted"
                >
                  {retryingWorkspaceCheck ? <Loader2 size={14} className="animate-spin" /> : null}
                  {retryingWorkspaceCheck ? 'Checking…' : 'Retry workspace check'}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="sr-only" role="status" aria-live="polite">
            {loading ? loadingMessage : ''}
          </div>

          {/* STEP 1: Workspace profile */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Badge variant="outline" className="mb-2 text-accent border-accent-muted bg-accent-light">
                  Step 1 of 3
                </Badge>
                <h1 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-heading focus:outline-none">Set up your workspace</h1>
                <p className="text-sm text-body-light mt-1">
                  Choose the organization name, base reporting currency, and headquarters timezone.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="onboarding-company-name" className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                    Company / Organization Name
                  </label>
                  <Input
                    id="onboarding-company-name"
                    name="organizationName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Global Holdings Inc."
                    autoComplete="organization"
                    aria-required="true"
                    className="bg-surface border-border-default text-heading placeholder:text-caption focus:border-accent h-11"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="onboarding-currency" className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                      Base Reporting Currency
                    </label>
                    <select
                      id="onboarding-currency"
                      name="currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full bg-surface border border-border-default rounded-button text-sm text-heading px-3 h-11 focus:outline-none focus:border-accent"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-surface text-heading">
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="onboarding-timezone" className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                      Headquarters Timezone
                    </label>
                    <select
                      id="onboarding-timezone"
                      name="timezone"
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
                  className="bg-primary hover:bg-primary-hover text-on-primary font-medium px-6 h-11 rounded-button shadow-card flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  <span>Review workspace areas</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Workspace areas */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Badge variant="outline" className="mb-2 text-accent border-accent-muted bg-accent-light">
                  Step 2 of 3
                </Badge>
                <h1 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-heading focus:outline-none">Workspace areas</h1>
                <p className="text-sm text-body-light mt-1">
                  All current product areas are available on the Free plan. Your selection here does not enable or disable access.
                </p>
              </div>

              <div className="space-y-3">
                {MODULES.map((mod) => {
                  const Icon = mod.icon
                  return (
                    <div
                      key={mod.id}
                      className="w-full p-4 rounded-button border border-border-default bg-surface text-left flex items-start gap-4"
                    >
                      <div className="p-2.5 rounded-card-sm flex-shrink-0 bg-primary-light text-primary">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-heading">{mod.name}</h3>
                          <Badge variant="outline" className="shrink-0 border-success-border bg-success-light text-success-text">
                            Available
                          </Badge>
                        </div>
                        <p className="text-xs text-body-light mt-1 leading-relaxed">{mod.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="border-border-default text-body hover:bg-surface-muted h-11 rounded-button flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>
                <Button
                  onClick={handleNext}
                  className="bg-primary hover:bg-primary-hover text-on-primary font-medium px-6 h-11 rounded-button shadow-card flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
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
                <h1 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-heading focus:outline-none">Choose how to start</h1>
                <p className="text-sm text-body-light mt-1">
                  Set up the workspace first, then migrate company data by area. You can plan a migration now and continue from Settings later, import the currently supported employee CSV, or explore clearly marked sample data.
                </p>
              </div>

              <div className="space-y-4">
                {/* The recommended path is first so a real workspace is the default choice. */}
                <button
                  type="button"
                  onClick={() => chooseDataMode('empty')}
                  aria-pressed={dataMode === 'empty'}
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-heading">Start with a clean workspace</h3>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-success-light text-success-text border border-success-border">Recommended</span>
                      </div>
                      <div
                        className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
                          dataMode === 'empty' ? 'bg-accent text-on-primary' : 'border border-border-default'
                        }`}
                      >
                        {dataMode === 'empty' && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                    <p className="text-xs text-body-light mt-1.5 leading-relaxed">
                      Starts without demonstration records. You can then enter business information through the available
                      workflows, including CSV bank-statement reconciliation where available.
                    </p>
                  </div>
                </button>

                {/* Sample data remains an explicit opt-in for exploration only. */}
                <button
                  type="button"
                  onClick={() => chooseDataMode('sample')}
                  aria-pressed={dataMode === 'sample'}
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
                        className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
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

                {/* Guided migration keeps the supported scope visible and reviews all rows before commit. */}
                <button
                  type="button"
                  onClick={() => chooseDataMode('import')}
                  aria-pressed={dataMode === 'import'}
                  className={`w-full p-5 rounded-card-sm border text-left flex items-start gap-4 transition-all cursor-pointer ${
                    dataMode === 'import'
                      ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                      : 'bg-surface border-border-default hover:border-border-strong'
                  }`}
                >
                  <div className="p-3 rounded-card-sm bg-primary-light text-primary flex-shrink-0 mt-0.5"><FileSpreadsheet className="w-6 h-6" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-heading">Bring existing employee data</h3>
                      <div className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${dataMode === 'import' ? 'bg-accent text-on-primary' : 'border border-border-default'}`}>
                        {dataMode === 'import' && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                    <p className="text-xs text-body-light mt-1.5 leading-relaxed">Upload a CSV export, map its columns, review validation and a record preview, then import up to 500 employee records in one transaction.</p>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => chooseDataMode('migration')}
                aria-pressed={dataMode === 'migration'}
                className={`w-full p-5 rounded-card-sm border text-left flex items-start gap-4 transition-all cursor-pointer ${
                  dataMode === 'migration'
                    ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                    : 'bg-surface border-border-default hover:border-border-strong'
                }`}
              >
                <div className="p-3 rounded-card-sm bg-primary-light text-primary flex-shrink-0 mt-0.5"><Database className="w-6 h-6" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-heading">Plan a company-wide migration</h3>
                    <div className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${dataMode === 'migration' ? 'bg-accent text-on-primary' : 'border border-border-default'}`}>
                      {dataMode === 'migration' && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                  <p className="text-xs text-body-light mt-1.5 leading-relaxed">Choose which business areas are in scope and finish workspace setup. The project will be saved in Settings so you can resume it later; selecting an area does not import its records.</p>
                </div>
              </button>

              {dataMode === 'import' && <EmployeeMigration onRowsChange={setEmployeeRows} disabled={loading} />}

              {(dataMode === 'import' || dataMode === 'migration') && (
                <fieldset className="rounded-card-sm border border-border-default bg-surface-raised p-4">
                  <legend className="px-1 text-sm font-semibold text-heading">Company migration scope</legend>
                  <p className="mb-3 text-xs leading-5 text-muted">The selected areas are saved together in one company project. Each area uses its own data file and validation steps as its import workflow becomes available.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MODULES.map(({ id, name, icon: Icon }) => {
                      const selected = migrationModules.includes(id)
                      const locked = dataMode === 'import' && id === 'hr'
                      return <button key={id} type="button" aria-pressed={selected} disabled={loading || locked} onClick={() => toggleMigrationModule(id)} className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-70 ${selected ? 'border-primary/50 bg-primary/5 text-heading' : 'border-border-default bg-surface text-body hover:bg-surface-muted'}`}>
                        <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{name}</span>
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-transparent'}`}><Check className="h-3 w-3" /></span>
                      </button>
                    })}
                  </div>
                  {dataMode === 'import' && <p className="mt-3 text-xs text-muted">People &amp; HR is required for this employee CSV. Other selected areas will be saved for later migration.</p>}
                  {dataMode === 'migration' && migrationModules.length === 0 && (
                    <p role="alert" className="mt-3 text-xs text-danger">Select at least one company area to save a migration plan.</p>
                  )}
                </fieldset>
              )}

              {/* Summary pill */}
              <div className="bg-surface-muted rounded-card-sm p-4 border border-border-default text-xs text-caption space-y-1.5">
                <div className="flex justify-between gap-4 text-body font-medium">
                  <span>Workspace:</span>
                  <span className="text-right text-heading font-semibold break-words min-w-0">{companyName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Start mode:</span>
                  <span className="text-right font-medium text-heading">{START_MODE_LABELS[dataMode]}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Reporting currency &amp; timezone:</span>
                  <span className="text-right">{currency} • {timezone.split('/')[1] || timezone}</span>
                </div>
                {(dataMode === 'import' || dataMode === 'migration') && (
                  <div className="flex justify-between gap-4">
                    <span>Migration scope:</span>
                    <span className="text-right font-medium text-heading break-words min-w-0">
                      {MODULES.filter(module => migrationModules.includes(module.id)).map(module => module.name).join(', ') || 'None selected'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span>Product areas:</span>
                  <span className="text-right">{MODULES.length} available</span>
                </div>
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="border-border-default text-body hover:bg-surface-muted h-11 rounded-button flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>
                <Button
                  onClick={finishOnboarding}
                  disabled={loading || organizationsPending || ((dataMode === 'import' || dataMode === 'migration') && migrationModules.length === 0) || (dataMode === 'import' && employeeRows.length === 0)}
                  className="bg-primary hover:bg-primary-hover text-on-primary font-medium px-7 h-11 rounded-button shadow-card flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{loadingMessage || 'Initializing...'}</span>
                    </>
                  ) : (
                    <>
                      <span>{dataMode === 'import' ? `Import ${employeeRows.length} employees & launch` : dataMode === 'migration' ? 'Save migration plan & launch' : 'Launch workspace'}</span>
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
