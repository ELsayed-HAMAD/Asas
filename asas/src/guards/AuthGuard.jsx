import { Navigate, Outlet } from 'react-router-dom'

// Checks for a token in localStorage.
// When you build real auth later, replace this
// with a check from your authStore (Zustand).

export default function AuthGuard() {
  const token = localStorage.getItem('asas_token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}