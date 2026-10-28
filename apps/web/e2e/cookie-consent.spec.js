import { expect, test } from '@playwright/test'

// Most suites start with a saved choice; this file deliberately starts as a first-time visitor.
test.use({ storageState: { cookies: [], origins: [] } })

test('first visit offers cookie choices, saves them, and reopens from the footer', async ({ page, context }) => {
  await context.route('**/api/auth/**', route => {
    const path = new URL(route.request().url()).pathname
    const body = path.endsWith('/get-session') ? 'null' : '{}'
    return route.fulfill({ status: 200, contentType: 'application/json', body })
  })

  await page.goto('/')

  const banner = page.getByRole('dialog', { name: 'Cookie preferences' })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/essential cookies/i)
  await expect(banner.getByRole('button', { name: 'Accept all' })).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Essential only' })).toBeVisible()

  await banner.getByRole('button', { name: 'Manage preferences' }).click()
  const analyticsSwitch = banner.getByRole('switch', { name: 'Allow analytics and diagnostics' })
  await expect(analyticsSwitch).toHaveAttribute('aria-checked', 'false')
  await analyticsSwitch.click()
  await banner.getByRole('button', { name: 'Save choices' }).click()
  await expect(banner).toBeHidden()

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('asas.cookie-consent.v1')))
  expect(stored).toMatchObject({ version: 1, essential: true, analytics: true })

  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Cookie preferences' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Cookie settings' }).click()
  const reopened = page.getByRole('dialog', { name: 'Cookie preferences' })
  await expect(reopened).toBeVisible()
  await expect(reopened.getByRole('switch', { name: 'Allow analytics and diagnostics' })).toHaveAttribute('aria-checked', 'true')
})
