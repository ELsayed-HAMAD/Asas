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

test('landing page presents a truthful free-workspace entry point and clearly marked sample preview', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockSignedOutSession(context)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /The unified workspace for/ })).toBeVisible()
  await expect(page.getByText('workspace / dashboard')).toBeVisible()
  await expect(page.getByText('Sample workspace', { exact: true })).toBeVisible()
  await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Headcount', { exact: true })).toBeVisible()
  await expect(page.getByText('Open pipeline value', { exact: true })).toBeVisible()
  await expect(page.getByText('Active sprints', { exact: true })).toBeVisible()
  await expect(page.getByText('All current product areas are available on the Free plan.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start Free Workspace' }).first()).toHaveAttribute('href', '/register')
})

test('desktop marketing navigation resolves product areas, resources, pricing, and workspace actions', async ({ page, context }) => {
  await mockSignedOutSession(context)
  await page.goto('/pricing')

  await page.getByRole('button', { name: 'Browse product areas' }).click()
  await page.getByRole('menuitem', { name: /Finance & treasury/ }).click()
  await expect(page).toHaveURL(/\/solutions\?area=finance$/)
  await expect(page.locator('#solution-detail').getByRole('heading', { name: 'Finance & Receivables' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finance', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Inventory', exact: true }).click()
  await expect(page).toHaveURL(/\/solutions\?area=inventory$/)
  await expect(page.locator('#solution-detail').getByRole('heading', { name: 'Inventory Records' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inventory', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Finance', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('status')).toContainText('Inventory Records')

  for (const destination of [
    { label: 'Pricing', path: '/pricing' },
  ]) {
    await page.getByRole('link', { name: destination.label, exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${destination.path.replace('/', '\\/')}$`))
    await expect(page.getByRole('heading', { name: 'Plans for your team and workspace' })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Resources' }).click()
  await page.getByRole('menuitem', { name: /Product guide/ }).click()
  await expect(page).toHaveURL(/\/documentation$/)
  await expect(page.getByRole('heading', { name: 'HR', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Finance', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'CRM', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Valuation', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true }).first()).toBeVisible()
  await expect(page.getByText('Executive overview')).toHaveCount(0)
  await expect(page.getByText(/Quick Add/)).toHaveCount(0)
  await expect(page.getByText(/task dependencies/i)).toHaveCount(0)
  await expect(page.getByText(/create and assign work/i)).toHaveCount(0)
  await expect(page.getByText(/company, contact, and opportunity workflows/i)).toHaveCount(0)
  await expect(page.getByText(/Generate Report/)).toBeVisible()
  await page.getByRole('button', { name: 'Resources' }).click()
  await page.getByRole('menuitem', { name: /Deployment status/ }).click()
  await expect(page).toHaveURL(/\/status$/)
  await expect(page.getByRole('heading', { name: 'Platform status' })).toBeVisible()

  await page.getByRole('link', { name: /Create workspace/ }).click()
  await expect(page).toHaveURL(/\/register$/)

  await page.goto('/status')
  await expect(page.getByRole('heading', { name: 'Platform status' })).toBeVisible()
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('public pages support keyboard skip, responsive layout, and reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await mockSignedOutSession(context)
  const page = await context.newPage()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /The unified workspace for/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start Free Workspace' }).first()).toBeVisible()

  const landingOverflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(landingOverflow.document).toBeLessThanOrEqual(1)
  expect(landingOverflow.body).toBeLessThanOrEqual(1)

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to content' })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  const financeTab = page.getByRole('button', { name: 'Finance lead' })
  const operationsTab = page.getByRole('button', { name: 'Operations lead' })
  await expect(financeTab).toHaveAttribute('aria-pressed', 'true')
  await operationsTab.click()
  await expect(operationsTab).toHaveAttribute('aria-pressed', 'true')
  await expect(financeTab).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Record movements')).toBeVisible()

  const animationDuration = await page.locator('.animate-float').first().evaluate(element => (
    window.getComputedStyle(element).animationDuration
  ))
  const firstDuration = animationDuration.split(',')[0].trim()
  const durationSeconds = firstDuration.endsWith('ms') ? parseFloat(firstDuration) / 1000 : parseFloat(firstDuration)
  expect(durationSeconds).toBeLessThanOrEqual(0.01)

  await page.goto('/pricing')
  await expect(page.getByRole('heading', { name: 'Plans for your team and workspace' })).toBeVisible()
  const pricingOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))
  expect(pricingOverflow).toBeLessThanOrEqual(1)

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  for (const destination of [
    { path: '/solutions', heading: 'Business workflows in one workspace' },
    { path: '/documentation', heading: 'Get started with Asas' },
    { path: '/status', heading: 'Platform status' },
    { path: '/privacy', heading: 'Privacy Policy' },
    { path: '/terms', heading: 'Terms of Service' },
  ]) {
    await page.goto(destination.path)
    await expect(page.getByRole('heading', { level: 1, name: destination.heading })).toBeVisible()
    const pageOverflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }))
    expect(pageOverflow.document, `${destination.path} document overflow`).toBeLessThanOrEqual(1)
    expect(pageOverflow.body, `${destination.path} body overflow`).toBeLessThanOrEqual(1)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  }

  await context.close()
})

test('public footer and guide links resolve to real destinations', async ({ page, context }) => {
  await mockSignedOutSession(context)

  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()

  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible()

  await page.goto('/documentation#api-reference')
  await expect(page.locator('#api-reference').getByRole('heading', { name: 'API reference' })).toBeVisible()

  await page.goto('/documentation#security')
  await expect(page.locator('#security').getByRole('heading', { name: 'Access & data handling' })).toBeVisible()

  await page.goto('/#features')
  await expect(page.locator('#features')).toBeVisible()
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
