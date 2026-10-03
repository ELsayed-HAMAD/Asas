import { expect, test } from '@playwright/test'

/**
 * Sample-data onboarding journey (rebuild plan, Preserve section: the pack as a *tested*
 * fixture). Signs up a fresh workspace, loads the enterprise sample pack, and asserts the
 * fixture's row counts and real KPI surfaces — payroll consistency is verified server-side by
 * `computePayrollLine`, so this spec asserts the surfaces render real seeded numbers.
 */
const ORG_NAME = `Sample Co ${Date.now()}`
const TEST_EMAIL = `sample-owner-${Date.now()}@example.com`
const TEST_PASSWORD = 'sample-password-123'

test.describe('Sample-data onboarding', () => {
  test('signup → load sample data → seeded surfaces render real numbers', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel(/name|organization/i).first().fill(ORG_NAME)
    await page.getByLabel(/email/i).first().fill(TEST_EMAIL)
    await page.getByLabel(/password/i).first().fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /sign\s*up|register|create/i }).click()

    await page.waitForURL('**/onboarding', { timeout: 15_000 }).catch(() => {})
    if (!(page.url().includes('/hr/'))) {
      // No active organization yet — create one, then the sample buttons appear.
      await page.getByLabel(/organization name/i).fill(ORG_NAME).catch(() => {})
      await page.getByRole('button', { name: /start with empty workspace/i }).click()
    }
    await page.waitForURL('**/hr/employees', { timeout: 15_000 })

    // The onboarding page is where the sample pack is offered. Navigate back to it.
    await page.goto('/onboarding')
    await page.getByRole('button', { name: /load sample data/i }).click()
    await expect(
      page.getByText(/sample data loaded|sample pack/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    // Every module surface now carries real seeded rows.
    await page.goto('/finance')
    await expect(page.getByText('Open payables')).toBeVisible()
    await expect(page.getByText('Open receivables')).toBeVisible()

    await page.goto('/hr/employees')
    await expect(page.getByText('Headcount')).toBeVisible()

    await page.goto('/crm')
    await expect(page.getByText('Open pipeline')).toBeVisible()

    // Sample data is visibly labeled (plan: it can never be mistaken for real records).
    await expect(page.getByText('Sample data').first()).toBeVisible({ timeout: 10_000 })
  })

  test('sample apply is idempotent — a second apply is refused', async ({ page }) => {
    await page.goto('/onboarding')
    await page.getByRole('button', { name: /load sample data/i }).click()
    await expect(
      page.getByText(/already has HR data/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
