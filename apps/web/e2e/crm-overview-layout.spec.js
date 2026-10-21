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

test('crm overview dashboard strictly satisfies all layout rules at 1280px, 1440px and 1920px in LTR and RTL', async ({ browser }) => {
  const account = { id: 'crm_layout_admin', name: 'CRM Admin', email: 'crm.layout@example.test', emailVerified: true, role: 'ADMIN' }

  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/crm/overview') && route.request().method() === 'GET') {
      return json(route, {
        data: {
          pipeline: {
            openTotal: { amount: 15400000, currency: 'USD' },
            openCount: 24,
            wonTotal: { amount: 4200000, currency: 'USD' },
            wonCount: 8,
            openTotalComparison: { previousTotal: null, previousAsOfDate: '2026-09-16' },
          },
          winRate: 35.5,
          winRateComparison: {
            current: { rate: null },
            previous: { rate: null },
          },
          createdLast7Days: 0,
          funnel: [
            { stage: 'LEADS', count: 12, value: { amount: 6200000, currency: 'USD' }, share: 0.4 },
            { stage: 'PROPOSAL', count: 8, value: { amount: 4800000, currency: 'USD' }, share: 0.3 },
            { stage: 'NEGOTIATION', count: 4, value: { amount: 4400000, currency: 'USD' }, share: 0.3 },
            { stage: 'CLOSED_WON', count: 8, value: { amount: 4200000, currency: 'USD' }, share: 0.2 },
            { stage: 'CLOSED_LOST', count: 5, value: { amount: 2100000, currency: 'USD' }, share: 0.1 },
          ],
          stageConversions: [
            { fromStage: 'LEADS', toStage: 'PROPOSAL', rate: 66.7 },
            { fromStage: 'PROPOSAL', toStage: 'NEGOTIATION', rate: 50.0 },
            { fromStage: 'NEGOTIATION', toStage: 'CLOSED_WON', rate: null },
          ],
          monthlyWinRate: [
            { month: '2026-05', rate: 30 },
            { month: '2026-06', rate: 32 },
            { month: '2026-07', rate: 35 },
          ],
        },
      })
    }

    if (path.endsWith('/crm/forecast') && route.request().method() === 'GET') {
      return json(route, {
        data: {
          monthlyPipeline: [
            { month: 'Oct 2026', value: { amount: 3200000, currency: 'USD' } },
            { month: 'Nov 2026', value: { amount: 4800000, currency: 'USD' } },
            { month: 'Dec 2026', value: { amount: 7400000, currency: 'USD' } },
          ],
          summary: {
            totalPipeline: { amount: 15400000, currency: 'USD' },
            totalQuota: { amount: 10000000, currency: 'USD' },
          },
        },
      })
    }

    if (path.includes('/crm/sales-performance')) {
      return json(route, {
        data: {
          year: '2026',
          yearWonTotal: { amount: 4200000, currency: 'USD' },
          summary: { totalWonCount: 0 },
        },
      })
    }

    if (path.endsWith('/crm/agenda')) {
      return json(route, { data: { items: [] } })
    }

    if (path.endsWith('/crm/activities')) {
      return json(route, { data: { items: [] } })
    }

    return json(route, { data: {} })
  })

  const page = await context.newPage()
  try {
    await signIn(page, account)

    for (const dir of ['ltr', 'rtl']) {
      for (const width of [1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/dashboard/crm')

        if (dir === 'rtl') {
          await page.evaluate(() => { document.documentElement.setAttribute('dir', 'rtl') })
        } else {
          await page.evaluate(() => { document.documentElement.setAttribute('dir', 'ltr') })
        }

        // 1. Verify no horizontal scrollbar on document
        const isHorizontalScrollable = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        expect(isHorizontalScrollable).toBe(false)

        // 2. Verify TopBar elements and sizing
        // Breadcrumb
        await expect(page.getByLabel('Breadcrumb')).toBeVisible()
        // Search or jump to...
        await expect(page.getByTitle(/Global search/i)).toBeVisible()
        // Notification bell
        await expect(page.getByRole('button', { name: 'Open notifications' })).toBeVisible()

        // "Search deals..." input: 36px high, ~260px wide
        const searchDealsInput = page.getByPlaceholder('Search deals...')
        await expect(searchDealsInput).toBeVisible()
        const searchBox = await searchDealsInput.boundingBox()
        expect(Math.round(searchBox.height)).toBe(36)
        expect(Math.round(searchBox.width)).toBe(260)

        // "New Deal" button: 36px high
        const newDealBtn = page.getByRole('button', { name: 'New Deal' })
        await expect(newDealBtn).toBeVisible()
        const newDealBox = await newDealBtn.boundingBox()
        expect(Math.round(newDealBox.height)).toBe(36)

        // 3. Verify Sidebar elements: "New Entry" button, Navigation links
        await expect(page.getByRole('button', { name: /New Entry/i })).toBeVisible()
        await expect(page.getByRole('link', { name: /Dashboard/i }).first()).toBeVisible()
        await expect(page.getByRole('link', { name: /Settings/i }).first()).toBeVisible()

        // 4. Verify 4 KPI cards and baseline alignment
        const kpiTitles = ['Total Pipeline', 'Win Rate', 'Active Deals', 'Closed Won (2026)']
        for (const title of kpiTitles) {
          await expect(page.getByText(title).first()).toBeVisible()
        }

        // Check required verbatim copy:
        await expect(page.getByText('Prior-month value (as of 2026-09-16) unavailable')).toBeVisible()
        await expect(page.getByText('MTD — · Prior period —')).toBeVisible()
        await expect(page.getByText('+0 this week')).toBeVisible()
        await expect(page.getByText('0 deals')).toBeVisible()

        // Check KPI values and equal height
        const kpiCards = page.locator('.grid.grid-cols-2.min-\\[1100px\\]\\:grid-cols-4 > div')
        await expect(kpiCards).toHaveCount(4)

        const heights = []
        const valueTops = []
        for (let i = 0; i < 4; i++) {
          const card = kpiCards.nth(i)
          const cardBox = await card.evaluate(el => {
            const r = el.getBoundingClientRect()
            return { height: Math.round(r.height), top: Math.round(r.top) }
          })
          heights.push(cardBox.height)
          expect(cardBox.height).toBeGreaterThanOrEqual(104)

          // Metric number top position
          const val = card.locator('p.text-2xl').first()
          const valTop = await val.evaluate(el => Math.round(el.getBoundingClientRect().top))
          valueTops.push(valTop)
        }

        // All 4 cards stretch to the same height (in 4-column layout at 1280, 1440, 1920)
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2)
        // All 4 values sit on the exact same horizontal baseline
        expect(Math.max(...valueTops) - Math.min(...valueTops)).toBeLessThanOrEqual(1)

        // 5. Verify Charts Row
        await expect(page.getByRole('heading', { name: 'Revenue Forecast' })).toBeVisible()
        await expect(page.getByTitle('View full revenue forecast')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Pipeline Conversion' })).toBeVisible()
        await expect(page.getByText('All-time cohorts from recorded stage history. Deals without recorded history are excluded.')).toBeVisible()

        // Check 5 stage rows: Leads, Proposal, Negotiation, Closed Won, Closed Lost
        const stages = ['Leads', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']
        for (const stage of stages) {
          const el = page.locator(`span:text-is("${stage}")`).first()
          await expect(el).toBeVisible()
          const whiteSpace = await el.evaluate(e => window.getComputedStyle(e).whiteSpace)
          expect(whiteSpace).toBe('nowrap')
        }

        // Check narrowest row (Closed Lost) is at least 75% of the funnel width
        const leadsRow = page.locator('div:has(> span:text-is("Leads"))').first()
        const closedLostRow = page.locator('div:has(> span:text-is("Closed Lost"))').first()
        const leadsWidth = (await leadsRow.boundingBox()).width
        const closedLostWidth = (await closedLostRow.boundingBox()).width
        expect(closedLostWidth / leadsWidth).toBeGreaterThanOrEqual(0.74)

        // Check connector chips are visible (including the "–" connector when null)
        await expect(page.getByText('67%')).toBeVisible()
        await expect(page.getByText('50%')).toBeVisible()
        await expect(page.getByText('—', { exact: true })).toBeVisible()

        // 6. Verify Bottom Row
        await expect(page.getByRole('heading', { name: 'Daily Agenda' })).toBeVisible()
        await expect(page.getByPlaceholder('Add an agenda item')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible()
        await expect(page.getByText('No agenda items')).toBeVisible()
        await expect(page.getByText('Add a task for this workspace.')).toBeVisible()

        await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible()
        await expect(page.getByText('No recent activity to show yet.')).toBeVisible()

        // Verify column alignment between Charts row and Bottom row:
        // Daily Agenda width should match Revenue Forecast width (within 2px)
        const revCard = page.locator('h2:text-is("Revenue Forecast")').locator('xpath=ancestor::div[contains(@class, "rounded-card-sm")]')
        const agendaCard = page.locator('h2:text-is("Daily Agenda")').locator('xpath=ancestor::div[contains(@class, "rounded-card-sm")]')
        const revBox = await revCard.evaluate(el => {
          const r = el.getBoundingClientRect()
          return { width: Math.round(r.width), top: Math.round(r.top) }
        })
        const agendaBox = await agendaCard.evaluate(el => {
          const r = el.getBoundingClientRect()
          return { width: Math.round(r.width), top: Math.round(r.top) }
        })
        expect(Math.abs(revBox.width - agendaBox.width)).toBeLessThanOrEqual(2)

        // 7. Verify that at 1440x900, the KPIs, both charts, and top of the bottom row are visible without scrolling
        if (width === 1440) {
          expect(revBox.top).toBeLessThan(900)
          expect(agendaBox.top).toBeLessThan(900)
        }
      }
    }
  } finally {
    await context.close()
  }
})
