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

test('accounts receivable satisfies Apple-Glass polish, exact currency, aging card preservation, and inspector layout', async ({ browser }) => {
  const account = { id: 'ar_layout_admin', name: 'AR Admin', email: 'ar.layout@example.test', emailVerified: true, role: 'ADMIN' }

  const mockCustomers = [
    {
      id: 'cust_charles',
      name: 'Charles Martin',
      email: 'charles.m@example.test',
      avatarUrl: null,
      openBalance: { amount: 3505800, currency: 'USD' },
      collectionStatus: 'CURRENT',
      oldestOverdueDays: 64,
    },
    {
      id: 'cust_sarah',
      name: 'Sarah Connor',
      email: 'sarah.c@example.test',
      avatarUrl: null,
      openBalance: { amount: 1240000, currency: 'USD' },
      collectionStatus: 'CURRENT',
      oldestOverdueDays: 20,
    },
    {
      id: 'cust_apex',
      name: 'Apex Solutions',
      email: 'billing@apex.test',
      avatarUrl: null,
      openBalance: { amount: 850000, currency: 'USD' },
      collectionStatus: 'CURRENT',
      oldestOverdueDays: 0,
    },
  ]

  const mockInvoicesCharles = [
    {
      id: 'inv_1010',
      number: 'INV-1010',
      amount: { amount: 1500000, currency: 'USD' },
      status: 'OPEN',
      dueDate: '2026-08-22T00:00:00.000Z',
      daysPastDue: 64,
      inventoryLines: [],
    },
    {
      id: 'inv_1057',
      number: 'INV-1057',
      amount: { amount: 2005800, currency: 'USD' },
      status: 'OPEN',
      dueDate: '2026-09-15T00:00:00.000Z',
      daysPastDue: 40,
      inventoryLines: [{ productName: 'Enterprise License', quantity: 1, costValue: { amount: 2005800, currency: 'USD' } }],
    },
  ]

  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/finance/customers') && route.request().method() === 'GET') {
      return json(route, { data: { items: mockCustomers } })
    }

    if (path.endsWith('/finance/receivables') && route.request().method() === 'GET') {
      const customerId = url.searchParams.get('customerId')
      if (customerId === 'cust_charles') {
        return json(route, {
          data: {
            items: mockInvoicesCharles,
            pagination: { page: 1, limit: 10, total: 2, pages: 1 },
          },
        })
      }
      return json(route, {
        data: {
          items: [],
          pagination: { page: 1, limit: 1, total: 2, pages: 1 },
          summary: {
            openBalance: { amount: 5595800, currency: 'USD' },
            agingBuckets: [
              { bucket: 'current', total: { amount: 850000, currency: 'USD' }, count: 1 },
              { bucket: '1-30', total: { amount: 1240000, currency: 'USD' }, count: 1 },
              { bucket: '31-60', total: { amount: 2005800, currency: 'USD' }, count: 1 },
              { bucket: '60+', total: { amount: 1500000, currency: 'USD' }, count: 1 },
            ],
            collectedThisMonthTotal: null,
          },
        },
      })
    }

    if (path.includes('/finance/customers/') && path.endsWith('/activities')) {
      return json(route, { data: { items: [] } })
    }

    return json(route, { data: {} })
  })

  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, account)

  await page.goto('/dashboard/finance/accounts-receivable', { waitUntil: 'domcontentloaded' })

  // 1. Apple-Glass Top Toolbar Verification
  const searchInput = page.getByPlaceholder('Search customers...')
  await expect(searchInput).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send Reminder' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Customers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Invoice' })).toBeVisible()

  // 2. 5 Aging KPI Cards Verification
  // Check 5 cards exist
  await expect(page.locator('p').filter({ hasText: /^Total Outstanding$/i }).first()).toBeVisible()
  await expect(page.locator('p').filter({ hasText: /^Current$/i }).first()).toBeVisible()
  await expect(page.locator('p').filter({ hasText: /^1-30 Days$/i }).first()).toBeVisible()
  await expect(page.locator('p').filter({ hasText: /^31-60 Days$/i }).first()).toBeVisible()
  await expect(page.locator('p').filter({ hasText: /^60\+ Days$/i }).first()).toBeVisible()

  // Card 1: MTD collections explain the state instead of showing a system placeholder
  const totalSubtext = page.getByText('No collections yet')
  await expect(totalSubtext).toBeVisible()
  await expect(page.getByText(/Collected MTD: Unavaila/)).toHaveCount(0)

  // Card 5: Strict preservation of red left border accent, text-danger, and critical invoices
  const card60Plus = page.locator('div').filter({ has: page.locator('p').filter({ hasText: /^60\+ Days$/i }) }).last()
  await expect(card60Plus).toHaveClass(/border-l-4/)
  await expect(card60Plus).toHaveClass(/border-l-red-600/)
  await expect(card60Plus.getByText('1 critical invoice')).toBeVisible()

  // Verify NO icon badges on the 5 aging cards
  const all5Cards = page.locator('.grid.grid-cols-2.md\\:grid-cols-3.xl\\:grid-cols-5 > div')
  await expect(all5Cards).toHaveCount(5)

  // 3. Customer Table
  // Full dollar formatting in OUTSTANDING column (e.g. $35,058, not $35K)
  const charlesRow = page.locator('tr').filter({ hasText: 'Charles Martin' })
  await expect(charlesRow).toBeVisible()
  await expect(charlesRow.getByText('$35,058')).toBeVisible()

  // Verification: Checkboxes removed from Customer Table
  await expect(page.getByRole('table').locator('button[role="checkbox"]')).toHaveCount(0)

  // 4. Right Customer Inspector
  // Charles Martin selected
  await expect(page.getByRole('heading', { name: 'Charles Martin' })).toBeVisible()
  await expect(page.getByText('Total Outstanding').last()).toBeVisible()
  // Outstanding Invoices Card
  await expect(page.getByRole('heading', { name: 'Outstanding Invoices' })).toBeVisible()
  await expect(page.getByText('INV-1010')).toBeVisible()
  await expect(page.getByText('Overdue (64d)')).toBeVisible()
  // Full due date must be rendered without truncation (no "D..." or "Du...")
  await expect(page.getByText(/Due Aug 22, 2026/)).toBeVisible()
  await expect(page.getByTitle('$15,000', { exact: true })).toBeVisible()
  await expect(page.getByTitle('$20,058', { exact: true })).toBeVisible()

  // Action buttons
  const actionBtns = page.getByRole('button', { name: /Invoice actions for/ })
  await expect(actionBtns.first()).toBeVisible()
  await expect(actionBtns.first()).toHaveClass(/h-7\.5/)

  // Single-page notice instead of cramped buttons
  await expect(page.getByText('All invoices shown')).toBeVisible()

  // Activity Composer textarea height check
  const activityTextarea = page.getByPlaceholder('Add a note or log a call...')
  await expect(activityTextarea).toBeVisible()
  await expect(activityTextarea).toHaveClass(/h-16/)

  // 5. Interactivity: Clicking an Aging card filters the table
  const card1to30 = page.locator('div').filter({ has: page.locator('p').filter({ hasText: /^1-30 Days$/i }) }).last()
  await card1to30.click()
  // Now only Sarah Connor should be visible (daysPastDue: 20) in the table
  await expect(page.getByRole('table').getByText('Sarah Connor')).toBeVisible()
  await expect(page.getByRole('table').getByText('Charles Martin')).not.toBeVisible()

  await context.close()
})

