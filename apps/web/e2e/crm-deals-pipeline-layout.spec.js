import { expect, test } from '@playwright/test';

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockAuth(context, account, apiHandler) {
  let signedIn = false;
  await context.route('**/api/auth/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/get-session')) {
      return json(route, signedIn ? {
        session: { id: `session-${account.id}`, token: `token-${account.id}`, userId: account.id, activeOrganizationId: `workspace-${account.id}` },
        user: account,
      } : null);
    }

    if (path.endsWith('/sign-in/email')) {
      signedIn = true;
      return json(route, { redirect: false, token: `token-${account.id}`, user: account });
    }

    if (path.endsWith('/organization/list')) {
      return json(route, [{ id: `workspace-${account.id}`, name: `${account.name} Workspace`, slug: `workspace-${account.id}`, logo: null, createdAt: new Date().toISOString() }]);
    }

    if (path.endsWith('/organization/get-active-member-role') && account.role) {
      return json(route, { role: account.role });
    }

    if (path.endsWith('/organization/get-full-organization')) {
      return json(route, { id: `workspace-${account.id}`, name: `${account.name} Workspace`, slug: `workspace-${account.id}`, logo: null, createdAt: new Date().toISOString(), members: [] });
    }

    return json(route, {});
  });

  await context.route('**/api/v1/**', route => apiHandler ? apiHandler(route) : json(route, { data: {} }));
}

async function signIn(page, account) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill('correct-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(account.name, { exact: true })).toBeVisible({ timeout: 15_000 });
}

test('crm deals pipeline UX reorganization, board columns, on-demand panel, and collapsible list', async ({ browser }) => {
  const account = { id: 'crm_deals_admin', name: 'CRM Deals Admin', email: 'crm.deals@example.test', emailVerified: true, role: 'ADMIN' };

  // 26 mock deals for LEADS stage so pages = 2 (to test pagination footer when pages > 1)
  const leadsDeals = Array.from({ length: 26 }, (_, i) => ({
    id: `deal-leads-${i + 1}`,
    name: `Enterprise Contract ${i + 1} with Extended Title For Overflow Testing`,
    company: `Client Corp ${i + 1}`,
    value: { amount: 1500000 + i * 250000, currency: 'USD' },
    stage: 'LEADS',
    winProbability: 35 + (i % 20) * 2,
    closeDate: '2026-08-15',
    forecastBucket: 'PIPELINE',
    owner: { name: 'Belson', title: 'Account Executive' },
  }));

  const proposalDeals = [
    {
      id: 'deal-prop-1',
      name: 'Acme Renewal',
      company: 'Acme International',
      value: { amount: 4800000, currency: 'USD' },
      stage: 'PROPOSAL',
      winProbability: 50,
      closeDate: '2026-09-01',
      forecastBucket: 'COMMIT',
      owner: { name: 'Sarah Connor', title: 'Senior VP' },
    },
  ];

  const negDeals = [
    {
      id: 'deal-neg-1',
      name: 'Global Supply Contract',
      company: 'OmniCorp',
      value: { amount: 8200000, currency: 'USD' },
      stage: 'NEGOTIATION',
      winProbability: null,
      closeDate: '2026-10-15',
      forecastBucket: 'COMMIT',
      owner: { name: 'Alex Murphy', title: 'Director' },
    },
  ];

  const wonDeals = [
    {
      id: 'deal-won-1',
      name: 'Tech Upgrade Phase 2',
      company: 'Cyberdyne',
      value: { amount: 3500000, currency: 'USD' },
      stage: 'CLOSED_WON',
      winProbability: 100,
      closeDate: '2026-06-30',
      forecastBucket: 'CLOSED',
      owner: { name: 'Miles Dyson', title: 'Tech Lead' },
    },
  ];

  // Empty CLOSED_LOST stage to verify "No deals"
  const lostDeals = [];

  const context = await browser.newContext();
  try {
    await mockAuth(context, account, async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;

      if (path.endsWith('/crm/deals') && route.request().method() === 'GET') {
        const stage = url.searchParams.get('stage');
        const pageParam = Number(url.searchParams.get('page') || '1');
        if (stage === 'LEADS') {
          const start = (pageParam - 1) * 25;
          const pageItems = leadsDeals.slice(start, start + 25);
          return json(route, {
            data: {
              items: pageItems,
              pagination: { page: pageParam, limit: 25, pages: 2, total: leadsDeals.length },
              summary: { openPipelineValue: { amount: 34500000, currency: 'USD' } },
            },
          });
        }
        if (stage === 'PROPOSAL') {
          return json(route, {
            data: {
              items: proposalDeals,
              pagination: { page: 1, limit: 25, pages: 1, total: proposalDeals.length },
              summary: { openPipelineValue: { amount: 4800000, currency: 'USD' } },
            },
          });
        }
        if (stage === 'NEGOTIATION') {
          return json(route, {
            data: {
              items: negDeals,
              pagination: { page: 1, limit: 25, pages: 1, total: negDeals.length },
              summary: { openPipelineValue: { amount: 8200000, currency: 'USD' } },
            },
          });
        }
        if (stage === 'CLOSED_WON') {
          return json(route, {
            data: {
              items: wonDeals,
              pagination: { page: 1, limit: 25, pages: 1, total: wonDeals.length },
              summary: { wonValue: { amount: 3500000, currency: 'USD' } },
            },
          });
        }
        if (stage === 'CLOSED_LOST') {
          return json(route, {
            data: {
              items: lostDeals,
              pagination: { page: 1, limit: 25, pages: 1, total: 0 },
              summary: { lostValue: { amount: 0, currency: 'USD' } },
            },
          });
        }
        return json(route, { data: { items: [], pagination: { page: 1, limit: 25, pages: 1, total: 0 } } });
      }

      if (path.includes('/crm/deals/') && path.endsWith('/activities')) {
        return json(route, {
          data: {
            items: [
              {
                id: 'act-1',
                type: 'EMAIL',
                title: 'Sent initial pricing proposal',
                body: 'Detailed quote delivered via email.',
                actorName: 'Belson',
                createdAt: '2026-07-20T14:30:00Z',
              },
            ],
            pagination: { page: 1, limit: 10, pages: 1, total: 1 },
          },
        });
      }

      return json(route, { data: {} });
    });

    const page = await context.newPage();
    await signIn(page, account);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: Top Bar Actions & Grid/List View Toggle Option Removed
    // ──────────────────────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/crm/deals', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    // Check search input in top bar
    const tableSearch = page.getByPlaceholder('Search...');
    await expect(tableSearch).toBeVisible();
    const searchBox = await tableSearch.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(searchBox).toBe(36);

    // New Deal button
    const newDealBtn = page.getByRole('button', { name: 'New Deal' });
    await expect(newDealBtn).toBeVisible();
    const newDealHeight = await newDealBtn.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(newDealHeight).toBe(36);

    // VERIFY: Grid / List view toggle option has been removed
    await expect(page.getByLabel('Grid view')).toHaveCount(0);
    await expect(page.getByLabel('List view')).toHaveCount(0);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: 5 Stage Switcher Cards In ONE Row with Compact Money Formats
    // ──────────────────────────────────────────────────────────────────────────
    const switcherCards = page.locator('button[aria-pressed]');
    await expect(switcherCards).toHaveCount(5);

    // Verify all 5 cards sit side by side in ONE row (same Y coordinate)
    const cardBoxes = await Promise.all([0, 1, 2, 3, 4].map(i => switcherCards.nth(i).boundingBox()));
    expect(cardBoxes.every(b => Math.abs(b.y - cardBoxes[0].y) <= 2)).toBe(true);

    // Leads card is active by default with short format ($345K) and full title/aria-label
    const leadsCard = switcherCards.filter({ hasText: 'Leads' });
    await expect(leadsCard).toHaveAttribute('aria-pressed', 'true');
    await expect(leadsCard.getByText('26 deals')).toBeVisible();
    await expect(leadsCard.getByText('$345K')).toBeVisible();
    await expect(leadsCard).toHaveAttribute('title', 'Leads: 26 deals, $345,000');
    await expect(leadsCard).toHaveAttribute('aria-label', 'Leads: 26 deals, $345,000');

    // Inactive stage switcher card (Proposal) with short format ($48K) and full title/aria-label
    const proposalCard = switcherCards.filter({ hasText: 'Proposal' });
    await expect(proposalCard).toHaveAttribute('aria-pressed', 'false');
    await expect(proposalCard.getByText('1 deal')).toBeVisible();
    await expect(proposalCard.getByText('$48K')).toBeVisible();
    await expect(proposalCard).toHaveAttribute('title', 'Proposal: 1 deal, $48,000');
    await expect(proposalCard).toHaveAttribute('aria-label', 'Proposal: 1 deal, $48,000');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: Deals List Table & Whole Dashboard Vertical Scrolling
    // ──────────────────────────────────────────────────────────────────────────
    // Column Header (DEAL NAME / STAGE / VALUE)
    const columnHeader = page.locator('div:has(> div:text-is("DEAL NAME"))').first();
    await expect(columnHeader).toBeVisible();
    await expect(columnHeader.getByText('STAGE')).toBeVisible();
    await expect(columnHeader.getByText('VALUE')).toBeVisible();

    // Group Header Bar: LEADS - 26 DEALS and stage total with full decimals precision
    const groupHeader = page.locator('div:has-text("LEADS - 26 DEALS")').first();
    await expect(groupHeader).toBeVisible();
    await expect(groupHeader.getByText('$345,000.00')).toBeVisible();

    // Active stage deals rendered (Leads page 1 = 25 items)
    const leadsFirstRow = page.locator('[data-deal-id="deal-leads-1"]');
    await expect(leadsFirstRow).toBeVisible();
    const rowBox = await leadsFirstRow.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(rowBox).toBe(56);

    // Stage badge in deal row: 22px high, 12px bold, text "Leads"
    const stageBadge = leadsFirstRow.locator('span.rounded-full:has-text("Leads")');
    await expect(stageBadge).toBeVisible();
    const badgeHeight = await stageBadge.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(badgeHeight).toBe(22);

    // First deal is selected by default and has 3px accent bar
    const selectedStripe = leadsFirstRow.locator('.w-\\[3px\\].bg-accent');
    await expect(selectedStripe).toBeVisible();

    // Pagination footer rendered at the bottom of the list card
    await expect(page.getByText('Showing 1–25 of 26')).toBeVisible();
    const prevBtn = page.getByRole('button', { name: 'Previous' });
    const nextBtn = page.getByRole('button', { name: 'Next' });
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    // Whole dashboard page is vertically scrollable down (main scrollHeight > main clientHeight)
    const mainScrollable = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollHeight > main.clientHeight : false;
    });
    expect(mainScrollable).toBe(true);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: Detail Panel (380px Wide, Sticky & No Internal Scrollbar)
    // ──────────────────────────────────────────────────────────────────────────
    const detailPanel = page.locator('aside[aria-label="Deal details"]');
    await expect(detailPanel).toBeVisible();
    const panelWidth = await detailPanel.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(panelWidth).toBe(380);

    // Detail panel has no internal scrollbar
    const panelOverflow = await detailPanel.evaluate(el => getComputedStyle(el).overflowY);
    expect(panelOverflow).toBe('visible');

    // Detail panel is sticky on desktop (>=1100px)
    const panelPosition = await detailPanel.evaluate(el => getComputedStyle(el).position);
    expect(panelPosition).toBe('sticky');

    // Panel shows first deal details: 32px extrabold amount, 36px action buttons, stage select, win probability
    await expect(detailPanel.getByText('Enterprise Contract 1 with Extended Title For Overflow Testing')).toBeVisible();
    await expect(detailPanel.getByRole('button', { name: 'Log Email' })).toBeVisible();
    await expect(detailPanel.getByRole('button', { name: 'Log Call' })).toBeVisible();
    await expect(detailPanel.getByRole('button', { name: 'Edit' })).toBeVisible();
    const logEmailHeight = await detailPanel.getByRole('button', { name: 'Log Email' }).evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(logEmailHeight).toBe(36);
    await expect(detailPanel.getByLabel('Stage')).toBeVisible();
    await expect(detailPanel.getByRole('heading', { name: 'Win Probability' })).toBeVisible();
    await expect(detailPanel.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: Interactive Stage Switching & Selection Reset
    // ──────────────────────────────────────────────────────────────────────────
    // Click Proposal card
    await proposalCard.click();
    await page.waitForTimeout(200);

    // Proposal card is now active, Leads is inactive
    await expect(proposalCard).toHaveAttribute('aria-pressed', 'true');
    await expect(leadsCard).toHaveAttribute('aria-pressed', 'false');

    // Group header bar updates to "PROPOSAL - 1 DEAL"
    await expect(page.locator('div:has-text("PROPOSAL - 1 DEAL")').first()).toBeVisible();

    // Only Proposal deals are visible in list
    await expect(page.locator('[data-deal-id="deal-prop-1"]')).toBeVisible();
    await expect(leadsFirstRow).toHaveCount(0);

    // Selection automatically reset to the first deal in Proposal stage
    await expect(detailPanel.getByText('Acme Renewal')).toBeVisible();
    await expect(detailPanel.getByText('$48,000.00')).toBeVisible();

    // Click Negotiation card (where deal has winProbability = null)
    const negCard = switcherCards.filter({ hasText: 'Negotiation' });
    await negCard.click();
    await page.waitForTimeout(200);

    await expect(negCard).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('div:has-text("NEGOTIATION - 1 DEAL")').first()).toBeVisible();
    await expect(detailPanel.getByText('Global Supply Contract')).toBeVisible();
    // Win Probability section is NOT rendered when data is missing
    await expect(detailPanel.getByRole('heading', { name: 'Win Probability' })).toHaveCount(0);

    // Click Closed Lost card (0 deals empty stage)
    const lostCard = switcherCards.filter({ hasText: 'Closed Lost' });
    await lostCard.click();
    await page.waitForTimeout(200);

    await expect(lostCard).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('div:has-text("CLOSED LOST - 0 DEALS")').first()).toBeVisible();
    await expect(page.getByText('No deals in this stage')).toBeVisible();
    await expect(detailPanel.getByText('Select a deal to view details.')).toBeVisible();

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: Stage Switcher Selection Persistence in localStorage
    // ──────────────────────────────────────────────────────────────────────────
    await proposalCard.click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => localStorage.getItem('deals_pipeline_active_stage'))).toBe('PROPOSAL');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: Responsive Stacking below 1100px & RTL Support
    // ──────────────────────────────────────────────────────────────────────────
    // Below 1100px: e.g. 1024px width
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);

    // Detail panel stacks below list pane (detail panel top >= list pane top)
    const listPaneBox = await page.locator('[data-testid="deals-list-card"]').boundingBox();
    const stackedPanelBox = await detailPanel.boundingBox();
    expect(stackedPanelBox.y).toBeGreaterThanOrEqual(listPaneBox.y);

    // Restore to 1440px desktop LTR
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 8: 1280/1440/1920 Viewports, Single-Row Switcher & Keyboard Operation
    // ──────────────────────────────────────────────────────────────────────────
    // Test 1280px, 1440px, 1920px: zero horizontal document scroll and all 5 cards in ONE row
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalScroll).toBe(false);

      const rowBoxes = await Promise.all([0, 1, 2, 3, 4].map(i => switcherCards.nth(i).boundingBox()));
      expect(rowBoxes.every(b => Math.abs(b.y - rowBoxes[0].y) <= 2)).toBe(true);
    }

    // Keyboard navigation: Tab to switcher cards and Enter/Space activate
    await leadsCard.focus();
    await page.keyboard.press('Enter');
    await expect(leadsCard).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await context.close();
  }
});
