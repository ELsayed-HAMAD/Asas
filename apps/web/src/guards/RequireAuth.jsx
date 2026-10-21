import { useEffect, useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
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
  const { data: session, isPending: sessionPending } = useSession()
  const { data: activeOrganization, isPending: orgPending } = useActiveOrganization()
  const { data: organizations, isPending: orgsPending } = useListOrganizations()
  const [isSyncing, setIsSyncing] = useState(false)

  const orgList = Array.isArray(organizations) ? organizations : []

  // Cache active workspace ID when available
  useEffect(() => {
    if (activeOrganization?.id) {
      localStorage.setItem('asas.lastActiveOrgId', activeOrganization.id)
    }
  }, [activeOrganization?.id])

  // Auto-activate workspace if needed
  useEffect(() => {
    if (activeOrganization) {
      setIsSyncing(false)
      return
    }

    // 1. If session has an activeOrganizationId assigned by server hook, sync it
    if (session?.session?.activeOrganizationId && !orgPending && !isSyncing) {
      setIsSyncing(true)
      authClient.organization
        .setActive({ organizationId: session.session.activeOrganizationId })
        .then(res => {
          if (res?.error) setIsSyncing(false)
        })
        .catch(() => setIsSyncing(false))
      return
    }

    // 2. If session doesn't have an active organization, check user memberships
    if (!orgPending && !orgsPending && !isSyncing && orgList.length > 0) {
      // If user has exactly 1 organization, auto-activate it
      if (orgList.length === 1) {
        setIsSyncing(true)
        authClient.organization
          .setActive({ organizationId: orgList[0].id })
          .catch(() => setIsSyncing(false))
        return
      }

      // If user has multiple organizations, check if lastActiveOrgId is valid
      const lastId = localStorage.getItem('asas.lastActiveOrgId')
      if (lastId && orgList.some(o => o.id === lastId)) {
        setIsSyncing(true)
        authClient.organization
          .setActive({ organizationId: lastId })
          .catch(() => setIsSyncing(false))
      }
    }
  }, [session, activeOrganization, orgPending, orgsPending, orgList, isSyncing])

  if (sessionPending || orgPending || (session && orgsPending) || isSyncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-sm text-muted">Loading workspace…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Paths that can be accessed without an active organization
  const isOrgIndependentPath =
    location.pathname === '/onboarding' || location.pathname === '/choose-workspace'

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
