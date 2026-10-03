import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useSession, useActiveOrganization } from '../lib/authClient'

/**
 * Route guard for authenticated areas (dashboard + onboarding).
 *
 * Port of the legacy `AuthGuard`, rebuilt for better-auth's httpOnly session cookie
 * (the legacy app read a JWT from a localStorage zustand store and refreshed it via
 * `GET /auth/me` — that model is gone; better-auth keeps the session in the cookie and
 * `useSession` reflects it).
 *
 * Flow (mirrors apps/web's RequireAuth, which is the working reference):
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

  if (sessionPending || orgPending) {
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

  return <Outlet />
}
