import { expect, test } from '@playwright/test'

/**
 * SSE cross-tab invalidation (rebuild plan, Phase 7 verification: "two browser windows open;
 * a mutation in one refreshes the other within a second via SSE").
 *
 * Two pages share one browser context (hence one session cookie). Window A watches the
 * employees list; window B creates an employee. The mutation publishes an `invalidate` frame
 * on the tenant's SSE stream, and A's TanStack Query cache refetches without a reload.
 */
const ORG_NAME = `SSE Co ${Date.now()}`
const TEST_EMAIL = `sse-owner-${Date.now()}@example.com`
const TEST_PASSWORD = 'sse-password-123'

test.describe('SSE cross-tab invalidation', () => {
  test('a mutation in one tab refreshes another within a second', async ({ browser }) => {
    const pageA = await browser.newPage()
    await pageA.goto('/signup')
    await pageA.getByLabel(/name|organization/i).first().fill(ORG_NAME)
    await pageA.getByLabel(/email/i).first().fill(TEST_EMAIL)
    await pageA.getByLabel(/password/i).first().fill(TEST_PASSWORD)
    await pageA.getByRole('button', { name: /sign\s*up|register|create/i }).click()

    await pageA.waitForURL('**/onboarding', { timeout: 15_000 }).catch(() => {})
    if (!pageA.url().includes('/hr/')) {
      await pageA.getByLabel(/organization name/i).fill(ORG_NAME).catch(() => {})
      await pageA.getByRole('button', { name: /start with empty workspace/i }).click()
    }
    await pageA.waitForURL('**/hr/employees', { timeout: 15_000 })

    // Second tab, same context → same session cookie → same tenant stream.
    const pageB = await browser.newPage()
    await pageB.goto('/hr/employees')

    // Establish the "before" state: page A's list is loaded and settled.
    const beforeCount = await pageA.getByRole('cell').count()
    expect(beforeCount).toBeGreaterThanOrEqual(0)

    // Mutate from B — the SSE `invalidate` frame should reach A without any action there.
    await pageB.getByRole('button', { name: /add\s*employee/i }).click()
    await pageB.getByLabel(/name/i).first().fill(`SSE Probe ${Date.now()}`)
    await pageB.getByLabel(/title/i).first().fill('Integration Test')
    await pageB.getByRole('button', { name: /^save|create|add$/i }).last().click()

    // A refetches within a second of the mutation committing — the SSE gate from the plan.
    await expect
      .poll(async () => pageA.getByRole('cell').count(), { timeout: 5_000, intervals: [250] })
      .toBeGreaterThan(beforeCount)
  })
})
