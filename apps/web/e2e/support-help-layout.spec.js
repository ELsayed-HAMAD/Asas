import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockAuth(context, account, ticketsStore) {
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

  await context.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()

    if (path.endsWith('/support/tickets')) {
      if (method === 'GET') {
        return json(route, { data: { items: ticketsStore } })
      }
      if (method === 'POST') {
        const body = route.request().postDataJSON()
        const newTicket = {
          id: `ticket_${Date.now()}`,
          subject: body.subject,
          status: 'OPEN',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        }
        ticketsStore.unshift(newTicket)
        return json(route, { data: newTicket }, 201)
      }
    }

    if (path.includes('/support/tickets/') && method === 'PATCH') {
      const parts = path.split('/')
      const ticketId = parts[parts.length - 1]
      const body = route.request().postDataJSON()
      const t = ticketsStore.find(item => item.id === ticketId)
      if (t) {
        t.status = body.status
        if (body.status === 'RESOLVED') {
          t.resolvedAt = new Date().toISOString()
        }
      }
      return json(route, { data: t })
    }

    return json(route, { data: {} })
  })
}

async function signIn(page, account) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill('correct-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(account.name, { exact: true })).toBeVisible({ timeout: 15_000 })
}

test('support workspace satisfies calm 2-section layout, clean global header, and integrated filtering', async ({ browser }) => {
  const account = { id: 'support_admin', name: 'Support Admin', email: 'support.admin@example.test', emailVerified: true, role: 'ADMIN' }
  const ticketsStore = []

  const context = await browser.newContext()
  await mockAuth(context, account, ticketsStore)

  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, account)

  // Navigate to Support / Help
  await page.goto('/dashboard/support')
  await expect(page.getByRole('heading', { name: 'Support Workspace' })).toBeVisible()

  // 1. Verify Global Header Bar is CLEAN (No "Filter tickets..." in topbar)
  const globalHeader = page.locator('header').first()
  await expect(globalHeader).toBeVisible()
  const filterInGlobalHeader = globalHeader.locator('input[placeholder="Filter tickets..."]')
  await expect(filterInGlobalHeader).toHaveCount(0)

  // 2. Verify Wide 2-Section Workspace Layout Container
  const workspaceContainer = page.locator('.max-w-5xl')
  await expect(workspaceContainer).toBeVisible()

  // 3. Section 1: Calm Horizontal Header & Recessed Ticket Composer Card
  // Squircle icon badge
  const iconBadge = workspaceContainer.locator('.w-11.h-11.rounded-2xl')
  await expect(iconBadge).toBeVisible()

  // Title and subtitle
  await expect(page.getByText('Support Workspace')).toBeVisible()
  await expect(page.getByText('Submit and monitor customer support and platform help requests.')).toBeVisible()

  // Right status pill: Support Online with green dot
  const statusPill = page.getByText('Support Online')
  await expect(statusPill).toBeVisible()
  const onlineDot = statusPill.locator('xpath=preceding-sibling::span[contains(@class, "bg-emerald-500")]')
  await expect(onlineDot).toBeVisible()

  // Recessed Ticket Composer Well
  const composerInput = page.getByPlaceholder('Describe your issue or question...')
  await expect(composerInput).toBeVisible()
  const submitButton = page.getByRole('button', { name: 'Submit' })
  await expect(submitButton).toBeVisible()
  // Primary dark brand button style
  await expect(submitButton).toHaveClass(/bg-brand-ink/)

  // 4. Section 2: SUPPORT REQUESTS (0) Card with Integrated Toolbar & Recessed Empty State
  await expect(page.getByText('SUPPORT REQUESTS (0)')).toBeVisible()

  // Filter input located inside Section 2 card header
  const cardFilterInput = workspaceContainer.getByPlaceholder('Filter tickets...')
  await expect(cardFilterInput).toBeVisible()

  // Calm Recessed Empty State Well
  await expect(page.getByText('No tickets yet')).toBeVisible()
  await expect(page.getByText('Submit a support request when you need assistance.')).toBeVisible()
  const emptyWell = workspaceContainer.locator('.border-dashed')
  await expect(emptyWell).toBeVisible()

  // 5. Submit a new ticket
  await composerInput.fill('Need assistance configuring multi-currency exchange rates')
  await submitButton.click()

  // Verify ticket appears in the list
  await expect(page.getByText('SUPPORT REQUESTS (1)')).toBeVisible()
  await expect(page.getByText('Need assistance configuring multi-currency exchange rates')).toBeVisible()
  await expect(page.getByText('Open', { exact: true })).toBeVisible()

  // 6. Test Integrated Filter Input
  await cardFilterInput.fill('nonexistent query')
  await expect(page.getByText('No matching tickets')).toBeVisible()
  await expect(page.getByText('Try adjusting your search filter.')).toBeVisible()
  await expect(page.getByText('Showing 0 of 1')).toBeVisible()

  await cardFilterInput.fill('multi-currency')
  await expect(page.getByText('Need assistance configuring multi-currency exchange rates')).toBeVisible()
  await cardFilterInput.clear()

  // 7. Test Admin Resolve Action
  const resolveButton = page.getByRole('button', { name: 'Resolve' })
  await expect(resolveButton).toBeVisible()
  await resolveButton.click()
  await expect(page.getByText('Resolved', { exact: true })).toBeVisible()

  await context.close()
})
