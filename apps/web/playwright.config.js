import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { COOKIE_CONSENT_STORAGE_KEY, COOKIE_CONSENT_VERSION } from './src/lib/cookieConsent.js'

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const appOrigin = 'http://127.0.0.1:5174'
const consentedStorageState = {
  cookies: [],
  origins: [{
    origin: appOrigin,
    localStorage: [{
      name: COOKIE_CONSENT_STORAGE_KEY,
      value: JSON.stringify({
        version: COOKIE_CONSENT_VERSION,
        essential: true,
        analytics: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }],
  }],
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  // Each test exercises a full browser session; two workers still cover multi-user concurrency
  // inside a test while avoiding resource starvation from launching one browser per CPU core.
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: appOrigin,
    storageState: consentedStorageState,
    headless: true,
    ...(process.platform === 'win32' && existsSync(chromePath) ? { launchOptions: { channel: 'chrome' } } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `${packageManager} --filter @asas/web exec vite --host 127.0.0.1 --port 5174 --strictPort`,
    url: 'http://127.0.0.1:5174/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
