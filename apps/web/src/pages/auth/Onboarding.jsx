import { useEffect, useRef, useState } from 'react'
import { getAvailableTimeZones } from '../../lib/timeZones'
import { timeZoneCityLabel } from '../../lib/timeZoneOptions'
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
import { AsasLogo } from '../../components/common/AsasLogo'
import CurrencyCombobox from '../../components/common/CurrencyCombobox'
import TimeZoneCombobox from '../../components/common/TimeZoneCombobox'
import OnboardingRail, { OnboardingProgress } from '../../components/auth/OnboardingRail'
import OnboardingLaunchProgress, { LAUNCH_STAGE } from '../../components/auth/OnboardingLaunchProgress'
import { clearOnboardingDraft, onboardingDraftStorage, readOnboardingDraft, saveOnboardingDraft } from '../../lib/onboardingDraft'
import EmployeeMigration from './EmployeeMigration'

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const AVAILABLE_TIMEZONES = getAvailableTimeZones(undefined, [localTimezone])
const DEFAULT_TIMEZONE = AVAILABLE_TIMEZONES.includes(localTimezone) ? localTimezone : 'UTC'

/**
 * The sample workspace pack writes across every module in one long transaction. Request-scoped
 * function hosts time out before it finishes, so the deployment can hide the option instead of
 * letting the launch fail after a minute.
 */
const SAMPLE_DATA_ENABLED = import.meta.env.VITE_DISABLE_SAMPLE_DATA !== 'true'

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
  const [launchStage, setLaunchStage] = useState(LAUNCH_STAGE.WORKSPACE)
  const [error, setError] = useState('')
  const [retryingWorkspaceCheck, setRetryingWorkspaceCheck] = useState(false)
  const [createdOrganizationId, setCreatedOrganizationId] = useState(null)
  const [draftReady, setDraftReady] = useState(false)
  const draftHydratedRef = useRef(false)
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
    if (mode === 'sample' && !SAMPLE_DATA_ENABLED) return
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

  const draftUserId = session?.user?.id ?? null
  const redirectingToDashboard = Boolean(activeOrganization) &&
    !forceCreateWorkspace &&
    activeOrganization.onboardingStatus !== 'PENDING'

  // Restore the wizard once the session identifies the user. Without this, any reload or
  // redirect restarts at step 1 and discards the choices the owner already made.
  useEffect(() => {
    if (draftHydratedRef.current || !draftUserId) return
    draftHydratedRef.current = true
    if (forceCreateWorkspace || redirectingToDashboard) {
      clearOnboardingDraft(onboardingDraftStorage())
      setDraftReady(true)
      return
    }
    const draft = readOnboardingDraft(onboardingDraftStorage(), draftUserId)
    if (draft) {
      setStep(draft.step)
      if (draft.companyName) setCompanyName(draft.companyName)
      setCurrency(draft.currency)
      setTimezone(draft.timezone)
      setDataMode(draft.dataMode === 'sample' && !SAMPLE_DATA_ENABLED ? 'empty' : draft.dataMode)
      setMigrationModules(draft.migrationModules)
    }
    setDraftReady(true)
  }, [draftUserId, forceCreateWorkspace, redirectingToDashboard])

  // A draft saved before the deployment disabled sample data must not keep the user on a mode
  // that can no longer finish inside the function timeout.
  useEffect(() => {
    if (!SAMPLE_DATA_ENABLED && dataMode === 'sample') setDataMode('empty')
  }, [dataMode])

  // Persist every edit after hydration so a reload resumes the current step and choices.
  // While launching we leave the last saved draft untouched: success clears it, failure keeps
  // it so the owner can retry the same step.
  useEffect(() => {
    if (!draftReady || !draftUserId || loading || redirectingToDashboard) return
    saveOnboardingDraft(onboardingDraftStorage(), draftUserId, {
      step,
      companyName,
      currency,
      timezone,
      dataMode,
      migrationModules,
    })
  }, [draftReady, draftUserId, step, companyName, currency, timezone, dataMode, migrationModules, loading, redirectingToDashboard])

  // A completed workspace must not leave a stale wizard draft behind for a future workspace.
  useEffect(() => {
    if (redirectingToDashboard && draftUserId) clearOnboardingDraft(onboardingDraftStorage())
  }, [redirectingToDashboard, draftUserId])

  if (redirectingToDashboard) {
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

  const selectStep = nextStep => {
    if (loading || nextStep >= step) return
    setError('')
    setStep(nextStep)
  }

  const migrationScopeLabel = (dataMode === 'import' || dataMode === 'migration')
    ? MODULES.filter(module => migrationModules.includes(module.id)).map(module => module.name).join(', ') || 'None selected'
    : ''

  const finishOnboarding = async () => {
    setError('')
    setLoading(true)
    setLaunchStage(LAUNCH_STAGE.WORKSPACE)
    setLoadingMessage('Configuring your workspace...')
    let migrationProjectId = null
    const expectedStatus = dataMode === 'sample' ? 'SAMPLE_LOADED' : dataMode === 'import' ? 'IMPORTED' : 'EMPTY'
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
      setLaunchStage(LAUNCH_STAGE.SETTINGS)
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

      setLaunchStage(LAUNCH_STAGE.DATA)
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
        const status = await http.get('/onboarding/status').catch(() => null)
        if (status?.onboardingStatus !== expectedStatus) throw applyErr
      }

      // The dashboard shell redirects any workspace that is still PENDING back to onboarding.
      // Verify the committed status first so a successful-looking response cannot bounce the
      // owner back to step 1; a mismatch keeps the draft so retrying resumes here.
      setLaunchStage(LAUNCH_STAGE.DATA)
      setLoadingMessage('Verifying your workspace setup...')
      const finalStatus = await http.get('/onboarding/status')
      if (finalStatus?.onboardingStatus !== expectedStatus) {
        throw new Error(`Your workspace is still finishing setup (status: ${finalStatus?.onboardingStatus ?? 'unknown'}). Please try again in a moment.`)
      }

      setLaunchStage(LAUNCH_STAGE.READY)
      setLoadingMessage('Opening your dashboard...')
      clearOnboardingDraft(onboardingDraftStorage())
      window.location.href = '/dashboard'
    } catch (err) {
      const msg = authErrorMessage(err, 'Unable to complete workspace configuration.')
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="auth-deep-blue relative min-h-screen overflow-hidden bg-surface text-body selection:bg-primary-light selection:text-primary lg:h-screen">
      <div className="pointer-events-none absolute left-1/2 top-1/4 -z-10 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-10 right-1/4 -z-10 h-[250px] w-[350px] rounded-full bg-primary/5 blur-3xl" aria-hidden="true" />

      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-3 py-3 sm:px-5 lg:h-full lg:min-h-0 lg:px-6 lg:py-5">
        <div className="grid min-h-0 flex-1 gap-4 pb-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-5">
          <OnboardingRail
            step={step}
            onStepSelect={selectStep}
            workspaceName={companyName}
            currency={currency}
            timezoneLabel={timeZoneCityLabel(timezone)}
            areaCount={MODULES.length}
            startModeLabel={START_MODE_LABELS[dataMode]}
            migrationScopeLabel={migrationScopeLabel}
          />

          <main className="min-w-0 lg:min-h-0">
            <div className="glass-strong flex h-full flex-col overflow-hidden rounded-[30px] border border-border-default/70 shadow-glass">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-3 sm:px-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-on-primary shadow-card">
                    <AsasLogo className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold leading-tight text-heading">Asas</span>
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-caption">Workspace setup</span>
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="hidden truncate text-[10px] font-medium text-caption sm:inline">{session?.user?.email}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/10 bg-white/50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-primary-hover">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-solid" />
                    Setup in progress
                  </span>
                </div>
              </div>
              <div className="border-b border-black/[0.05] p-4 sm:p-5 lg:hidden">
                <OnboardingProgress step={step} onStepSelect={selectStep} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-7 lg:p-7">
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

          {loading ? (
            <OnboardingLaunchProgress message={loadingMessage} dataMode={dataMode} stage={launchStage} />
          ) : (
          <div key={step} className="onboarding-step-enter flex min-h-0 flex-1 flex-col">
          {/* STEP 1: Workspace profile */}
          {step === 1 && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-5 lg:overflow-y-auto lg:pr-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Workspace profile</p>
                <h1 ref={stepHeadingRef} tabIndex={-1} className="mt-2 text-2xl font-bold tracking-tight text-heading focus:outline-none sm:text-3xl">Set up your workspace</h1>
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
                    maxLength={200}
                    aria-required="true"
                    className="bg-surface border-border-default text-heading placeholder:text-caption focus:border-accent h-11"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="onboarding-currency" className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                      Base Reporting Currency
                    </label>
                    <CurrencyCombobox
                      id="onboarding-currency"
                      ariaLabel="Base Reporting Currency"
                      value={currency}
                      onChange={setCurrency}
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      Sets reports and ledger totals. You can change it until monetary records exist.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="onboarding-timezone" className="block text-xs font-semibold uppercase tracking-wider text-heading mb-1.5">
                      Headquarters Timezone
                    </label>
                    <TimeZoneCombobox
                      id="onboarding-timezone"
                      ariaLabel="Headquarters Timezone"
                      value={timezone}
                      onChange={setTimezone}
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      Sets reporting dates, payroll periods, and scheduled job times.
                    </p>
                  </div>
                </div>
              </div>
              </div>

              <div className="flex shrink-0 justify-end border-t border-black/[0.06] pt-3.5">
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
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-5 lg:overflow-y-auto lg:pr-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Included areas</p>
                <h1 ref={stepHeadingRef} tabIndex={-1} className="mt-2 text-2xl font-bold tracking-tight text-heading focus:outline-none sm:text-3xl">Workspace areas</h1>
                <p className="text-sm text-body-light mt-1">
                  All current product areas are available on the Free plan. Your selection here does not enable or disable access.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {MODULES.map((mod) => {
                  const Icon = mod.icon
                  return (
                    <div
                      key={mod.id}
                      className="w-full p-4 rounded-2xl border border-border-default bg-surface/80 text-left flex items-start gap-4 transition-colors hover:border-primary/20 hover:bg-surface"
                    >
                      <div className="p-2.5 rounded-card-sm flex-shrink-0 bg-primary-light text-primary">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-heading">{mod.name}</h3>
                          <Badge variant="outline" className="shrink-0 border-success-border bg-success-light text-success-text">
                            Included
                          </Badge>
                        </div>
                        <p className="text-xs text-body-light mt-1 leading-relaxed">{mod.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-black/[0.06] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-3.5 lg:overflow-y-auto lg:pr-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Start mode</p>
                <h1 ref={stepHeadingRef} tabIndex={-1} className="mt-2 text-2xl font-bold tracking-tight text-heading focus:outline-none sm:text-3xl">Choose how to start</h1>
                <p className="text-sm text-body-light mt-1">
                  Set up the workspace first, then bring company data across. Plan a migration or import an employee CSV.
                  {SAMPLE_DATA_ENABLED ? ' You can also explore clearly marked sample data.' : ''}
                </p>
              </div>

              <div className="grid gap-2.5 md:grid-cols-2">
                {/* The recommended path is first so a real workspace is the default choice. */}
                <button
                  type="button"
                  onClick={() => chooseDataMode('empty')}
                  aria-pressed={dataMode === 'empty'}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                    dataMode === 'empty'
                      ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                      : 'bg-surface border-border-default hover:border-border-strong'
                  }`}
                >
                  <div className="p-2.5 rounded-card-sm bg-surface-muted text-muted flex-shrink-0 mt-0.5">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-heading">Start with a clean workspace</h3>
                        <span className="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-success-light text-success-text border border-success-border">Recommended</span>
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

                {/* Sample data remains an explicit opt-in; deployments can hide it with VITE_DISABLE_SAMPLE_DATA. */}
                {SAMPLE_DATA_ENABLED && (
                <button
                  type="button"
                  onClick={() => chooseDataMode('sample')}
                  aria-pressed={dataMode === 'sample'}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                    dataMode === 'sample'
                      ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                      : 'bg-surface border-border-default hover:border-border-strong'
                  }`}
                >
                  <div className="p-2.5 rounded-card-sm bg-accent text-on-primary flex-shrink-0 mt-0.5">
                    <Sparkles className="w-5 h-5" />
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
                )}

                {/* Guided migration keeps the supported scope visible and reviews all rows before commit. */}
                <button
                  type="button"
                  onClick={() => chooseDataMode('import')}
                  aria-pressed={dataMode === 'import'}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                    dataMode === 'import'
                      ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                      : 'bg-surface border-border-default hover:border-border-strong'
                  }`}
                >
                  <div className="p-2.5 rounded-card-sm bg-primary-light text-primary flex-shrink-0 mt-0.5"><FileSpreadsheet className="w-5 h-5" /></div>
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

                <button
                  type="button"
                  onClick={() => chooseDataMode('migration')}
                  aria-pressed={dataMode === 'migration'}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                    dataMode === 'migration'
                      ? 'bg-accent-light border-accent ring-2 ring-accent/20'
                      : 'bg-surface border-border-default hover:border-border-strong'
                  }`}
                >
                  <div className="p-2.5 rounded-card-sm bg-primary-light text-primary flex-shrink-0 mt-0.5"><Database className="w-5 h-5" /></div>
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
              </div>

              {dataMode === 'import' && <EmployeeMigration onRowsChange={setEmployeeRows} disabled={loading} />}

              {(dataMode === 'import' || dataMode === 'migration') && (
                <fieldset className="rounded-2xl border border-border-default bg-surface-raised p-4">
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

              </div>

              <div className="flex shrink-0 flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-black/[0.06] pt-3.5">
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
                  <span>{dataMode === 'import' ? `Import ${employeeRows.length} employees & launch` : dataMode === 'migration' ? 'Save migration plan & launch' : 'Launch workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          </div>
          )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
