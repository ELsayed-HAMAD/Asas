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

test('landing page renders its glass preview and switches product workflows without runtime errors', async ({ page, context }) => {
  const runtimeErrors = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  await mockSignedOutSession(context)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Everything connected/ })).toBeVisible()
  await expect(page.getByText('Asas workspace', { exact: true })).toBeVisible()
  await expect(page.getByText('Interactive preview', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'From invoice to reconciliation.' })).toBeVisible()
  await expect(page.getByText('Illustrative workflow · no live business figures')).toBeVisible()
  const finalCtaCopy = page.getByText('All current product areas are available on Free.')
  await finalCtaCopy.scrollIntoViewIfNeeded()
  await expect(finalCtaCopy).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get started free' })).toHaveAttribute('href', '/register')

  const financeTab = page.getByRole('button', { name: 'Finance', exact: true })
  const peopleTab = page.getByRole('button', { name: 'People', exact: true })
  await expect(financeTab).toHaveAttribute('aria-pressed', 'true')
  await peopleTab.click()
  await expect(peopleTab).toHaveAttribute('aria-pressed', 'true')
  await expect(financeTab).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('heading', { name: 'People operations, clearly organized.' })).toBeVisible()
  await expect(page.getByText('Employee record', { exact: true })).toBeVisible()
  expect(runtimeErrors).toEqual([])
})

test('marketing navbar remains fixed while landing content scrolls', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockSignedOutSession(context)
  await page.goto('/')

  const navbar = page.getByRole('banner')
  await expect(navbar).toBeVisible()
  await expect(navbar).toHaveCSS('position', 'fixed')
  const initialTop = await navbar.evaluate(element => element.getBoundingClientRect().top)

  await page.locator('#pricing').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const scrolledTop = await navbar.evaluate(element => element.getBoundingClientRect().top)
  expect(scrolledTop).toBeCloseTo(initialTop, 0)
})

test('every product-area menu destination resolves to its matching solution view', async ({ page, context }) => {
  await mockSignedOutSession(context)
  await page.goto('/solutions')

  const areas = [
    { menu: /Finance & treasury/, tab: 'Finance', path: '/solutions?area=finance', heading: 'Finance & Receivables' },
    { menu: /People & payroll/, tab: 'HR & Payroll', path: '/solutions?area=hr', heading: 'Workforce Management' },
    { menu: /Customer workflows/, tab: 'CRM', path: '/solutions?area=crm', heading: 'Customer & Sales Workflows' },
    { menu: /Projects & delivery/, tab: 'Projects', path: '/solutions?area=engineering', heading: 'Project Planning & Delivery' },
    { menu: /Inventory records/, tab: 'Inventory', path: '/solutions?area=inventory', heading: 'Inventory Records' },
    { menu: /Workspace administration/, tab: 'Workspace Security', path: '/solutions?area=governance', heading: 'Workspace Access & Administration' },
  ]

  for (const area of areas) {
    await page.getByRole('button', { name: 'Browse product areas' }).click()
    await page.getByRole('menuitem', { name: area.menu }).click()
    await expect(page).toHaveURL(new RegExp(`${area.path.replace('?', '\\?')}$`))
    await expect(page.locator('#solution-detail').getByRole('heading', { name: area.heading })).toBeVisible()
    await expect(page.getByRole('button', { name: area.tab, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }

  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: /Everything connected/ })).toBeVisible()
})

test('status page renders only the readiness fields reported by the API', async ({ page, context }) => {
  let readinessRequests = 0
  await mockSignedOutSession(context)
  await context.route('**/api/v1/ready', route => {
    readinessRequests += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { status: 'ok', database: 'connected', emailDelivery: 'disabled', objectStorage: 's3' } }),
    })
  })

  await page.goto('/status')
  await expect(page.getByRole('heading', { name: 'Platform status' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The API readiness check passed.' })).toBeVisible()
  await expect(page.getByText('Operational', { exact: true })).toHaveCount(2)
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await expect(page.getByText('Not configured', { exact: true })).toBeVisible()
  await expect(page.getByText('Configured driver: s3. The readiness endpoint does not test writes.')).toBeVisible()
  expect(readinessRequests).toBe(1)

  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => readinessRequests).toBeGreaterThan(1)
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
    await expect(page.getByText('Prices shown are monthly.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Compare plan limits across tiers' })).toBeVisible()
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
  await expect(page.getByRole('menuitem', { name: /Deployment status/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('link', { name: 'System status' })).toHaveCount(0)

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
  await expect(page.getByRole('heading', { name: /Everything connected/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get started free' })).toBeVisible()

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

  const reducedMotionStyles = await page.locator('[data-hero-title]').evaluate(element => ({
    opacity: window.getComputedStyle(element).opacity,
    transform: window.getComputedStyle(element).transform,
  }))
  expect(reducedMotionStyles.opacity).toBe('1')
  expect(reducedMotionStyles.transform).toBe('none')
  await expect(page.locator('[data-preview]')).toHaveCSS('opacity', '1')

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
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/')
  await expect(page.getByRole('dialog').getByText('Deployment status')).toHaveCount(0)

  await page.getByRole('dialog').getByRole('link', { name: /Inventory records/ }).click()
  await expect(page).toHaveURL(/\/solutions\?area=inventory$/)
  await expect(page.locator('#solution-detail').getByRole('heading', { name: 'Inventory Records' })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
  await context.close()
})
