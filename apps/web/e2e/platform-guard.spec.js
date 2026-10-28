import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const OWNER = {
  userId: 'user_platform_owner',
  name: 'Platform Owner',
  email: 'owner@example.test',
  platformRole: 'OWNER',
  twoFactorEnabled: true,
  twoFactorVerified: true,
  requiresTwoFactor: false,
  requiresTwoFactorVerification: false,
  nodeEnv: 'test',
  isProduction: false,
}

async function mockSession(context) {
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) return json(route, null)
    return json(route, {})
  })
  await context.route('**/api/v1/auth/providers', route => json(route, {
    data: { google: false, devAuthAllowed: false },
  }))
}

test('an account without a platform role cannot render the console shell', async ({ page, context }) => {
  await mockSession(context)
  await context.route('**/api/v1/platform/me', route => json(route, {
    error: { message: 'Platform access is not available for this account' },
  }, 403))

  await page.goto('/admin')

  await expect(page.getByText('404', { exact: true })).toBeVisible()
  await expect(page.getByText('Page not found')).toBeVisible()
  await expect(page.getByTestId('platform-sidebar')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Platform navigation' })).toHaveCount(0)
})

test('the console asks for two-factor enrollment before it opens', async ({ page, context }) => {
  await mockSession(context)
  await context.route('**/api/v1/platform/me', route => json(route, {
    data: { ...OWNER, twoFactorEnabled: false, twoFactorVerified: false, requiresTwoFactor: true, requiresTwoFactorVerification: false },
  }))

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: 'Two-factor authentication required' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open workspace security' })).toHaveAttribute('href', '/dashboard/settings')
  await expect(page.getByTestId('platform-sidebar')).toHaveCount(0)
})

test('a session without a completed second factor steps up before the console opens', async ({ page, context }) => {
  await mockSession(context)
  let stepUpCompleted = false
  let stepUpPayload = null

  await context.route('**/api/v1/platform/me', route => json(route, {
    data: {
      ...OWNER,
      twoFactorVerified: stepUpCompleted,
      requiresTwoFactorVerification: !stepUpCompleted,
    },
  }))
  await context.route('**/api/v1/platform/step-up', route => {
    stepUpPayload = route.request().postDataJSON()
    stepUpCompleted = true
    return json(route, { data: { verified: true, verifiedAt: '2026-01-01T00:00:00.000Z' } })
  })
  // The overview is not the subject of this test; fail it closed so the shell, not the data, is asserted.
  await context.route('**/api/v1/platform/overview', route => json(route, {
    error: { message: 'Overview unavailable in this test' },
  }, 503))
  await context.route('**/api/v1/platform/health', route => json(route, {
    error: { message: 'Health unavailable in this test' },
  }, 503))

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: /Verify it/ })).toBeVisible()
  await expect(page.getByTestId('platform-sidebar')).toHaveCount(0)

  await page.getByLabel('Authenticator code').fill('123456')
  await page.getByRole('button', { name: 'Verify and continue' }).click()

  await expect.poll(() => stepUpPayload?.method).toBe('totp')
  await expect.poll(() => stepUpPayload?.code).toBe('123456')
  await expect(page.getByTestId('platform-sidebar')).toBeVisible()
})
