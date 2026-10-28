import { expect, test } from '@playwright/test'

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockSignedOut(context) {
  await context.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get-session')) return json(route, null)
    return json(route, {})
  })
  await context.route('**/api/v1/auth/providers', route => json(route, {
    data: { google: false, devAuthAllowed: false },
  }))
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth - root.clientWidth
  })
}

async function verticalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    return root.scrollHeight - root.clientHeight
  })
}

test('desktop keeps the showcase on the left and the form on the right without overflow', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockSignedOut(context)

  await page.goto('/login')
  const showcase = page.getByTestId('auth-showcase')
  await expect(showcase).toBeVisible()
  await expect(showcase).toHaveAttribute('data-variant', 'signin')
  await expect(showcase).toHaveAttribute('aria-hidden', 'true')
  // The showcase is pure art: no copy, no logo, no raster images.
  await expect(showcase).toHaveText('')
  await expect(showcase.locator('text, img, a')).toHaveCount(0)
  await expect(page.locator('.auth-shell')).toHaveCSS('background-color', 'rgb(245, 245, 247)')
  await expect(showcase).toHaveCSS('background-color', 'rgb(5, 17, 39)')
  await expect(showcase.locator('.auth-showcase-art')).toBeVisible()
  await expect(showcase).toHaveAttribute('data-modules', '5')
  await expect(showcase.locator('.auth-showcase-panel')).toHaveCount(5)
  await expect(showcase.locator('.auth-showcase-halo')).toBeVisible()

  const heading = page.getByRole('heading', { name: 'Welcome back' })
  await expect(heading).toBeVisible()
  const formBox = await heading.boundingBox()
  const showcaseBox = await showcase.boundingBox()
  expect(formBox).not.toBeNull()
  expect(showcaseBox).not.toBeNull()
  // The decorative showcase sits on the left; the form panel is on the right.
  expect(showcaseBox.x).toBeLessThan(formBox.x)
  expect(formBox.x).toBeGreaterThan(showcaseBox.x + showcaseBox.width - 1)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  expect(await verticalOverflow(page)).toBeLessThanOrEqual(1)

  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible()
  await expect(page.getByTestId('auth-showcase')).toHaveAttribute('data-variant', 'signup')
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  expect(await verticalOverflow(page)).toBeLessThanOrEqual(1)

  await page.goto('/reset-password')
  await expect(page.getByTestId('auth-showcase')).toHaveAttribute('data-variant', 'security')
})

test('desktop sign-in and sign-up fit the viewport without vertical scrolling', async ({ page, context }) => {
  await mockSignedOut(context)

  for (const [width, height] of [[1366, 768], [1280, 720]]) {
    await page.setViewportSize({ width, height })
    for (const [path, heading] of [
      ['/login', 'Welcome back'],
      ['/register', 'Create your workspace'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(1)
    }
  }
})

test('showcase art tilts toward the pointer', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockSignedOut(context)

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  const tilt = page.locator('[data-auth-tilt]')
  await expect(tilt).toBeVisible()
  const initialTransform = await tilt.evaluate(element => element.style.transform)
  const box = await tilt.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.18)
  await expect.poll(() => tilt.evaluate(element => element.style.transform)).not.toBe(initialTransform)
})

test('mobile hides the full showcase and keeps the form usable', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSignedOut(context)

  await page.goto('/login')
  await expect(page.getByTestId('auth-showcase')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  const email = page.getByLabel('Work email')
  const password = page.getByLabel('Password', { exact: true })
  await email.fill('owner@example.test')
  await password.fill('Correct-Horse-9')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')

  const formBox = await email.boundingBox()
  expect(formBox).not.toBeNull()
  expect(formBox.x).toBeGreaterThanOrEqual(0)
  expect(formBox.x + formBox.width).toBeLessThanOrEqual(390)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)

  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible()
  await expect(page.getByTestId('auth-showcase')).toBeHidden()
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

test('reduced motion keeps the art panel and form content visible', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockSignedOut(context)

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  const showcase = page.getByTestId('auth-showcase')
  await expect(showcase).toBeVisible()
  await expect(showcase).toHaveText('')
  await expect(showcase.locator('.auth-showcase-art')).toBeVisible()
  await expect(showcase.locator('.auth-showcase-panel')).toHaveCount(5)

  for (const selector of [
    '.auth-showcase-enter',
    '.auth-showcase-veil',
    '.auth-showcase-halo',
    '.auth-showcase-light',
    '.auth-showcase-draw',
    '.auth-showcase-fade',
    '.auth-showcase-dust',
    '.auth-showcase-sweep',
    '.auth-showcase-reflection',
  ]) {
    await expect(showcase.locator(selector).first()).toHaveCSS('animation-name', 'none')
  }
})
