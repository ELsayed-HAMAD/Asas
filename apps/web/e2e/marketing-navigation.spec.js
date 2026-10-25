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

test('desktop marketing navigation resolves product areas, resources, pricing, and workspace actions', async ({ page, context }) => {
  await mockSignedOutSession(context)
  await page.goto('/pricing')

  await page.getByRole('button', { name: 'Browse product areas' }).click()
  await page.getByRole('menuitem', { name: /Finance & treasury/ }).click()
  await expect(page).toHaveURL(/\/solutions\?area=finance$/)
  await expect(page.locator('#solution-detail').getByRole('heading', { name: 'Finance & Receivables' })).toBeVisible()

  for (const destination of [
    { label: 'Pricing', path: '/pricing' },
  ]) {
    await page.getByRole('link', { name: destination.label, exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${destination.path.replace('/', '\\/')}$`))
  }

  await page.getByRole('button', { name: 'Resources' }).click()
  await page.getByRole('menuitem', { name: /Product guide/ }).click()
  await expect(page).toHaveURL(/\/documentation$/)
  await expect(page.getByRole('heading', { name: 'People & HR' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Finance', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings & workspace tools' })).toBeVisible()
  await page.getByRole('button', { name: 'Resources' }).click()
  await page.getByRole('menuitem', { name: /Deployment status/ }).click()
  await expect(page).toHaveURL(/\/status$/)

  await page.getByRole('link', { name: /Create workspace/ }).click()
  await expect(page).toHaveURL(/\/register$/)

  await page.goto('/status')
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('mobile Sheet navigation opens accessibly, deep-links to a product area, and closes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await mockSignedOutSession(context)
  const page = await context.newPage()
  await page.goto('/solutions')

  const menuButton = page.getByRole('button', { name: 'Open navigation menu' })
  await menuButton.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Explore product workflows, guides, and workspace options.')).toBeVisible()

  await page.getByRole('dialog').getByRole('link', { name: /Inventory records/ }).click()
  await expect(page).toHaveURL(/\/solutions\?area=inventory$/)
  await expect(page.locator('#solution-detail').getByRole('heading', { name: 'Inventory Records' })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
  await context.close()
})
