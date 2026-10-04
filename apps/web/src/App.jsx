import { Routes, Route } from 'react-router-dom'

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

import DashboardPlaceholder from './pages/dashboard/DashboardPlaceholder'
import DashboardOverview from './pages/dashboard/DashboardOverview'
import EmployeeList from './pages/dashboard/hr/EmployeeList'
import Payroll from './pages/dashboard/hr/Payroll'
import TimeAttendance from './pages/dashboard/hr/TimeAttendance'
import RecruitmentPipeline from './pages/dashboard/hr/RecruitmentPipeline'
import FinanceOverview from './pages/dashboard/finance/FinanceOverview'
import AccountsPayable from './pages/dashboard/finance/AccountsPayable'
import AccountsReceivable from './pages/dashboard/finance/AccountsReceivable'
import Expenses from './pages/dashboard/finance/Expenses'
import CRMOverview from './pages/dashboard/crm/CRMOverview'
import DealsPipeline from './pages/dashboard/crm/DealsPipeline'
import SalesPerformance from './pages/dashboard/crm/SalesPerformance'
import RevenueForecast from './pages/dashboard/crm/RevenueForecast'
import ProductCatalog from './pages/dashboard/inventory/ProductCatalog'
import PortfolioOverview from './pages/dashboard/projects/PortfolioOverview'
import ActiveSprints from './pages/dashboard/projects/ActiveSprints'
import Roadmap from './pages/dashboard/projects/Roadmap'
import SettingsGeneral from './pages/dashboard/settings/SettingsGeneral'
import BillingPlans from './pages/dashboard/settings/BillingPlans'
import Integrations from './pages/dashboard/settings/Integrations'
import Notifications from './pages/dashboard/settings/Notifications'
import DataExport from './pages/dashboard/settings/DataExport'
import HelpCenter from './pages/dashboard/support/HelpCenter'

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
  '/dashboard/inventory', '/dashboard/inventory/movements',
  '/dashboard/projects', '/dashboard/projects/sprints', '/dashboard/projects/roadmap',
  '/dashboard/settings', '/dashboard/settings/billing', '/dashboard/settings/integrations', '/dashboard/settings/notifications', '/dashboard/settings/data-export', '/dashboard/exports',
  '/dashboard/support',
]

// Routes that have a real (wired) page; anything missing here is still a placeholder.
const REAL_PAGES = {
  '/dashboard': DashboardOverview,
  '/dashboard/hr/employees': EmployeeList,
  '/dashboard/hr/payroll': Payroll,
  '/dashboard/hr/time-attendance': TimeAttendance,
  '/dashboard/hr/recruitment': RecruitmentPipeline,
  '/dashboard/finance': FinanceOverview,
  '/dashboard/finance/accounts-payable': AccountsPayable,
  '/dashboard/finance/accounts-receivable': AccountsReceivable,
  '/dashboard/finance/expenses': Expenses,
  '/dashboard/crm': CRMOverview,
  '/dashboard/crm/deals': DealsPipeline,
  '/dashboard/crm/sales-performance': SalesPerformance,
  '/dashboard/crm/revenue-forecast': RevenueForecast,
  '/dashboard/inventory': ProductCatalog,
  '/dashboard/inventory/movements': ProductCatalog,
  '/dashboard/projects': PortfolioOverview,
  '/dashboard/projects/sprints': ActiveSprints,
  '/dashboard/projects/roadmap': Roadmap,
  '/dashboard/settings': SettingsGeneral,
  '/dashboard/settings/billing': BillingPlans,
  '/dashboard/settings/integrations': Integrations,
  '/dashboard/settings/notifications': Notifications,
  '/dashboard/settings/data-export': DataExport,
  '/dashboard/exports': DataExport,
  '/dashboard/support': HelpCenter,
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
