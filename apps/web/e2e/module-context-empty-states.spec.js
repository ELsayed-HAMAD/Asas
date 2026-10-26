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

const account = {
  id: 'module_context_admin',
  name: 'Module Context Admin',
  email: 'module.context@example.test',
  emailVerified: true,
  role: 'ADMIN',
}

const emptyMoney = { amount: 0, currency: 'USD' }

const attendanceResponse = {
  timesheets: [],
  exceptions: [],
  leaveRequests: [],
  summary: {
    exceptionCount: 0,
    exceptionCountPreviousPeriod: 0,
    onLeaveCount: 0,
    attendanceRate: null,
    attendanceRatePreviousPeriod: null,
    attendanceRateRangeDays: 30,
    attendanceRateRecordedDays: 0,
    timesheetCount: 0,
    overtimeHours: 0,
  },
  selfClock: null,
}

const salesPerformanceResponse = {
  monthlyClosedWon: [],
  byRep: [],
  summary: {
    totalWonCount: 0,
    totalLostCount: 0,
    overallWinRate: null,
    averageSalesCycleDays: null,
  },
  weeklyActivity: [],
  yearWonTotal: emptyMoney,
  previousYearWonTotal: emptyMoney,
  undatedClosedCount: 0,
}

const revenueForecastResponse = {
  liveForecastByRep: [],
  quotas: [],
  monthlyPipeline: [],
  monthlyCommit: [],
  summary: {
    totalQuota: emptyMoney,
    totalPipeline: emptyMoney,
    weightedPipeline: emptyMoney,
    unweightedPipeline: emptyMoney,
    unweightedDealCount: 0,
    dealCommit: emptyMoney,
    dealCommitCount: 0,
    dealBestCase: emptyMoney,
    dealBestCaseCount: 0,
    quotaAttainmentPct: null,
    excludedQuotaCount: 0,
  },
  baseCurrency: 'USD',
  availableYears: [String(new Date().getFullYear())],
}

async function createPage(browser, apiHandler) {
  const context = await browser.newContext()
  await mockAuth(context, account, apiHandler)
  const page = await context.newPage()
  await signIn(page, account)
  return { context, page }
}

test('empty finance workspaces keep page context and actionable next steps', async ({ browser }) => {
  const { context, page } = await createPage(browser, async route => {
    const path = new URL(route.request().url()).pathname

    if (path.endsWith('/finance/payables')) {
      return json(route, {
        data: {
          items: [],
          summary: {
            openOutstanding: emptyMoney,
            pastDueTotal: emptyMoney,
            dueIn7DaysTotal: emptyMoney,
            paidThisMonthTotal: null,
            paidThisMonthComparison: null,
            openCount: 0,
          },
        },
      })
    }

    if (path.endsWith('/finance/receivables')) {
      return json(route, {
        data: {
          items: [],
          summary: {
            openBalance: emptyMoney,
            agingBuckets: [],
            collectedThisMonthTotal: null,
            collectedThisMonthComparison: { previousTotal: null },
          },
        },
      })
    }

    if (path.endsWith('/finance/customers')) return json(route, { data: { items: [] } })

    if (path.endsWith('/finance/expenses')) {
      return json(route, {
        data: {
          items: [],
          pagination: { page: 1, limit: 25, total: 0, pages: 0 },
          summary: {
            pendingCount: 0,
            pendingTotal: emptyMoney,
            approvedCount: 0,
            approvedTotal: emptyMoney,
            flaggedCount: 0,
            flaggedTotal: emptyMoney,
            reimbursedThisMonthTotal: null,
            reimbursedThisMonthComparison: { previousTotal: null },
          },
        },
      })
    }

    if (path.endsWith('/finance/bank-statements')) return json(route, { data: { items: [] } })
    if (path.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    return json(route, { data: {} })
  })

  try {
    await page.goto('/dashboard/finance/accounts-payable')
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts Payable' })).toHaveCount(1)
    await expect(page.getByText('No open bills yet. Use New Bill to add the first vendor invoice.')).toBeVisible()

    await page.goto('/dashboard/finance/accounts-receivable')
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts Receivable' })).toHaveCount(1)
    await expect(page.getByText('No customers yet. Use Customers to add one before creating an invoice.')).toBeVisible()

    await page.goto('/dashboard/finance/expenses')
    await expect(page.getByRole('heading', { level: 1, name: 'Expenses' })).toHaveCount(1)
    await expect(page.getByText('No expenses yet. Use New Expense to submit the first report.')).toBeVisible()

    await page.goto('/dashboard/finance/reconciliation')
    await expect(page.getByRole('heading', { level: 1, name: 'Bank Reconciliation' })).toHaveCount(1)
    await expect(page.getByText('No statement imports yet')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('empty HR workspaces keep page context and actionable next steps', async ({ browser }) => {
  const { context, page } = await createPage(browser, async route => {
    const path = new URL(route.request().url()).pathname

    if (path.endsWith('/hr/attendance')) return json(route, { data: attendanceResponse })
    if (path.endsWith('/hr/departments')) return json(route, { data: { items: [] } })
    if (path.endsWith('/hr/leave-balances')) return json(route, { data: { items: [], year: new Date().getFullYear() } })
    if (path.endsWith('/hr/leave-policies')) return json(route, { data: { items: [] } })
    if (path.endsWith('/hr/candidates')) {
      return json(route, {
        data: {
          items: [],
          pagination: { page: 1, limit: 8, total: 0, pages: 0 },
          summary: { activeCandidates: 0, stageCounts: {} },
          roleOptions: [],
        },
      })
    }
    return json(route, { data: {} })
  })

  try {
    await page.goto('/dashboard/hr/time-attendance')
    await expect(page.getByRole('heading', { level: 1, name: 'Time & Attendance' })).toHaveCount(1)
    await expect(page.getByText('No weekly timesheets yet. Clocked-in shifts will appear here for approval.')).toBeVisible()

    await page.goto('/dashboard/hr/time-off')
    await expect(page.getByRole('heading', { level: 1, name: 'Time Off & Leave' })).toHaveCount(1)
    await expect(page.getByText('No time off requests yet. Submitted requests will appear here for review.')).toBeVisible()
    await expect(page.getByText('No annual leave balances recorded yet. Open Policies to set an allowance.')).toBeVisible()

    await page.goto('/dashboard/hr/recruitment')
    await expect(page.getByRole('heading', { level: 1, name: 'Recruitment' })).toHaveCount(1)
    await expect(page.getByText('No candidates yet')).toBeVisible()
    await expect(page.getByText('Use + Add Candidate to start the pipeline.')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('empty CRM workspaces keep page context and actionable next steps', async ({ browser }) => {
  const { context, page } = await createPage(browser, async route => {
    const path = new URL(route.request().url()).pathname

    if (path.endsWith('/crm/sales-performance')) return json(route, { data: salesPerformanceResponse })
    if (path.endsWith('/crm/forecast')) return json(route, { data: revenueForecastResponse })
    if (path.endsWith('/crm/deals')) {
      return json(route, { data: { items: [], pagination: { page: 1, limit: 3, total: 0, pages: 0 } } })
    }
    return json(route, { data: {} })
  })

  try {
    await page.goto('/dashboard/crm/sales-performance')
    await expect(page.getByRole('heading', { level: 1, name: 'Sales Performance' })).toHaveCount(1)
    await expect(page.getByText('No rep activity yet. Assign deals in Deals Pipeline to populate this leaderboard.')).toBeVisible()
    await expect(page.getByText('No closed deals yet. Close a deal in Deals Pipeline to populate this analysis.')).toBeVisible()
    await expect(page.getByText('No closed-won deals in this period. Choose All Dates or close a deal in Deals Pipeline.')).toBeVisible()

    await page.goto('/dashboard/crm/revenue-forecast')
    await expect(page.getByRole('heading', { level: 1, name: 'Revenue Forecast' })).toHaveCount(1)
    await expect(page.getByText('Add expected close dates in Deals Pipeline to build the forecast.')).toBeVisible()
    await expect(page.getByText(`No owned deals with a close date in ${new Date().getFullYear()} yet. Add close dates in Deals Pipeline or choose another year.`)).toBeVisible()
  } finally {
    await context.close()
  }
})
