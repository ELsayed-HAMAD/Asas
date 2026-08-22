import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// If the user is already logged in, don't let them
// see the login/register pages — send them to dashboard.

export default function GuestGuard() {
  const token = useAuthStore(state => state.token)

  if (token) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}