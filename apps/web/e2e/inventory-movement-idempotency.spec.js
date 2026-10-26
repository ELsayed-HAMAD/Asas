import { expect, test } from '@playwright/test';

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockAuth(context, account, apiHandler) {
  let signedIn = false;
  await context.route('**/api/auth/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/get-session')) {
      return json(
        route,
        signedIn
          ? {
              session: {
                id: `session-${account.id}`,
                token: `token-${account.id}`,
                userId: account.id,
                activeOrganizationId: `workspace-${account.id}`,
              },
              user: account,
            }
          : null
      );
    }

    if (path.endsWith('/sign-in/email')) {
      signedIn = true;
      return json(route, { redirect: false, token: `token-${account.id}`, user: account });
    }

    if (path.endsWith('/organization/list')) {
      return json(route, [{
        id: `workspace-${account.id}`,
        name: `${account.name} Workspace`,
        slug: `workspace-${account.id}`,
        logo: null,
        createdAt: new Date().toISOString(),
      }]);
    }

    if (path.endsWith('/organization/get-active-member-role') && account.role) {
      return json(route, { role: account.role });
    }

    if (path.endsWith('/organization/get-full-organization')) {
      return json(route, {
        id: `workspace-${account.id}`,
        name: `${account.name} Workspace`,
        slug: `workspace-${account.id}`,
        logo: null,
        createdAt: new Date().toISOString(),
        members: [],
      });
    }

    return json(route, {});
  });

  await context.route('**/api/v1/**', (route) => (apiHandler ? apiHandler(route) : json(route, { data: {} })));
}

async function signIn(page, account) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill('correct-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(account.name, { exact: true })).toBeVisible({ timeout: 15_000 });
}

test('a lost stock-movement response is retried after reload with the same request key', async ({ browser }) => {
  test.setTimeout(120_000);
  const account = {
    id: 'movement_idempotency_admin',
    name: 'Movement Idempotency Admin',
    email: 'movement.idempotency@example.test',
    emailVerified: true,
    role: 'ADMIN',
  };
  const product = {
    id: 'product_1',
    name: 'Tracked Product',
    sku: 'SKU-1',
    price: '12.50',
    stock: 20,
    status: 'IN_STOCK',
    warehouse: 'Main',
    aisle: null,
    bin: null,
    avgMonthlyUsage: null,
    leadTimeDays: null,
    minThreshold: 5,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const movementBodies = [];
  const context = await browser.newContext();
  await mockAuth(context, account, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.endsWith('/inventory/stock/movements') && method === 'GET') {
      return json(route, { data: {
        items: [],
        pagination: { page: 1, limit: 25, total: 0, pages: 0 },
        summary: {
          totalIn: 0,
          totalOut: 0,
          recordedThisMonth: { totalIn: 0, totalOut: 0 },
          recordedThisMonthComparison: {
            previousStartDate: '2026-09-01',
            previousEndDateExclusive: '2026-10-01',
            totalIn: 0,
            totalOut: 0,
          },
        },
      } });
    }

    if (path.endsWith('/inventory/stock/movements') && method === 'POST') {
      movementBodies.push(route.request().postDataJSON());
      if (movementBodies.length === 1) return route.abort('failed');
      return json(route, { data: {
        id: 'movement_1',
        productId: product.id,
        productName: product.name,
        warehouse: product.warehouse,
        delta: 3,
        type: 'IN',
        note: 'PO-2026-081',
        createdAt: '2026-10-26T08:00:00.000Z',
        newStock: 23,
        creationReplayed: false,
      } }, 201);
    }

    if (path.endsWith('/inventory/valuation/setup') && method === 'GET') {
      return json(route, { data: { configured: false } });
    }

    if (path.endsWith('/inventory/warehouses') && method === 'GET') {
      return json(route, { data: { items: [] } });
    }

    if (path.endsWith('/inventory/products') && method === 'GET') {
      return json(route, { data: {
        items: [product],
        pagination: { page: 1, limit: 25, total: 1, pages: 1 },
        summary: {},
      } });
    }

    if (path.endsWith('/inventory/products/product_1') && method === 'GET') {
      return json(route, { data: product });
    }

    return json(route, { data: {} });
  });

  const page = await context.newPage();
  try {
    await signIn(page, account);
    await page.goto('/dashboard/inventory/movements');
    await expect(page.getByRole('heading', { name: 'Stock Movements' })).toBeVisible();

    await page.getByRole('button', { name: 'Record Movement' }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const productSelect = dialog.getByRole('combobox', { name: 'Product' });
    await productSelect.click();
    const productOption = page.getByRole('option', { name: /Tracked Product \(SKU-1\)/ });
    await expect(productOption).toBeVisible();
    await productOption.click();
    await dialog.getByRole('spinbutton').fill('3');
    await dialog.getByPlaceholder(/PO-2026-081/).fill('PO-2026-081');
    await dialog.getByRole('button', { name: 'Save Movement' }).click();

    await expect.poll(() => movementBodies.length).toBe(1);
    await expect(dialog.getByRole('status')).toContainText('A previous request may have reached the server');
    expect(movementBodies[0]).toMatchObject({ productId: product.id, delta: 3, note: 'PO-2026-081' });
    expect(movementBodies[0].requestKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // Reloading loses the in-memory form but not the tab-scoped retry key.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Stock Movements' })).toBeVisible();
    await expect(page.getByText(account.name, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Record Movement' }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('A previous request may have reached the server');
    await expect(dialog.getByRole('combobox', { name: 'Product' })).toContainText('Tracked Product');
    await expect(dialog.getByRole('spinbutton')).toHaveValue('3');
    await expect(dialog.getByPlaceholder(/PO-2026-081/)).toHaveValue('PO-2026-081');

    await dialog.getByRole('button', { name: 'Save Movement' }).click();
    await expect.poll(() => movementBodies.length).toBe(2);
    expect(movementBodies[1]).toMatchObject({
      productId: product.id,
      delta: 3,
      note: 'PO-2026-081',
      requestKey: movementBodies[0].requestKey,
    });
    await expect(dialog).toBeHidden();
  } finally {
    await context.close();
  }
});

test('a lost product-catalog adjustment response is retried after reload with the same request key', async ({ browser }) => {
  test.setTimeout(120_000);
  const account = {
    id: 'catalog_idempotency_admin',
    name: 'Catalog Idempotency Admin',
    email: 'catalog.idempotency@example.test',
    emailVerified: true,
    role: 'ADMIN',
  };
  const product = {
    id: 'product_1',
    name: 'Tracked Product',
    sku: 'SKU-1',
    price: '12.50',
    stock: 20,
    status: 'IN_STOCK',
    warehouse: 'Main',
    aisle: null,
    bin: null,
    avgMonthlyUsage: null,
    leadTimeDays: null,
    minThreshold: 5,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const otherProduct = {
    ...product,
    id: 'product_2',
    name: 'Other Product',
    sku: 'SKU-2',
  };
  let productListItems = [product];
  const movementBodies = [];
  const context = await browser.newContext();
  await mockAuth(context, account, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.endsWith('/inventory/stock/movements') && method === 'POST') {
      movementBodies.push(route.request().postDataJSON());
      if (movementBodies.length === 1) {
        // The saved product need not remain on the currently loaded list page after reload.
        productListItems = [otherProduct];
        return route.abort('failed');
      }
      return json(route, { data: {
        id: 'movement_catalog_1',
        productId: product.id,
        productName: product.name,
        warehouse: product.warehouse,
        delta: 3,
        type: 'IN',
        note: 'PO-2026-081',
        createdAt: '2026-10-26T08:00:00.000Z',
        newStock: 23,
        creationReplayed: false,
      } }, 201);
    }

    if (path.endsWith('/inventory/valuation/setup') && method === 'GET') {
      return json(route, { data: { configured: false } });
    }

    if (path.endsWith('/inventory/products') && method === 'GET') {
      return json(route, { data: {
        items: productListItems,
        pagination: { page: 1, limit: 25, total: productListItems.length, pages: 1 },
        summary: {},
      } });
    }

    if (path.endsWith('/inventory/products/product_1') && method === 'GET') {
      return json(route, { data: product });
    }

    return json(route, { data: {} });
  });

  const page = await context.newPage();
  try {
    await signIn(page, account);
    await page.goto('/dashboard/inventory', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Adjust Stock' }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('spinbutton').fill('3');
    await dialog.getByPlaceholder(/PO #4521 receipt/).fill('PO-2026-081');
    await dialog.getByRole('button', { name: 'Record movement' }).click();

    await expect.poll(() => movementBodies.length).toBe(1);
    await expect(dialog.getByRole('status')).toContainText('A previous request may have reached the server');
    expect(movementBodies[0]).toMatchObject({ productId: product.id, delta: 3, note: 'PO-2026-081' });
    const requestKey = movementBodies[0].requestKey;
    expect(requestKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // Reloading loses the in-memory dialog but not the catalog-scoped retry key.
    // The saved product is deliberately absent from the newly loaded list, so Restore
    // must fetch it directly instead of letting auto-select replace it with another row.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(otherProduct.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(product.name, { exact: true })).toBeHidden();
    const retryBanner = page.getByRole('status').filter({ hasText: 'A previous stock adjustment may have reached the server' });
    await expect(retryBanner).toBeVisible();
    await retryBanner.getByRole('button', { name: 'Restore retry' }).click();

    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('A previous request may have reached the server');
    await expect(dialog).toContainText(product.name);
    await expect(dialog).not.toContainText(otherProduct.name);
    await expect(dialog.getByRole('spinbutton')).toHaveValue('3');
    await expect(dialog.getByPlaceholder(/PO #4521 receipt/)).toHaveValue('PO-2026-081');

    await dialog.getByRole('button', { name: 'Record movement' }).click();
    await expect.poll(() => movementBodies.length).toBe(2);
    expect(movementBodies[1]).toMatchObject({
      productId: product.id,
      delta: 3,
      note: 'PO-2026-081',
      requestKey,
    });
    await expect(dialog).toBeHidden();
    await expect(retryBanner).toBeHidden();
    // The post-movement count belongs to the saved product and must not leak onto the
    // different product that auto-select restores after the dialog closes.
    await expect(page.getByText('On hand: 23 units')).toBeHidden();
    const remainingDrafts = await page.evaluate(() => (
      Object.keys(window.sessionStorage).filter((key) => key.includes('stock-movement-retry'))
    ));
    expect(remainingDrafts).toEqual([]);
  } finally {
    await context.close();
  }
});
