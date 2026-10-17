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

test('expenses page strictly satisfies all layout rules at 1280px, 1440px and 1920px', async ({ browser }) => {
  const account = { id: 'expense_layout_admin', name: 'Layout Admin', email: 'expense.layout@example.test', emailVerified: true, role: 'ADMIN' }
  const makeExpense = index => ({
    id: `expense_${index}`, projectId: null, employeeId: `emp_${index}`, employee: `Employee ${index}`,
    name: `Expense Report ${index}`, category: index % 2 === 0 ? 'OFFICE' : 'TRAVEL', merchant: `Merchant ${index}`,
    date: '2026-10-01T00:00:00.000Z', amount: { amount: 125000 + index * 1000, currency: 'USD' }, tax: { amount: 500, currency: 'USD' },
    policyMatch: index % 3 !== 0, status: index === 1 ? 'PENDING' : index === 2 ? 'APPROVED' : 'FLAGGED', reimbursedAt: null, reimbursedById: null,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  })
  const items = Array.from({ length: 25 }, (_, i) => makeExpense(i + 1))

  const context = await browser.newContext()
  await mockAuth(context, account, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/finance/expenses') && route.request().method() === 'GET') {
      return json(route, {
        data: {
          items,
          pagination: { page: 1, limit: 25, total: 25, pages: 1 },
          summary: {
            pendingCount: 1,
            pendingTotal: { amount: 126000, currency: 'USD' },
            approvedCount: 1,
            approvedTotal: { amount: 127000, currency: 'USD' },
            flaggedCount: 1,
            flaggedTotal: { amount: 128000, currency: 'USD' },
            reimbursedThisMonthTotal: null,
            reimbursedThisMonthComparison: { previousTotal: null },
          },
        },
      })
    }
    if (path.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    return json(route, { data: {} })
  })

  const page = await context.newPage()
  try {
    await signIn(page, account)

    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard/finance/expenses')

      // 1. Verify no horizontal scrollbar on document
      const isHorizontalScrollable = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      expect(isHorizontalScrollable).toBe(false)

      // 2. Verify page body doesn't scroll vertically at 900px height
      const bodyScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      expect(bodyScrollHeight).toBeLessThanOrEqual(900)

      // 3. Verify topbar buttons: Export CSV and New Expense are 36px high
      const exportBtn = page.getByRole('button', { name: /Export CSV/i })
      const newExpenseBtn = page.getByRole('button', { name: /New Expense/i })
      await expect(exportBtn).toBeVisible()
      await expect(newExpenseBtn).toBeVisible()

      const exportHeight = await exportBtn.evaluate(el => el.getBoundingClientRect().height)
      const newExpenseHeight = await newExpenseBtn.evaluate(el => el.getBoundingClientRect().height)
      expect(Math.round(exportHeight)).toBe(36)
      expect(Math.round(newExpenseHeight)).toBe(36)

      // 4. Verify 3 KPI cards are visible and all values exist
      await expect(page.getByText('Pending Approval')).toBeVisible()
      await expect(page.getByText('Approved Expenses')).toBeVisible()
      await expect(page.getByText('Policy Violations')).toBeVisible()
      await expect(page.getByText('Reimbursed MTD: unavailable · Prior period: unavailable')).toBeVisible()

      // 5. Verify sort dropdown and table columns: Employee, Merchant, Expense Date, Status, Amount (no checkbox column)
      await expect(page.getByRole('combobox', { name: 'Sort expenses' })).toBeVisible()
      await expect(page.getByRole('checkbox', { name: 'Select all expenses' })).toHaveCount(0)
      await expect(page.getByRole('columnheader', { name: 'Employee', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Merchant', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Expense Date', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Amount', exact: true })).toBeVisible()

      // 6. Verify table row height (48px), header height (40px), and at least 9 rows visible at 1440x900
      const headerRow = page.locator('thead tr')
      const headerHeight = await headerRow.evaluate(el => Math.round(el.getBoundingClientRect().height))
      expect(headerHeight).toBe(40)

      const firstRow = page.locator('tbody tr').first()
      const firstRowHeight = await firstRow.evaluate(el => Math.round(el.getBoundingClientRect().height))
      expect(firstRowHeight).toBe(48)

      if (width === 1440) {
        const rows = page.locator('tbody tr')
        const rowCount = await rows.count()
        expect(rowCount).toBeGreaterThanOrEqual(9)

        // Count visible rows inside viewport
        const visibleRows = await page.evaluate(() => {
          const trs = Array.from(document.querySelectorAll('tbody tr'))
          return trs.filter(tr => {
            const rect = tr.getBoundingClientRect()
            return rect.top >= 0 && rect.bottom <= window.innerHeight
          }).length
        })
        expect(visibleRows).toBeGreaterThanOrEqual(9)
      }

      // 7. Verify rebalanced detail panel width is 380px
      const detailPanel = page.locator('div.w-full.min-\\[1100px\\]\\:w-\\[380px\\]')
      await expect(detailPanel).toBeVisible()
      const panelWidth = await detailPanel.evaluate(el => Math.round(el.getBoundingClientRect().width))
      expect(panelWidth).toBe(380)

      // 8. Verify action buttons in detail panel are 36px high and nowrap
      const approveBtn = page.getByRole('button', { name: 'Approve' })
      const markReimbursedBtn = page.getByRole('button', { name: 'Mark Reimbursed' })
      const rejectBtn = page.getByRole('button', { name: 'Reject' })
      const voidBtn = page.getByRole('button', { name: 'Void expense' })

      await expect(approveBtn).toBeVisible()
      await expect(markReimbursedBtn).toBeVisible()
      await expect(rejectBtn).toBeVisible()
      await expect(voidBtn).toBeVisible()

      for (const btn of [approveBtn, markReimbursedBtn, rejectBtn, voidBtn]) {
        const height = await btn.evaluate(el => Math.round(el.getBoundingClientRect().height))
        expect(height).toBe(36)
        const whiteSpace = await btn.evaluate(el => window.getComputedStyle(el).whiteSpace)
        expect(whiteSpace).toBe('nowrap')
      }

      // 9. Selecting a different row updates the detail panel
      await page.getByText('Employee 2', { exact: true }).click()
      await expect(page.locator('h2').getByText('Employee 2')).toBeVisible()
      await page.getByText('Employee 3', { exact: true }).click()
      await expect(page.locator('h2').getByText('Employee 3')).toBeVisible()
    }
  } finally {
    await context.close()
  }
})

