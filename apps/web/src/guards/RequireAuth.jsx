import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, Navigate, useLocation, Link } from 'react-router-dom'
import { useSession, useActiveOrganization, useListOrganizations, authClient } from '../lib/authClient'
import { setQueryScope } from '../lib/queryKeys'

/**
 * Route guard for authenticated areas (dashboard, onboarding, workspace chooser).
 *
 * Rebuilt for better-auth's httpOnly session cookie and multi-workspace support.
 *
 * Flow:
 *   1. session/org/orgList loading        → full-screen "Loading workspace…"
 *   2. no session                         → redirect to /login (remembering where we came from)
 *   3. session with active organization   → scope query cache & render children
 *   4. session with no active organization:
 *      - if on /onboarding or /choose-workspace → render children
 *      - if 0 memberships                → redirect to /onboarding
 *      - if 1+ memberships               → redirect to /choose-workspace (or auto-activate)
 */
export default function RequireAuth() {
  const location = useLocation()
  const sessionQuery = useSession()
  const organizationQuery = useActiveOrganization()
  const organizationsQuery = useListOrganizations()
  const { data: session, isPending: sessionPending } = sessionQuery
  const { data: activeOrganization, isPending: orgPending } = organizationQuery
  const { data: organizations, isPending: orgsPending } = organizationsQuery
  const [isSyncing, setIsSyncing] = useState(false)
  const [activationError, setActivationError] = useState('')
  const [loadingExpired, setLoadingExpired] = useState(false)
  const attemptedOrganizationRef = useRef(null)

  const orgList = Array.isArray(organizations) ? organizations : []
  const isLoading = sessionPending || orgPending || (Boolean(session) && orgsPending) || isSyncing
  const isOrgIndependentPath =
    location.pathname === '/onboarding' || location.pathname === '/choose-workspace'

  const activateOrganization = useCallback(async (organizationId) => {
    attemptedOrganizationRef.current = organizationId
    setActivationError('')
    setIsSyncing(true)
    try {
      const result = await authClient.organization.setActive({ organizationId })
      if (result?.error) {
        setActivationError(result.error.message || 'We could not open that workspace. Choose a workspace or try again.')
      }
    } catch (error) {
      setActivationError(error?.message || 'We could not open that workspace. Choose a workspace or try again.')
    } finally {
      setIsSyncing(false)
    }
  }, [])

  // Cache active workspace ID when available
  useEffect(() => {
    if (activeOrganization?.id) {
      localStorage.setItem('asas.lastActiveOrgId', activeOrganization.id)
    }
  }, [activeOrganization?.id])

  // Auto-activate workspace if needed
  useEffect(() => {
    if (activeOrganization) {
      attemptedOrganizationRef.current = null
      setActivationError('')
      setIsSyncing(false)
      return
    }

    // 1. Sync a session workspace only after confirming the user is still a member.
    // A stale session value can otherwise make setActive fail and trap the user here.
    const sessionOrganizationId = session?.session?.activeOrganizationId
    if (
      sessionOrganizationId &&
      !orgPending &&
      !orgsPending &&
      orgList.some((organization) => organization.id === sessionOrganizationId) &&
      !isSyncing &&
      attemptedOrganizationRef.current !== sessionOrganizationId
    ) {
      void activateOrganization(sessionOrganizationId)
      return
    }

    // 2. If session doesn't have an active organization, check user memberships
    if (!orgPending && !orgsPending && !isSyncing && orgList.length > 0) {
      // If user has exactly 1 organization, auto-activate it
      if (orgList.length === 1 && attemptedOrganizationRef.current !== orgList[0].id) {
        void activateOrganization(orgList[0].id)
        return
      }

      // If user has multiple organizations, check if lastActiveOrgId is valid
      const lastId = localStorage.getItem('asas.lastActiveOrgId')
      if (lastId && orgList.some(o => o.id === lastId) && attemptedOrganizationRef.current !== lastId) {
        void activateOrganization(lastId)
      }
    }
  }, [session, activeOrganization, orgPending, orgsPending, orgList, isSyncing, activateOrganization])

  useEffect(() => {
    setLoadingExpired(false)
    if (!isLoading) return undefined
    const timeout = window.setTimeout(() => setLoadingExpired(true), 12_000)
    return () => window.clearTimeout(timeout)
  }, [isLoading])

  const retryWorkspaceLoad = useCallback(async () => {
    attemptedOrganizationRef.current = null
    setActivationError('')
    setLoadingExpired(false)
    setIsSyncing(false)
    await Promise.allSettled([
      sessionQuery.refetch?.(),
      organizationQuery.refetch?.(),
      organizationsQuery.refetch?.(),
    ])
  }, [sessionQuery.refetch, organizationQuery.refetch, organizationsQuery.refetch])

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
        <p className="text-sm text-muted">Loading workspace…</p>
        {loadingExpired && (
          <div className="space-y-3" role="status">
            <p className="max-w-sm text-sm text-body-light">This is taking longer than expected. Check your connection and retry.</p>
            <button type="button" onClick={retryWorkspaceLoad} className="rounded-button border border-border-default bg-surface-raised px-4 py-2 text-sm font-medium text-heading transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Retry workspace loading
            </button>
          </div>
        )}
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (activationError && !isOrgIndependentPath) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-6">
        <div className="w-full max-w-md space-y-4 rounded-card border border-border-default bg-surface-raised p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold text-heading">Workspace unavailable</h1>
          <p role="alert" className="text-sm text-muted">{activationError}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={retryWorkspaceLoad} className="rounded-button bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Try again
            </button>
            <Link to="/choose-workspace" className="rounded-button border border-border-default bg-surface-raised px-4 py-2 text-sm font-medium text-heading transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Choose workspace
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!activeOrganization && !isOrgIndependentPath) {
    if (orgList.length === 0) {
      return <Navigate to="/onboarding" replace />
    }
    return <Navigate to="/choose-workspace" replace />
  }

  // Scope query keys to the active workspace before any child renders (and builds its keys);
  // LiveSync in main.jsx does the same in an effect, which would run only after children.
  setQueryScope(activeOrganization?.id)

  return <Outlet />
}
