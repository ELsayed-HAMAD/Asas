import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const TENANT_ID = 'tenant_platform_abc123'

async function mockAuth(context, account, apiHandler, { orgStatus = 'ACTIVE' } = {}) {
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
      return json(route, [{ id: `workspace-${account.id}`, name: `${account.name} Workspace`, slug: `workspace-${account.id}`, logo: null, createdAt: new Date().toISOString(), status: orgStatus }])
    }
    if (path.endsWith('/organization/get-active-member-role') && account.role) {
      return json(route, { role: account.role })
    }
    if (path.endsWith('/organization/get-full-organization')) {
      return json(route, { id: `workspace-${account.id}`, name: `${account.name} Workspace`, slug: `workspace-${account.id}`, logo: null, createdAt: new Date().toISOString(), status: orgStatus, members: [] })
    }
    return json(route, {})
  })
  await context.route('**/api/v1/**', route => apiHandler ? apiHandler(route) : json(route, { data: {} }))
}

async function login(page, account) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill('correct-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function signIn(page, account) {
  await login(page, account)
  await expect(page.getByText(account.name, { exact: true })).toBeVisible({ timeout: 15_000 })
}

const workspace = {
  id: TENANT_ID,
  name: 'Acme Workspace',
  slug: 'acme',
  status: 'ACTIVE',
  onboardingStatus: 'EMPTY',
  planName: 'Standard Growth',
  priceMonthly: '29.00',
  currency: 'USD',
  seatsUsed: 2,
  seatLimit: 15,
  storageUsedGb: 1.5,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function platformHandler(capture) {
  return route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/platform/public-config')) {
      return json(route, { data: { maintenanceMode: false, signupsEnabled: true, exportsEnabled: true } })
    }
    if (path.endsWith('/platform/me')) {
      return json(route, { data: { userId: 'admin_1', name: 'Platform Owner', email: 'owner@example.test', platformRole: 'OWNER', twoFactorEnabled: true, requiresTwoFactor: false, nodeEnv: 'development', isProduction: false } })
    }
    if (path.endsWith('/platform/overview')) {
      return json(route, { data: {
        workspaceCount: 1,
        activeWorkspaceCount: 1,
        suspendedWorkspaceCount: 0,
        userCount: 3,
        activeSubscriptionCount: 1,
        pastDueSubscriptionCount: 0,
        mrr: '29.00',
        currency: 'USD',
        reportedStorageGb: 1.5,
        newWorkspaces30d: 1,
        newUsers30d: 2,
        planMix: [{ planName: 'Standard Growth', count: 1 }],
        recentAudit: [{ id: 'audit_1', action: 'workspace.plan.comp', targetType: 'Tenant', targetId: TENANT_ID, createdAt: '2026-10-28T10:00:00.000Z' }],
      } })
    }
    if (path.endsWith('/platform/workspaces')) {
      return json(route, { data: { items: [workspace], pagination: { page: 1, limit: 25, total: 1, pages: 1 }, summary: { total: 1, active: 1, suspended: 0 } } })
    }
    if (path.includes('/platform/workspaces/') && path.endsWith('/status')) {
      capture.statusBody = route.request().postDataJSON()
      return json(route, { data: { id: TENANT_ID, status: 'SUSPENDED', suspendedAt: new Date().toISOString(), suspendedReason: capture.statusBody.reason } })
    }
    if (path.includes('/platform/workspaces/') && path.endsWith('/plan')) {
      return json(route, { data: { id: 'sub_1', planName: 'Professional Scale', priceMonthly: '79.00', seatLimit: 50, storageLimitGb: 100 } })
    }
    if (path.includes('/platform/workspaces/')) {
      return json(route, { data: {
        workspace: { ...workspace, supportEmail: null, timezone: 'UTC', suspendedAt: null, suspendedReason: null },
        subscription: {
          id: 'sub_1', planName: 'Standard Growth', status: 'ACTIVE', priceMonthly: '29.00', currency: 'USD',
          renewsOn: null, stripeSubscriptionId: null, stripeCustomerId: null, seatsUsed: 2, seatLimit: 15, storageLimitGb: 25,
        },
        members: [{ id: 'member_1', userId: 'user_1', name: 'Workspace Owner', email: 'workspace.owner@example.test', role: 'OWNER', createdAt: '2026-01-01T00:00:00.000Z' }],
        footprint: { employees: 2, payableInvoices: 1, receivableInvoices: 1, deals: 0, projects: 1, products: 3 },
        recentAudit: [],
      } })
    }
    if (path.endsWith('/platform/users')) {
      return json(route, { data: {
        items: [{
          id: 'user_1', name: 'Workspace Owner', email: 'workspace.owner@example.test', emailVerified: true,
          twoFactorEnabled: false, platformRole: 'NONE', createdAt: '2026-01-01T00:00:00.000Z',
          memberships: [{ tenantId: TENANT_ID, tenantName: 'Acme Workspace', role: 'OWNER' }],
          lastSessionAt: '2026-10-28T10:00:00.000Z',
        }],
        pagination: { page: 1, limit: 25, total: 1, pages: 1 },
        summary: { total: 1, unverified: 0, withTwoFactor: 0 },
      } })
    }
    if (path.includes('/platform/users/') && path.endsWith('/revoke-sessions')) {
      return json(route, { data: { revoked: 1 } })
    }
    if (path.includes('/platform/users/')) {
      return json(route, { data: {
        user: {
          id: 'user_1', name: 'Workspace Owner', email: 'workspace.owner@example.test', emailVerified: true,
          twoFactorEnabled: false, platformRole: 'NONE', createdAt: '2026-01-01T00:00:00.000Z',
          memberships: [{ tenantId: TENANT_ID, tenantName: 'Acme Workspace', role: 'OWNER' }],
          lastSessionAt: '2026-10-28T10:00:00.000Z',
        },
        sessions: [],
        recentAudit: [],
      } })
    }
    if (path.endsWith('/platform/billing')) {
      return json(route, { data: {
        summary: { activeSubscriptions: 1, pastDueSubscriptions: 0, mrr: '29.00', currency: 'USD', invoiceTotal: '29.00', invoiceCount: 1 },
        subscriptions: [{
          id: 'sub_1', tenantId: TENANT_ID, tenantName: 'Acme Workspace', planName: 'Standard Growth',
          status: 'ACTIVE', priceMonthly: '29.00', currency: 'USD', renewsOn: null,
          stripeSubscriptionId: null, stripeCustomerId: null,
        }],
        invoices: [{
          id: 'inv_1', tenantId: TENANT_ID, tenantName: 'Acme Workspace', date: '2026-10-01T00:00:00.000Z',
          description: 'Standard Growth monthly', amount: '29.00', currency: 'USD', status: 'Paid', stripeInvoiceId: null,
        }],
      } })
    }
    if (path.endsWith('/platform/health')) {
      return json(route, { data: {
        status: 'ok', database: 'connected', uptimeSeconds: 7200, timestamp: new Date().toISOString(),
        nodeEnv: 'test', storageDriver: 'local', emailDelivery: 'disabled', queueMode: 'inline',
        redisConfigured: false, exportJobs: { queued: 0, running: 0, failed: 0, done: 0 }, failedJobs: [],
      } })
    }
    if (path.endsWith('/platform/flags')) {
      return json(route, { data: { maintenanceMode: false, signupsEnabled: true, exportsEnabled: true, updatedAt: null } })
    }
    if (path.includes('/platform/flags/')) {
      return json(route, { data: { maintenanceMode: false, signupsEnabled: false, exportsEnabled: true, updatedAt: new Date().toISOString() } })
    }
    if (path.endsWith('/platform/audit')) {
      return json(route, { data: {
        items: [{
          id: 'audit_1', actorId: 'admin_1', actorName: 'Platform Owner', actorEmail: 'owner@example.test',
          action: 'workspace.plan.comp', targetType: 'Tenant', targetId: TENANT_ID,
          metadata: '{"planId":"starter"}', ipAddress: '127.0.0.1', userAgent: 'test', createdAt: '2026-10-28T10:00:00.000Z',
        }],
        pagination: { page: 1, limit: 25, total: 1, pages: 1 },
        summary: null,
      } })
    }
    return json(route, { data: {} })
  }
}

test('a normal workspace owner cannot discover or open the platform console', async ({ browser }) => {
  const account = { id: 'normal_owner', name: 'Normal Owner', email: 'normal.owner@example.test', emailVerified: true, role: 'OWNER', platformRole: 'NONE' }
  const context = await browser.newContext()
  await mockAuth(context, account, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/platform/me')) {
      return json(route, { error: { message: 'Platform access is not available for this account' } }, 403)
    }
    if (path.endsWith('/platform/public-config')) {
      return json(route, { data: { maintenanceMode: false, signupsEnabled: true, exportsEnabled: true } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)
    await page.goto('/admin')
    await expect(page.getByText('Page not found')).toBeVisible()
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'User profile menu' }).click()
    await expect(page.getByText('Platform console', { exact: true })).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('a suspended workspace displays the suspended screen', async ({ browser }) => {
  const account = { id: 'suspended_owner', name: 'Suspended Owner', email: 'suspended.owner@example.test', emailVerified: true, role: 'OWNER', platformRole: 'NONE' }
  const context = await browser.newContext()
  await mockAuth(context, account, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/platform/public-config')) {
      return json(route, { data: { maintenanceMode: false, signupsEnabled: true, exportsEnabled: true } })
    }
    return json(route, { data: {} })
  }, { orgStatus: 'SUSPENDED' })
  const page = await context.newPage()
  try {
    await login(page, account)
    await expect(page.getByRole('heading', { name: 'Workspace suspended' })).toBeVisible()
    await expect(page.getByText(/currently suspended/)).toBeVisible()
  } finally {
    await context.close()
  }
})

test('maintenance mode replaces the workspace with a clear notice', async ({ browser }) => {
  const account = { id: 'maintenance_owner', name: 'Maintenance Owner', email: 'maintenance.owner@example.test', emailVerified: true, role: 'OWNER', platformRole: 'NONE' }
  const context = await browser.newContext()
  await mockAuth(context, account, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/platform/public-config')) {
      return json(route, { data: { maintenanceMode: true, signupsEnabled: true, exportsEnabled: true } })
    }
    return json(route, { data: {} })
  })
  const page = await context.newPage()
  try {
    await login(page, account)
    await expect(page.getByRole('heading', { name: 'Asas is under maintenance' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('the platform owner can inspect every console surface and suspend a workspace', async ({ browser }) => {
  test.setTimeout(120_000)
  const account = { id: 'platform_owner', name: 'Platform Owner', email: 'owner@example.test', emailVerified: true, role: 'OWNER', platformRole: 'OWNER' }
  const capture = {}
  const context = await browser.newContext()
  await mockAuth(context, account, platformHandler(capture))
  const page = await context.newPage()
  const main = page.locator('#platform-main-content')
  try {
    await signIn(page, account)
    await page.getByRole('button', { name: 'User profile menu' }).click()
    await expect(page.getByText('Platform console', { exact: true })).toBeVisible()
    await page.getByText('Platform console', { exact: true }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(main.getByRole('heading', { name: 'Platform overview' })).toBeVisible()
    await expect(main.getByText(/1 active/)).toBeVisible()
    await expect(page.getByText('Development data')).toBeVisible()
    const sidebar = page.getByTestId('platform-sidebar')
    await expect(sidebar).toBeVisible()
    await expect.poll(() => sidebar.evaluate(element => window.getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')

    await page.goto('/admin/workspaces')
    await expect(main.getByRole('heading', { name: 'Workspaces' })).toBeVisible()
    await page.getByRole('link', { name: 'Acme Workspace' }).click()
    await expect(main.getByRole('heading', { name: 'Acme Workspace' })).toBeVisible()
    await page.getByRole('button', { name: 'Suspend workspace' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Suspend workspace' })).toBeVisible()
    await dialog.getByLabel('Reason').fill('Security review')
    await dialog.getByRole('button', { name: 'Suspend workspace' }).click()
    await expect.poll(() => capture.statusBody).toEqual({ status: 'SUSPENDED', reason: 'Security review' })

    await page.goto('/admin/users')
    await expect(main.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(main.getByText('Workspace Owner')).toBeVisible()
    await main.getByText('Workspace Owner').click()
    const userDialog = page.getByRole('dialog')
    await expect(userDialog.getByRole('heading', { name: 'Workspace Owner' })).toBeVisible()
    await expect(userDialog.getByText('workspace.owner@example.test')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.goto('/admin/billing')
    await expect(main.getByRole('heading', { name: 'Billing' })).toBeVisible()
    await page.goto('/admin/health')
    await expect(main.getByRole('heading', { name: 'Health' })).toBeVisible()
    await page.goto('/admin/controls')
    await expect(main.getByRole('heading', { name: 'Platform controls' })).toBeVisible()
    await page.goto('/admin/audit')
    await expect(main.getByRole('heading', { name: 'Platform audit' })).toBeVisible()
    await expect(main.getByText('workspace.plan.comp')).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin')
    await expect(page.getByRole('button', { name: 'Open platform navigation' })).toBeVisible()
  } finally {
    await context.close()
  }
})
