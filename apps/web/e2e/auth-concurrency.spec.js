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
    await page.goto('/dashboard/settings/billing')
    await page.getByRole('heading', { name: 'Available plans' }).waitFor()
    await page.getByRole('button', { name: 'Choose plan' }).click()
    await expect(page).toHaveURL('https://checkout.stripe.com/test-session')
    await expect(page).toHaveTitle('Hosted checkout test')
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
    await page.getByRole('button', { name: 'Year-end rounding review' }).click()
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
  const firstPage = Array.from({ length: 25 }, (_, index) => ({
    id: `candidate_page_one_${index}`,
    name: `Candidate ${String(index + 1).padStart(2, '0')}`,
    role: 'Engineer', stage: 'APPLIED', stageEnteredAt: '2026-10-01T00:00:00.000Z', timeInStage: '11d', activity: [],
    appliedAt: '2026-10-01T00:00:00.000Z', avatarUrl: null, currentRole: null, experience: null, source: null,
    location: null, email: null, education: null, resumeUrl: null,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  }))
  const lastCandidate = {
    ...firstPage[0], id: 'candidate_page_two', name: 'Candidate 26', role: 'Designer',
  }
  const summary = {
    stageCounts: { APPLIED: 26, SCREENING: 0, TECH_INTERVIEW: 0, FINAL_INTERVIEW: 0, OFFER_SENT: 0, HIRED: 0, REJECTED: 0 },
    activeCandidates: 26, totalHired: 0, hiredThisPeriod: 0, hiredPreviousPeriod: 0,
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
      const total = role === 'Designer' || search?.toLowerCase().includes('designer') ? 1 : 26
      const pages = Math.ceil(total / 25)
      return json(route, { data: {
        items,
        pagination: { page: pageNumber, limit: 25, total, pages },
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
    await expect(page.getByText('Candidate 25', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–25 of 26 candidates')).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
    await expect(page.getByText('Candidate 26', { exact: true })).toBeVisible()
    await page.getByRole('combobox', { name: 'Filter by candidate role' }).selectOption('Designer')
    await expect(page.getByText('Candidate 26', { exact: true })).toBeVisible()
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
      const expenses = pageNumber === 1 ? Array.from({ length: 25 }, (_, index) => makeExpense(index + 1)) : [makeExpense(26)]
      return json(route, { data: {
        items: expenses, pagination: { page: pageNumber, limit, total: 26, pages: 2 },
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
    await expect(page.getByText('Showing 1–25 of 26 expenses')).toBeVisible()
    await page.getByRole('button', { name: 'Next expense page' }).click()
    await expect.poll(() => expenseRequests.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    await expect(page.getByText('Showing 26–26 of 26 expenses')).toBeVisible()
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
        : pageNumber === 1
          ? Array.from({ length: 25 }, (_, index) => ({ id: `bill_${index + 1}`, vendor: `Vendor ${index + 1}`, vendorId: null, invoiceNumber: `OPEN-${index + 1}`, date: '2026-10-01T00:00:00.000Z', dueDate: null, amount: { amount: 1000, currency: 'USD' }, status: 'PENDING' }))
          : [{ id: 'bill_26', vendor: 'Last Open Vendor', vendorId: null, invoiceNumber: 'OPEN-026', date: '2026-10-02T00:00:00.000Z', dueDate: null, amount: { amount: 2000, currency: 'USD' }, status: 'PENDING' }]
      return json(route, { data: { items, pagination: { page: pageNumber, limit: 25, total: history ? 1 : 26, pages: history ? 1 : 2 }, summary: {
        openOutstanding: { amount: 27000, currency: 'USD' }, pendingCount: 26, pendingTotal: { amount: 27000, currency: 'USD' }, scheduledCount: 0, scheduledTotal: { amount: 0, currency: 'USD' }, paidCount: 1, paidTotal: { amount: 5000, currency: 'USD' }, rejectedCount: 0, rejectedTotal: { amount: 0, currency: 'USD' }, voidCount: 0, voidTotal: { amount: 0, currency: 'USD' }, pastDueTotal: { amount: 0, currency: 'USD' }, dueIn7DaysTotal: { amount: 0, currency: 'USD' }, paidThisMonthTotal: { amount: 0, currency: 'USD' }, paidThisMonthComparison: null,
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
    await page.goto('/dashboard/finance/accounts-payable')
    await expect(page.getByText('Vendor 25', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–25 of 26')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25 && item.statusGroup === 'OPEN')).toBe(true)
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
    await page.goto('/dashboard/inventory')
    const table = page.getByRole('table')
    await expect(table.getByText('Product 25', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–25 of 26 products')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => requested.some(item => item.page === 2 && item.limit === 25)).toBe(true)
    await expect(table.getByText('Product 26', { exact: true })).toBeVisible()
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
    await page.goto('/dashboard/inventory/movements')
    await page.getByRole('button', { name: 'Record Movement' }).click()
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
