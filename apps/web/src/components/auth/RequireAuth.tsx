import { Navigate, Outlet, useLocation } from 'react-router'
import { useActiveOrganization, useSession } from '@/lib/authClient.js'

/**
 * Auth guard for the app shell.
 *
 * - No session → `/login` (preserving the destination for post-login return).
 * - Session but no active workspace → `/onboarding` (workspace picker/creation).
 * - Otherwise renders the shell. While the session/org queries load, a
 *   minimal loading state avoids flashing the login form.
 */
export function RequireAuth() {
  const location = useLocation()
  const { data: session, isPending: sessionPending } = useSession()
  const { data: activeOrganization, isPending: orgPending } = useActiveOrganization()

  if (sessionPending || orgPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)]">
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
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
