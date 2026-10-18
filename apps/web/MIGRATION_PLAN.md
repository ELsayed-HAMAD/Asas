# shadcn/ui Migration Plan — apps/web

> Branch: `feat/web-shadcn-modernization`
> Approved: 2026-10-18
> Progress tracker: [MIGRATION_PROGRESS.md](MIGRATION_PROGRESS.md)

---

## Context

The Asas frontend received a first shadcn/ui pass (commit `da71d9e`) that added 21 primitives and swapped basic controls, but the migration is unfinished. This plan completes it with **zero behavior changes** — every API call, mutation, keyboard flow, i18n (AR/EN + RTL), deep link, and portal must work identically after.

## Hard Constraints

1. **Nothing deleted, no feature or behavior changed.**
2. **Colors and design preserved.** All styling runs on ASAS tokens in `index.css` + a shadcn alias shim. New primitives reuse them.
3. **Markup-only edits on logic-bearing pages.** Hooks, handlers, state, and API calls stay byte-identical; only JSX markup and classNames change.
4. **Data layer untouchable.** `lib/api/*`, `lib/format.js`, `lib/queryKeys.js`, `lib/sse.js`, `lib/authClient.js`, `main.jsx` — zero changes.
5. **Phased execution** with a verification gate before each phase advances.

## Locked Decisions (user-confirmed)

- **Sidebar: KEEP CUSTOM.** Do not migrate to shadcn `Sidebar`.
- **Marketing: SWAP CONTROLS ONLY.** Keep `MarketingPageFrame` and visual identity.
- **Approved design tweaks (only these):**
  1. Skeleton loading states in QueryState.
  2. Tooltips on collapsed sidebar icons.
  3. Use `ui/alert-dialog` for destructive ConfirmDialogs.
- **Onboarding choice cards: ADOPT Radio Group** (`@radix-ui/react-radio-group`).
- **NOT included:** shadcn `Empty`, `ui/sheet` mobile sidebar, toasts/sonner, form/schema/date libs, pagination numbered links.

---

## Phased Plan

### Phase 0 — Foundation
- [ ] Add new primitives: `skeleton`, `radio-group`, `breadcrumb`, `kbd`, `label`
- [ ] Add `@radix-ui/react-radio-group` dependency
- [ ] Fix `table.jsx` TableHead RTL: `text-left` → `text-left rtl:text-right`
- [ ] Verification: `pnpm test` + `pnpm build`

### Phase 1 — Layout Shell (DashboardLayout)
- [ ] Breadcrumb → `ui/breadcrumb` (preserve BREADCRUMB_LABELS, `t()`, `aria-current`, truncation)
- [ ] Inline `<kbd>` → `ui/kbd`
- [ ] CommandPalette → `ui/command` with substring filter override
- [ ] Verification: `pnpm test` + `pnpm build` + manual check (Ctrl+K, AR toggle, dark mode)

### Phase 2 — Common Components
- [ ] QueryState: add skeleton loading branch
- [ ] ConfirmDialog: add `ui/alert-dialog` branch when `danger`
- [ ] StatCard: verify (already wraps Card+Badge)
- [ ] Verification: `pnpm test` + `pnpm build`

### Phase 3 — Tables (18 raw tables → ui/table)
Files (13):
- [ ] `SalesPerformance.jsx`
- [ ] `RevenueForecast.jsx`
- [ ] `AccountsReceivable.jsx`
- [ ] `BankReconciliation.jsx`
- [ ] `PortfolioOverview.jsx`
- [ ] `Expenses.jsx`
- [ ] `FinanceOverview.jsx`
- [ ] `RecruitmentPipeline.jsx`
- [ ] `ProductCatalog.jsx` (×3 tables)
- [ ] `TrialBalance.jsx`
- [ ] `TimeAttendance.jsx` (×2)
- [ ] `Payroll.jsx` (×3)
- [ ] `StockMovements.jsx`

Verification per module: `pnpm test` + `pnpm build` + grep audit (no `<table` in converted pages)

### Phase 4 — Form Controls
- [ ] Native `<select>` → `ui/select` (70 sites / 18 files)
  - Sentinel `__all__` for empty-value "All" filter options
- [ ] Raw `<button>` → `ui/button` (65 sites / 24 files)
- [ ] Raw `<input>` → `ui/input` (20 sites / 10 files)
- Split by module: auth → CRM → finance → HR → inventory → projects → settings
- Verification per module: `pnpm test` + `pnpm build`

### Phase 5 — Settings Tabs + Small Surfaces
- [ ] SettingsTabs → `ui/tabs` (route-driven, `value={pathname}`, `onValueChange` navigates)
- [ ] Onboarding → `ui/radio-group`
- [ ] Marketing page control swaps
- [ ] Verification: `pnpm test` + `pnpm build`

### Phase 6 — Approved Tweaks
- [ ] Sidebar-icon tooltips (collapsed state)
- [ ] ConfirmDialog destructive call-sites onto alert-dialog branch
- [ ] Verification: `pnpm test` + `pnpm build`

### Phase 7 — Final Sweep
- [ ] Dark-mode pass (all migrated surfaces)
- [ ] RTL/AR pass (all migrated surfaces)
- [ ] Unused-import/primitive audit
- [ ] Final: `pnpm test` + `pnpm build`

---

## Key Technical Notes

- **Radix Select empty value:** `SelectItem value=""` throws. Use `__all__` sentinel in JSX wiring only.
- **cmdk filter:** Override with substring matcher to preserve identical search results.
- **Tabs routing:** `value={pathname}` + `onValueChange={navigate}` keeps deep links working.
- **Table RTL:** Fixed in Phase 0 (`rtl:text-right` on TableHead).
- **No `@` alias:** All imports are relative paths.
- **Tailwind v4 CSS-first:** No `tailwind.config.js`; tokens in `@theme` block of `index.css`.

## Verification (every phase)

1. `pnpm test` — full suite, real pass counts
2. `pnpm build`
3. Grep audit: no leftover raw equivalents in converted pages
4. Diff review: zero changes to hook/handler/API lines