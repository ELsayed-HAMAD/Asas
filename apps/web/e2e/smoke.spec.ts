import { test, expect } from '@playwright/test'

/**
 * Smoke test: load every route and verify the page renders without a crash.
 *
 * This catches import-time errors, broken lazy chunks, and missing route registrations
 * without the full setup the HR flow spec requires. It navigates to each route and asserts
 * that the page's main heading is visible.
 *
 * These tests do NOT require authentication — they verify the route exists and the bundle
 * loads. If the app redirects to login, that is also a pass (the route exists, the user just
 * needs auth).
 */

const ROUTES = [
  { path: '/hr/employees', heading: /employees/i },
  { path: '/hr/payroll', heading: /payroll/i },
  { path: '/hr/candidates', heading: /candidate/i },
  { path: '/hr/attendance', heading: /attendance/i },
  { path: '/finance', heading: /finance/i },
  { path: '/crm', heading: /crm|pipeline|funnel/i },
  { path: '/projects', heading: /project|portfolio/i },
  { path: '/inventory', heading: /inventory|product/i },
  { path: '/settings', heading: /settings/i },
]

test.describe('Route smoke tests', () => {
  for (const route of ROUTES) {
    test(`loads ${route.path}`, async ({ page }) => {
      await page.goto(route.path)

      // Either the page heading is visible (authenticated) or we're redirected to login
      const heading = page.getByRole('heading', { name: route.heading })
      const loginForm = page.getByLabel(/email/i)

      // One of the two should be visible within 5 seconds
      await Promise.race([
        expect(heading).toBeVisible({ timeout: 5_000 }),
        expect(loginForm).toBeVisible({ timeout: 5_000 }),
      ])
    })
  }
})
