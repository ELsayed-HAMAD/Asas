import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the Asas web E2E suite.
 *
 * The web dev server runs on port 5173 (Vite default). The API is expected to be running
 * separately (on port 4000) — in CI this is handled by the workflow's service setup; locally
 * the developer runs `pnpm --filter @asas/api dev` in a second terminal.
 *
 * The HR flow spec (`e2e/hr-flow.spec.ts`) is the Phase 2 gate test: signup → onboarding →
 * create employee → run payroll → download payslip. The smoke spec loads every route to catch
 * import-time crashes.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share a DB tenant; serial avoids cross-test pollution
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 30_000,
      },
})
