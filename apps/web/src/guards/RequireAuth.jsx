import { useEffect, useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useSession, useActiveOrganization, authClient } from '../lib/authClient'
import { setQueryScope } from '../lib/queryKeys'

/**
 * Route guard for authenticated areas (dashboard + onboarding).
 *
 * Rebuilt for better-auth's httpOnly session cookie. The old JWT / localStorage
 * `GET /auth/me` model is gone; `useSession` reflects the cookie session.
 *
 * Flow:
 *   1. session/org still loading        → full-screen "Loading…"
 *   2. no session                       → redirect to /login (remembering where we came from)
 *   3. session but no active organization → redirect to /onboarding (workspace picker /
 *      first-run onboarding — the session.create hook auto-assigns single-org users, so
 *      this only fires for zero-org or multi-org users)
 *   4. otherwise                        → render the children
 *
 * The onboarding PENDING → /onboarding bounce lives in the dashboard shell itself
 * (see DashboardLayout), because onboarding state is a property of the active
 * organization, not the session.
 */
export default function RequireAuth() {
  const location = useLocation()
  const { data: session, isPending: sessionPending } = useSession()
  const { data: activeOrganization, isPending: orgPending } = useActiveOrganization()
  const [isSyncing, setIsSyncing] = useState(false)

  // If the server auto-assigned an activeOrganizationId on session creation,
  // the client may not have picked it up yet. Sync it before deciding to bounce.
  // `setActive` fires better-auth's org/session signals, so `useActiveOrganization`
  // refetches on its own — no reload needed (an unconditional reload here would
  // loop forever whenever the org fetch keeps coming back empty).
  useEffect(() => {
    if (activeOrganization) {
      setIsSyncing(false)
      return
    }
    if (!session?.session?.activeOrganizationId || orgPending || isSyncing) return
    setIsSyncing(true)
    authClient.organization
      .setActive({ organizationId: session.session.activeOrganizationId })
      .then(res => {
        // If setActive itself failed (e.g. the membership is gone), stop syncing
        // and let the /onboarding redirect below take over instead of retrying.
        if (res?.error) setIsSyncing(false)
      })
      .catch(() => setIsSyncing(false))
  }, [session, activeOrganization, orgPending, isSyncing])

  if (sessionPending || orgPending || isSyncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-sm text-muted">Loading workspace…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!activeOrganization && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  // Scope query keys to the active workspace before any child renders (and builds its keys);
  // LiveSync in main.jsx does the same in an effect, which would run only after children.
  setQueryScope(activeOrganization?.id)

  return <Outlet />
}
