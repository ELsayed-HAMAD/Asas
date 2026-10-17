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

test('crm sales performance page strictly satisfies all layout rules at 1280px, 1440px and 1920px', async ({ browser }) => {
  const account = { id: 'crm_sales_admin', name: 'CRM Sales Admin', email: 'crm.sales@example.test', emailVerified: true, role: 'ADMIN' };

  const reps = [
    { ownerEmployeeId: 'rep-1', ownerName: 'Richard Lopez', wonValue: { amount: 12500000, currency: 'USD' }, winRate: 68.5, openValue: { amount: 8000000, currency: 'USD' }, weeklyActivity: [{ week: '2026-W40', active: 5, won: 2, lost: 1 }, { week: '2026-W41', active: 6, won: 3, lost: 0 }] },
    { ownerEmployeeId: 'rep-2', ownerName: 'Richard Martin', wonValue: { amount: 9800000, currency: 'USD' }, winRate: 55.0, openValue: { amount: 6200000, currency: 'USD' }, weeklyActivity: [{ week: '2026-W40', active: 4, won: 1, lost: 2 }, { week: '2026-W41', active: 5, won: 2, lost: 1 }] },
    { ownerEmployeeId: 'rep-3', ownerName: 'Linda Lopez', wonValue: { amount: 8400000, currency: 'USD' }, winRate: 62.0, openValue: { amount: 5500000, currency: 'USD' }, weeklyActivity: [{ week: '2026-W40', active: 3, won: 2, lost: 1 }, { week: '2026-W41', active: 4, won: 2, lost: 0 }] },
    { ownerEmployeeId: 'rep-4', ownerName: 'James Robinson', wonValue: { amount: 7200000, currency: 'USD' }, winRate: 48.0, openValue: { amount: 4800000, currency: 'USD' }, weeklyActivity: [{ week: '2026-W40', active: 6, won: 1, lost: 3 }, { week: '2026-W41', active: 5, won: 1, lost: 2 }] },
    { ownerEmployeeId: 'rep-5', ownerName: 'James Braddock', wonValue: { amount: 5600000, currency: 'USD' }, winRate: 45.0, openValue: { amount: 3900000, currency: 'USD' }, weeklyActivity: [{ week: '2026-W40', active: 2, won: 1, lost: 1 }, { week: '2026-W41', active: 3, won: 1, lost: 1 }] },
    { ownerEmployeeId: 'rep-6', ownerName: 'Martin Riggs', wonValue: { amount: 4100000, currency: 'USD' }, winRate: 40.0, openValue: { amount: 2800000, currency: 'USD' }, weeklyActivity: [{ week: '2026-W40', active: 3, won: 1, lost: 2 }, { week: '2026-W41', active: 2, won: 0, lost: 1 }] },
  ];

  const topDeals = [
    { id: 'deal-1', name: 'Cyberdyne AI Defense Infrastructure', company: 'Cyberdyne Systems', value: { amount: 4800000, currency: 'USD' }, productLine: 'Enterprise Suite', owner: { name: 'Richard Lopez' } },
    { id: 'deal-2', name: 'OmniCorp Urban Automation Protocol', company: 'Omni Consumer Products', value: { amount: 3600000, currency: 'USD' }, productLine: 'Security Systems', owner: { name: 'Richard Martin' } },
    { id: 'deal-3', name: 'Weyland Bio-Terraforming Agreement', company: 'Weyland-Yutani', value: { amount: 2400000, currency: 'USD' }, productLine: 'Industrial Robotics', owner: { name: 'Linda Lopez' } },
  ];

  const context = await browser.newContext();
  try {
    await mockAuth(context, account, async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;

      if (path.endsWith('/crm/sales-performance')) {
        return json(route, {
          data: {
            monthlyClosedWon: [
              { month: '2026-01', count: 4, value: { amount: 2800000, currency: 'USD' } },
              { month: '2026-02', count: 5, value: { amount: 3500000, currency: 'USD' } },
              { month: '2026-03', count: 6, value: { amount: 4200000, currency: 'USD' } },
              { month: '2026-04', count: 4, value: { amount: 3100000, currency: 'USD' } },
              { month: '2026-05', count: 7, value: { amount: 5400000, currency: 'USD' } },
              { month: '2026-06', count: 8, value: { amount: 6200000, currency: 'USD' } },
              { month: '2026-07', count: 6, value: { amount: 4800000, currency: 'USD' } },
              { month: '2026-08', count: 5, value: { amount: 3900000, currency: 'USD' } },
              { month: '2026-09', count: 7, value: { amount: 5600000, currency: 'USD' } },
              { month: '2026-10', count: 6, value: { amount: 4900000, currency: 'USD' } },
            ],
            byRep: reps,
            summary: {
              totalWonCount: 18,
              totalLostCount: 8,
              overallWinRate: 69.2,
              averageSalesCycleDays: 32.4,
            },
            weeklyActivity: [
              { week: '2026-W37', active: 8, won: 3, lost: 2 },
              { week: '2026-W38', active: 10, won: 4, lost: 1 },
              { week: '2026-W39', active: 12, won: 5, lost: 3 },
              { week: '2026-W40', active: 14, won: 6, lost: 2 },
              { week: '2026-W41', active: 11, won: 4, lost: 2 },
            ],
            yearWonTotal: { amount: 44400000, currency: 'USD' },
            previousYearWonTotal: { amount: 38000000, currency: 'USD' },
            undatedClosedCount: 0,
          },
        });
      }

      if (path.endsWith('/crm/forecast')) {
        return json(route, {
          data: {
            summary: {
              totalQuota: { amount: 60000000, currency: 'USD' },
              quotaAttainmentPct: 74.0,
            },
            availableYears: ['2026', '2025', '2024'],
          },
        });
      }

      if (path.endsWith('/crm/deals')) {
        return json(route, {
          data: {
            items: topDeals,
            pagination: { page: 1, limit: 3, total: 3, pages: 1 },
            summary: { wonValue: { amount: 10800000, currency: 'USD' } },
          },
        });
      }

      return json(route, { data: {} });
    });

    const page = await context.newPage();
    await signIn(page, account);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: Top Bar & Filter Row
    // ──────────────────────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/crm/sales-performance', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    // 1) Top Bar (56px, one row, 12px gaps, nothing wraps)
    const topBar = page.locator('header').first();
    await expect(topBar).toBeVisible();
    const topBarHeight = await topBar.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(topBarHeight).toBe(56);

    // Left: Breadcrumb ("Dashboard > CRM > Sales Performance")
    const breadcrumb = topBar.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumb).toBeVisible();
    const breadcrumbRect = await breadcrumb.evaluate(el => el.getBoundingClientRect());
    expect(await breadcrumb.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');

    // Right group: "Search or jump to..." (240px, 36px) and Bell (36x36)
    const jumpSearchBtn = topBar.getByRole('button', { name: /Search or jump to\.\.\./i });
    await expect(jumpSearchBtn).toBeVisible();
    const jumpSearchRect = await jumpSearchBtn.evaluate(el => ({
      x: Math.round(el.getBoundingClientRect().x),
      y: Math.round(el.getBoundingClientRect().y),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    expect(jumpSearchRect.width).toBe(240);
    expect(jumpSearchRect.height).toBe(36);
    // Spacer: breadcrumb on left and command search on right never touch
    expect(jumpSearchRect.x).toBeGreaterThan(breadcrumbRect.x + breadcrumbRect.width + 50);

    const bellBtn = topBar.getByRole('button', { name: /Notification Settings/i });
    await expect(bellBtn).toBeVisible();
    const bellRect = await bellBtn.evaluate(el => ({
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    expect(bellRect.width).toBe(36);
    expect(bellRect.height).toBe(36);

    // 2) Filter Row directly below top bar (48px, padding 0 24px, 1px bottom border)
    // Left group: Search (240px), year (104px), month (min 168px)
    const searchInput = page.getByPlaceholder('Search...');
    await expect(searchInput).toBeVisible();
    const searchRect = await searchInput.evaluate(el => ({
      y: Math.round(el.getBoundingClientRect().y),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    expect(searchRect.width).toBe(240);
    expect(searchRect.height).toBe(36);

    // Year select: 36px high, width 104px
    const yearSelect = page.getByLabel('Sales performance year');
    await expect(yearSelect).toBeVisible();
    const yearLabel = yearSelect.locator('xpath=..');
    const yearRect = await yearLabel.evaluate(el => ({
      y: Math.round(el.getBoundingClientRect().y),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    expect(yearRect.height).toBe(36);
    expect(yearRect.width).toBe(104);

    // Month select button: 36px high, min-width 168px, shows full month text without ellipsis
    const monthBtn = page.getByRole('button', { name: /October 2026|All Dates/i });
    await expect(monthBtn).toBeVisible();
    const monthRect = await monthBtn.evaluate(el => ({
      y: Math.round(el.getBoundingClientRect().y),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    expect(monthRect.height).toBe(36);
    expect(monthRect.width).toBeGreaterThanOrEqual(168);

    // Right group in Filter Row: Download icon button (36x36) + "Download Report" (36px high, nowrap)
    const downloadIconBtn = page.getByRole('button', { name: 'Download sales report' });
    await expect(downloadIconBtn).toBeVisible();
    const downloadIconRect = await downloadIconBtn.evaluate(el => ({
      y: Math.round(el.getBoundingClientRect().y),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    expect(downloadIconRect.width).toBe(36);
    expect(downloadIconRect.height).toBe(36);

    const downloadReportBtn = page.getByRole('button', { name: 'Download Report', exact: true });
    await expect(downloadReportBtn).toBeVisible();
    const downloadReportRect = await downloadReportBtn.evaluate(el => ({
      y: Math.round(el.getBoundingClientRect().y),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    expect(downloadReportRect.height).toBe(36);

    // At 1440px: Left group and Right group sit in the same filter row without wrapping
    expect(Math.abs(searchRect.y - downloadReportRect.y)).toBeLessThanOrEqual(4);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: Top Note Row (12px Muted, Line-Height 1.5, pt-3 px-6 pb-0)
    // ──────────────────────────────────────────────────────────────────────────
    const topNote = page.getByText(/Closed outcomes: 2026 \(UTC\)/i);
    await expect(topNote).toBeVisible();
    const topNoteStyles = await topNote.evaluate(el => {
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize,
        paddingTop: s.paddingTop,
      };
    });
    expect(topNoteStyles.fontSize).toBe('12px');
    expect(topNoteStyles.paddingTop).toBe('12px');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: KPI Row (3 Equal Cards, Equal Height 104px, Shared Baseline)
    // ──────────────────────────────────────────────────────────────────────────
    const kpiCards = [
      page.locator('div:has(> div > p:text-is("Team Quota Attainment"))').first(),
      page.locator('div:has(> div > p:text-is("Total Closed Won"))').first(),
      page.locator('div:has(> div > p:text-is("Avg Sales Cycle"))').first(),
    ];

    for (const card of kpiCards) {
      await expect(card).toBeVisible();
    }

    const kpiBoxes = await Promise.all(kpiCards.map(c => c.boundingBox()));
    // Equal height (min 104px)
    expect(kpiBoxes[0].height).toBeGreaterThanOrEqual(104);
    expect(Math.abs(kpiBoxes[0].height - kpiBoxes[1].height)).toBeLessThanOrEqual(2);
    expect(Math.abs(kpiBoxes[0].height - kpiBoxes[2].height)).toBeLessThanOrEqual(2);

    // Shared values baseline (Y coordinate of values line within 2px)
    const val1 = page.getByText('74%').first();
    const val2 = page.getByText('$444,000.00').first();
    const val3 = page.getByText('32 Days').first();
    await expect(val1).toBeVisible();
    await expect(val2).toBeVisible();
    await expect(val3).toBeVisible();

    const val1Box = await val1.boundingBox();
    const val2Box = await val2.boundingBox();
    const val3Box = await val3.boundingBox();
    expect(Math.abs(val1Box.y - val2Box.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(val1Box.y - val3Box.y)).toBeLessThanOrEqual(2);

    // Card 1: 6px high progress bar
    const progressBar = kpiCards[0].locator('.rounded-full.h-\\[6px\\]');
    await expect(progressBar).toBeVisible();
    const progressHeight = await progressBar.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(progressHeight).toBe(6);

    // Card 2: comparison delta text
    await expect(kpiCards[1].getByText('+16.8% vs 2025')).toBeVisible();

    // Card 3: "Closed won" inline badge on same baseline
    const closedWonBadge = kpiCards[2].getByText('Closed won');
    await expect(closedWonBadge).toBeVisible();

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: Middle Row (Grid 3fr 2fr, Aligned Top/Bottom Edges)
    // ──────────────────────────────────────────────────────────────────────────
    const leaderboardCard = page.locator('div:has(> div > h2:text-is("Rep Leaderboard"))').first();
    const activityCard = page.locator('div:has(> div > h2:text-is("Activity Breakdown"))').first();

    await expect(leaderboardCard).toBeVisible();
    await expect(activityCard).toBeVisible();

    const leaderBox = await leaderboardCard.boundingBox();
    const actBox = await activityCard.boundingBox();

    // Top and bottom edges aligned
    expect(Math.abs(leaderBox.y - actBox.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(leaderBox.height - actBox.height)).toBeLessThanOrEqual(2);

    // Leaderboard Table: NO horizontal scroll
    const tableScrollable = await leaderboardCard.evaluate(el => {
      const table = el.querySelector('table');
      return table ? table.scrollWidth > table.clientWidth : false;
    });
    expect(tableScrollable).toBe(false);

    // Leaderboard Columns: Rank (48px), Rep (minmax 200px 1fr), Win Rate (96px), Revenue (110px), Trend (140px)
    const rankHeader = leaderboardCard.locator('th:text-is("Rank")');
    const repHeader = leaderboardCard.locator('th:text-is("Rep")');
    const winRateHeader = leaderboardCard.locator('th:text-is("Win Rate")');
    const revenueHeader = leaderboardCard.locator('th:text-is("Revenue")');
    const trendHeader = leaderboardCard.locator('th:text-is("Trend")');

    await expect(rankHeader).toBeVisible();
    await expect(repHeader).toBeVisible();
    await expect(winRateHeader).toBeVisible();
    await expect(revenueHeader).toBeVisible();
    await expect(trendHeader).toBeVisible();

    const colWidths = await leaderboardCard.evaluate(el => {
      const ths = Array.from(el.querySelectorAll('thead th'));
      return ths.map(th => Math.round(th.getBoundingClientRect().width));
    });
    // [Rank 48, Rep >= 200, Win Rate 96, Revenue 110, Trend 140]
    expect(colWidths[0]).toBe(48);
    expect(colWidths[1]).toBeGreaterThanOrEqual(200);
    expect(colWidths[2]).toBe(96);
    expect(colWidths[3]).toBe(110);
    expect(colWidths[4]).toBe(140);

    // Verify all header labels have white-space: nowrap and "WIN RATE" is on one line
    const headerNowraps = await leaderboardCard.evaluate(el => {
      const ths = Array.from(el.querySelectorAll('thead th'));
      return ths.map(th => ({
        text: th.textContent.trim(),
        whiteSpace: getComputedStyle(th).whiteSpace,
        height: Math.round(th.getBoundingClientRect().height),
      }));
    });
    headerNowraps.forEach(h => {
      expect(h.whiteSpace).toBe('nowrap');
      expect(h.height).toBe(40);
    });

    // Verify Rep row: 52px height, 32px avatar + name 14px medium
    const firstRepRow = leaderboardCard.locator('tbody tr').first();
    await expect(firstRepRow).toBeVisible();
    const rowHeight = await firstRepRow.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(rowHeight).toBe(52);

    const firstAvatar = firstRepRow.locator('.w-8.h-8.rounded-full');
    await expect(firstAvatar).toBeVisible();
    const avatarWidth = await firstAvatar.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(avatarWidth).toBe(32);

    // Trend sparkline height is 24px
    const firstSparkline = firstRepRow.locator('.recharts-responsive-container');
    await expect(firstSparkline).toBeVisible();
    const sparkHeight = await firstSparkline.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(sparkHeight).toBe(24);

    // All reps visible with no inner scrollbar
    const repRows = leaderboardCard.locator('tbody tr');
    await expect(repRows).toHaveCount(6);

    // Activity Breakdown: 16px title, legend (OPEN, WON, LOST, 12px)
    await expect(activityCard.getByText(/open/i)).toBeVisible();
    await expect(activityCard.getByText(/won/i).first()).toBeVisible();
    await expect(activityCard.getByText(/lost/i)).toBeVisible();

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: Bottom Row (Grid 3fr 2fr, items-start, min-height 200px)
    // ──────────────────────────────────────────────────────────────────────────
    const winLossCard = page.locator('div:has(> div > h2:text-is("Win/Loss Analysis"))').first();
    const topDealsCard = page.locator('div:has(> div > h2:text-is("Top Deals · October 2026"))').first();

    await expect(winLossCard).toBeVisible();
    await expect(topDealsCard).toBeVisible();

    const winLossBox = await winLossCard.boundingBox();
    const topDealsBox = await topDealsCard.boundingBox();

    expect(winLossBox.height).toBeGreaterThanOrEqual(200);
    expect(topDealsBox.height).toBeGreaterThanOrEqual(200);

    // Top Deals has "View All" link on title line
    const viewAllBtn = topDealsCard.getByRole('button', { name: 'View All' });
    await expect(viewAllBtn).toBeVisible();

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: Viewports 1280px, 1440px, 1920px (Rep Names Full, Zero Scroll)
    // ──────────────────────────────────────────────────────────────────────────
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);

      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalScroll).toBe(false);

      // Verify Top Bar shows breadcrumb on left and Search-or-jump + bell on right with no overlap
      const topBarCheck = await page.evaluate(() => {
        const nav = document.querySelector('header nav[aria-label="Breadcrumb"]');
        const jump = document.querySelector('header button[title="Global search (⌘K or Ctrl+K)"]');
        const nRect = nav.getBoundingClientRect();
        const jRect = jump.getBoundingClientRect();
        return {
          noOverlap: jRect.x > (nRect.x + nRect.width),
        };
      });
      expect(topBarCheck.noOverlap).toBe(true);

      // Verify Filter Row: search/year/month on left, download on right with no wrapping
      const filterRowCheck = await page.evaluate(() => {
        const search = document.querySelector('input[placeholder="Search..."]');
        const dl = document.querySelector('button[aria-label="Download sales report"]');
        const sRect = search.getBoundingClientRect();
        const dRect = dl.getBoundingClientRect();
        return {
          sameRow: Math.abs(sRect.y - dRect.y) <= 4,
          dlRight: dRect.x > sRect.x + sRect.width,
        };
      });
      expect(filterRowCheck.sameRow).toBe(true);
      expect(filterRowCheck.dlRight).toBe(true);

      // Verify Leaderboard table has no horizontal scroll at this width
      const hasTableScroll = await leaderboardCard.evaluate(el => el.scrollWidth > el.clientWidth);
      expect(hasTableScroll).toBe(false);

      // Verify "Richard Lopez", "Richard Martin", "Linda Lopez", "James Robinson" show in full without ellipsis
      const nameElements = await leaderboardCard.evaluate(el => {
        const spans = Array.from(el.querySelectorAll('tbody tr td:nth-child(2) span'));
        return spans.slice(0, 4).map(s => ({
          text: s.textContent.trim(),
          title: s.getAttribute('title'),
          isTruncated: s.scrollWidth > s.clientWidth,
        }));
      });

      expect(nameElements[0].text).toBe('Richard Lopez');
      expect(nameElements[0].isTruncated).toBe(false);
      expect(nameElements[0].title).toBe('Richard Lopez');

      expect(nameElements[1].text).toBe('Richard Martin');
      expect(nameElements[1].isTruncated).toBe(false);
      expect(nameElements[1].title).toBe('Richard Martin');

      expect(nameElements[2].text).toBe('Linda Lopez');
      expect(nameElements[2].isTruncated).toBe(false);
      expect(nameElements[2].title).toBe('Linda Lopez');

      expect(nameElements[3].text).toBe('James Robinson');
      expect(nameElements[3].isTruncated).toBe(false);
      expect(nameElements[3].title).toBe('James Robinson');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6b: Below 900px, Filter Row wraps onto two lines, controls keep size
    // ──────────────────────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 850, height: 900 });
    await page.waitForTimeout(100);

    const filterRowWrap = await page.evaluate(() => {
      const search = document.querySelector('input[placeholder="Search..."]');
      const dlBtn = document.querySelector('button[aria-label="Download sales report"]');
      const sRect = search.getBoundingClientRect();
      const dRect = dlBtn.getBoundingClientRect();
      return {
        searchY: Math.round(sRect.y),
        downloadY: Math.round(dRect.y),
        searchHeight: Math.round(sRect.height),
        searchWidth: Math.round(sRect.width),
        downloadHeight: Math.round(dRect.height),
        downloadWidth: Math.round(dRect.width),
      };
    });
    // Download group is on its own line below left group
    expect(filterRowWrap.downloadY).toBeGreaterThan(filterRowWrap.searchY + 20);
    expect(filterRowWrap.searchHeight).toBe(36);
    expect(filterRowWrap.searchWidth).toBe(240);
    expect(filterRowWrap.downloadHeight).toBe(36);
    expect(filterRowWrap.downloadWidth).toBe(36);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: At 1440x900, KPIs and at least first 5 Rep rows visible without scroll
    // ──────────────────────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);

    const visibleRepRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.filter(r => {
        const rect = r.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      }).length;
    });
    expect(visibleRepRows).toBeGreaterThanOrEqual(5);
  } finally {
    await context.close();
  }
});
