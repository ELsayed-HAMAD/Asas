import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const workspace = {
  id: 'workspace_payroll', name: 'Payroll Workspace', slug: 'payroll-workspace', logo: null,
  currency: 'USD', onboardingStatus: 'IMPORTED', createdAt: '2026-10-01T00:00:00.000Z',
}
const owner = { id: 'payroll_owner', name: 'Pia Owner', email: 'pia@example.test', emailVerified: true }

const paidLine = (id, name, title, gross) => ({
  id,
  employee: { id: `employee_${id}`, name, title, departmentName: 'Finance' },
  gross: String(gross),
  deductions: String(Math.round(gross * 0.2)),
  net: String(Math.round(gross * 0.8)),
  taxableGross: String(gross),
  earnings: [],
  taxLines: [],
  employerCosts: [],
  currency: 'USD',
  status: 'PAID',
})

/**
 * A PENDING run renders the Approve action and no lines; a PAID run drops Approve and lists lines.
 * Both must produce the same toolbar, KPI row, and register shell.
 */
async function mockPayroll(context, populated) {
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) {
      return json(route, { session: { id: 'session_payroll', token: 'token', userId: owner.id, activeOrganizationId: workspace.id }, user: owner })
    }
    if (path.endsWith('/organization/list')) return json(route, [workspace])
    if (path.endsWith('/organization/get-full-organization')) return json(route, { ...workspace, members: [] })
    if (path.endsWith('/organization/get-active-member-role')) return json(route, { role: 'OWNER' })
    return json(route, {})
  })

  // Playwright resolves the most recently registered route first, so this fallback goes first.
  await context.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') return json(route, { data: {} })
    if (path.endsWith('/hr/departments')) return json(route, { data: [] })
    if (path.endsWith('/hr/payroll/my-payslips')) return json(route, { data: [] })
    if (path.endsWith('/hr/employees')) return json(route, { data: { items: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } } })
    return json(route, { data: {} })
  })

  await context.route('**/api/v1/hr/payroll/runs**', async route => {
    const url = new URL(route.request().url())
    const detailId = url.pathname.match(/\/hr\/payroll\/runs\/([^/]+)$/)?.[1]
    const status = populated ? 'PAID' : 'PENDING'
    if (detailId) {
      const isSecond = detailId === 'run_2'
      return json(route, {
        data: {
          id: detailId,
          label: isSecond ? 'June 2026 Payroll' : 'July 2026 Payroll',
          status: isSecond ? 'PENDING' : status,
          currency: 'USD',
          payDate: isSecond || !populated ? null : '2026-07-31',
          periodStart: null,
          periodEnd: null,
          lines: populated && !isSecond
            ? [
                paidLine('line_1', 'Anthony Hernandez', 'Chief Financial Officer', 260000),
                paidLine('line_2', 'Betty Perez', 'Software Engineer', 132200),
                paidLine('line_3', 'Christopher Martin', 'Software Engineer', 148200),
              ]
            : [],
          totals: populated && !isSecond
            ? { gross: '4393000', deductions: '879200', net: '3513800' }
            : { gross: '0', deductions: '0', net: '0' },
        },
      })
    }
    const items = populated
      ? [
          { id: 'run_1', label: 'July 2026 Payroll', status, currency: 'USD', payDate: '2026-07-31', periodStart: null, periodEnd: null },
          { id: 'run_2', label: 'June 2026 Payroll', status: 'PENDING', currency: 'USD', payDate: null, periodStart: null, periodEnd: null },
        ]
      : []
    return json(route, {
      data: { items, pagination: { page: 1, limit: 25, total: items.length, pages: items.length ? 1 : 0 } },
    })
  })
}

async function payrollGeometry(page) {
  return page.evaluate(() => {
    const box = element => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    }
    const toolbar = document.querySelector('div[class*="z-30"]')
    const toolbarRow = toolbar?.firstElementChild
    const kpiLabel = [...document.querySelectorAll('span')].find(element => element.textContent.trim() === 'Total Gross')
    const employeeHead = [...document.querySelectorAll('th')].find(element => element.textContent.trim() === 'EMPLOYEE')
    return {
      toolbar: box(toolbar),
      toolbarRow: box(toolbarRow),
      kpi: box(kpiLabel?.closest('div.rounded-2xl')),
      register: box(employeeHead?.closest('div.rounded-2xl')),
    }
  })
}

test('payroll keeps one geometry whether the run is empty or fully populated', async ({ browser }) => {
  async function measure(populated) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await mockPayroll(context, populated)
    try {
      const page = await context.newPage()
      await page.goto('/dashboard/hr/payroll')
      await expect(page.getByText('Total Gross', { exact: true })).toBeVisible()
      await expect(page.getByText('EMPLOYEE', { exact: true })).toBeVisible()
      return await payrollGeometry(page)
    } finally {
      await context.close()
    }
  }

  const empty = await measure(false)
  const populated = await measure(true)

  expect(empty.toolbar.h).toBe(populated.toolbar.h)
  expect(empty.toolbarRow.h).toBe(populated.toolbarRow.h)
  expect(empty.kpi).toEqual(populated.kpi)
  expect(empty.register).toEqual(populated.register)
  // One row, not two: the Approve action must not push the action cluster onto a second line.
  expect(empty.toolbarRow.h).toBeLessThan(48)
})

test('the empty payroll register keeps its column headers and footer', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await mockPayroll(context, false)
  try {
    const page = await context.newPage()
    await page.goto('/dashboard/hr/payroll')
    for (const heading of ['EMPLOYEE', 'GROSS', 'DEDUCTIONS', 'NET', 'PAYSLIP']) {
      await expect(page.getByRole('columnheader', { name: heading })).toBeVisible()
    }
    await expect(page.getByText('No payroll lines', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 0 of 0 employees', { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('the run selector switches runs and reads as empty when the workspace has none', async ({ browser }) => {
  const populatedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await mockPayroll(populatedContext, true)
  try {
    const page = await populatedContext.newPage()
    await page.goto('/dashboard/hr/payroll')
    const trigger = page.getByRole('combobox', { name: 'Payroll run' })
    await expect(trigger).toContainText('July 2026')
    await trigger.click()
    await expect(page.getByRole('option', { name: /June 2026/ })).toBeVisible()
    await page.getByRole('option', { name: /June 2026/ }).click()
    await expect(trigger).toContainText('June 2026')
  } finally {
    await populatedContext.close()
  }

  const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await mockPayroll(emptyContext, false)
  try {
    const page = await emptyContext.newPage()
    await page.goto('/dashboard/hr/payroll')
    const trigger = page.getByRole('combobox', { name: 'Payroll run' })
    await expect(trigger).toContainText('No payroll runs yet')
    await expect(trigger).toBeDisabled()
  } finally {
    await emptyContext.close()
  }
})
