import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const workspace = {
  id: 'workspace_dashboard',
  name: 'Dashboard Workspace',
  slug: 'dashboard-workspace',
  logo: null,
  currency: 'USD',
  onboardingStatus: 'IMPORTED',
  createdAt: '2026-10-01T00:00:00.000Z',
}

const user = {
  id: 'dashboard_owner',
  name: 'Dana Owner',
  email: 'dana@example.test',
  emailVerified: true,
}

async function mockDashboard(context, endpointData) {
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) {
      return json(route, {
        session: {
          id: 'session_dashboard',
          token: 'token-dashboard',
          userId: user.id,
          activeOrganizationId: workspace.id,
        },
        user,
      })
    }
    if (path.endsWith('/organization/list')) return json(route, [workspace])
    if (path.endsWith('/organization/get-full-organization')) {
      return json(route, { ...workspace, members: [] })
    }
    if (path.endsWith('/organization/get-active-member-role')) return json(route, { role: 'ADMIN' })
    return json(route, {})
  })

  await context.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') return json(route, { data: {} })
    const payload = endpointData(path)
    return json(route, { data: payload ?? {} })
  })
}

function emptyEndpointData(path) {
  if (path.endsWith('/hr/employees')) {
    return {
      items: [],
      pagination: { page: 1, limit: 1, total: 0, pages: 0 },
      summary: { totalHeadcount: 0, onLeaveCount: 0, hiredThisMonth: 0, hiredPreviousMonthToDate: 0 },
    }
  }
  if (path.endsWith('/crm/overview')) {
    return {
      pipeline: {
        openCount: 0,
        openTotal: { amount: 0, currency: 'USD' },
        openCountComparison: { previousCount: null },
        openTotalComparison: { previousTotal: null },
      },
    }
  }
  if (path.endsWith('/finance/overview')) {
    return { payableOutstanding: { amount: 0, currency: 'USD' }, cashFlow: [] }
  }
  if (path.endsWith('/finance/payables')) {
    return {
      items: [],
      pagination: { page: 1, limit: 1, total: 0, pages: 0 },
      summary: {
        pastDueTotal: { amount: 0, currency: 'USD' },
        dueIn7DaysTotal: { amount: 0, currency: 'USD' },
        paidThisMonthTotal: null,
        paidThisMonthComparison: null,
        pendingApprovalCount: 0,
      },
    }
  }
  if (path.endsWith('/projects/sprints')) return { items: [] }
  if (path.endsWith('/finance/receivables')) {
    return {
      items: [],
      pagination: { page: 1, limit: 1, total: 0, pages: 0 },
      summary: { overdueCount: 0, overdueTotal: { amount: 0, currency: 'USD' } },
    }
  }
  if (path.endsWith('/inventory/products')) {
    return {
      items: [],
      pagination: { page: 1, limit: 1, total: 0, pages: 0 },
      summary: { lowStockProducts: 0 },
    }
  }
  if (path.endsWith('/hr/payroll/runs')) {
    return {
      items: [],
      pagination: { page: 1, limit: 1, total: 0, pages: 0 },
      summary: { pendingCount: 0 },
    }
  }
  if (path.endsWith('/hr/attendance')) {
    return { exceptions: [], leaveRequests: [], summary: { exceptionCount: 0 } }
  }
  if (path.endsWith('/audit-logs')) return { items: [] }
  return null
}

test('a clean workspace shows truthful empty dashboard states, keyboard skip access, and a downloadable report at 390px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await mockDashboard(context, emptyEndpointData)

  try {
    const page = await context.newPage()
    await page.goto('/dashboard')

    await expect(page.getByText('Headcount', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard overview' })).toBeAttached()
    await expect(page.getByText('0 hired MTD', { exact: true })).toBeVisible()
    await expect(page.getByText('No historical comparison yet', { exact: true })).toBeVisible()
    await expect(page.getByText('No past-due bills', { exact: true })).toBeVisible()
    await expect(page.getByText('No active sprint', { exact: true })).toBeVisible()
    await expect(page.getByText('0 completed across portfolio', { exact: true })).toBeVisible()

    await expect(page.getByText('Nothing needs attention right now.', { exact: true })).toBeVisible()
    await expect(page.getByText(/No cash flow data is available for/)).toBeVisible()
    await expect(page.getByText('No active sprints found.', { exact: true })).toBeVisible()
    await expect(page.getByText('No recent activity', { exact: true })).toBeVisible()
    await expect(page.getByText('Recorded audits will appear here after the page refreshes', { exact: true })).toBeVisible()
    await expect(page.getByText('…', { exact: true })).toHaveCount(0)
    await expect(page.getByText('—', { exact: true })).toHaveCount(0)
    await expect(page.getByText('N/A', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Acme Global/)).toHaveCount(0)

    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: 'Skip to dashboard content' })
    await expect(skipLink).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#dashboard-main-content')).toBeFocused()

    const mainDimensions = await page.locator('#dashboard-main-content').evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(mainDimensions.scrollWidth).toBeLessThanOrEqual(mainDimensions.clientWidth + 1)

    const reportButton = page.getByRole('button', { name: 'Generate Report' })
    await expect(reportButton).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      reportButton.click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^dashboard-\d{4}-\d{2}-\d{2}\.csv$/)
    const filePath = await download.path()
    const csv = await readFile(filePath, 'utf8')
    expect(csv).toContain('"Headcount","0"')
    expect(csv).toContain('"Open Pipeline Value"')
    expect(csv).toContain('"Active Sprints","0"')
    expect(csv).toContain('"Requires attention","Detail","Amount / action"')
    expect(csv).not.toContain('…')
  } finally {
    await context.close()
  }
})

test('desktop sidebar toggle stays in the topbar and never overlaps the collapsed brand', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  await mockDashboard(context, emptyEndpointData)

  try {
    const page = await context.newPage()
    await page.goto('/dashboard')

    const sidebar = page.locator('aside').first()
    const collapseButton = page.getByRole('button', { name: 'Collapse sidebar', exact: true })
    await expect(collapseButton).toBeVisible()
    await collapseButton.click()

    const expandButton = page.getByRole('button', { name: 'Expand sidebar', exact: true })
    await expect(expandButton).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toHaveCount(0)

    const sidebarBox = await sidebar.boundingBox()
    expect(sidebarBox).not.toBeNull()
    // The sidebar animates its width, so poll instead of sampling a mid-transition frame.
    await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 999)).toBeLessThanOrEqual(65)

    const logoBox = await page.getByTestId('sidebar-brand-logo').boundingBox()
    const expandBox = await expandButton.boundingBox()
    expect(logoBox).not.toBeNull()
    expect(expandBox).not.toBeNull()
    expect(expandBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width)

    await expandButton.click()
    await expect(page.getByRole('button', { name: 'Collapse sidebar', exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('dashboard attention and sprint links point at the affected module and the report includes live records', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  await mockDashboard(context, path => {
    if (path.endsWith('/hr/employees')) {
      return {
        items: [],
        pagination: { page: 1, limit: 1, total: 7, pages: 7 },
        summary: { totalHeadcount: 7, onLeaveCount: 1, hiredThisMonth: 2, hiredPreviousMonthToDate: 1 },
      }
    }
    if (path.endsWith('/crm/overview')) {
      return {
        pipeline: {
          openCount: 4,
          openTotal: { amount: 154000000, currency: 'USD' },
          openCountComparison: { previousCount: 2 },
          openTotalComparison: { previousTotal: 104000000 },
        },
      }
    }
    if (path.endsWith('/finance/overview')) {
      return {
        payableOutstanding: { amount: 1234500, currency: 'USD' },
        cashFlow: [
          { month: '2026-09', net: { amount: 100000, currency: 'USD' } },
          { month: '2026-10', net: { amount: 250000, currency: 'USD' } },
        ],
      }
    }
    if (path.endsWith('/finance/payables')) {
      return {
        items: [],
        pagination: { page: 1, limit: 1, total: 0, pages: 0 },
        summary: {
          pastDueTotal: { amount: 250000, currency: 'USD' },
          dueIn7DaysTotal: { amount: 100000, currency: 'USD' },
          paidThisMonthTotal: null,
          paidThisMonthComparison: null,
          pendingApprovalCount: 1,
        },
      }
    }
    if (path.endsWith('/projects/sprints')) {
      return {
        items: [
          { id: 'sprint_active', name: 'Sprint A', status: 'ACTIVE', completionPct: 50, endsAt: '2026-11-05T00:00:00.000Z' },
          { id: 'sprint_done', name: 'Sprint 0', status: 'COMPLETED', completionPct: 100, endsAt: '2026-10-01T00:00:00.000Z' },
        ],
      }
    }
    if (path.endsWith('/finance/receivables')) {
      return {
        items: [],
        pagination: { page: 1, limit: 1, total: 0, pages: 0 },
        summary: { overdueCount: 2, overdueTotal: { amount: 300000, currency: 'USD' } },
      }
    }
    if (path.endsWith('/inventory/products')) {
      return {
        items: [],
        pagination: { page: 1, limit: 1, total: 0, pages: 0 },
        summary: { lowStockProducts: 3 },
      }
    }
    if (path.endsWith('/hr/payroll/runs')) {
      return {
        items: [],
        pagination: { page: 1, limit: 1, total: 0, pages: 0 },
        summary: { pendingCount: 2 },
      }
    }
    if (path.endsWith('/hr/attendance')) {
      return { exceptions: [], leaveRequests: [], summary: { exceptionCount: 1 } }
    }
    if (path.endsWith('/audit-logs')) {
      return {
        items: [{ id: 'audit_1', action: 'Payroll run approved', actorName: 'Avery Admin', createdAt: '2026-10-26T09:00:00.000Z' }],
      }
    }
    return null
  })

  try {
    const page = await context.newPage()
    await page.goto('/dashboard')

    await expect(page.getByText('$1.54M', { exact: true })).toBeVisible()
    await expect(page.getByText('$12.3K', { exact: true })).toBeVisible()
    await expect(page.getByText('4 open deals', { exact: true })).toBeVisible()
    await expect(page.getByText('2 hired MTD', { exact: true })).toBeVisible()

    for (const [name, href] of [
      ['Open overdue receivables', '/dashboard/finance/accounts-receivable'],
      ['Open low-stock products', '/dashboard/inventory'],
      ['Review pending payroll runs', '/dashboard/hr/payroll'],
      ['Review attendance exceptions', '/dashboard/hr/time-attendance'],
    ]) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
    }

    const sprintLink = page.getByRole('link', { name: /Sprint A/ })
    await expect(sprintLink).toBeVisible()
    await expect(sprintLink).toHaveAttribute('href', '/dashboard/projects')
    await expect(page.getByText('50%', { exact: true })).toBeVisible()
    await expect(page.getByText('Payroll run approved', { exact: true })).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Generate Report' }).click(),
    ])
    const csv = await readFile(await download.path(), 'utf8')
    expect(csv).toContain('"Overdue Receivables"')
    expect(csv).toContain('"Pending Payroll Runs"')
    expect(csv).toContain('"Sprint A","50"')
    expect(csv).toContain('"Attendance Exceptions"')
  } finally {
    await context.close()
  }
})
