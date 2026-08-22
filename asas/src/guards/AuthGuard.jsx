import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { authService } from '../services/auth.service'
import { useAuthStore } from '../store/authStore'

export default function AuthGuard() {
  const location = useLocation()
  const token = useAuthStore(state => state.token)
  const user = useAuthStore(state => state.user)
  const setSession = useAuthStore(state => state.setSession)
  const clearSession = useAuthStore(state => state.clearSession)

  // Fetch /me in the background to update user details silently,
  // but do not block the UI or show a loading screen if we already have the cache.
  // We only run this when the token changes (e.g. initial load or login).
  useEffect(() => {
    if (token) {
      authService.me()
        .then(result => setSession(result.user, token))
        .catch(() => clearSession())
    }
  }, [token, setSession, clearSession])

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-raised text-muted gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading workspace…</span>
      </div>
    )
  }

  const onboardingStatus = user.tenant?.onboardingStatus || 'PENDING'
  const onOnboardingRoute = location.pathname.startsWith('/onboarding')

  if (onboardingStatus === 'PENDING' && !onOnboardingRoute) {
    return <Navigate to="/onboarding" replace />
  }
  
  if (onboardingStatus !== 'PENDING' && onOnboardingRoute) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
