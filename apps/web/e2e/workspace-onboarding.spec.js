import { expect, test } from '@playwright/test'

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
    await page.getByRole('link', { name: 'Create New Workspace' }).click()

    await expect(page).toHaveURL(/\/onboarding\?new=1$/)
    await expect(page.getByRole('heading', { name: 'Configure your enterprise profile' })).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Acme Global Holdings Inc.')).toHaveValue("Existing Owner's Workspace")
  } finally {
    await context.close()
  }
})
