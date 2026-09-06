import { createBrowserRouter } from 'react-router'
import { App } from './App.js'
import { RequireAuth } from './components/auth/RequireAuth.js'

/**
 * One real route per ported module surface, all rendered inside the `App` sidebar shell.
 * Mirrors the registration order in `apps/api/src/app.ts` — every path here is backed by a
 * live `/api/v1/*` endpoint, and `/` lands on the cross-module dashboard overview.
 *
 * `/login`, `/signup`, and `/onboarding` stay outside the auth guard (they are
 * the way *into* the app). Everything else renders through `RequireAuth`,
 * which redirects to `/login` without a session and to `/onboarding` when no
 * workspace is active.
 *
 * Every page is a lazy route: each module's imports (its charts, its dnd-kit, its table) land
 * in a per-route chunk that the browser fetches only when the user navigates there, which
 * is what keeps every chunk under the CI 500 kB budget alongside the vendor `manualChunks` in
 * `vite.config.ts`.
 *
 * `/dev/tokens` (the design-system page from the plan's Phase 1 verification) is deliberately
 * not in the sidebar — it is a development surface, reached by URL.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: async () => ({ Component: (await import('./pages/auth/LoginPage.js')).LoginPage }),
  },
  {
    path: '/signup',
    lazy: async () => ({ Component: (await import('./pages/auth/SignupPage.js')).SignupPage }),
  },
  {
    path: '/onboarding',
    lazy: async () => ({ Component: (await import('./pages/auth/OnboardingPage.js')).OnboardingPage }),
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <App />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('./pages/dashboard/DashboardOverviewPage.js')).DashboardOverviewPage }),
          },
          {
            path: 'hr/employees',
            lazy: async () => ({ Component: (await import('./pages/hr/EmployeeListPage.js')).EmployeeListPage }),
          },
          {
            path: 'hr/payroll',
            lazy: async () => ({ Component: (await import('./pages/hr/PayrollRunsPage.js')).PayrollRunsPage }),
          },
          {
            path: 'hr/candidates',
            lazy: async () => ({ Component: (await import('./pages/hr/CandidatePage.js')).CandidatePage }),
          },
          {
            path: 'hr/attendance',
            lazy: async () => ({ Component: (await import('./pages/hr/TimeAttendancePage.js')).TimeAttendancePage }),
          },
          {
            path: 'finance',
            lazy: async () => ({ Component: (await import('./pages/dashboard/finance/FinanceOverviewPage.js')).FinanceOverviewPage }),
          },
          {
            path: 'finance/payables',
            lazy: async () => ({ Component: (await import('./pages/dashboard/finance/AccountsPayablePage.js')).AccountsPayablePage }),
          },
          {
            path: 'finance/receivables',
            lazy: async () => ({ Component: (await import('./pages/dashboard/finance/AccountsReceivablePage.js')).AccountsReceivablePage }),
          },
          {
            path: 'finance/expenses',
            lazy: async () => ({ Component: (await import('./pages/dashboard/finance/ExpensesPage.js')).ExpensesPage }),
          },
          {
            path: 'exports',
            lazy: async () => ({ Component: (await import('./pages/dashboard/exports/ExportsPage.js')).ExportsPage }),
          },
          {
            path: 'crm',
            lazy: async () => ({ Component: (await import('./pages/dashboard/crm/CrmOverviewPage.js')).CrmOverviewPage }),
          },
          {
            path: 'crm/deals',
            lazy: async () => ({ Component: (await import('./pages/dashboard/crm/DealsPipelinePage.js')).DealsPipelinePage }),
          },
          {
            path: 'crm/forecast',
            lazy: async () => ({ Component: (await import('./pages/dashboard/crm/RevenueForecastPage.js')).RevenueForecastPage }),
          },
          {
            path: 'crm/performance',
            lazy: async () => ({ Component: (await import('./pages/dashboard/crm/SalesPerformancePage.js')).SalesPerformancePage }),
          },
          {
            path: 'projects',
            lazy: async () => ({ Component: (await import('./pages/dashboard/projects/PortfolioOverviewPage.js')).PortfolioOverviewPage }),
          },
          {
            path: 'projects/sprints',
            lazy: async () => ({ Component: (await import('./pages/dashboard/projects/ActiveSprintsPage.js')).ActiveSprintsPage }),
          },
          {
            path: 'projects/roadmap',
            lazy: async () => ({ Component: (await import('./pages/dashboard/projects/RoadmapPage.js')).RoadmapPage }),
          },
          {
            path: 'inventory',
            lazy: async () => ({ Component: (await import('./pages/dashboard/inventory/ProductCatalogPage.js')).ProductCatalogPage }),
          },
          {
            path: 'inventory/movements',
            lazy: async () => ({ Component: (await import('./pages/dashboard/inventory/StockMovementsPage.js')).StockMovementsPage }),
          },
          {
            path: 'settings',
            lazy: async () => ({ Component: (await import('./pages/dashboard/settings/SettingsGeneralPage.js')).SettingsGeneralPage }),
          },
          {
            path: 'settings/notifications',
            lazy: async () => ({ Component: (await import('./pages/dashboard/settings/NotificationsPage.js')).NotificationsPage }),
          },
          {
            path: 'settings/integrations',
            lazy: async () => ({ Component: (await import('./pages/dashboard/settings/IntegrationsPage.js')).IntegrationsPage }),
          },
          {
            path: 'dev/tokens',
            lazy: async () => ({ Component: (await import('./pages/dev/TokensPage.js')).TokensPage }),
          },
        ],
      },
    ],
  },
])
