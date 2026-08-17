import { Navigate, Outlet } from 'react-router-dom'

// If the user is already logged in, don't let them
// see the login/register pages — send them to dashboard.

export default function GuestGuard() {
  const token = localStorage.getItem('asas_token')

  if (token) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}