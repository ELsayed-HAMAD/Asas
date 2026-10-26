import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockAuth(context, account) {
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

  await context.route('**/api/v1/**', route => json(route, { data: {} }))
}

async function signIn(page, account) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill('correct-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(account.name, { exact: true })).toBeVisible({ timeout: 15_000 })
}

test('user account & workspace popover menu satisfies compact Apple-Glass polish pass', async ({ browser }) => {
  const account = {
    id: 'qa_user',
    name: 'QA User',
    email: 'qa.user@example.com',
    emailVerified: true,
    role: 'ADMIN',
  }

  const context = await browser.newContext()
  await mockAuth(context, account)

  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, account)

  // 1. Open User Menu from Sidebar Footer
  const userMenuBtn = page.getByTestId('user-menu-button')
  await expect(userMenuBtn).toBeVisible()
  await userMenuBtn.click()

  // 2. Popover Container Checks
  const popover = page.locator('[role="menu"]')
  await expect(popover).toBeVisible()
  const box = await popover.boundingBox()
  expect(box).not.toBeNull()
  // Ensure popover width is compact (~248px), not the bloated 288px+ (w-72)
  expect(box.width).toBeLessThanOrEqual(255)
  expect(box.width).toBeGreaterThanOrEqual(235)

  // 3. User Identity Recessed Well
  await expect(popover.getByText('QA User', { exact: true })).toBeVisible()
  // Full email must be displayed without cutting off at gmail....
  const emailElement = popover.getByText('qa.user@example.com')
  await expect(emailElement).toBeVisible()
  expect(await emailElement.textContent()).toBe('qa.user@example.com')

  // Squircle avatar with initials EH
  const avatar = popover.locator('.w-9.h-9.rounded-xl')
  await expect(avatar).toBeVisible()
  await expect(avatar).toHaveText('QU')

  // Green online indicator dot
  const onlineDot = popover.locator('.bg-emerald-500.rounded-full')
  await expect(onlineDot).toBeVisible()

  // 4. Structured Workspace Section (Eliminates Duplicate Text Bug)
  // Overline label WORKSPACE
  await expect(popover.getByText('WORKSPACE', { exact: true })).toBeVisible()
  // Active workspace with badge initial and checkmark
  const workspaceRow = popover.locator('[role="menuitem"]').filter({ hasText: 'QA User Workspace' })
  await expect(workspaceRow).toBeVisible()
  // Workspace initial badge
  await expect(workspaceRow.locator('.w-5.h-5.rounded-md')).toHaveText('Q')
  // Checkmark inside workspace row
  await expect(workspaceRow.locator('svg.lucide-check')).toBeVisible()

  // Create New Workspace action
  await expect(popover.getByRole('menuitem', { name: /Create New Workspace/i })).toBeVisible()

  // 5. Full-Width Tactile Menu Rows (Zero Truncation, No 2-Column Grid Clipping)
  await expect(popover.getByRole('menuitem', { name: /Profile & Preferences/i })).toBeVisible()

  // Full-width Toggle Theme item with status pill
  const themeItem = popover.getByRole('menuitem', { name: /Toggle Theme/i })
  await expect(themeItem).toBeVisible()
  await expect(themeItem.getByText(/Light|Dark/i)).toBeVisible()

  // Full-width Language toggle item with status badge and data-testid
  const languageItem = popover.getByTestId('language-toggle')
  await expect(languageItem).toBeVisible()
  await expect(languageItem.getByText(/العربية|English/i)).toBeVisible()
  await expect(languageItem.getByText(/AR|EN/i)).toBeVisible()

  await expect(popover.getByRole('menuitem', { name: /Download Desktop App/i })).toBeVisible()

  // 6. Clean Destructive Log Out Footer
  const logoutItem = popover.getByRole('menuitem', { name: /Log Out/i })
  await expect(logoutItem).toBeVisible()
  await expect(logoutItem).toHaveClass(/text-rose-600/)

  await context.close()
})

