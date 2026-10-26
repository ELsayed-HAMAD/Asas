import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockSignedOut(context, { invitation, signIn, invitationFailure } = {}) {
  let invitationAttempts = 0
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) return json(route, null)
    if (path.endsWith('/sign-in/email') && signIn) {
      if (signIn.abort) return route.abort('failed')
      signIn.capture?.(route.request().postDataJSON())
      return json(route, signIn.response, signIn.status ?? 401)
    }
    if (path.endsWith('/organization/get-invitation')) {
      invitationAttempts += 1
      const shouldFail = typeof invitationFailure === 'function'
        ? invitationFailure(invitationAttempts)
        : invitationFailure === 'always' || (invitationFailure === 'first' && invitationAttempts === 1)
      if (shouldFail) return route.abort('failed')
      if (invitation) return json(route, invitation)
    }
    return json(route, {})
  })
  await context.route('**/api/v1/auth/providers', route => json(route, {
    data: { google: false, apple: false, devAuthAllowed: false },
  }))
}

test('login and registration explain unavailable social providers without fake OAuth', async ({ page, context }) => {
  await mockSignedOut(context)

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByRole('button', { name: 'Google', exact: true }).click()
  await expect(page.getByText(/Google single sign-on is not configured for this deployment/)).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible()
  await page.getByRole('button', { name: 'Apple', exact: true }).click()
  await expect(page.getByText(/Apple single sign-on is not configured for this deployment/)).toBeVisible()
  await expect(page).toHaveURL(/\/register$/)
})

test('invitation entry shows the invited workspace and exposes explicit account choices', async ({ page, context }) => {
  await mockSignedOut(context, {
    invitation: {
      id: 'invitation_1',
      organizationId: 'workspace_acme',
      organizationName: 'Acme Ltd.',
      email: 'invitee@example.test',
      role: 'MEMBER',
      status: 'pending',
    },
  })

  await page.goto('/accept-invitation?invitationId=invitation_1')
  await expect(page.getByRole('heading', { name: 'Workspace Invitation' })).toBeVisible()
  await expect(page.getByText('Acme Ltd.').first()).toBeVisible()
  await expect(page.getByText('invitee@example.test')).toBeVisible()

  const registerTab = page.getByRole('button', { name: 'Create account and join workspace' })
  const loginTab = page.getByRole('button', { name: 'Sign in and join workspace' })
  await expect(registerTab).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#invitation-register-form')).toBeVisible()

  await loginTab.click()
  await expect(loginTab).toHaveAttribute('aria-pressed', 'true')
  await expect(registerTab).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#invitation-login-form')).toBeVisible()
})

test('invitation password recovery returns to the same invitation', async ({ page, context }) => {
  await mockSignedOut(context, {
    invitation: {
      id: 'invitation_1',
      organizationId: 'workspace_acme',
      organizationName: 'Acme Ltd.',
      email: 'invitee@example.test',
      role: 'MEMBER',
      status: 'pending',
    },
  })

  await page.goto('/accept-invitation?invitationId=invitation_1')
  await page.getByRole('button', { name: 'Sign in and join workspace' }).click()

  const resetRequest = page.waitForRequest(request =>
    request.method() === 'POST' && /password/i.test(new URL(request.url()).pathname),
  )
  await page.getByRole('button', { name: 'Email me a reset link' }).click()
  const resetPayload = (await resetRequest).postDataJSON()
  expect(resetPayload.email).toBe('invitee@example.test')
  expect(resetPayload.redirectTo).toContain('/reset-password?returnTo=')
  expect(decodeURIComponent(resetPayload.redirectTo)).toContain('/accept-invitation?invitationId=invitation_1')
  await expect(page.getByRole('status')).toContainText('reset link was sent')

  await page.goto(`/reset-password?token=test-token&returnTo=${encodeURIComponent('/accept-invitation?invitationId=invitation_1')}`)
  await page.getByRole('textbox', { name: 'New Password', exact: true }).fill('Correct-Horse-9!')
  await page.getByLabel('Confirm Password').fill('Correct-Horse-9!')
  await page.getByRole('button', { name: 'Set New Password' }).click()

  await expect(page.getByRole('heading', { name: 'Password Reset Complete' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Continue to Invitation/ })).toHaveAttribute(
    'href',
    '/accept-invitation?invitationId=invitation_1',
  )
})

test('login controls are labelled and remember-me reaches the sign-in request', async ({ page, context }) => {
  let signInPayload = null
  await mockSignedOut(context, {
    signIn: {
      capture: payload => { signInPayload = payload },
      response: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
      status: 401,
    },
  })

  await page.goto('/login')
  const email = page.getByLabel('Work email')
  const password = page.getByLabel('Password', { exact: true })
  await email.fill('owner@example.test')
  await password.fill('Correct-Horse-9')

  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible()

  const remember = page.getByRole('checkbox', { name: 'Keep me signed in' })
  await expect(remember).toBeChecked()
  await remember.click()
  await expect(remember).not.toBeChecked()

  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect.poll(() => signInPayload?.rememberMe).toBe(false)
  await expect(page.getByText('Invalid email or password')).toBeVisible()
})

test('login reports an auth service outage without blaming the account', async ({ page, context }) => {
  await mockSignedOut(context, { signIn: { abort: true } })

  await page.goto('/login')
  await page.getByLabel('Work email').fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-9')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await expect(page.getByText(/Cannot reach the service right now/)).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('invitation load failure can be retried without discarding the invitation', async ({ page, context }) => {
  let failInvitations = true
  await mockSignedOut(context, {
    invitationFailure: () => failInvitations,
    invitation: {
      id: 'invitation_retry',
      organizationId: 'workspace_retry',
      organizationName: 'Retry Workspace',
      email: 'invitee@example.test',
      role: 'MEMBER',
      status: 'pending',
    },
  })

  await page.goto('/accept-invitation?invitationId=invitation_retry')
  await expect(page.getByRole('heading', { name: 'Cannot Load Invitation' })).toBeVisible()
  await expect(page.getByText(/Cannot reach the service right now/)).toBeVisible()

  failInvitations = false
  await page.getByRole('button', { name: 'Try Again' }).click()
  await expect(page.getByRole('heading', { name: 'Workspace Invitation' })).toBeVisible()
  await expect(page.getByText('Retry Workspace').first()).toBeVisible()
})

test('unverified invitation sign-in routes through verification with the invitation intact', async ({ page, context }) => {
  await mockSignedOut(context, {
    invitation: {
      id: 'invitation_1',
      organizationId: 'workspace_acme',
      organizationName: 'Acme Ltd.',
      email: 'invitee@example.test',
      role: 'MEMBER',
      status: 'pending',
    },
    signIn: {
      response: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
      status: 403,
    },
  })

  await page.goto('/accept-invitation?invitationId=invitation_1')
  await page.getByRole('button', { name: 'Sign in and join workspace' }).click()
  await page.locator('#invitation-login-form input[type="password"]').fill('Correct-Horse-9')
  await page.getByRole('button', { name: 'Sign In & Join' }).click()

  await expect(page).toHaveURL(/\/verify-email\?/)
  const verifyUrl = new URL(page.url())
  expect(verifyUrl.searchParams.get('email')).toBe('invitee@example.test')
  expect(verifyUrl.searchParams.get('callbackURL')).toContain('/accept-invitation?invitationId=invitation_1')
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible()
  await expect(page.getByText('invitee@example.test', { exact: true })).toBeVisible()
})

test('recovery and verification entry points state the next action accurately', async ({ page, context }) => {
  await mockSignedOut(context)

  await page.goto('/reset-password')
  await expect(page.getByRole('heading', { name: 'Invalid or Expired Link' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Return to Sign In/ })).toBeVisible()

  await page.goto('/reset-password?token=test-token')
  const newPassword = page.getByRole('textbox', { name: 'New Password', exact: true })
  await expect(newPassword).toHaveAttribute('autocomplete', 'new-password')
  await page.getByRole('button', { name: 'Show new password' }).click()
  await expect(newPassword).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Hide new password' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show confirmed password' })).toBeVisible()

  await page.goto('/verify-email?email=owner%40example.test')
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible()
  await expect(page.getByText('owner@example.test', { exact: true })).toBeVisible()
  await expect(page.getByText('Open your email app or webmail')).toBeVisible()
  await expect(page.getByText(/cannot detect the inbox provider for owner@example\.test/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Email Inbox' })).toHaveCount(0)
  await expect(page.getByText(/The sender address is set by this deployment/)).toBeVisible()

  await page.goto('/verify-email?email=owner%40gmail.com')
  await expect(page.getByRole('heading', { name: 'Confirm your Gmail' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Gmail' })).toHaveAttribute('href', 'https://mail.google.com')
})
