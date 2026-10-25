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

test('accounts payable strictly satisfies Apple-Glass polish, exact currency, and spatial layout rules', async ({ browser }) => {
  const account = { id: 'ap_layout_admin', name: 'AP Admin', email: 'ap.layout@example.test', emailVerified: true, role: 'ADMIN' }

  // 8 pending bills, 10 scheduled bills
  const pendingBills = Array.from({ length: 8 }, (_, i) => ({
    id: i === 0 ? 'bill_ap_2018' : `bill_pending_${i + 1}`,
    vendor: i === 0 ? 'Google Cloud' : `Vendor P${i + 1}`,
    vendorId: `vendor_${i + 1}`,
    invoiceNumber: i === 0 ? 'AP-2018' : `INV-P${i + 1}`,
    date: '2026-10-01T00:00:00.000Z',
    dueDate: '2026-10-28T00:00:00.000Z',
    amount: i === 0 ? { amount: 549900, currency: 'USD' } : { amount: 200000 + i * 50000, currency: 'USD' },
    status: 'PENDING',
    projectId: null,
  }))

  const scheduledBills = Array.from({ length: 10 }, (_, i) => ({
    id: `bill_scheduled_${i + 1}`,
    vendor: `Vendor S${i + 1}`,
    vendorId: `vendor_s_${i + 1}`,
    invoiceNumber: `INV-S${i + 1}`,
    date: '2026-10-05T00:00:00.000Z',
    dueDate: '2026-11-05T00:00:00.000Z',
    amount: { amount: 300000 + i * 40000, currency: 'USD' },
    status: 'SCHEDULED',
    projectId: null,
  }))

  const allBills = [...pendingBills, ...scheduledBills]

  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/finance/payables') && route.request().method() === 'GET') {
      return json(route, {
        data: {
          items: allBills,
          pagination: { page: 1, limit: 100, total: allBills.length, pages: 1 },
          summary: {
            openOutstanding: { amount: 7410400, currency: 'USD' },
            pastDueTotal: { amount: 0, currency: 'USD' },
            dueIn7DaysTotal: { amount: 1540000, currency: 'USD' },
            paidThisMonthTotal: null,
            paidThisMonthComparison: null,
            openCount: 18,
          },
        },
      })
    }

    if (path.includes('/finance/payables/bill_ap_2018/pdf')) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 mock' })
    }

    if (path.includes('/finance/payables/bill_ap_2018')) {
      return json(route, {
        data: {
          id: 'bill_ap_2018',
          vendor: 'Google Cloud',
          invoiceNumber: 'AP-2018',
          status: 'PENDING',
          amount: { amount: 549900, currency: 'USD' },
          date: '2026-10-01T00:00:00.000Z',
          dueDate: '2026-10-28T00:00:00.000Z',
          lineItems: [],
        },
      })
    }

    if (path.endsWith('/finance/vendors')) {
      return json(route, {
        data: {
          items: [
            { id: 'vendor_1', name: 'Google Cloud' },
          ],
        },
      })
    }

    return json(route, { data: {} })
  })

  const page = await context.newPage()
  await signIn(page, account)

  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/dashboard/finance/accounts-payable')

    // 1. Verify no horizontal viewport scrollbar
    const isHorizontalScrollable = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(isHorizontalScrollable).toBe(false)

    // 2. Toolbar controls present and unclipped
    await expect(page.getByPlaceholder('Search invoices...')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Payables view' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'All Dates' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Batch Payment (10)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Vendors' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Bill' })).toBeVisible()
    await expect(page.getByTitle('Export Accounts Payable CSV')).toBeVisible()

    // 3. Top Row KPI cards with precision compact currency
    // TOTAL OUTSTANDING: $74.1K (title has full $74,104.00)
    const card1 = page.locator('text=Total Outstanding').locator('..')
    await expect(card1.getByText('$74.1K')).toBeVisible()
    await expect(card1.getByText('18 open bills')).toBeVisible()

    // Card 2: PAST DUE ($0.00 / $0, 'No overdue bills')
    const card2 = page.locator('text=Past Due').locator('..')
    await expect(card2.getByText('No overdue bills')).toBeVisible()

    // Card 3: DUE IN 7 DAYS
    const card3 = page.locator('text=Due in 7 Days').locator('..')
    await expect(card3.getByText('$1.5M')).toBeVisible()
    await expect(card3.getByText('Upcoming payments scheduled')).toBeVisible()

    // Card 4: PAID THIS MONTH ('Unavailable until journal history complete')
    const card4 = page.locator('text=Paid This Month').locator('..')
    await expect(card4.getByText('Unavailable until journal history complete')).toBeVisible()

    // 4. Segmented tabs in the bills card
    await expect(page.getByRole('tab', { name: 'All (18)' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Needs Approval (8)' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Scheduled (10)' })).toBeVisible()

    // 5. Table rows have exact dollar-and-cent amount ($5,499.00)
    const googleCloudRow = page.locator('tr', { hasText: 'Google Cloud' })
    await expect(googleCloudRow).toBeVisible()
    await expect(googleCloudRow.getByText('$5,499.00')).toBeVisible()

    // 6. Right-hand Invoice Inspector
    await expect(page.getByRole('heading', { name: 'Google Cloud' })).toBeVisible()
    await expect(page.getByText('Invoice #AP-2018')).toBeVisible()
    await expect(page.getByText('Total Amount Due')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request Changes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
    await expect(page.getByText('LINE ITEMS')).toBeVisible()
    await expect(page.getByText('No line items recorded for this invoice.')).toBeVisible()

    // 7. Unclipped attachment bar with invoice-AP-2018.pdf
    await expect(page.getByText('invoice-AP-2018.pdf')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Full preview' })).toBeVisible()
    await expect(page.getByTitle('Open in new window')).toBeVisible()
    await expect(page.getByTitle('Download PDF')).toBeVisible()
  }

  await context.close()
})

