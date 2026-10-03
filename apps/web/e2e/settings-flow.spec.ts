import { expect, test } from '@playwright/test'

const routes = [
  { path: '/settings', heading: /settings/i },
  { path: '/settings/general', heading: /general|settings/i },
  { path: '/settings/notifications', heading: /notification/i },
  { path: '/settings/integrations', heading: /integration/i },
]

test.describe('Settings routes', () => {
  for (const route of routes) {
    test(`loads ${route.path}`, async ({ page }) => {
      await page.goto(route.path)
      await Promise.race([
        expect(page.getByRole('heading', { name: route.heading })).toBeVisible({ timeout: 5_000 }),
        expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 5_000 }),
      ])
    })
  }
})
