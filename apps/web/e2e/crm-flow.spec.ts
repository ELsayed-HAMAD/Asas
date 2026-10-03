import { expect, test } from '@playwright/test'

const routes = [
  { path: '/crm', heading: /crm|pipeline|funnel/i },
  { path: '/crm/deals', heading: /deal|pipeline/i },
  { path: '/crm/forecast', heading: /forecast/i },
  { path: '/crm/performance', heading: /performance|sales/i },
]

test.describe('CRM routes', () => {
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
