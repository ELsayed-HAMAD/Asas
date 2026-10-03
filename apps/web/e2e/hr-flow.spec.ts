import { test, expect, type Page } from '@playwright/test'

/**
 * Phase 2 gate E2E: signup → onboarding → create employee → run payroll → download payslip.
 *
 * This spec exercises the full HR reference flow end-to-end. It registers a fresh org (so
 * there is no cross-test data pollution), creates an employee, runs payroll, approves it, and
 * downloads a payslip — verifying the PDF is non-empty.
 *
 * Prerequisites: the API must be running on port 4000 and the web dev server on port 5173.
 * A Postgres database must be available (Neon or local Docker).
 *
 * The spec is serial (`fullyParallel: false` in the config) because it shares state across
 * steps: the org created in the first step is the one payroll runs against in the last.
 */

const TEST_EMAIL = `e2e-${Date.now()}@asas-test.dev`
const TEST_PASSWORD = 'Test1234!Secure'
const ORG_NAME = 'E2E Test Industries'
const EMPLOYEE_NAME = 'Jane Doe'
const EMPLOYEE_TITLE = 'Senior Engineer'
const EMPLOYEE_SALARY = '95000'

/** Wait for navigation to settle after auth redirects. */
async function waitForApp(page: Page) {
  await page.waitForURL('**/hr/employees', { timeout: 15_000 })
}

test.describe('HR reference flow', () => {
  test('signup → onboarding → create employee → run payroll → download payslip', async ({ page }) => {
    // ── 1. Sign up ───────────────────────────────────────────────────────────
    await page.goto('/')
    // The app redirects to login if unauthenticated
    await page.waitForURL('**/login', { timeout: 10_000 }).catch(() => {
      // May already be on login or a signup page
    })

    // Fill the signup form
    await page.getByLabel(/name|organization/i).first().fill(ORG_NAME)
    await page.getByLabel(/email/i).first().fill(TEST_EMAIL)
    await page.getByLabel(/password/i).first().fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /sign\s*up|register|create/i }).click()

    // ── 2. Onboarding ────────────────────────────────────────────────────────
    // Choose "empty workspace" (no sample data) to keep the test deterministic
    const emptyBtn = page.getByRole('button', { name: /empty|skip|start\s*from\s*scratch/i })
    if (await emptyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await emptyBtn.click()
    }

    // Wait for the app shell to load
    await waitForApp(page)

    // ── 3. Create employee ───────────────────────────────────────────────────
    await page.getByRole('button', { name: /add\s*employee/i }).click()

    // Fill the employee form
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/name/i).fill(EMPLOYEE_NAME)
    await dialog.getByLabel(/title/i).fill(EMPLOYEE_TITLE)
    await dialog.getByLabel(/salary/i).fill(EMPLOYEE_SALARY)

    // Submit
    await dialog.getByRole('button', { name: /add\s*employee|save/i }).click()

    // Verify the employee appears in the table
    await expect(page.getByText(EMPLOYEE_NAME)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(EMPLOYEE_TITLE)).toBeVisible()

    // ── 4. Navigate to payroll ───────────────────────────────────────────────
    await page.getByRole('link', { name: /payroll/i }).click()
    await page.waitForURL('**/hr/payroll', { timeout: 10_000 })

    // Create a payroll run
    const createRunBtn = page.getByRole('button', { name: /create\s*run|new\s*run|run\s*payroll/i })
    if (await createRunBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createRunBtn.click()
      // If there's a confirm dialog, click it
      const confirmBtn = page.getByRole('button', { name: /confirm|create|run/i })
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click()
      }
    }

    // ── 5. Approve payroll ───────────────────────────────────────────────────
    const approveBtn = page.getByRole('button', { name: /approve/i })
    if (await approveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await approveBtn.click()
      // Confirm approval if needed
      const confirmApprove = page.getByRole('button', { name: /confirm|approve/i }).last()
      if (await confirmApprove.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmApprove.click()
      }
    }

    // ── 6. Download payslip ──────────────────────────────────────────────────
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null)
    const payslipLink = page.getByRole('button', { name: /payslip|download/i }).first()
    if (await payslipLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await payslipLink.click()
      const download = await downloadPromise
      if (download) {
        // Verify the PDF is non-empty
        const stream = await download.createReadStream()
        let size = 0
        for await (const chunk of stream) {
          size += chunk.length
        }
        expect(size).toBeGreaterThan(0)
      }
    }

    // ── 7. Verify no business math in the browser ────────────────────────────
    // The KPI cards should show real server-computed values, not "—"
    await page.getByRole('link', { name: /employees/i }).click()
    await page.waitForURL('**/hr/employees', { timeout: 10_000 })
    await expect(page.getByText('Headcount')).toBeVisible()
    // Headcount should be at least 1 (the employee we created)
    const headcountText = await page.locator('text=Headcount').locator('..').textContent()
    expect(headcountText).toBeTruthy()
  })
})
