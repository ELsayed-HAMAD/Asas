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
      return json(route, [
        {
          id: `workspace-${account.id}`,
          name: `${account.name} Workspace`,
          slug: `workspace-${account.id}`,
          logo: null,
          createdAt: new Date().toISOString(),
        },
      ]);
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

test('inventory product catalog layout-only cleanup verified across 1280px, 1440px, and 1920px viewports', async ({ browser }) => {
  const account = {
    id: 'inventory_admin',
    name: 'Inventory Admin',
    email: 'inventory.admin@example.test',
    emailVerified: true,
    role: 'ADMIN',
  };

  // Generate 25 products so 10+ rows render and pagination footer is populated
  const mockProducts = Array.from({ length: 25 }, (_, i) => {
    const num = i + 1;
    let status = 'IN_STOCK';
    let stock = 75 + i * 10;
    if (num === 2) {
      status = 'IN_STOCK';
      stock = 227;
    } else if (num === 3) {
      status = 'LOW_STOCK';
      stock = 5;
    }
    return {
      id: `prod-${num}`,
      name: `Industrial Component ${num} Precision Grade Steel`,
      sku: `SKU-${35070 + num}`,
      price: (149.99 + num * 12.5).toFixed(2),
      stock,
      minThreshold: 10,
      warehouse: 'Main Distribution Hub',
      aisle: '4B',
      bin: '12',
      status,
      avgMonthlyUsage: 120 + num * 5,
      leadTimeDays: 14,
      archivedAt: null,
      createdAt: '2026-01-15T10:00:00Z',
    };
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mockAuth(context, account, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/inventory/products')) {
      return json(route, {
        data: {
          items: mockProducts,
          pagination: {
            page: 1,
            limit: 25,
            total: 45,
            pages: 2,
          },
        },
      });
    }

    if (path.includes('/stock/movements')) {
      return json(route, {
        data: {
          items: [
            {
              id: 'mov-1',
              productId: 'prod-1',
              type: 'IN',
              delta: 50,
              note: 'PO #4521 receipt',
              createdAt: '2026-10-12T08:30:00Z',
            },
            {
              id: 'mov-2',
              productId: 'prod-1',
              type: 'OUT',
              delta: -15,
              note: 'Order fulfillment #8812',
              createdAt: '2026-10-14T11:20:00Z',
            },
          ],
          summary: {
            recordedThisMonth: { totalIn: 50, totalOut: 15 },
            recordedThisMonthComparison: { totalIn: 40, totalOut: 20 },
          },
          pagination: { page: 1, limit: 25, total: 2, pages: 1 },
        },
      });
    }

    if (path.includes('/suppliers')) {
      return json(route, {
        data: {
          items: [
            { id: 'supp-1', name: 'Global Steel Dynamics' },
            { id: 'supp-2', name: 'Precision Castings Ltd' },
          ],
        },
      });
    }

    if (path.includes('/purchase-orders')) {
      return json(route, {
        data: {
          items: [
            {
              id: 'po-100234',
              productId: 'prod-1',
              quantity: 100,
              status: 'APPROVED',
              createdAt: '2026-10-10T14:00:00Z',
            },
          ],
        },
      });
    }

    return json(route, { data: {} });
  });

  const page = await context.newPage();
  await signIn(page, account);

  // Navigate to Product Catalog
  await page.goto('/dashboard/inventory', { waitUntil: 'networkidle' });
  const tableCard = page.locator('[data-testid="product-table-card"]');
  await expect(tableCard).toBeVisible({ timeout: 10_000 });

  // ──────────────────────────────────────────────────────────────────────────
  // 1) TOP BAR (56px, one row, 12px gaps, nothing wraps)
  // ──────────────────────────────────────────────────────────────────────────
  const topbar = page.locator('header').first();
  await expect(topbar).toBeVisible();
  const topbarBox = await topbar.boundingBox();
  expect(Math.round(topbarBox.height)).toBe(56);

  // Breadcrumb ("Dashboard > Inventory", nowrap)
  const breadcrumb = topbar.locator('nav[aria-label="Breadcrumb"]');
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.getByText('Inventory')).toBeVisible();

  // "Search or jump to..." input button (fixed 240px, 36px)
  const jumpSearch = topbar.getByRole('button', { name: /Search or jump to/i });
  await expect(jumpSearch).toBeVisible();
  const jumpSearchBox = await jumpSearch.boundingBox();
  expect(Math.round(jumpSearchBox.width)).toBe(240);
  expect(Math.round(jumpSearchBox.height)).toBe(36);

  // Bell button (36x36)
  const bellBtn = topbar.getByTitle('Notification Settings');
  await expect(bellBtn).toBeVisible();
  const bellBox = await bellBtn.boundingBox();
  expect(Math.round(bellBox.width)).toBe(36);
  expect(Math.round(bellBox.height)).toBe(36);

  // "New Product" primary button (36px high, padding 0 16px, nowrap)
  const newProductBtn = topbar.getByRole('button', { name: 'New Product' });
  await expect(newProductBtn).toBeVisible();
  const newProductBox = await newProductBtn.boundingBox();
  expect(Math.round(newProductBox.height)).toBe(36);
  expect(newProductBox.width).toBeGreaterThanOrEqual(100);

  // ──────────────────────────────────────────────────────────────────────────
  // 2) LIST PANE HEADER / TOOLBAR (Visible title removed, search fills freed space)
  // ──────────────────────────────────────────────────────────────────────────
  const listHeader = page.locator('[data-testid="product-list-header"]');
  await expect(listHeader).toBeVisible();

  // RULE 1: Visible heading removed from list pane, sr-only h1 kept in DOM
  const visibleH1 = page.locator('[data-testid="product-list-pane"] h1:not(.sr-only)');
  await expect(visibleH1).toHaveCount(0);
  const srOnlyH1 = page.locator('[data-testid="product-list-pane"] h1.sr-only');
  await expect(srOnlyH1).toHaveText('Product Catalog');

  // Sidebar item and breadcrumb are unchanged
  await expect(page.locator('aside').getByRole('link', { name: 'Product Catalog' })).toBeVisible();
  await expect(breadcrumb.getByText('Inventory')).toBeVisible();

  // RULE 2: Search input, Active products select, All Stock filter button, Grid button
  const tableSearch = listHeader.getByLabel('Search products');
  const activeSelect = listHeader.getByLabel('Show active or archived products');
  const stockFilter = listHeader.getByLabel('Filter products by stock status');
  const gridBtn = listHeader.getByLabel('Stock Movements');

  await expect(tableSearch).toBeVisible();
  await expect(activeSelect).toBeVisible();
  await expect(stockFilter).toBeVisible();
  await expect(gridBtn).toBeVisible();

  // Check left-to-right ordering
  const searchBox = await tableSearch.boundingBox();
  const activeSelectBox = await activeSelect.boundingBox();
  const stockFilterBox = await stockFilter.boundingBox();
  const gridBox = await gridBtn.boundingBox();

  expect(searchBox.x).toBeLessThan(activeSelectBox.x);
  expect(activeSelectBox.x).toBeLessThan(stockFilterBox.x);
  expect(stockFilterBox.x).toBeLessThan(gridBox.x);

  // Sizing: Search stretches to fill freed space, left edge flush with table card
  const tableCardBox = await tableCard.boundingBox();
  expect(Math.abs(searchBox.x - tableCardBox.x)).toBeLessThanOrEqual(2);
  expect(searchBox.width).toBeGreaterThanOrEqual(300); // Flew into freed title space

  // Fixed widths of the other 3 controls: ~150px, ~110px, 36x36
  expect(Math.round(activeSelectBox.width)).toBe(150);
  expect(Math.round(stockFilterBox.width)).toBe(110);
  expect(Math.round(gridBox.width)).toBe(36);

  // All 4 controls are 36px high
  expect(Math.round(searchBox.height)).toBe(36);
  expect(Math.round(activeSelectBox.height)).toBe(36);
  expect(Math.round(stockFilterBox.height)).toBe(36);
  expect(Math.round(gridBox.height)).toBe(36);

  // Single row at 1440px: vertically aligned
  expect(Math.abs(searchBox.y - activeSelectBox.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(searchBox.y - stockFilterBox.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(searchBox.y - gridBox.y)).toBeLessThanOrEqual(2);

  // ──────────────────────────────────────────────────────────────────────────
  // 3) TABLE CARD & ROWS
  // ──────────────────────────────────────────────────────────────────────────
  // Fixed column header row (40px)
  const tableThead = tableCard.locator('thead tr');
  await expect(tableThead).toBeVisible();
  const theadBox = await tableThead.boundingBox();
  expect(Math.round(theadBox.height)).toBe(40);

  // Header column labels (Product, SKU, Price, Status)
  const thProduct = tableCard.locator('th', { hasText: 'PRODUCT' });
  const thSku = tableCard.locator('th', { hasText: 'SKU' });
  const thPrice = tableCard.locator('th', { hasText: 'PRICE' });
  const thStatus = tableCard.locator('th', { hasText: 'STATUS' });
  await expect(thProduct).toBeVisible();
  await expect(thSku).toBeVisible();
  await expect(thPrice).toBeVisible();
  await expect(thStatus).toBeVisible();

  // Column widths: SKU 120px, Price 100px, Status 140px
  const skuWidth = await thSku.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const priceWidth = await thPrice.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const statusWidth = await thStatus.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(skuWidth).toBe(120);
  expect(priceWidth).toBe(100);
  expect(statusWidth).toBe(140);

  // Rows: 56px high for every row
  const rows = tableCard.locator('tbody tr');
  const rowCount = await rows.count();
  expect(rowCount).toBe(25);
  const firstRowBox = await rows.first().boundingBox();
  expect(Math.round(firstRowBox.height)).toBe(56);

  // Product cell: 32px icon tile, single line name
  const firstTile = rows.first().locator('svg.lucide-box').first();
  await expect(firstTile).toBeVisible();

  // SKU cell: 13px, whitespace-nowrap
  const firstSku = rows.first().locator('td').nth(1);
  const skuWrap = await firstSku.evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(skuWrap).toBe('nowrap');

  // Status badge: 22px height, min-width 96px, single line text
  const statusBadge = rows.first().locator('td').nth(3).locator('span');
  await expect(statusBadge).toBeVisible();
  const badgeHeight = await statusBadge.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const badgeMinWidth = await statusBadge.evaluate((el) => parseInt(getComputedStyle(el).minWidth, 10));
  expect(badgeHeight).toBe(22);
  expect(badgeMinWidth).toBe(96);

  // Selected row accent bar: 3px strip flush with edge
  const accentBar = rows.first().locator('span.bg-primary');
  await expect(accentBar).toBeVisible();
  const barWidth = await accentBar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(barWidth).toBe(3);

  // Pagination Footer pinned in card: 44px, 1px top border
  const pagination = tableCard.locator('div.h-11');
  await expect(pagination).toBeVisible();
  const paginationBox = await pagination.boundingBox();
  expect(Math.round(paginationBox.height)).toBe(44);
  await expect(pagination.getByText(/Showing 1–25 of 45 products/i)).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Next' })).toBeVisible();

  // Verify at 1440x900 at least 11 rows are visible in the viewport without scrolling the page
  const visibleRowCount = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-testid="product-table-card"] tbody tr'));
    const scrollContainer = document.querySelector('[data-testid="product-table-card"] .overflow-y-auto');
    const containerRect = scrollContainer.getBoundingClientRect();
    return rows.filter((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
    }).length;
  });
  expect(visibleRowCount).toBeGreaterThanOrEqual(11);

  // ──────────────────────────────────────────────────────────────────────────
  // 4) DETAIL PANEL (400px wide, 48px tile, 44px tabs, 2-col fields, 3-row footer)
  // ──────────────────────────────────────────────────────────────────────────
  const detailPanel = page.locator('[data-testid="product-detail-panel"]');
  await expect(detailPanel).toBeVisible();
  const panelWidth = await detailPanel.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(panelWidth).toBe(400);

  // Header: tile 48px, close button 36x36
  const detailTile = detailPanel.locator('.w-12.h-12');
  await expect(detailTile).toBeVisible();
  const tileBox = await detailTile.boundingBox();
  expect(Math.round(tileBox.width)).toBe(48);
  expect(Math.round(tileBox.height)).toBe(48);

  const closeBtn = detailPanel.getByLabel('Close details');
  await expect(closeBtn).toBeVisible();
  const closeBox = await closeBtn.boundingBox();
  expect(Math.round(closeBox.width)).toBe(36);
  expect(Math.round(closeBox.height)).toBe(36);

  // Tabs: 44px high, 20px gap
  const tabsBar = detailPanel.locator('.h-11.px-5.border-b');
  await expect(tabsBar).toBeVisible();
  const tabsBox = await tabsBar.boundingBox();
  expect(Math.round(tabsBox.height)).toBe(44);

  const tabOverview = detailPanel.getByRole('button', { name: 'Overview' });
  const tabSuppliers = detailPanel.getByRole('button', { name: 'Suppliers' });
  const tabHistory = detailPanel.getByRole('button', { name: 'History' });
  const tabOrders = detailPanel.getByRole('button', { name: 'Orders' });
  await expect(tabOverview).toBeVisible();
  await expect(tabSuppliers).toBeVisible();
  await expect(tabHistory).toBeVisible();
  await expect(tabOrders).toBeVisible();

  // Unit Price and Location: 2-column grid, 36px fields
  const unitPriceField = detailPanel.getByText('$162.49');
  await expect(unitPriceField).toBeVisible();
  const priceFieldBox = await unitPriceField.boundingBox();
  expect(Math.round(priceFieldBox.height)).toBe(36);

  // Stat cards: Avg. Monthly Usage & Lead Time
  const usageCard = detailPanel.getByText('Avg. Monthly Usage');
  const leadTimeCard = detailPanel.getByText('Lead Time');
  await expect(usageCard).toBeVisible();
  await expect(leadTimeCard).toBeVisible();

  // Actions footer: 3 rows, all buttons 36px high
  const editBtn = detailPanel.getByRole('button', { name: 'Edit' });
  const adjustBtn = detailPanel.getByRole('button', { name: 'Adjust Stock' });
  const orderBtn = detailPanel.getByRole('button', { name: 'Create Purchase Order' });
  const archiveBtn = detailPanel.getByRole('button', { name: 'Archive Product' });

  await expect(editBtn).toBeVisible();
  await expect(adjustBtn).toBeVisible();
  await expect(orderBtn).toBeVisible();
  await expect(archiveBtn).toBeVisible();

  expect(Math.round((await editBtn.boundingBox()).height)).toBe(36);
  expect(Math.round((await adjustBtn.boundingBox()).height)).toBe(36);
  expect(Math.round((await orderBtn.boundingBox()).height)).toBe(36);
  expect(Math.round((await archiveBtn.boundingBox()).height)).toBe(36);

  // ──────────────────────────────────────────────────────────────────────────
  // 5) RESPONSIVE VIEWPORTS & ZERO HORIZONTAL SCROLL
  // ──────────────────────────────────────────────────────────────────────────
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);

    // Assert zero page body horizontal scrollbar
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Toolbar is a single row at 1280px or wider
    const curSearchBox = await tableSearch.boundingBox();
    const curSelectBox = await activeSelect.boundingBox();
    expect(Math.abs(curSearchBox.y - curSelectBox.y)).toBeLessThanOrEqual(2);

    // Search spans up to Active products select
    expect(Math.abs(curSelectBox.x - (curSearchBox.x + curSearchBox.width))).toBeLessThanOrEqual(10);

    // Top and bottom edges: list pane and detail panel stretch to same height
    const listPaneBox = await page.locator('[data-testid="product-list-pane"]').boundingBox();
    const currentPanelBox = await detailPanel.boundingBox();
    expect(Math.abs(listPaneBox.y - currentPanelBox.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(listPaneBox.height - currentPanelBox.height)).toBeLessThanOrEqual(2);

    // Status badge is fully visible on one line
    const statusText = await rows.nth(1).locator('td').nth(3).locator('span').evaluate((el) => el.textContent.trim());
    expect(statusText).toBe('227 IN STOCK');
    const badge2Wrap = await rows.nth(1).locator('td').nth(3).locator('span').evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(badge2Wrap).toBe('nowrap');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6) BELOW 900PX BREAKPOINT: Search goes on its own full-width line
  // ──────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 850, height: 900 });
  await page.waitForTimeout(100);
  const smallSearchBox = await tableSearch.boundingBox();
  const smallSelectBox = await activeSelect.boundingBox();
  expect(smallSelectBox.y).toBeGreaterThan(smallSearchBox.y + smallSearchBox.height);

  // Restore 1440x900
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(100);

  // ──────────────────────────────────────────────────────────────────────────
  // 7) INTERACTIVE VERIFICATION (Selection, Tabs, Close X)
  // ──────────────────────────────────────────────────────────────────────────
  // Click second product row -> detail panel updates immediately
  await rows.nth(1).click();
  await expect(detailPanel.getByRole('heading', { name: 'Industrial Component 2 Precision Grade Steel' })).toBeVisible();
  await expect(detailPanel.getByText('SKU: SKU-35072')).toBeVisible();

  // Switch to Suppliers tab
  await tabSuppliers.click();
  await expect(detailPanel.getByText('Global Steel Dynamics')).toBeVisible();
  await expect(detailPanel.getByText('Precision Castings Ltd')).toBeVisible();

  // Switch to History tab
  await tabHistory.click();
  await expect(detailPanel.getByText('PO #4521 receipt')).toBeVisible();

  // Switch to Orders tab
  await tabOrders.click();
  await expect(detailPanel.getByText('#100234')).toBeVisible();

  // Close details (X button) -> deselection empty state
  await closeBtn.click();
  await expect(detailPanel.getByText('Select a product to view details.')).toBeVisible();

  // Re-selecting a row restores details
  await rows.first().click();
  await expect(detailPanel.getByRole('heading', { name: 'Industrial Component 1 Precision Grade Steel' })).toBeVisible();

  await context.close();
});
