import { expect, test } from '@playwright/test'

test('workspace chooser reports a failed workspace list and can retry without claiming the user has no memberships', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const firstWorkspace = {
    id: 'workspace_retry_one',
    name: 'Retry Workspace One',
    slug: 'retry-workspace-one',
    logo: null,
    currency: 'USD',
    onboardingStatus: 'IMPORTED',
    createdAt: new Date().toISOString(),
  }
  const secondWorkspace = {
    ...firstWorkspace,
    id: 'workspace_retry_two',
    name: 'Retry Workspace Two',
    slug: 'retry-workspace-two',
  }
  const user = {
    id: 'owner_retry',
    name: 'Retry Owner',
    email: 'owner.with.a.long.address@example.test',
    emailVerified: true,
  }
  let failWorkspaceList = true

  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            id: 'session_retry',
            token: 'token-retry',
            userId: user.id,
            activeOrganizationId: firstWorkspace.id,
          },
          user,
        }),
      })
    }
    if (path.endsWith('/organization/list')) {
      if (failWorkspaceList) return route.abort('failed')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([firstWorkspace, secondWorkspace]) })
    }
    if (path.endsWith('/organization/get-full-organization')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(firstWorkspace) })
    }
    if (path.endsWith('/organization/get-active-member-role')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'ADMIN' }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  try {
    const page = await context.newPage()
    await page.goto('/choose-workspace')

    await expect(page.getByRole('heading', { name: 'Select a workspace' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('We could not load your workspaces')
    await expect(page.getByText('No workspaces found', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry workspace list' })).toBeVisible()

    failWorkspaceList = false
    await page.getByRole('button', { name: 'Retry workspace list' }).click()
    await expect(page.getByRole('button', { name: 'Open Retry Workspace One (active workspace)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Retry Workspace Two' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  } finally {
    await context.close()
  }
})

test('an existing workspace owner can create a second workspace from the chooser', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const workspace = {
    id: 'workspace_existing',
    name: 'Existing Workspace',
    slug: 'existing-workspace',
    logo: null,
    currency: 'USD',
    onboardingStatus: 'IMPORTED',
    createdAt: new Date().toISOString(),
  }
  const secondExistingWorkspace = {
    ...workspace,
    id: 'workspace_second',
    name: 'Second Existing Workspace',
    slug: 'second-existing-workspace',
  }
  const user = { id: 'owner_existing', name: 'Existing Owner', email: 'owner@example.test', emailVerified: true }

  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body = {}
    if (path.endsWith('/get-session')) {
      body = {
        session: { id: 'session_existing', token: 'session-token', userId: user.id, activeOrganizationId: workspace.id },
        user,
      }
    } else if (path.endsWith('/organization/list')) {
      body = [workspace, secondExistingWorkspace]
    } else if (path.endsWith('/organization/get-full-organization')) {
      body = workspace
    } else if (path.endsWith('/organization/get-active-member-role')) {
      body = { role: 'OWNER' }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  try {
    const page = await context.newPage()
    await page.goto('/choose-workspace')
    await expect(page.getByRole('button', { name: 'Open Existing Workspace (active workspace)' })).toHaveAttribute('aria-current', 'true')
    await page.getByRole('link', { name: 'Create New Workspace' }).click()

    await expect(page).toHaveURL(/\/onboarding\?new=1$/)
    await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Acme Global Holdings Inc.')).toHaveValue("Existing Owner's Workspace")
  } finally {
    await context.close()
  }
})

test('onboarding refuses to create a duplicate workspace while memberships cannot be verified, then recovers on retry', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const user = {
    id: 'owner_membership_check',
    name: 'Membership Owner',
    email: 'membership.owner@example.test',
    emailVerified: true,
  }
  let failWorkspaceList = true
  let createCalls = 0

  const json = (route, body, status = 200) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(body),
  })

  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) {
      return json(route, {
        session: { id: 'session_membership_check', token: 'token', userId: user.id, activeOrganizationId: null },
        user,
      })
    }
    if (path.endsWith('/organization/get-full-organization')) return json(route, null)
    if (path.endsWith('/organization/list')) {
      if (failWorkspaceList) return route.abort('failed')
      return json(route, [])
    }
    if (path.endsWith('/organization/create')) {
      createCalls += 1
      return json(route, {
        id: 'workspace_should_not_exist',
        name: 'Membership Owner Workspace',
        slug: 'membership-owner-workspace',
        onboardingStatus: 'PENDING',
      })
    }
    if (path.endsWith('/organization/get-active-member-role')) return json(route, { role: 'OWNER' })
    return json(route, {})
  })

  try {
    const page = await context.newPage()
    await page.goto('/onboarding')

    await expect(page.getByText(/We could not check your existing workspaces\./)).toBeVisible()
    await page.getByRole('button', { name: 'Review workspace areas' }).click()
    await page.getByRole('button', { name: 'Choose how to start' }).click()
    await page.getByRole('button', { name: 'Launch workspace' }).click()

    await expect(page.getByText(/Retry the workspace check before creating a new one/)).toBeVisible()
    expect(createCalls).toBe(0)

    failWorkspaceList = false
    await page.getByRole('button', { name: 'Retry workspace check' }).click()
    await expect(page.getByRole('button', { name: 'Retry workspace check' })).toHaveCount(0)
    await expect(page.getByText(/We could not check your existing workspaces\./)).toHaveCount(0)
    expect(createCalls).toBe(0)

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  } finally {
    await context.close()
  }
})

test('onboarding retries on the same workspace after a setup failure', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const existingWorkspace = {
    id: 'workspace_existing_retry',
    name: 'Existing Workspace',
    slug: 'existing-workspace',
    logo: null,
    currency: 'USD',
    onboardingStatus: 'IMPORTED',
    createdAt: new Date().toISOString(),
  }
  const newWorkspace = {
    id: 'workspace_retry',
    name: "Existing Owner's Workspace",
    slug: 'existing-owners-workspace',
    logo: null,
    currency: 'USD',
    onboardingStatus: 'PENDING',
    createdAt: new Date().toISOString(),
  }
  const user = { id: 'owner_retry', name: 'Existing Owner', email: 'owner@example.test', emailVerified: true }
  let activeOrganizationId = existingWorkspace.id
  let created = false
  let createCalls = 0
  let settingsPatchCalls = 0
  let emptyCalls = 0

  const json = (route, body, status = 200) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(body),
  })

  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) {
      return json(route, {
        session: { id: 'session_retry', token: 'token', userId: user.id, activeOrganizationId },
        user,
      })
    }
    if (path.endsWith('/organization/list')) {
      return json(route, created ? [existingWorkspace, newWorkspace] : [existingWorkspace])
    }
    if (path.endsWith('/organization/get-full-organization')) {
      return json(route, activeOrganizationId === newWorkspace.id ? newWorkspace : existingWorkspace)
    }
    if (path.endsWith('/organization/get-active-member-role')) return json(route, { role: 'OWNER' })
    if (path.endsWith('/organization/create')) {
      createCalls += 1
      created = true
      activeOrganizationId = newWorkspace.id
      return json(route, newWorkspace)
    }
    if (path.endsWith('/organization/set-active')) {
      const body = route.request().postDataJSON()
      activeOrganizationId = body.organizationId
      return json(route, { id: activeOrganizationId })
    }
    return json(route, {})
  })
  await context.route('**/api/v1/settings/general', route => {
    if (route.request().method() !== 'PATCH') return json(route, { data: {} })
    settingsPatchCalls += 1
    if (settingsPatchCalls === 1) {
      return json(route, { error: { message: 'Simulated settings outage.' } }, 500)
    }
    return json(route, { data: {} })
  })
  await context.route('**/api/v1/billing/switch-plan', route => json(route, { data: {} }))
  await context.route('**/api/v1/onboarding/empty', route => {
    emptyCalls += 1
    return json(route, { data: { onboardingStatus: 'EMPTY' } })
  })
  await context.route('**/api/v1/onboarding/status', route => json(route, { data: { onboardingStatus: 'PENDING' } }))

  try {
    const page = await context.newPage()
    await page.goto('/onboarding?new=1')
    await page.getByRole('button', { name: 'Review workspace areas' }).click()
    await page.getByRole('button', { name: 'Choose how to start' }).click()
    await page.getByRole('button', { name: 'Launch workspace' }).click()

    await expect(page.getByRole('alert')).toContainText('Simulated settings outage.')
    await expect(page).toHaveURL(/\/onboarding\?new=1$/)
    expect(createCalls).toBe(1)

    const applyRequest = page.waitForResponse(response => (
      response.url().endsWith('/api/v1/onboarding/empty') &&
      response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Launch workspace' }).click()
    await applyRequest

    expect(createCalls).toBe(1)
    expect(settingsPatchCalls).toBe(2)
    expect(emptyCalls).toBe(1)
  } finally {
    await context.close()
  }
})

test('onboarding labels its fields, moves focus between steps, and fits a mobile viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const workspace = {
    id: 'workspace_mobile_setup', name: 'Pending Workspace', slug: 'pending-workspace', logo: null,
    currency: 'USD', onboardingStatus: 'PENDING', createdAt: new Date().toISOString(),
  }
  const user = { id: 'owner_mobile_setup', name: 'Mobile Owner', email: 'owner@example.test', emailVerified: true }
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body = {}
    if (path.endsWith('/get-session')) body = { session: { id: 'session_mobile_setup', token: 'token', userId: user.id, activeOrganizationId: workspace.id }, user }
    else if (path.endsWith('/organization/list')) body = [workspace]
    else if (path.endsWith('/organization/get-full-organization')) body = workspace
    else if (path.endsWith('/organization/get-active-member-role')) body = { role: 'OWNER' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  try {
    const page = await context.newPage()
    await page.goto('/onboarding')

    await expect(page.getByRole('heading', { name: 'Set up your workspace', level: 1 })).toBeVisible()
    await expect(page.getByLabel(/Company \/ Organization Name/)).toHaveValue('Pending Workspace')
    await expect(page.getByLabel('Base Reporting Currency')).toHaveValue('USD')
    await expect(page.getByLabel('Headquarters Timezone')).toBeVisible()

    await page.getByRole('button', { name: 'Review workspace areas' }).click()
    await expect(page.getByRole('heading', { name: 'Workspace areas', level: 1 })).toBeFocused()
    await page.getByRole('button', { name: 'Choose how to start' }).click()
    await expect(page.getByRole('heading', { name: 'Choose how to start', level: 1 })).toBeFocused()

    const cleanWorkspace = page.getByRole('button', { name: /Start with a clean workspace/ })
    await cleanWorkspace.click()
    await expect(cleanWorkspace).toHaveAttribute('aria-pressed', 'true')

    for (const locator of [cleanWorkspace, page.getByRole('button', { name: 'Launch workspace' })]) {
      const box = await locator.boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390.5)
    }
  } finally {
    await context.close()
  }
})

test('onboarding reviews and maps an employee CSV before enabling import', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const workspace = {
    id: 'workspace_pending', name: 'Pending Workspace', slug: 'pending-workspace', logo: null,
    currency: 'USD', onboardingStatus: 'PENDING', createdAt: new Date().toISOString(),
  }
  const user = { id: 'owner_migration', name: 'Migration Owner', email: 'migration@example.test', emailVerified: true }
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body = {}
    if (path.endsWith('/get-session')) {
      body = { session: { id: 'session_migration', token: 'session-token', userId: user.id, activeOrganizationId: workspace.id }, user }
    } else if (path.endsWith('/organization/list')) body = [workspace]
    else if (path.endsWith('/organization/get-full-organization')) body = workspace
    else if (path.endsWith('/organization/get-active-member-role')) body = { role: 'OWNER' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await context.route('**/api/v1/onboarding/import/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { validRows: payload.employees.length } }) })
  })

  try {
    const page = await context.newPage()
    await page.goto('/onboarding')
    await page.getByRole('button', { name: 'Review workspace areas' }).click()
    await page.getByRole('button', { name: 'Choose how to start' }).click()
    await page.getByRole('button', { name: /Bring existing employee data/ }).click()
    const csv = 'Full Name,Position,Department,Work Email,Monthly Salary\nAda Lovelace,Engineer,Research,ada@example.test,8400.00\nGrace Hopper,Director,Engineering,grace@example.test,12500'
    await page.getByRole('button', { name: 'Choose CSV' }).click()
    await page.getByLabel('Choose employee CSV file').setInputFiles({
      name: 'employees.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
    })

    await expect(page.getByText('2 records validated')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Ada Lovelace' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Grace Hopper' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import 2 employees & launch' })).toBeEnabled()
  } finally {
    await context.close()
  }
})

test('onboarding saves a resumable company migration project before launching a usable workspace', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const workspace = {
    id: 'workspace_migration_plan', name: 'Acme Ltd.', slug: 'acme-ltd', logo: null,
    currency: 'USD', onboardingStatus: 'PENDING', createdAt: new Date().toISOString(),
  }
  const user = { id: 'owner_plan', name: 'Migration Owner', email: 'owner@example.test', emailVerified: true }
  let migrationPlan = null
  let workspaceInitialized = false

  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body = {}
    if (path.endsWith('/get-session')) body = { session: { id: 'session_plan', token: 'session-token', userId: user.id, activeOrganizationId: workspace.id }, user }
    else if (path.endsWith('/organization/list')) body = [workspace]
    else if (path.endsWith('/organization/get-full-organization')) body = workspace
    else if (path.endsWith('/organization/get-active-member-role')) body = { role: 'OWNER' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await context.route('**/api/v1/settings/general', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { name: 'Acme Ltd.' } }) }))
  await context.route('**/api/v1/billing/switch-plan', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { planId: 'free' } }) }))
  await context.route('**/api/v1/onboarding/migration-project', async route => {
    migrationPlan = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      id: 'migration_project_1', name: migrationPlan.name, sourceSystem: null, modules: migrationPlan.modules,
      status: 'PLANNING', targetCutoverAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), jobs: [],
    } }) })
  })
  await context.route('**/api/v1/onboarding/empty', async route => {
    workspaceInitialized = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { onboardingStatus: 'EMPTY' } }) })
  })

  try {
    const page = await context.newPage()
    await page.goto('/onboarding')
    await page.getByRole('button', { name: 'Review workspace areas' }).click()
    await page.getByRole('button', { name: 'Choose how to start' }).click()
    await expect(page.getByRole('button', { name: /Start with a clean workspace/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /Plan a company-wide migration/ }).click()
    await expect(page.getByRole('button', { name: /Start with a clean workspace/ })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: /Plan a company-wide migration/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /People & payroll/ }).click()
    await expect(page.getByRole('alert')).toContainText('Select at least one company area')
    await expect(page.getByRole('button', { name: /Save migration plan & launch/ })).toBeDisabled()
    await page.getByRole('button', { name: /People & payroll/ }).click()
    await page.getByRole('button', { name: /CRM & pipeline/ }).click()
    await page.getByRole('button', { name: /Finance & accounting/ }).click()
    await expect(page.getByText('Start mode:')).toBeVisible()
    await expect(page.getByText('Company migration plan', { exact: true })).toBeVisible()
    await expect(page.getByText('Finance & accounting, People & payroll, CRM & pipeline', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Save migration plan & launch/ }).click()
    await expect.poll(() => migrationPlan).not.toBeNull()
    await expect.poll(() => workspaceInitialized).toBe(true)
    expect(migrationPlan.modules).toEqual(expect.arrayContaining(['HR', 'CRM', 'FINANCE']))
  } finally {
    await context.close()
  }
})

test('Settings Data Migration persists a company scope plan', async ({ browser }) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const workspace = {
    id: 'workspace_settings_migration', name: 'Acme Ltd.', slug: 'acme-ltd-settings', logo: null,
    currency: 'USD', onboardingStatus: 'EMPTY', createdAt: new Date().toISOString(),
  }
  const user = { id: 'owner_settings', name: 'Migration Owner', email: 'owner@example.test', emailVerified: true }
  let projects = []
  let createdPayload = null
  let companyImportPayload = null
  let dealImportPayload = null
  let productImportPayload = null
  let openingStockImportPayload = null
  let valuedOpeningStockImportPayload = null
  let inventorySupplierImportPayload = null
  let productSupplierImportPayload = null
  let financeCustomerImportPayload = null
  let financeVendorImportPayload = null
  const financeStagePayloads = {}
  const stagedBatches = []
  let financeCutoverPayload = null
  let projectPortfolioImportPayload = null
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body = {}
    if (path.endsWith('/get-session')) body = { session: { id: 'session_settings', token: 'session-token', userId: user.id, activeOrganizationId: workspace.id }, user }
    else if (path.endsWith('/organization/list')) body = [workspace]
    else if (path.endsWith('/organization/get-full-organization')) body = workspace
    else if (path.endsWith('/organization/get-active-member-role')) body = { role: 'OWNER' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await context.route('**/api/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) }))
  await context.route('**/api/v1/settings/data-migrations', async route => {
    if (route.request().method() === 'POST') {
      createdPayload = route.request().postDataJSON()
      const now = new Date().toISOString()
      projects = [{ id: 'cmigrationui00000000000001', ...createdPayload, status: 'PLANNING', createdAt: now, updatedAt: now, jobs: [], stagedBatches }]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: projects[0] }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { projects } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/crm/companies/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      totalRows: payload.companies.length, validRows: payload.companies.length, alreadyImported: false, issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/crm/companies/import', async route => {
    companyImportPayload = route.request().postDataJSON()
    const now = new Date().toISOString()
    const job = { id: 'crm_import_job', entity: 'CRM_COMPANIES', status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
    projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [job] }]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/crm/deals/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      totalRows: payload.deals.length, validRows: payload.deals.length, alreadyImported: false, issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/crm/deals/import', async route => {
    dealImportPayload = route.request().postDataJSON()
    const now = new Date().toISOString()
    const job = { id: 'crm_deal_import_job', entity: 'CRM_DEALS', status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
    projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [...projects[0].jobs, job] }]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/products/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      totalRows: payload.products.length, validRows: payload.products.length, alreadyImported: false, issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/products/import', async route => {
    productImportPayload = route.request().postDataJSON()
    const now = new Date().toISOString()
    const job = { id: 'inventory_products_job', entity: 'INVENTORY_PRODUCTS', status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
    projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [...projects[0].jobs, job] }]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/opening-stock/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      totalRows: payload.stock.length, validRows: payload.stock.length, alreadyImported: false, issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/opening-stock/import', async route => {
    openingStockImportPayload = route.request().postDataJSON()
    if (openingStockImportPayload.stock.some(row => row.unitCost)) valuedOpeningStockImportPayload = openingStockImportPayload
    const now = new Date().toISOString()
    const job = { id: 'inventory_opening_stock_job', entity: 'INVENTORY_OPENING_STOCK', status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
    projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [...projects[0].jobs, job] }]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/suppliers/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      totalRows: payload.suppliers.length, validRows: payload.suppliers.length, alreadyImported: false, issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/suppliers/import', async route => {
    inventorySupplierImportPayload = route.request().postDataJSON()
    const now = new Date().toISOString()
    const job = { id: 'inventory_suppliers_job', entity: 'INVENTORY_SUPPLIERS', status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
    projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [...projects[0].jobs, job] }]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/product-suppliers/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      totalRows: payload.links.length, validRows: payload.links.length, alreadyImported: false, issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/inventory/product-suppliers/import', async route => {
    productSupplierImportPayload = route.request().postDataJSON()
    const now = new Date().toISOString()
    const job = { id: 'inventory_product_suppliers_job', entity: 'INVENTORY_PRODUCT_SUPPLIERS', status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
    projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [...projects[0].jobs, job] }]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
  })
  for (const [kind, capture] of [['customers', value => { financeCustomerImportPayload = value }], ['vendors', value => { financeVendorImportPayload = value }]]) {
    await context.route(`**/api/v1/settings/data-migrations/*/finance/${kind}/validate`, async route => {
      const payload = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
        totalRows: payload[kind].length, validRows: payload[kind].length, alreadyImported: false, issues: [],
      } }) })
    })
    await context.route(`**/api/v1/settings/data-migrations/*/finance/${kind}/import`, async route => {
      capture(route.request().postDataJSON())
      const now = new Date().toISOString()
      const entity = `FINANCE_${kind.toUpperCase()}`
      const job = { id: `${kind}_job`, entity, status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
      projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [...projects[0].jobs, job] }]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
    })
  }
  for (const [kind, payloadKey, entity] of [
    ['ap-open-items', 'items', 'FINANCE_AP_OPEN_ITEMS'],
    ['ar-open-items', 'items', 'FINANCE_AR_OPEN_ITEMS'],
    ['opening-balance', 'lines', 'FINANCE_OPENING_BALANCE'],
  ]) {
    await context.route(`**/api/v1/settings/data-migrations/*/finance/${kind}/validate`, async route => {
      const payload = route.request().postDataJSON()
      const rows = payload[payloadKey]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
        totalRows: rows.length, validRows: rows.length, alreadyStaged: false, issues: [],
      } }) })
    })
    await context.route(`**/api/v1/settings/data-migrations/*/finance/${kind}/stage`, async route => {
      const payload = route.request().postDataJSON()
      financeStagePayloads[kind] = payload
      const now = new Date().toISOString()
      const batch = { id: `stage-${kind}`, entity, status: 'STAGED', totalRows: payload[payloadKey].length, stagedRows: payload[payloadKey].length, createdAt: now }
      stagedBatches.push(batch)
      projects = [{ ...projects[0], status: 'IN_PROGRESS', stagedBatches: [...stagedBatches] }]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { batch, replayed: false } }) })
    })
  }
  await context.route('**/api/v1/settings/data-migrations/*/finance/staged-records**', async route => {
    const query = new URL(route.request().url()).searchParams
    const entity = query.get('entity')
    const kind = entity === 'FINANCE_AP_OPEN_ITEMS' ? 'ap-open-items' : entity === 'FINANCE_AR_OPEN_ITEMS' ? 'ar-open-items' : 'opening-balance'
    const payloadKey = kind === 'opening-balance' ? 'lines' : 'items'
    const sourceRows = financeStagePayloads[kind]?.[payloadKey] ?? []
    const page = Number(query.get('page') || 1)
    const limit = Number(query.get('limit') || 50)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      items: sourceRows.slice((page - 1) * limit, page * limit).map((payload, index) => ({ id: `record-${entity}-${index}`, entity, sourceId: payload.sourceId ?? `ACCOUNT:${payload.code}`, payload, createdAt: new Date().toISOString() })),
      pagination: { page, limit, total: sourceRows.length, pages: Math.ceil(sourceRows.length / limit) },
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/finance/reconciliation', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      targetCutoverAt: '2026-09-30', workspaceCurrency: 'USD', state: financeCutoverPayload ? 'CUTOVER_COMPLETED' : 'RECONCILED_PENDING_CUTOVER', cutoverAvailable: false,
      evidence: { apRows: 1, eligibleApRows: 1, pendingApRows: 0, arRows: 1, trialBalanceRows: 2, activeJournalCount: 0, existingPayableInvoiceCount: 0, existingReceivableInvoiceCount: 0 },
      balances: { sourceApControl: '800.0000', stagedEligibleApAtCutoverFx: '800.0000', apDifference: '0.0000', sourceArControl: '600.0000', stagedArAtCutoverFx: '600.0000', arDifference: '0.0000', residualDebit: '12200.0000', residualCredit: '12000.0000' },
      issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/finance/cutover', async route => {
    financeCutoverPayload = route.request().postDataJSON()
    stagedBatches.splice(0, stagedBatches.length, ...stagedBatches.map(batch => ({ ...batch, status: 'COMPLETED' })))
    projects = [{ ...projects[0], stagedBatches: [...stagedBatches] }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      replayed: false, cutoverAt: '2026-09-30', openingJournalId: 'opening_journal_1', importedPayables: 1, importedReceivables: 1, pendingPayablesNotRecognized: 0,
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/projects/portfolio/validate', async route => {
    const payload = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      totalRows: payload.projects.length, validRows: payload.projects.length, alreadyImported: false, issues: [],
    } }) })
  })
  await context.route('**/api/v1/settings/data-migrations/*/projects/portfolio/import', async route => {
    projectPortfolioImportPayload = route.request().postDataJSON()
    const now = new Date().toISOString()
    const job = { id: 'projects_portfolio_job', entity: 'PROJECTS_PROJECTS', status: 'COMPLETED', totalRows: 1, importedRows: 1, createdAt: now, completedAt: now }
    projects = [{ ...projects[0], status: 'IN_PROGRESS', jobs: [...projects[0].jobs, job] }]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { imported: 1, replayed: false, job } }) })
  })

  try {
    const page = await context.newPage()
    await page.goto('/dashboard/settings/data-migration')
    await expect(page.getByRole('heading', { name: /Bring your business data into Asas/ })).toBeVisible({ timeout: 15_000 })
    await page.locator('button[aria-pressed="false"]').filter({ hasText: 'People & HR' }).click()
    await page.locator('button[aria-pressed="false"]').filter({ hasText: 'CRM' }).click()
    await page.locator('button[aria-pressed="false"]').filter({ hasText: 'Inventory' }).click()
    await page.locator('button[aria-pressed="false"]').filter({ hasText: 'Finance' }).click()
    await page.locator('button[aria-pressed="false"]').filter({ hasText: 'Projects' }).click()
    await page.getByLabel(/Target cutover date/).fill('2026-09-30')
    await page.getByRole('button', { name: 'Create migration project' }).click()
    await expect.poll(() => createdPayload).not.toBeNull()
    expect(createdPayload.modules).toEqual(expect.arrayContaining(['HR', 'CRM', 'INVENTORY']))
    await expect(page.getByText('Company migration project created.')).toBeVisible()

    await page.getByLabel('Choose CRM company CSV file').setInputFiles({
      name: 'companies.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source Record ID,Company Name,Customer Tier\nerp-co-7,Northstar Manufacturing,Enterprise'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 CRM companies' }).click()
    await expect.poll(() => companyImportPayload).not.toBeNull()
    expect(companyImportPayload.companies).toEqual([{ sourceId: 'erp-co-7', name: 'Northstar Manufacturing', tier: 'Enterprise' }])
    await expect(page.getByText(/1 CRM companies imported/)).toBeVisible()

    await page.getByLabel('Choose CRM deal CSV file').setInputFiles({
      name: 'deals.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source record ID,Deal name,Asas deal stage,Value in workspace currency,Company source record ID,Owner employee email,Win probability (0–100),Expected close date (YYYY-MM-DD),Actual close date (closed deals)\nerp-deal-4,Northstar renewal,CLOSED_WON,1250.50,erp-co-7,rep@example.test,100,2025-06-30,2025-06-30'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 CRM deals' }).click()
    await expect.poll(() => dealImportPayload).not.toBeNull()
    expect(dealImportPayload.deals[0]).toMatchObject({ sourceId: 'erp-deal-4', stage: 'CLOSED_WON', value: '1250.50', companySourceId: 'erp-co-7', ownerEmail: 'rep@example.test', closeDate: '2025-06-30', actualCloseDate: '2025-06-30' })
    await expect(page.getByText(/1 CRM deals imported/)).toBeVisible()

    await page.getByLabel('Choose inventory product CSV file').setInputFiles({
      name: 'products.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source record ID,SKU,Product name,Sale price (workspace currency),Minimum stock threshold,Average monthly usage,Lead time in days,Warehouse,Aisle,Bin,Source creation date (optional)\nerp-item-12,SKU-12,Industrial filter,49.95,12,25,14,Main warehouse,A-04,BIN-12,2025-02-01'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 products' }).click()
    await expect.poll(() => productImportPayload).not.toBeNull()
    expect(productImportPayload.products[0]).toMatchObject({ sourceId: 'erp-item-12', sku: 'SKU-12', name: 'Industrial filter', salePrice: '49.95', minThreshold: '12', warehouse: 'Main warehouse' })
    await expect(page.getByText(/1 inventory products imported/)).toBeVisible()

    await page.getByLabel('Choose inventory opening stock CSV file').setInputFiles({
      name: 'opening-stock.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source product ID,Opening quantity,Stock count as of (YYYY-MM-DD)\nerp-item-12,240,2026-09-30'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 row' }).click()
    await expect.poll(() => openingStockImportPayload).not.toBeNull()
    expect(openingStockImportPayload.stock).toEqual([{ sourceProductId: 'erp-item-12', quantity: '240', asOf: '2026-09-30' }])
    await expect(page.getByText(/1 opening stock row imported/)).toBeVisible()
    await expect(page.getByText(/1 positive row remains quantity-only/)).toBeVisible()

    await page.getByLabel('Choose inventory opening stock CSV file').setInputFiles({
      name: 'opening-stock-valued.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source product ID,Opening quantity,Source unit cost,Stock count as of (YYYY-MM-DD)\nerp-item-13,12,7.25,2026-09-30'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 row' }).click()
    await expect.poll(() => valuedOpeningStockImportPayload).not.toBeNull()
    expect(valuedOpeningStockImportPayload.stock).toEqual([{ sourceProductId: 'erp-item-13', quantity: '12', unitCost: '7.25', asOf: '2026-09-30' }])
    await expect(page.getByText(/1 valued row posted inventory against opening equity/)).toBeVisible()

    await page.getByLabel('Choose inventory supplier CSV file').setInputFiles({
      name: 'suppliers.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source supplier ID,Supplier name,Source creation date (optional)\nerp-supplier-12,Northstar Industrial Supply,2025-04-12'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 suppliers' }).click()
    await expect.poll(() => inventorySupplierImportPayload).not.toBeNull()
    expect(inventorySupplierImportPayload.suppliers[0]).toMatchObject({ sourceId: 'erp-supplier-12', name: 'Northstar Industrial Supply', sourceCreatedAt: '2025-04-12' })
    await expect(page.getByText(/1 Inventory suppliers imported/)).toBeVisible()

    await page.getByLabel('Choose product supplier link CSV file').setInputFiles({
      name: 'product-suppliers.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source product ID,Source supplier ID\nerp-item-12,erp-supplier-12'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 links' }).click()
    await expect.poll(() => productSupplierImportPayload).not.toBeNull()
    expect(productSupplierImportPayload.links).toEqual([{ sourceProductId: 'erp-item-12', sourceSupplierId: 'erp-supplier-12' }])
    await expect(page.getByText(/1 product–supplier links imported/)).toBeVisible()

    await page.getByLabel('Choose Finance customer CSV file').setInputFiles({
      name: 'customers.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source record ID,Customer name,Customer email\nerp-customer-8,Northstar Manufacturing,billing@example.test'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 customers' }).click()
    await expect.poll(() => financeCustomerImportPayload).not.toBeNull()
    expect(financeCustomerImportPayload.customers[0]).toMatchObject({ sourceId: 'erp-customer-8', name: 'Northstar Manufacturing', email: 'billing@example.test' })
    await expect(page.getByText(/1 Finance customers imported/)).toBeVisible()

    await page.getByLabel('Choose Finance vendor CSV file').setInputFiles({
      name: 'vendors.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source record ID,Vendor name\nerp-vendor-2,Industrial Supply Co.'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 vendors' }).click()
    await expect.poll(() => financeVendorImportPayload).not.toBeNull()
    expect(financeVendorImportPayload.vendors[0]).toMatchObject({ sourceId: 'erp-vendor-2', name: 'Industrial Supply Co.' })
    await expect(page.getByText(/1 Finance vendors imported/)).toBeVisible()

    await page.getByLabel('Choose Finance payables CSV file').setInputFiles({
      name: 'payables.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source invoice ID,Vendor source ID,Invoice number,Invoice date,Due date,Currency,Open balance,Original amount,Paid to date,Source AP status\nerp-ap-9,erp-vendor-2,AP-9,2026-08-01,2026-08-31,USD,800.00,1000.00,200.00,APPROVED'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Save staged batch' }).nth(0).click()
    await expect.poll(() => financeStagePayloads['ap-open-items']).not.toBeNull()
    expect(financeStagePayloads['ap-open-items'].items[0]).toMatchObject({ sourceId: 'erp-ap-9', vendorSourceId: 'erp-vendor-2', openAmount: '800.00', originalAmount: '1000.00', paidAmount: '200.00', status: 'APPROVED' })
    await expect(page.getByText(/saved to migration staging/).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: 'erp-ap-9' }).first()).toBeVisible()

    await page.getByLabel('Choose Finance receivables CSV file').setInputFiles({
      name: 'receivables.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source invoice ID,Customer source ID,Invoice number,Invoice date,Due date,Currency,Open balance,Original amount,Paid to date,Source AR status\nerp-ar-8,erp-customer-8,AR-8,2026-08-01,2026-08-31,USD,600.00,750.00,150.00,OVERDUE'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Save staged batch' }).nth(1).click()
    await expect.poll(() => financeStagePayloads['ar-open-items']).not.toBeNull()
    expect(financeStagePayloads['ar-open-items'].items[0]).toMatchObject({ sourceId: 'erp-ar-8', customerSourceId: 'erp-customer-8', openAmount: '600.00', status: 'OVERDUE' })

    await page.getByLabel('Choose Finance trial balance lines CSV file').setInputFiles({
      name: 'trial-balance.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Asas account code,Account name,Account type,Balance side,Balance amount\nCASH,Cash,ASSET,DEBIT,12200.00\nCAPITAL,Capital,EQUITY,CREDIT,12000.00'),
    })
    await page.getByLabel('Source AR control balance (workspace currency)').fill('600.00')
    await page.getByLabel('Source AP control balance (workspace currency)').fill('800.00')
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Save staged batch' }).nth(2).click()
    await expect.poll(() => financeStagePayloads['opening-balance']).not.toBeNull()
    expect(financeStagePayloads['opening-balance']).toMatchObject({ asOf: '2026-09-30', accountsReceivableControlTotal: '600.00', accountsPayableControlTotal: '800.00', lines: expect.arrayContaining([expect.objectContaining({ code: 'CASH', amount: '12200.00' })]) })
    await expect(page.getByText(/Opening trial balance staged/)).toBeVisible()
    await page.getByRole('button', { name: 'Run reconciliation preview' }).click()
    await expect(page.getByText('Reconciled · ready for cutover')).toBeVisible()
    await expect(page.getByText('Eligible AP at cutover FX')).toBeVisible()
    await expect(page.getByText(/Committing creates the opening journal and linked open invoices in one transaction/)).toBeVisible()
    await page.getByRole('button', { name: 'Commit Finance cutover' }).click()
    await expect(page.getByRole('heading', { name: 'Commit Finance migration cutover?' })).toBeVisible()
    await page.getByRole('button', { name: 'Commit cutover' }).click()
    await expect.poll(() => financeCutoverPayload).toMatchObject({ acknowledge: 'I_CONFIRM_FINANCE_CUTOVER' })
    await expect(page.getByText('Finance cutover completed')).toBeVisible()

    await page.getByLabel('Choose project portfolio CSV file').setInputFiles({
      name: 'projects.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Source record ID,Project name,Asas project status,Budget (optional),Budget currency (required with budget),Timeline date (YYYY-MM-DD),Source creation date (optional)\nerp-project-5,Warehouse modernization,ON_TRACK,250000.00,USD,2027-03-31,2025-01-15'),
    })
    await expect(page.getByText('All rows validated').last()).toBeVisible()
    await page.getByRole('button', { name: 'Import 1 projects' }).click()
    await expect.poll(() => projectPortfolioImportPayload).not.toBeNull()
    expect(projectPortfolioImportPayload.projects[0]).toMatchObject({ sourceId: 'erp-project-5', name: 'Warehouse modernization', status: 'ON_TRACK', budget: '250000.00', currency: 'USD', timeline: '2027-03-31' })
    await expect(page.getByText(/1 projects imported/)).toBeVisible()
  } finally {
    await context.close()
  }
})
