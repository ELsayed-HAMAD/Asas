import { expect, test } from '@playwright/test'

const routes = [
  { path: '/finance', heading: /finance/i },
  { path: '/finance/payables', heading: /payable/i },
  { path: '/finance/receivables', heading: /receivable/i },
  { path: '/finance/expenses', heading: /expense/i },
]

test.describe('Finance routes', () => {
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
