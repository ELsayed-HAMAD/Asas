import { Routes, Route, Navigate } from 'react-router-dom'

// ── Layouts ────────────────────────────────────────────────
import MarketingLayout  from './layouts/MarketingLayout'
import AuthLayout       from './layouts/AuthLayout'
import DashboardLayout  from './layouts/DashboardLayout'

// ── Guards ─────────────────────────────────────────────────
import AuthGuard  from './guards/AuthGuard'
import GuestGuard from './guards/GuestGuard'

// ── Marketing ──────────────────────────────────────────────
import Landing from './pages/marketing/Landing'

// ── Auth ───────────────────────────────────────────────────
import Login    from './pages/auth/Login'
import Register from './pages/auth/Register'
import Onboarding from './pages/auth/Onboarding'

// ── Dashboard ──────────────────────────────────────────────
import DashboardOverview from './pages/dashboard/DashboardOverview'

// ── HR ─────────────────────────────────────────────────────
import EmployeeList       from './pages/dashboard/hr/EmployeeList'
import Payroll            from './pages/dashboard/hr/Payroll'
import TimeAttendance     from './pages/dashboard/hr/TimeAttendance'
import RecruitmentPipeline from './pages/dashboard/hr/RecruitmentPipeline'

// ── Finance ────────────────────────────────────────────────
import FinanceOverview     from './pages/dashboard/finance/FinanceOverview'
import AccountsPayable     from './pages/dashboard/finance/AccountsPayable'
import AccountsReceivable  from './pages/dashboard/finance/AccountsReceivable'
import Expenses            from './pages/dashboard/finance/Expenses'

// ── CRM ────────────────────────────────────────────────────
import CRMOverview      from './pages/dashboard/crm/CRMOverview'
import DealsPipeline    from './pages/dashboard/crm/DealsPipeline'
import SalesPerformance from './pages/dashboard/crm/SalesPerformance'
import RevenueForecast from './pages/dashboard/crm/RevenueForecast'

// ── Inventory ──────────────────────────────────────────────
import ProductCatalog from './pages/dashboard/inventory/ProductCatalog'

// ── Projects ───────────────────────────────────────────────
import PortfolioOverview from './pages/dashboard/projects/PortfolioOverview'
import ActiveSprints     from './pages/dashboard/projects/ActiveSprints'
import Roadmap           from './pages/dashboard/projects/Roadmap'

// ── Settings ───────────────────────────────────────────────
import SettingsGeneral from './pages/dashboard/settings/SettingsGeneral'
import BillingPlans    from './pages/dashboard/settings/BillingPlans'
import Integrations    from './pages/dashboard/settings/Integrations'
import Notifications   from './pages/dashboard/settings/Notifications'
import DataExport      from './pages/dashboard/settings/DataExport'

// ── Support ────────────────────────────────────────────────
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

      {/* ── Dashboard (protected — redirect to login if not logged in) ── */}
      <Route element={<AuthGuard />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<DashboardLayout />}>

          {/* Overview */}
          <Route path="/dashboard" element={<DashboardOverview />} />

          {/* HR */}
          <Route path="/dashboard/hr/employees"        element={<EmployeeList />} />
          <Route path="/dashboard/hr/payroll"          element={<Payroll />} />
          <Route path="/dashboard/hr/time-attendance"  element={<TimeAttendance />} />
          <Route path="/dashboard/hr/recruitment"      element={<RecruitmentPipeline />} />

          {/* Finance */}
          <Route path="/dashboard/finance"                     element={<FinanceOverview />} />
          <Route path="/dashboard/finance/accounts-payable"    element={<AccountsPayable />} />
          <Route path="/dashboard/finance/accounts-receivable" element={<AccountsReceivable />} />
          <Route path="/dashboard/finance/expenses"            element={<Expenses />} />

          {/* CRM */}
          <Route path="/dashboard/crm"                  element={<CRMOverview />} />
          <Route path="/dashboard/crm/deals"            element={<DealsPipeline />} />
          <Route path="/dashboard/crm/sales-performance" element={<SalesPerformance />} />
          <Route path="/dashboard/crm/revenue-forecast" element={<RevenueForecast />} />

          {/* Inventory */}
          <Route path="/dashboard/inventory" element={<ProductCatalog />} />

          {/* Projects */}
          <Route path="/dashboard/projects"         element={<PortfolioOverview />} />
          <Route path="/dashboard/projects/sprints" element={<ActiveSprints />} />
          <Route path="/dashboard/projects/roadmap" element={<Roadmap />} />

          {/* Settings */}
          <Route path="/dashboard/settings"              element={<SettingsGeneral />} />
          <Route path="/dashboard/settings/billing"      element={<BillingPlans />} />
          <Route path="/dashboard/settings/integrations" element={<Integrations />} />
          <Route path="/dashboard/settings/notifications" element={<Notifications />} />
          <Route path="/dashboard/settings/data-export"   element={<DataExport />} />

          {/* Support */}
          <Route path="/dashboard/support" element={<HelpCenter />} />

        </Route>
      </Route>

      {/* ── Fallback ── */}
      <Route path="*" element={<NotFound />} />

    </Routes>
  )
}