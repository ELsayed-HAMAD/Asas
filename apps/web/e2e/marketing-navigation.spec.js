import { expect, test } from '@playwright/test'

async function mockSignedOutSession(context) {
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
}

test('desktop marketing navigation resolves every primary destination and scrolls to Features', async ({ page, context }) => {
  await mockSignedOutSession(context)
  await page.goto('/pricing')

  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Features', exact: true })
    .click()
  await expect(page).toHaveURL(/\/#features$/)
  await expect(page.locator('#features')).toBeInViewport()

  for (const destination of [
    { label: 'Solutions', path: '/solutions' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Documentation', path: '/documentation' },
    { label: 'System Status', path: '/status' },
  ]) {
    await page.getByRole('link', { name: destination.label, exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${destination.path.replace('/', '\\/')}$`))
  }

  await page.getByRole('link', { name: /Start Free/ }).click()
  await expect(page).toHaveURL(/\/register$/)

  await page.goto('/status')
  await page.getByRole('link', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('mobile navigation is labelled, opens, navigates, and closes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await mockSignedOutSession(context)
  const page = await context.newPage()
  await page.goto('/solutions')

  const menuButton = page.getByRole('button', { name: 'Open navigation menu' })
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  await menuButton.click()
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Documentation' }).click()
  await expect(page).toHaveURL(/\/documentation$/)
  await expect(page.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
  await context.close()
})
