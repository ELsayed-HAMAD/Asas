import { Outlet, Navigate } from 'react-router-dom'
import { useSession } from '../lib/authClient'

/**
 * Route guard for guest-only areas (login / register). Port of the legacy `GuestGuard`:
 * an already-signed-in user is bounced to the dashboard instead of seeing the login form
 * again.
 */
export default function GuestGuard() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    )
  }

  if (session) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
