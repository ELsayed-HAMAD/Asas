import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockAuth(context, account, apiHandler) {
  let signedIn = false
  await context.route('**/api/auth/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/get-session')) {
      return json(route, signedIn ? {
        session: { id: `session-${account.id}`, token: `token-${account.id}`, userId: account.id, activeOrganizationId: `workspace-${account.id}` },
        user: account,
      } : null)
    }

    if (path.endsWith('/sign-in/email')) {
      const credentials = route.request().postDataJSON()
      if (credentials.email !== account.email || credentials.password !== 'correct-password') {
        return json(route, { message: 'Invalid email or password' }, 401)
      }
      signedIn = true
      return json(route, { redirect: false, token: `token-${account.id}`, user: account })
    }

    if (path.endsWith('/organization/list')) {
      return json(route, [{ id: `workspace-${account.id}`, name: `${account.name} Workspace`, slug: `workspace-${account.id}`, logo: null, createdAt: new Date().toISOString() }])
    }

    if (path.endsWith('/organization/get-active-member-role') && account.role) {
      return json(route, { role: account.role })
    }

    if (path.endsWith('/organization/get-full-organization')) {
      return json(route, { id: `workspace-${account.id}`, name: `${account.name} Workspace`, slug: `workspace-${account.id}`, logo: null, createdAt: new Date().toISOString(), members: [] })
    }

    return json(route, {})
  })

  await context.route('**/api/v1/**', route => apiHandler ? apiHandler(route) : json(route, { data: {} }))
}

async function signIn(page, account) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill('correct-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(account.name, { exact: true })).toBeVisible({ timeout: 15_000 })
}

test('two workspaces can sign in at the same time without sharing browser session identity', async ({ browser }) => {
  const accountOne = { id: 'user_one', name: 'Northwind Owner', email: 'northwind@example.test', emailVerified: true }
  const accountTwo = { id: 'user_two', name: 'Contoso Finance', email: 'contoso@example.test', emailVerified: true }
  const [contextOne, contextTwo] = await Promise.all([browser.newContext(), browser.newContext()])
  await Promise.all([mockAuth(contextOne, accountOne), mockAuth(contextTwo, accountTwo)])
  const [pageOne, pageTwo] = await Promise.all([contextOne.newPage(), contextTwo.newPage()])

  try {
    await Promise.all([signIn(pageOne, accountOne), signIn(pageTwo, accountTwo)])
    await expect(pageOne.getByText(accountTwo.name, { exact: true })).toHaveCount(0)
    await expect(pageTwo.getByText(accountOne.name, { exact: true })).toHaveCount(0)
  } finally {
    await Promise.all([contextOne.close(), contextTwo.close()])
  }
})

test('a rejected sign-in in one browser does not disrupt a concurrent valid user', async ({ browser }) => {
  const validAccount = { id: 'valid_user', name: 'Valid Workspace User', email: 'valid@example.test', emailVerified: true }
  const deniedAccount = { id: 'denied_user', name: 'Denied Workspace User', email: 'denied@example.test', emailVerified: true }
  const [validContext, deniedContext] = await Promise.all([browser.newContext(), browser.newContext()])
  await Promise.all([mockAuth(validContext, validAccount), mockAuth(deniedContext, deniedAccount)])
  const [validPage, deniedPage] = await Promise.all([validContext.newPage(), deniedContext.newPage()])

  try {
    await Promise.all([
      signIn(validPage, validAccount),
      (async () => {
        await deniedPage.goto('/login')
        await deniedPage.locator('input[name="email"]').fill(deniedAccount.email)
        await deniedPage.locator('input[name="password"]').fill('wrong-password')
        await deniedPage.getByRole('button', { name: 'Sign in' }).click()
        await expect(deniedPage.getByText('Invalid email or password')).toBeVisible()
        await expect(deniedPage).toHaveURL(/\/login$/)
      })(),
    ])
    await expect(validPage.getByText(validAccount.name, { exact: true })).toBeVisible()
  } finally {
    await Promise.all([validContext.close(), deniedContext.close()])
  }
})

test('dashboard Arabic direction stays within phone, tablet, and desktop viewports', async ({ browser }) => {
  const account = { id: 'rtl_review_user', name: 'RTL Review User', email: 'rtl.review@example.test', emailVerified: true }
  const context = await browser.newContext()
  await mockAuth(context, account, async route => json(route, { data: {} }))
  const page = await context.newPage()
  try {
    await signIn(page, account)
    // Header must no longer have a standalone language button
    await expect(page.locator('header button').filter({ has: page.locator('svg.lucide-globe') })).toHaveCount(0)

    // Open user menu from sidebar footer and click the language toggle inside the panel
    const userMenuButton = page.locator('button[data-testid="user-menu-button"]').first()
    await expect(userMenuButton).toBeVisible()
    await userMenuButton.click()

    const languageToggle = page.locator('button[data-testid="language-toggle"]').first()
    await expect(languageToggle).toBeVisible()
    await languageToggle.click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl')

    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await expect(page.getByRole('main')).toHaveCount(1)
    }
  } finally {
    await context.close()
  }
})

test('marketing navigation opens useful pages and displays configured prices responsively', async ({ browser }) => {
  const account = { id: 'marketing_visitor', name: 'Marketing Visitor', email: 'marketing@example.test', emailVerified: true }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await mockAuth(context, account, async route => {
    if (new URL(route.request().url()).pathname.endsWith('/billing/plans')) return json(route, { data: { enabled: true, items: [
      { priceId: 'price_team', name: 'Team', amount: '29.00', currency: 'USD', interval: 'month', seatLimit: 10, storageLimitGb: 100 },
    ] } })
    return json(route, { data: {} })
  })
  const page = await context.newPage()

  try {
    await page.goto('/')
    await page.getByRole('link', { name: 'Features' }).click()
    await expect(page).toHaveURL(/#features$/)
    await page.getByRole('link', { name: 'Solutions' }).click()
    await expect(page.getByRole('heading', { name: 'Connected work across your business' })).toBeVisible()
    await page.getByRole('link', { name: 'Pricing' }).click()
    await expect(page.getByRole('heading', { name: 'A clear view of your workspace plan' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
    await expect(page.getByText('$29.00')).toBeVisible()
    await page.getByRole('banner').getByRole('link', { name: 'Documentation' }).click()
    await expect(page.getByRole('heading', { name: 'A practical guide to Asas' })).toBeVisible()
    await page.goto('/status')
    await expect(page.getByRole('heading', { name: 'Public live status is not connected' })).toBeVisible()

    for (const path of ['/', '/solutions', '/pricing', '/documentation', '/status']) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await expect.poll(() => page.locator('header').evaluate(header => header.scrollWidth <= header.clientWidth)).toBe(true)
      if (path === '/') await expect(page.getByRole('link', { name: 'Features' })).toBeVisible()
    }
  } finally {
    await context.close()
  }
})

test('workspace admin can launch hosted plan checkout from Billing & Plans', async ({ browser }) => {
  const account = { id: 'billing_owner', name: 'Billing Workspace Owner', email: 'billing@example.test', emailVerified: true }
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/settings/billing')) {
      return json(route, { data: { stripePortalAvailable: false, subscriptions: [], paymentMethods: [], invoices: [] } })
    }
    if (path.endsWith('/billing/plans')) {
      return json(route, { data: { enabled: true, items: [{ priceId: 'price_basic', name: 'Basic', amount: '10.00', currency: 'USD', interval: 'month', seatLimit: 10, storageLimitGb: 100 }] } })
    }
    if (path.endsWith('/billing/checkout')) return json(route, { data: { url: 'https://checkout.stripe.com/test-session' } })
    return json(route, { data: {} })
  })
  await context.route('https://checkout.stripe.com/test-session', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Hosted checkout test</title>' }))
  const page = await context.newPage()

  try {
    await signIn(page, account)
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard/settings/billing')
      await page.getByRole('heading', { name: 'Available plans' }).waitFor()
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
      expect(dimensions.content, `Billing page should fit the ${width}px viewport`).toBeLessThanOrEqual(dimensions.viewport)
      const settingsNavigation = page.getByRole('navigation', { name: 'Settings navigation' })
      await expect.poll(() => settingsNavigation.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    await page.getByRole('button', { name: 'Choose plan' }).click()
    await expect(page).toHaveURL('https://checkout.stripe.com/test-session')
    await expect(page).toHaveTitle('Hosted checkout test')
  } finally {
    await context.close()
  }
})

test('dashboard content fits phone, tablet, and desktop viewports', async ({ browser }) => {
  const account = { id: 'responsive_owner', name: 'Responsive Workspace Owner', email: 'responsive@example.test', emailVerified: true }
  const context = await browser.newContext()
  await mockAuth(context, account, async route => json(route, { data: {} }))
  const page = await context.newPage()

  try {
    await signIn(page, account)
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard')
      await page.getByRole('heading', { name: 'Cash Flow Analysis' }).waitFor()
      await expect(page.getByText(/No cash flow data is available for \d{4}\./)).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (width === 390) {
        const menuButton = page.getByRole('button', { name: 'Open navigation menu' })
        await menuButton.click()
        await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
        await page.keyboard.press('Escape')
        await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
      }
      if (width === 1280) {
        const userMenuButton = page.getByTestId('user-menu-button')
        await userMenuButton.click()
        const logoutButton = page.getByRole('button', { name: 'Log Out' })
        await expect(logoutButton).toBeVisible()
        const menuCard = logoutButton.locator('xpath=ancestor::div[contains(@class, "rounded-xl")]')
        await expect.poll(async () => {
          const box = await menuCard.boundingBox()
          return box?.width ?? 0
        }).toBeGreaterThanOrEqual(285)
        await userMenuButton.click()
        await expect(logoutButton).toBeHidden()
      }
    }
  } finally {
    await context.close()
  }
})

test('dashboard summary cards and cash-flow chart fit with populated large values', async ({ browser }) => {
  const account = { id: 'populated_home_owner', name: 'Populated Home Owner', email: 'populated.home@example.test', emailVerified: true }
  const year = new Date().getFullYear()
  const money = amount => ({ amount, currency: 'USD' })
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/finance/overview')) {
      return json(route, { data: {
        payableOutstanding: money(9876543210987),
        cashFlow: Array.from({ length: 12 }, (_, index) => ({
          month: `${year}-${String(index + 1).padStart(2, '0')}`,
          inflow: money((index + 8) * 1_200_000_000),
          outflow: money((index + 3) * 700_000_000),
          net: money(((index + 8) * 1_200_000_000) - ((index + 3) * 700_000_000)),
        })),
      } })
    }
    if (path.endsWith('/crm/overview')) return json(route, { data: { pipeline: {
      openCount: 83,
      openTotal: money(12500000000000),
      openCountComparison: { previousCount: 71 },
      openTotalComparison: { previousTotal: money(11800000000000) },
    } } })
    return json(route, { data: { items: [] } })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Cash Flow Analysis' })).toBeVisible()
      await expect(page.locator('.recharts-surface').first()).toBeVisible()
      for (const label of ['Open Pipeline Value', 'Payables Outstanding']) {
        const card = page.locator('div.bg-surface-raised').filter({ has: page.getByText(label, { exact: true }) }).first()
        const metric = card.locator('p.text-3xl')
        await expect(metric).toBeVisible()
        const dimensions = await metric.evaluate(element => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: element.textContent,
        }))
        expect(dimensions.scrollWidth, `${dimensions.text} should fit at ${width}px`).toBeLessThanOrEqual(dimensions.clientWidth)
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  } finally {
    await context.close()
  }
})

test('all dashboard routes render without page overflow at phone, tablet, and desktop widths', async ({ browser }) => {
  test.setTimeout(180_000)
  const account = { id: 'route_audit_owner', name: 'Route Audit Owner', email: 'route.audit@example.test', emailVerified: true, role: 'ADMIN' }
  const context = await browser.newContext()
  const pageErrors = []
  await mockAuth(context, account, async route => json(route, { error: { message: 'Temporary test outage' } }, 503))
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(error.message))
  const routes = [
    '/dashboard', '/dashboard/hr/employees', '/dashboard/hr/payroll', '/dashboard/hr/time-attendance', '/dashboard/hr/recruitment',
    '/dashboard/finance', '/dashboard/finance/accounts-payable', '/dashboard/finance/accounts-receivable', '/dashboard/finance/expenses',
    '/dashboard/finance/trial-balance', '/dashboard/finance/reconciliation', '/dashboard/crm', '/dashboard/crm/deals',
    '/dashboard/crm/sales-performance', '/dashboard/crm/revenue-forecast', '/dashboard/inventory', '/dashboard/inventory/movements',
    '/dashboard/projects', '/dashboard/projects/sprints', '/dashboard/projects/roadmap', '/dashboard/settings',
    '/dashboard/settings/members', '/dashboard/settings/billing', '/dashboard/settings/integrations',
    '/dashboard/settings/notifications', '/dashboard/settings/data-export', '/dashboard/support',
  ]

  try {
    await signIn(page, account)
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of routes) {
        await page.evaluate(nextPath => {
          window.history.pushState({}, '', nextPath)
          window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
        }, path)
        await expect(page.getByRole('main').first(), `${path} should render its dashboard content`).toBeVisible({ timeout: 15_000 })
        await expect(page.getByRole('main'), `${path} should expose one main landmark`).toHaveCount(1)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      }
    }
    expect(pageErrors, `Unexpected browser errors: ${pageErrors.join('; ')}`).toEqual([])
  } finally {
    await context.close()
  }
})

test('CRM overview charts and dashboard actions fit phone, tablet, and desktop viewports', async ({ browser }) => {
  const account = { id: 'responsive_crm_owner', name: 'Responsive CRM Owner', email: 'responsive.crm@example.test', emailVerified: true }
  const year = new Date().getFullYear()
  const today = new Date().toISOString().slice(0, 10)
  const money = amount => ({ amount, currency: 'USD' })
  const pipeline = { openTotal: money(12500000000), openCount: 48, wonTotal: money(3400000), wonCount: 12, lostTotal: money(1800000), lostCount: 7,
    openCountComparison: { previousAsOfDate: today, previousCount: 41 }, openTotalComparison: { previousAsOfDate: today, previousTotal: money(10800000000) } }
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/crm/overview')) return json(route, { data: {
      pipeline, createdLast7Days: 8, winRate: 38.4,
      winRateComparison: { current: { startDate: `${year}-10-01`, endDateExclusive: today, wonCount: 12, lostCount: 19, rate: 38.4 }, previous: { startDate: `${year}-09-01`, endDateExclusive: `${year}-10-01`, wonCount: 11, lostCount: 20, rate: 35.5 } },
      monthlyWinRate: months.map((month, index) => ({ month, rate: 25 + index * 3, wonCount: index + 2, lostCount: 5 })),
      funnel: [
        { stage: 'LEADS', count: 96, value: money(18500000), share: 100 },
        { stage: 'PROPOSAL', count: 54, value: money(11200000), share: 56.25 },
        { stage: 'NEGOTIATION', count: 28, value: money(6800000), share: 29.17 },
        { stage: 'CLOSED_WON', count: 12, value: money(3400000), share: 12.5 },
        { stage: 'CLOSED_LOST', count: 7, value: money(1800000), share: 7.29 },
      ],
      stageConversions: [{ fromStage: 'LEADS', toStage: 'PROPOSAL', enteredCount: 96, convertedCount: 54, rate: 56 }, { fromStage: 'PROPOSAL', toStage: 'NEGOTIATION', enteredCount: 54, convertedCount: 28, rate: 52 }, { fromStage: 'NEGOTIATION', toStage: 'CLOSED_WON', enteredCount: 28, convertedCount: 12, rate: 43 }],
    } })
    if (path.endsWith('/crm/forecast')) return json(route, { data: {
      year: String(year), availableYears: [String(year)], forecastByRep: [], quotas: [],
      monthlyPipeline: months.map((month, index) => ({ month, value: money((12 - index) * 850000) })),
      monthlyCommit: months.map((month, index) => ({ month, value: money((12 - index) * 420000) })),
      monthlyWeightedPipeline: months.map((month, index) => ({ month, value: money((12 - index) * 310000) })),
      summary: { totalPipeline: money(12500000000), totalQuota: money(10000000000), totalCommit: money(4200000000), totalBestCase: money(7800000000), weightedPipeline: money(6900000000), unweightedPipeline: money(12500000000), unweightedDealCount: 48,
        dealCommit: money(4200000), dealBestCase: money(7800000), dealCommitCount: 11, dealBestCaseCount: 18, quotaAttainmentPct: 34, excludedQuotaCount: 0 },
    } })
    if (path.endsWith('/crm/sales-performance')) return json(route, { data: {
      year: String(year), yearWonTotal: money(3400000000), previousYearWonTotal: money(2750000000), undatedClosedCount: 0,
      monthlyClosedWon: months.map((month, index) => ({ month, value: money((index + 1) * 180000000), count: index + 1 })),
      weeklyActivity: [], byRep: [],
      summary: { totalWon: money(3400000000), totalWonCount: 12, totalLostCount: 19, overallWinRate: 38.4, averageSalesCycleDays: 41 },
    } })
    if (path.endsWith('/crm/agenda') || path.endsWith('/crm/activities')) return json(route, { data: { items: [] } })
    return json(route, { data: {} })
  })
  const page = await context.newPage()

  try {
    await signIn(page, account)
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard/crm')
      await expect(page.getByRole('heading', { name: 'Revenue Forecast' })).toBeVisible()
      await expect(page.locator('.recharts-surface').first()).toBeVisible()
      await expect(page.getByText('$125,000,000.00').first()).toBeVisible()
      await expect(page.getByText('$34,000,000.00').first()).toBeVisible()
      for (const value of ['$125,000,000.00', '$34,000,000.00']) {
        const metric = page.getByText(value).first()
        const dimensions = await metric.evaluate(element => ({ text: element.textContent, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, fontSize: getComputedStyle(element).fontSize }))
        expect(dimensions.scrollWidth, `${value} should fit its KPI card at ${width}px (${JSON.stringify(dimensions)})`).toBeLessThanOrEqual(dimensions.clientWidth)
      }
      await expect.poll(() => page.evaluate(width => {
        const header = document.querySelector('header')
        return header.scrollWidth <= header.clientWidth && document.documentElement.scrollWidth <= width
      }, width)).toBe(true)
    }
  } finally {
    await context.close()
  }
})

test('finance overview shows the empty cash-flow state and fits phone and tablet widths', async ({ browser }) => {
  const account = { id: 'responsive_finance_owner', name: 'Responsive Finance Owner', email: 'responsive.finance@example.test', emailVerified: true }
  const currentYear = new Date().getFullYear()
  const money = { amount: 0, currency: 'USD' }
  const period = year => ({ startDate: `${year}-01-01`, endDateExclusive: `${year + 1}-01-01`, inflow: money, outflow: money, net: money })
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/finance/overview')) return json(route, { data: {
      payableOutstanding: money,
      receivableOutstanding: money,
      expensesTotal: money,
      expensesPendingCount: 0,
      expensesPendingTotal: money,
      cashFlow: [],
      cashFlowComparison: { current: period(currentYear), previous: period(currentYear - 1) },
      recentTransactions: [],
    } })
    return json(route, { data: { items: [] } })
  })
  const page = await context.newPage()

  try {
    await signIn(page, account)
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard/finance')
      await expect(page.getByText(`No cash flow data is available for ${currentYear}.`)).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  } finally {
    await context.close()
  }
})

test('finance overview keeps populated currency KPIs and charts inside phone, tablet, and desktop layouts', async ({ browser }) => {
  const account = { id: 'populated_finance_owner', name: 'Populated Finance Owner', email: 'populated.finance@example.test', emailVerified: true }
  const year = new Date().getFullYear()
  const money = amount => ({ amount, currency: 'USD' })
  const period = (periodYear, netAmount) => ({
    startDate: `${periodYear}-01-01`, endDateExclusive: `${periodYear + 1}-01-01`,
    inflow: money(20000000000), outflow: money(12500000000), net: money(netAmount),
  })
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/finance/overview')) return json(route, { data: {
      payableOutstanding: money(4000000000), receivableOutstanding: money(12500000000), expensesTotal: money(6500000000),
      expensesPendingCount: 4, expensesPendingTotal: money(1200000000),
      cashFlow: Array.from({ length: 12 }, (_, index) => {
        const month = `${year}-${String(index + 1).padStart(2, '0')}`
        const inflow = money((index + 4) * 1200000000)
        const outflow = money((index + 2) * 800000000)
        return { month, inflow, outflow, net: money(inflow.amount - outflow.amount) }
      }),
      cashFlowComparison: { current: period(year, 7500000000), previous: period(year - 1, 6900000000) },
      recentTransactions: [{ id: 'tx-long-description', date: `${year}-10-05`, description: 'International enterprise services annual settlement', amount: money(12500000000), type: 'credit', status: 'CLEARED' }],
    } })
    if (path.endsWith('/finance/customers')) return json(route, { data: { items: [] } })
    if (path.endsWith('/finance/receivables')) return json(route, { data: { items: [], pagination: { page: 1, limit: 1, total: 0, pages: 0 }, summary: { collectedThisMonthTotal: money(3200000000), collectedThisMonthComparison: { previousTotal: money(2900000000) } } } })
    if (path.endsWith('/finance/payables')) return json(route, { data: { items: [], pagination: { page: 1, limit: 1, total: 0, pages: 0 }, summary: { paidThisMonthTotal: money(2100000000), paidThisMonthComparison: { previousTotal: money(1700000000) } } } })
    return json(route, { data: {} })
  })
  const page = await context.newPage()

  try {
    await signIn(page, account)
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard/finance')
      await expect(page.getByRole('heading', { name: 'Cash Flow Analysis' })).toBeVisible()
      await expect(page.locator('.recharts-surface').first()).toBeVisible()
      for (const value of ['$125,000,000.00', '$40,000,000.00', '$65,000,000.00', '$75,000,000.00']) {
        const metric = page.getByText(value, { exact: true })
        await expect(metric).toBeVisible()
        const dimensions = await metric.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, fontSize: getComputedStyle(element).fontSize }))
        expect(dimensions.scrollWidth, `${value} should fit at ${width}px (${JSON.stringify(dimensions)})`).toBeLessThanOrEqual(dimensions.clientWidth)
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  } finally {
    await context.close()
  }
})

test('active sprint burndown chart fits phone, tablet, and desktop layouts with populated history', async ({ browser }) => {
  const account = { id: 'sprint_chart_admin', name: 'Sprint Chart Admin', email: 'sprint.chart@example.test', emailVerified: true, role: 'ADMIN' }
  const context = await browser.newContext()
  const start = new Date('2026-09-01T00:00:00.000Z')
  const points = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(start)
    day.setUTCDate(day.getUTCDate() + index)
    return {
      date: day.toISOString().slice(0, 10),
      remaining: Math.max(0, 32 - index),
      ideal: Number((32 * (1 - index / 29)).toFixed(1)),
    }
  })
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/projects/sprints') && route.request().method() === 'GET') {
      return json(route, { data: { items: [{
        id: 'sprint_chart_1', name: 'September delivery sprint', status: 'ACTIVE', projectId: 'project_chart_1',
        startsAt: start.toISOString(), endsAt: '2026-09-30T23:59:59.000Z', completionPct: 9,
        issueCounts: { total: 32, done: 3 },
        velocity: { completedStoryPoints: 8, estimatedCompletedIssues: 3, unestimatedCompletedIssues: 0 },
        createdAt: start.toISOString(), updatedAt: start.toISOString(),
      }] } })
    }
    if (url.pathname.endsWith('/sprints/sprint_chart_1/burndown')) {
      return json(route, { data: {
        sprintId: 'sprint_chart_1', sprintName: 'September delivery sprint', startDate: '2026-09-01',
        totalScope: 32, completed: 3, undatedCompleted: 1, points,
      } })
    }
    if (url.pathname.endsWith('/sprints/sprint_chart_1/issues')) return json(route, { data: { items: [] } })
    return json(route, { data: {} })
  })

  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/projects/sprints')
    const chartCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sprint burndown' }) })
    const chart = chartCard.locator('.recharts-surface')
    await expect(chart).toBeVisible()
    await expect(chart.locator('.recharts-line-curve')).toHaveCount(2)

    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const cardBounds = await chartCard.boundingBox()
      const chartBounds = await chart.boundingBox()
      expect(chartBounds.x).toBeGreaterThanOrEqual(cardBounds.x)
      expect(chartBounds.x + chartBounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width + 1)
      const tickBounds = await chartCard.evaluate(element => {
        const card = element.getBoundingClientRect()
        const labels = [...element.querySelectorAll('svg text')]
        return {
          count: labels.length,
          outside: labels.flatMap(label => {
          const bounds = label.getBoundingClientRect()
            return bounds.left < card.left || bounds.right > card.right
              ? [{ text: label.textContent, left: bounds.left, right: bounds.right, cardLeft: card.left, cardRight: card.right }]
              : []
          }),
        }
      })
      expect(tickBounds.count).toBeGreaterThan(0)
      expect(tickBounds.outside).toEqual([])
    }
  } finally {
    await context.close()
  }
})

test('project portfolio keeps populated budget figures and its detail panel usable on narrow screens', async ({ browser }) => {
  const account = { id: 'portfolio_review_admin', name: 'Portfolio Review Admin', email: 'portfolio.review@example.test', emailVerified: true, role: 'ADMIN' }
  const context = await browser.newContext()
  const totalBudget = { amount: 12500000000000, currency: 'USD' }
  const spent = { amount: 9876543210987, currency: 'USD' }
  const projectName = 'International Operations Consolidation and Workforce Modernization Program'
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/projects/portfolio')) return json(route, { data: {
      items: [{
        projectId: 'portfolio_project_1', name: projectName, status: 'ACTIVE', spent,
        unvaluedSettlementCount: 0, budget: totalBudget, utilizationPct: 78.9,
      }],
      summary: {
        totalProjects: 11, activeProjects: 7, totalSpent: spent, unvaluedSettlementCount: 0,
        unassignedSettlementCount: 0, totalBudget, utilizationPct: 78.9,
      },
    } })
    if (url.pathname.endsWith('/projects/sprints')) return json(route, { data: { items: [] } })
    if (url.pathname.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    if (url.pathname.endsWith('/projects/portfolio_project_1/sprint-velocity-comparison')) return json(route, { data: {
      projectId: 'portfolio_project_1', current: null, previous: null, deltaStoryPoints: null, deltaPct: null,
    } })
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard/projects')
      await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible()
      const budgetKpiCard = page.getByText('Total Budget', { exact: true }).locator('..')
      const budgetKpi = budgetKpiCard.locator('p.text-3xl')
      await expect(budgetKpi).toBeVisible()
      const budgetCardBounds = await budgetKpiCard.boundingBox()
      const kpiBounds = await budgetKpi.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, right: bounds.right }
      })
      expect(kpiBounds.scrollWidth, `Portfolio budget KPI should fit at ${width}px`).toBeLessThanOrEqual(kpiBounds.clientWidth)
      expect(kpiBounds.right, `Portfolio budget KPI should stay inside its card at ${width}px`).toBeLessThanOrEqual(budgetCardBounds.x + budgetCardBounds.width)
      const panelHeading = page.getByRole('heading', { name: projectName })
      await expect(panelHeading).toBeVisible()
      const panelBounds = await panelHeading.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))
      expect(panelBounds.scrollWidth, `Project detail heading should fit at ${width}px`).toBeLessThanOrEqual(panelBounds.clientWidth)
      const financialCard = page.getByRole('heading', { name: 'Financial Health' }).locator('..')
      const financialCardBounds = await financialCard.boundingBox()
      const financialValues = await financialCard.locator('p.text-2xl').evaluateAll(elements => elements.map(element => {
        const bounds = element.getBoundingClientRect()
        return {
          text: element.textContent,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          left: bounds.left,
          right: bounds.right,
        }
      }))
      expect(financialValues).toHaveLength(2)
      for (const value of financialValues) {
        expect(value.scrollWidth, `${value.text} should fit in the project detail card at ${width}px`).toBeLessThanOrEqual(value.clientWidth)
        expect(value.left, `${value.text} should stay inside the project detail card at ${width}px`).toBeGreaterThanOrEqual(financialCardBounds.x)
        expect(value.right, `${value.text} should stay inside the project detail card at ${width}px`).toBeLessThanOrEqual(financialCardBounds.x + financialCardBounds.width)
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  } finally {
    await context.close()
  }
})

test('two workspaces can manage billing concurrently without seeing each other\'s card or portal session', async ({ browser }) => {
  const accounts = [
    { id: 'northwind_billing', name: 'Northwind Billing', email: 'northwind.billing@example.test', emailVerified: true, card: '4242', brand: 'visa' },
    { id: 'contoso_billing', name: 'Contoso Billing', email: 'contoso.billing@example.test', emailVerified: true, card: '5555', brand: 'mastercard' },
  ]
  const contexts = await Promise.all(accounts.map(() => browser.newContext()))
  const pages = await Promise.all(contexts.map(context => context.newPage()))
  const portalUrls = accounts.map(account => `https://billing.stripe.com/${account.id}`)

  try {
    await Promise.all(contexts.map((context, index) => {
      const account = accounts[index]
      const portalUrl = portalUrls[index]
      return mockAuth(context, account, async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/settings/billing')) {
          return json(route, { data: {
            stripePortalAvailable: true,
            subscriptions: [{ id: `sub_${account.id}`, planName: `${account.name} Plan`, priceMonthly: '10.00', currency: 'USD', priceId: 'price_basic', status: 'ACTIVE', renewsOn: null, seatsUsed: 2, seatLimit: 10, storageUsedGb: 1, storageLimitGb: 100 }],
            paymentMethods: [{ id: `pm_${account.id}`, brand: account.brand, last4: account.card, expires: '08/2030' }],
            invoices: [],
          } })
        }
        if (path.endsWith('/billing/plans')) {
          return json(route, { data: { enabled: true, items: [{ priceId: 'price_basic', name: 'Basic', amount: '10.00', currency: 'USD', interval: 'month', seatLimit: 10, storageLimitGb: 100 }] } })
        }
        if (path.endsWith('/billing/portal')) return json(route, { data: { url: portalUrl } })
        return json(route, { data: {} })
      })
    }))
    await Promise.all(pages.map((page, index) => signIn(page, accounts[index])))
    await Promise.all(pages.map(page => page.goto('/dashboard/settings/billing')))

    await Promise.all(accounts.map(async (account, index) => {
      await expect(pages[index].getByText(new RegExp(`${account.name} Plan`))).toBeVisible()
      await expect(pages[index].getByText(new RegExp(`${account.brand} ending in ${account.card}`, 'i'))).toBeVisible()
      const other = accounts[1 - index]
      await expect(pages[index].getByText(new RegExp(`${other.name} Plan`))).toHaveCount(0)
      await expect(pages[index].getByText(new RegExp(`${other.brand} ending in ${other.card}`, 'i'))).toHaveCount(0)
    }))

    await Promise.all(pages.map(async (page, index) => {
      await page.route(portalUrls[index], route => route.fulfill({ status: 200, contentType: 'text/html', body: `<title>${accounts[index].name} portal</title>` }))
      await page.getByRole('button', { name: 'Manage billing' }).click()
    }))
    await Promise.all(pages.map(async (page, index) => {
      await expect(page).toHaveURL(portalUrls[index])
      await expect(page).toHaveTitle(`${accounts[index].name} portal`)
    }))
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('payroll keeps employee selections across pages and recovers an uncertain create request after reload', async ({ browser }) => {
  const account = { id: 'payroll_admin', name: 'Payroll Admin', email: 'payroll.admin@example.test', emailVerified: true, role: 'ADMIN' }
  const context = await browser.newContext()
  const submittedRequests = []
  let failFirstCreate = true
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/hr/payroll/runs') && route.request().method() === 'GET') {
      return json(route, { data: { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 }, summary: {} } })
    }
    if (path.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    if (path.endsWith('/hr/employees')) {
      const page = Number(url.searchParams.get('page') || 1)
      const employees = page === 1
        ? Array.from({ length: 25 }, (_, index) => ({ id: `employee_${String(index + 1).padStart(3, '0')}`, name: `Payroll Employee ${index + 1}`, title: 'Analyst' }))
        : [{ id: 'employee_026', name: 'Payroll Employee 26', title: 'Analyst' }]
      return json(route, { data: { items: employees, pagination: { page, limit: 25, total: 26, pages: 2 }, summary: {} } })
    }
    if (path.endsWith('/hr/payroll/runs') && route.request().method() === 'POST') {
      submittedRequests.push(route.request().postDataJSON())
      if (failFirstCreate) {
        failFirstCreate = false
        return json(route, { error: { message: 'Connection interrupted after submission.' } }, 503)
      }
      return json(route, { data: { id: 'run_1234567890' } }, 201)
    }
    return json(route, { data: {} })
  })

  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/hr/payroll')
    await page.getByRole('button', { name: 'New Payroll Run' }).click()
    await expect(page.getByText('Payroll Employee 1', { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Payroll Employee 1 Analyst' }).check()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Payroll Employee 26', { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Payroll Employee 26 Analyst' }).check()
    await expect(page.getByText('(2 selected)')).toBeVisible()
    await page.locator('#payroll-run-label').fill('October payroll retry')
    await page.getByLabel('Unspecified salary basis').selectOption('MONTHLY')
    await page.getByLabel('Earning period start').fill('2026-10-01')
    await page.getByLabel('Earning period end').fill('2026-10-31')
    await page.getByRole('button', { name: 'Create run' }).click()
    await expect(page.getByRole('alert')).toContainText('Connection interrupted')
    expect(submittedRequests).toHaveLength(1)
    const originalRequest = submittedRequests[0]
    expect(originalRequest.employeeIds).toEqual(['employee_001', 'employee_026'])

    await page.reload()
    await page.getByRole('button', { name: 'New Payroll Run' }).click()
    await expect(page.getByRole('status')).toContainText('Retry unchanged')
    await expect(page.locator('#payroll-run-label')).toHaveValue('October payroll retry')
    await page.getByRole('button', { name: 'Create run' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(submittedRequests).toHaveLength(2)
    expect(submittedRequests[1].requestKey).toBe(originalRequest.requestKey)
    expect(submittedRequests[1].employeeIds).toEqual(originalRequest.employeeIds)
  } finally {
    await context.close()
  }
})

test('workspace admin can edit employee salary, basis, and employment end date', async ({ browser }) => {
  const account = { id: 'employee_admin', name: 'Employee Admin', email: 'employee.admin@example.test', emailVerified: true, role: 'ADMIN' }
  const employee = {
    id: 'employee_001', name: 'Alex Employee', title: 'Analyst', email: null, location: null,
    departmentId: null, department: null, managerId: null, manager: null, status: 'ACTIVE',
    avatarUrl: null, hiredAt: '2024-01-01T00:00:00.000Z', employmentEndDate: null, salary: '70000.00', salaryBasis: 'MONTHLY', salaryEffectiveFrom: '2024-01-01',
    salaryHistory: [{ salary: '70000.00', salaryBasis: 'MONTHLY', currency: 'USD', effectiveFrom: '2024-01-01' }],
    equityOptions: null, band: null, employeeNumber: null,
  }
  let updatePayload = null
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const method = route.request().method()
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    if (path.endsWith('/hr/employees') && method === 'GET') {
      return json(route, { data: { items: [employee], pagination: { page: 1, limit: 25, total: 1, pages: 1 }, summary: { totalHeadcount: 1, onLeaveCount: 0, hiredThisMonth: 0, hiredPreviousMonthToDate: 0, openRoles: 0 } } })
    }
    if (path.endsWith('/hr/employees/employee_001') && method === 'PATCH') {
      updatePayload = route.request().postDataJSON()
      return json(route, { data: { ...employee, ...updatePayload } })
    }
    if (path.endsWith('/audit-logs')) return json(route, { data: { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } })
    return json(route, { data: {} })
  })
  const page = await context.newPage()

  try {
    await signIn(page, account)
    await page.goto('/dashboard/hr/employees')
    await expect(page.getByRole('heading', { name: 'Alex Employee' })).toBeVisible()
    await page.getByRole('button', { name: 'Edit profile' }).click()
    await page.getByRole('spinbutton', { name: 'Salary' }).fill('80000.00')
    await page.getByRole('combobox', { name: /Salary basis/ }).selectOption('ANNUAL')
    await page.getByLabel('Salary effective from').fill('2026-10-17')
    await page.getByLabel('Employment end date').fill('2026-11-30')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => updatePayload).not.toBeNull()
    expect(updatePayload.salary).toBe('80000.00')
    expect(updatePayload.salaryBasis).toBe('ANNUAL')
    expect(updatePayload.employmentEndDate).toBe('2026-11-30')
    expect(updatePayload.salaryEffectiveFrom).toBe('2026-10-17')
  } finally {
    await context.close()
  }
})

test('workspace admin can review earning-year payroll rounding differences', async ({ browser }) => {
  const account = { id: 'rounding_admin', name: 'Rounding Admin', email: 'rounding.admin@example.test', emailVerified: true, role: 'ADMIN' }
  let reconciliationMethod = null
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/hr/payroll/runs') && route.request().method() === 'GET') {
      return json(route, { data: { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 }, summary: {} } })
    }
    if (path.endsWith('/hr/payroll/rounding-reconciliation')) {
      reconciliationMethod = route.request().method()
      return json(route, { data: {
        year: Number(url.searchParams.get('year')),
        excludedManualOverrideLines: 1,
        excludedUnknownCurrencyLines: 0,
        groups: [{
          employeeId: 'clxxxxxxxxxxxxxxxxxxxxxxx', employeeName: 'Ada Lovelace', currency: 'USD',
          taxRates: [{ label: 'Pension', rate: '0.9' }], paidLineCount: 2,
          grossTotal: '10.00', recordedDeductions: '0.10', aggregateRoundedDeductions: '0.09', variance: '0.01',
          taxLines: [{ label: 'Pension', recorded: '0.10', aggregateRounded: '0.09', variance: '0.01' }],
        }],
      } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/hr/payroll')
    await page.getByRole('button', { name: 'Calculators' }).click()
    await page.getByRole('menuitem', { name: /Year-end rounding review/ }).click()
    await expect(page.getByRole('heading', { name: 'Earning-year rounding review' })).toBeVisible()
    await expect(page.getByText('Ada Lovelace')).toBeVisible()
    await expect(page.getByText(/not a statutory tax calculation/i)).toBeVisible()
    await expect(page.getByText(/1 line with manual tax overrides excluded/)).toBeVisible()
    expect(reconciliationMethod).toBe('GET')
  } finally {
    await context.close()
  }
})

test('recruitment candidates are server-paginated and role choices remain complete', async ({ browser }) => {
  const account = { id: 'recruitment_admin', name: 'Recruitment Admin', email: 'recruitment@example.test', emailVerified: true, role: 'ADMIN' }
  const firstPage = Array.from({ length: 8 }, (_, index) => ({
    id: `candidate_page_one_${index}`,
    name: `Candidate ${String(index + 1).padStart(2, '0')}`,
    role: 'Engineer', stage: 'APPLIED', stageEnteredAt: '2026-10-01T00:00:00.000Z', timeInStage: '11d', activity: [],
    appliedAt: '2026-10-01T00:00:00.000Z', avatarUrl: null, currentRole: null, experience: null, source: null,
    location: null, email: null, education: null, resumeUrl: null,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  }))
  const lastCandidate = {
    ...firstPage[0], id: 'candidate_page_two', name: 'Candidate 09', role: 'Designer',
  }
  const summary = {
    stageCounts: { APPLIED: 9, SCREENING: 0, TECH_INTERVIEW: 0, FINAL_INTERVIEW: 0, OFFER_SENT: 0, HIRED: 0, REJECTED: 0 },
    activeCandidates: 9, totalHired: 0, hiredThisPeriod: 0, hiredPreviousPeriod: 0,
    averageTimeToHireDays: null, averageTimeToHireThisPeriod: null, averageTimeToHirePreviousPeriod: null,
    offerAcceptanceRate: null, offerAcceptanceRateThisPeriod: null, offerAcceptanceRatePreviousPeriod: null,
    offersDecided: 0, offersDecidedThisPeriod: 0, offersDecidedPreviousPeriod: 0,
  }
  const requested = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/hr/candidates') && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const role = url.searchParams.get('role')
      const search = url.searchParams.get('search')
      requested.push({ page: pageNumber, role, search, limit: Number(url.searchParams.get('limit')) })
      const items = role === 'Designer' || search?.toLowerCase().includes('designer')
        ? [lastCandidate]
        : pageNumber === 1 ? firstPage : [lastCandidate]
      const total = role === 'Designer' || search?.toLowerCase().includes('designer') ? 1 : 9
      const pages = Math.ceil(total / 8)
      return json(route, { data: {
        items,
        pagination: { page: pageNumber, limit: 8, total, pages },
        summary,
        roleOptions: ['Designer', 'Engineer'],
      } })
    }
    if (path.includes('/hr/candidates/') && path.endsWith('/interviews')) return json(route, { data: [] })
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/hr/recruitment')
    await expect(page.getByText('Candidate 08', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–8 of 9 candidates')).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 8)).toBe(true)
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
    await expect(page.getByText('Candidate 09', { exact: true })).toBeVisible()
    await page.getByRole('combobox', { name: 'Filter by candidate role' }).selectOption('Designer')
    await expect(page.getByText('Candidate 09', { exact: true })).toBeVisible()
    await expect.poll(() => requested.some(item => item.page === 1 && item.role === 'Designer')).toBe(true)
  } finally {
    await context.close()
  }
})

test('expense entry can find and select employees beyond the first page', async ({ browser }) => {
  const account = { id: 'expense_admin', name: 'Expense Admin', email: 'expense.admin@example.test', emailVerified: true, role: 'ADMIN' }
  const employeesPageOne = Array.from({ length: 25 }, (_, index) => ({
    id: `employee_${String(index + 1).padStart(2, '0')}`,
    name: `Employee ${String(index + 1).padStart(2, '0')}`,
    status: 'ACTIVE',
  }))
  const employeeTwentySix = { id: 'employee_26', name: 'Employee 26', status: 'ACTIVE' }
  const requested = []
  const expenseRequests = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/finance/expenses') && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit'))
      expenseRequests.push({ page: pageNumber, limit })
      const makeExpense = index => ({
        id: `expense_${index}`, projectId: null, employeeId: null, employee: `Employee ${index}`,
        name: `Expense ${index}`, category: 'OFFICE', merchant: `Merchant ${index}`,
        date: '2026-10-01T00:00:00.000Z', amount: { amount: 1250, currency: 'USD' }, tax: null,
        policyMatch: null, status: 'PENDING', reimbursedAt: null, reimbursedById: null,
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      })
      const expenses = limit >= 26 ? Array.from({ length: 26 }, (_, index) => makeExpense(index + 1)) : (pageNumber === 1 ? Array.from({ length: 25 }, (_, index) => makeExpense(index + 1)) : [makeExpense(26)])
      return json(route, { data: {
        items: expenses, pagination: { page: pageNumber, limit, total: 26, pages: limit >= 26 ? 1 : 2 },
        summary: { pendingCount: 0, pendingTotal: { amount: 0, currency: 'USD' }, approvedTotal: { amount: 0, currency: 'USD' }, flaggedTotal: { amount: 0, currency: 'USD' } },
      } })
    }
    if (path.endsWith('/hr/employees') && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const search = url.searchParams.get('search')
      requested.push({ page: pageNumber, search, limit: Number(url.searchParams.get('limit')) })
      const isEmployeeTwentySix = pageNumber === 2 || search?.toLowerCase().includes('employee 26')
      return json(route, { data: {
        items: isEmployeeTwentySix ? [employeeTwentySix] : employeesPageOne,
        pagination: { page: pageNumber, limit: 25, total: 26, pages: 2 },
        summary: { totalHeadcount: 26, onLeaveCount: 0, openRoles: 0, hiredThisMonth: 0, hiredPreviousMonthToDate: 0 },
      } })
    }
    if (path.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/finance/expenses')
    await expect(page.getByText('Showing 26 of 26 expenses')).toBeVisible()
    await expect(page.getByText('Merchant 26', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'New Expense' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const employeeSelect = page.getByRole('combobox', { name: 'Expense employee' })
    await expect(employeeSelect.locator('option', { hasText: 'Employee 26' })).toHaveCount(1)
    await employeeSelect.selectOption('employee_26')
    await expect(employeeSelect).toHaveValue('employee_26')
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    await page.getByRole('searchbox', { name: 'Search employees' }).fill('Employee 26')
    await expect.poll(() => requested.some(item => item.search === 'Employee 26' && item.page === 1)).toBe(true)
    await expect(employeeSelect.locator('option', { hasText: 'Employee 26' })).toHaveCount(1)
    await expect(employeeSelect).toHaveValue('employee_26')
  } finally {
    await context.close()
  }
})

test('accounts payable pages open bills and exposes paid history', async ({ browser }) => {
  const account = { id: 'payables_admin', name: 'Payables Admin', email: 'payables.admin@example.test', emailVerified: true, role: 'ADMIN' }
  const requested = []
  const projectRequests = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/finance/payables') && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const statusGroup = url.searchParams.get('statusGroup')
      requested.push({ page: pageNumber, statusGroup, limit: Number(url.searchParams.get('limit')), dateRange: url.searchParams.get('dateRange') })
      const history = statusGroup === 'HISTORY'
      const items = history
        ? [{ id: 'bill_paid', vendor: 'Historical Vendor', vendorId: null, invoiceNumber: 'PAID-001', date: '2026-09-05T00:00:00.000Z', dueDate: null, amount: { amount: 5000, currency: 'USD' }, status: 'PAID' }]
        : [
            ...Array.from({ length: 8 }, (_, index) => ({ id: `bill_${index + 1}`, vendor: `Vendor ${index + 1}`, vendorId: null, invoiceNumber: `OPEN-${index + 1}`, date: '2026-10-01T00:00:00.000Z', dueDate: null, amount: { amount: 1000, currency: 'USD' }, status: 'PENDING' })),
            { id: 'bill_09', vendor: 'Last Open Vendor', vendorId: null, invoiceNumber: 'OPEN-009', date: '2026-10-02T00:00:00.000Z', dueDate: null, amount: { amount: 2000, currency: 'USD' }, status: 'PENDING' },
          ]
      return json(route, { data: { items, pagination: { page: 1, limit: 100, total: items.length, pages: 1 }, summary: {
        openOutstanding: { amount: 27000, currency: 'USD' }, pendingCount: 9, pendingTotal: { amount: 27000, currency: 'USD' }, scheduledCount: 0, scheduledTotal: { amount: 0, currency: 'USD' }, paidCount: 1, paidTotal: { amount: 5000, currency: 'USD' }, rejectedCount: 0, rejectedTotal: { amount: 0, currency: 'USD' }, voidCount: 0, voidTotal: { amount: 0, currency: 'USD' }, pastDueTotal: { amount: 0, currency: 'USD' }, dueIn7DaysTotal: { amount: 0, currency: 'USD' }, paidThisMonthTotal: { amount: 0, currency: 'USD' }, paidThisMonthComparison: null,
      } } })
    }
    if (path.endsWith('/finance/vendors')) return json(route, { data: { items: [] } })
    if (path.endsWith('/projects')) {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit'))
      const search = url.searchParams.get('search')
      projectRequests.push({ page: pageNumber, limit, search })
      const makeProject = index => ({ id: `project_${index}`, name: `Project ${index}`, status: 'ACTIVE', department: null, budget: null, spent: null, currency: 'USD', sprintCount: 0, createdAt: '2026-01-01T00:00:00.000Z' })
      const items = search ? [makeProject(26)] : pageNumber === 1 ? Array.from({ length: 25 }, (_, index) => makeProject(index + 1)) : [makeProject(26)]
      return json(route, { data: { items, pagination: { page: pageNumber, limit, total: search ? 1 : 26, pages: search ? 1 : 2 } } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/dashboard/finance/accounts-payable')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await expect(page.getByText('Vendor 8', { exact: true })).toBeVisible()
    await expect(page.getByText('Last Open Vendor', { exact: true })).toBeVisible()
    await page.getByText('Last Open Vendor', { exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Last Open Vendor' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Payables view' }).selectOption('HISTORY')
    await expect.poll(() => requested.some(item => item.statusGroup === 'HISTORY')).toBe(true)
    await expect(page.getByRole('heading', { name: 'Historical Vendor' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'PAID', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'New Bill' }).click()
    await page.getByRole('button', { name: 'Next project page' }).click()
    await expect.poll(() => projectRequests.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    const projectSelect = page.getByRole('combobox', { name: 'Project' })
    await projectSelect.selectOption('project_26')
    await page.getByRole('searchbox', { name: 'Search projects' }).fill('Project 26')
    await expect.poll(() => projectRequests.some(item => item.search === 'Project 26' && item.page === 1)).toBe(true)
    await expect(projectSelect).toHaveValue('project_26')
    await expect(projectSelect.locator('option')).toContainText(['Project 26'])
  } finally {
    await context.close()
  }
})

test('accounts receivable pages all open invoices for the selected customer', async ({ browser }) => {
  const account = { id: 'receivables_admin', name: 'Receivables Admin', email: 'receivables.admin@example.test', emailVerified: true, role: 'ADMIN' }
  const requested = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/finance/customers') && route.request().method() === 'GET') {
      return json(route, { data: { items: [{ id: 'customer_1', name: 'Customer One', email: null, avatarUrl: null, collectionStatus: 'CURRENT', openBalance: { amount: 11000, currency: 'USD' }, oldestOverdueDays: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] } })
    }
    if (path.endsWith('/finance/receivables') && route.request().method() === 'GET') {
      const customerId = url.searchParams.get('customerId')
      if (!customerId) return json(route, { data: { items: [], pagination: { page: 1, limit: 1, total: 11, pages: 11 }, summary: {
        openBalance: { amount: 11000, currency: 'USD' }, collectedThisMonthTotal: null, collectedThisMonthComparison: { previousStartDate: '2026-09-01', previousEndDateExclusive: '2026-09-13', previousTotal: null },
        agingBuckets: ['current', '1-30', '31-60', '60+'].map(bucket => ({ bucket, count: 0, total: { amount: 0, currency: 'USD' } })), currentCount: 0, currentTotal: { amount: 0, currency: 'USD' }, overdueCount: 0, overdueTotal: { amount: 0, currency: 'USD' }, inCollectionsCount: 0, inCollectionsTotal: { amount: 0, currency: 'USD' }, paidCount: 0, paidTotal: { amount: 0, currency: 'USD' }, voidCount: 0, voidTotal: { amount: 0, currency: 'USD' },
      } } })
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const statusGroup = url.searchParams.get('statusGroup')
      const limit = Number(url.searchParams.get('limit'))
      requested.push({ customerId, page: pageNumber, statusGroup, limit })
      const items = pageNumber === 1
        ? Array.from({ length: 10 }, (_, index) => ({ id: `invoice_${index + 1}`, customerId, customer: 'Customer One', number: `INV-${String(index + 1).padStart(2, '0')}`, amount: { amount: 1000, currency: 'USD' }, dueDate: '2026-11-01T00:00:00.000Z', daysPastDue: 0, status: 'CURRENT', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }))
        : [{ id: 'invoice_11', customerId, customer: 'Customer One', number: 'INV-11', amount: { amount: 1000, currency: 'USD' }, dueDate: '2026-11-01T00:00:00.000Z', daysPastDue: 0, status: 'CURRENT', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }]
      return json(route, { data: { items, pagination: { page: pageNumber, limit, total: 11, pages: 2 }, summary: {} } })
    }
    if (path.endsWith('/activities')) return json(route, { data: { items: [] } })
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/finance/accounts-receivable')
    await expect(page.getByRole('heading', { name: 'Customer One' })).toBeVisible()
    await expect(page.getByText('INV-10', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–10 of 11')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => requested.some(item => item.customerId === 'customer_1' && item.page === 2 && item.limit === 10 && item.statusGroup === 'OPEN')).toBe(true)
    await expect(page.getByText('INV-11', { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('payroll run selector can reach runs beyond the first page', async ({ browser }) => {
  const account = { id: 'payroll_pages_admin', name: 'Payroll Admin', email: 'payroll.pages@example.test', emailVerified: true, role: 'ADMIN' }
  const requested = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    if (path.endsWith('/hr/payroll/runs') && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit'))
      requested.push({ page: pageNumber, limit })
      const items = pageNumber === 1
        ? Array.from({ length: 25 }, (_, index) => ({ id: `run_${index + 1}`, label: `Payroll Run ${index + 1}`, payDate: '2026-10-01', status: 'DRAFT', lineCount: 0, createdAt: '2026-10-01T00:00:00.000Z' }))
        : [{ id: 'run_26', label: 'Payroll Run 26', payDate: '2026-10-01', status: 'DRAFT', lineCount: 0, createdAt: '2026-10-01T00:00:00.000Z' }]
      return json(route, { data: { items, pagination: { page: pageNumber, limit, total: 26, pages: 2 }, summary: {
        totalRuns: 26, lineCount: 0, pendingCount: 0, totalGross: '0', totalNet: '0', paidThisMonthTotal: null,
        paidThisMonthComparison: { previousStartDate: '2026-09-01', previousEndDateExclusive: '2026-09-13', previousTotal: null },
      } } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/hr/payroll')
    const runSelect = page.getByRole('combobox', { name: 'Payroll run' })
    await expect(runSelect.locator('option')).toHaveCount(25)
    await page.getByRole('button', { name: 'Next payroll run page' }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    await expect(runSelect).toHaveValue('run_26')
    await expect(runSelect.locator('option')).toHaveCount(1)
    await expect(page.getByText('2/2')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('product catalog pages beyond the first 100-row cap', async ({ browser }) => {
  const account = { id: 'inventory_admin', name: 'Inventory Admin', email: 'inventory.admin@example.test', emailVerified: true, role: 'ADMIN' }
  const requested = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/inventory/products') && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit'))
      requested.push({ page: pageNumber, limit, search: url.searchParams.get('search'), status: url.searchParams.get('status'), archived: url.searchParams.get('archived') })
      const makeProduct = index => ({ id: `product_${index}`, name: `Product ${index}`, sku: `SKU-${index}`, price: '12.50', stock: 20, status: 'IN_STOCK', warehouse: 'Main', aisle: null, bin: null, avgMonthlyUsage: null, leadTimeDays: null, minThreshold: 5, archivedAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' })
      const items = pageNumber === 1 ? Array.from({ length: 25 }, (_, index) => makeProduct(index + 1)) : [makeProduct(26)]
      return json(route, { data: { items, pagination: { page: pageNumber, limit, total: 26, pages: 2 }, summary: {} } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/dashboard/inventory')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const table = page.getByRole('table')
    await expect(table.getByText('Product 25', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–25 of 26 products')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    await expect(table.getByText('Product 26', { exact: true })).toBeVisible()
    await table.getByText('Product 26', { exact: true }).click()
    const archiveButton = page.getByRole('button', { name: 'Archive Product' })
    await archiveButton.click()
    const confirmation = page.getByRole('dialog')
    await expect(confirmation).toBeVisible()
    const confirmationBounds = await confirmation.boundingBox()
    expect(confirmationBounds.width).toBeLessThanOrEqual(390)
    expect(confirmationBounds.height).toBeLessThanOrEqual(765)
    const cancelButton = confirmation.getByRole('button', { name: 'Cancel' })
    const confirmButton = confirmation.getByRole('button', { name: 'Archive product' })
    await expect(cancelButton).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirmButton).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancelButton).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirmation).toBeHidden()
    await expect(archiveButton).toBeFocused()
  } finally {
    await context.close()
  }
})

test('stock movement entry searches and pages the full product catalog while retaining selection', async ({ browser }) => {
  const account = { id: 'movement_picker_admin', name: 'Movement Picker Admin', email: 'movement.picker@example.test', emailVerified: true, role: 'ADMIN' }
  const requested = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/inventory/products') && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit'))
      const search = url.searchParams.get('search')
      requested.push({ page: pageNumber, limit, search })
      const makeProduct = index => ({ id: `product_${index}`, name: `Product ${index}`, sku: `SKU-${index}`, price: '12.50', stock: 20, status: 'IN_STOCK', warehouse: 'Main', aisle: null, bin: null, avgMonthlyUsage: null, leadTimeDays: null, minThreshold: 5, archivedAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' })
      const items = search ? [makeProduct(99)] : pageNumber === 1 ? Array.from({ length: 25 }, (_, index) => makeProduct(index + 1)) : [makeProduct(26)]
      const total = search ? 1 : 26
      const pages = search ? 1 : 2
      return json(route, { data: { items, pagination: { page: pageNumber, limit, total, pages }, summary: {} } })
    }
    if (url.pathname.endsWith('/inventory/stock/movements') && route.request().method() === 'GET') {
      return json(route, { data: { items: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 }, summary: {
        totalIn: 0, totalOut: 0, recordedThisMonth: { totalIn: 0, totalOut: 0 },
        recordedThisMonthComparison: { previousStartDate: '2026-09-01', previousEndDateExclusive: '2026-09-13', totalIn: 0, totalOut: 0 },
      } } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/dashboard/inventory/movements')
    await expect(page.getByRole('heading', { name: 'Stock Movements' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const openDialogButton = page.getByRole('button', { name: 'Record Movement' })
    await openDialogButton.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const dialogBounds = await dialog.boundingBox()
    expect(dialogBounds.width).toBeLessThanOrEqual(390)
    expect(dialogBounds.height).toBeLessThanOrEqual(765)
    const focusCycle = await dialog.evaluate(element => {
      const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      const focusable = [...element.querySelectorAll(selector)].filter(item => item.offsetWidth || item.offsetHeight || item.getClientRects().length)
      focusable[0]?.focus()
      return focusable.length
    })
    expect(focusCycle).toBeGreaterThan(1)
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    const lastFocused = await dialog.evaluate(element => {
      const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      const focusable = [...element.querySelectorAll(selector)].filter(item => item.offsetWidth || item.offsetHeight || item.getClientRects().length)
      return focusable.at(-1) === document.activeElement
    })
    expect(lastFocused).toBe(true)
    await page.keyboard.press('Tab')
    const firstFocused = await dialog.evaluate(element => {
      const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      const focusable = [...element.querySelectorAll(selector)].filter(item => item.offsetWidth || item.offsetHeight || item.getClientRects().length)
      return focusable[0] === document.activeElement
    })
    expect(firstFocused).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(openDialogButton).toBeFocused()
    await openDialogButton.click()
    const productSelect = page.getByRole('combobox').filter({ has: page.locator('option[value^="product_"]') })
    await page.getByRole('button', { name: 'Next product page' }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    await productSelect.selectOption('product_26')
    await page.getByRole('searchbox', { name: 'Search products' }).fill('special')
    await expect.poll(() => requested.some(item => item.search === 'special' && item.page === 1 && item.limit === 25)).toBe(true)
    await expect(productSelect).toHaveValue('product_26')
    await expect(productSelect.locator('option')).toContainText(['Product 26 (SKU-26)', 'Product 99 (SKU-99)'])
  } finally {
    await context.close()
  }
})

test('product movement history pages all rows and exposes load errors', async ({ browser }) => {
  const account = { id: 'movement_admin', name: 'Movement Admin', email: 'movement.admin@example.test', emailVerified: true, role: 'ADMIN' }
  let movementRequests = 0
  const requested = []
  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/inventory/products') && route.request().method() === 'GET') {
      const product = { id: 'product_1', name: 'Tracked Product', sku: 'SKU-1', price: '12.50', stock: 20, status: 'IN_STOCK', warehouse: 'Main', aisle: null, bin: null, avgMonthlyUsage: null, leadTimeDays: null, minThreshold: 5, archivedAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }
      return json(route, { data: { items: [product], pagination: { page: 1, limit: 25, total: 1, pages: 1 }, summary: {} } })
    }
    if (url.pathname.endsWith('/inventory/stock/movements') && route.request().method() === 'GET') {
      movementRequests += 1
      if (movementRequests <= 2) return json(route, { message: 'Temporary movement history failure' }, 500)
      const pageNumber = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit'))
      requested.push({ page: pageNumber, limit, productId: url.searchParams.get('productId') })
      const makeMovement = index => ({ id: `movement_${index}`, productId: 'product_1', productName: 'Tracked Product', warehouse: 'Main', delta: 1, type: 'IN', note: `Movement ${index}`, createdAt: '2026-10-01T00:00:00.000Z' })
      const items = pageNumber === 1 ? Array.from({ length: 25 }, (_, index) => makeMovement(index + 1)) : [makeMovement(26)]
      return json(route, { data: { items, pagination: { page: pageNumber, limit, total: 26, pages: 2 }, summary: {
        totalIn: 26, totalOut: 0, recordedThisMonth: { totalIn: 26, totalOut: 0 },
        recordedThisMonthComparison: { previousStartDate: '2026-09-01', previousEndDateExclusive: '2026-09-13', totalIn: 0, totalOut: 0 },
      } } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/dashboard/inventory')
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByRole('alert')).toContainText('Request failed')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Movement 25', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–25 of 26 movements')).toBeVisible()
    await page.getByRole('button', { name: 'Next movement page' }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25 && item.productId === 'product_1')).toBe(true)
    await expect(page.getByText('Movement 26', { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})
