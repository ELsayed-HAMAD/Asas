import { Routes, Route, Navigate } from 'react-router-dom'

// ── Layouts ────────────────────────────────────────────────
import MarketingLayout  from './layouts/MarketingLayout'
import AuthLayout       from './layouts/AuthLayout'
import DashboardLayout  from './layouts/DashboardLayout'

// ── Guards ─────────────────────────────────────────────────
import RequireAuth  from './guards/RequireAuth'
import GuestGuard   from './guards/GuestGuard'

// ── Marketing ──────────────────────────────────────────────
import Landing from './pages/marketing/Landing'

// ── Auth ───────────────────────────────────────────────────
import Login    from './pages/auth/Login'
import Register from './pages/auth/Register'
import Onboarding from './pages/auth/Onboarding'

// ── Dashboard (placeholders until Phase 3 wires real pages) ──
import DashboardPlaceholder from './pages/dashboard/DashboardPlaceholder'

// ── Real pages landing ahead of Phase 3 ──
import SettingsGeneral from './pages/dashboard/settings/SettingsGeneral'

// ── 404 ────────────────────────────────────────────────────
function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center flex-col gap-3">
      <p className="text-5xl font-bold text-heading">404</p>
      <p className="text-muted">Page not found</p>
      <a href="/" className="text-sm text-accent hover:underline">
        Go back home
      </a>
    </div>
  )
}

const DASHBOARD_PATHS = [
  '/dashboard',
  '/dashboard/hr/employees', '/dashboard/hr/payroll', '/dashboard/hr/time-attendance', '/dashboard/hr/recruitment',
  '/dashboard/finance', '/dashboard/finance/accounts-payable', '/dashboard/finance/accounts-receivable', '/dashboard/finance/expenses',
  '/dashboard/crm', '/dashboard/crm/deals', '/dashboard/crm/sales-performance', '/dashboard/crm/revenue-forecast',
  '/dashboard/inventory',
  '/dashboard/projects', '/dashboard/projects/sprints', '/dashboard/projects/roadmap',
  '/dashboard/settings', '/dashboard/settings/billing', '/dashboard/settings/integrations', '/dashboard/settings/notifications', '/dashboard/settings/data-export',
  '/dashboard/support',
]

// Routes that already have a real (wired) page; everything else is a placeholder until
// Phase 3 ports each module page.
const REAL_PAGES = {
  '/dashboard/settings': SettingsGeneral,
}

export default function App() {
  return (
    <Routes>

      {/* ── Marketing ── */}
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
      </Route>

      {/* ── Auth (only for guests — redirect to dashboard if already logged in) ── */}
      <Route element={<GuestGuard />}>
        <Route element={<AuthLayout />}>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
      </Route>

      {/* ── Onboarding (protected) ── */}
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>

      {/* ── Dashboard (protected) ── */}
      <Route element={<RequireAuth />}>
        {/* The layout route has NO path (matches the legacy App.jsx) so the absolute
            child paths below are valid — React Router 7 forbids absolute children under
            a pathed parent. */}
        <Route element={<DashboardLayout />}>
          {DASHBOARD_PATHS.map(p => {
            const Page = REAL_PAGES[p] ?? DashboardPlaceholder
            return <Route key={p} path={p} element={<Page />} />
          })}
        </Route>
      </Route>

      {/* ── Fallback ── */}
      <Route path="*" element={<NotFound />} />

    </Routes>
  )
}
