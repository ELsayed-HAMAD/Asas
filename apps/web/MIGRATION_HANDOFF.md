# shadcn/ui Migration — HANDOFF FILE

> **Purpose:** Start a new chat, paste this file's path (or its contents), and continue exactly where we left off.
> **Repo:** `d:\WEP PROJECTS\Asas` · **App:** `apps/web` · **Branch:** `feat/web-shadcn-modernization`
> **Last worked:** 2026-10-18 · **Companion files:** [MIGRATION_PLAN.md](MIGRATION_PLAN.md) · [MIGRATION_PROGRESS.md](MIGRATION_PROGRESS.md)

---

## 1. THE MISSION

Complete the shadcn/ui migration of the Asas frontend (`apps/web`). A first pass (commit `da71d9e`, 2026-10-17) added 21 shadcn primitives and swapped basic controls, but most surfaces are still hand-rolled: the command palette, most tables, settings tabs, breadcrumbs, 70 native selects, 65 raw buttons, 20 raw inputs, onboarding cards, marketing controls.

The plan below was **fully audited and approved by the user** (Elsayed Hamad) after three rounds of questions. Do not re-litigate the locked decisions.

## 2. HARD RULES (non-negotiable, from the user)

1. **Nothing deleted, no feature or behavior changed.** Every API call, mutation, validation, keyboard flow, i18n (AR/EN + RTL), deep link (`?new=1`), and portal (`#topbar-actions-portal`) must work identically after.
2. **Colors and design preserved exactly.** Styling runs on the dual-token system in `src/index.css` (ASAS tokens + shadcn alias shim). Do NOT rewrite tokens; new primitives reuse them. Where a ui/* default differs from the current look, pass className overrides so the result is pixel-identical.
3. **Markup-only edits on logic-bearing pages.** Dashboard pages fuse react-query hooks + handlers + JSX in one file. Hooks, handlers, state, and API calls stay byte-identical in substance; only JSX markup and classNames change.
4. **Data layer untouchable.** `lib/api/*`, `lib/format.js`, `lib/queryKeys.js`, `lib/sse.js`, `lib/authClient.js`, `main.jsx` LiveSync — zero changes.
5. **Phased execution** with a verification gate before each phase advances.
6. **Surface any design tweak to the user first** — the user makes that call. The ONLY pre-approved tweaks are the three listed in §3.

### Working rules (from user memory)
- Run `pnpm.cmd test` full suite with **real pass counts** on every task before reporting done. Baseline: **44 pass / 0 fail** (confirmed 2026-10-18).
- API runs **compiled** (`pnpm build` then `node dist/server.js`), never `pnpm dev`.
- Never run `prisma migrate deploy` — the user deploys migrations.
- Keep `MIGRATION_PROGRESS.md` updated as work proceeds.
- Git commits end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## 3. LOCKED DECISIONS (user-confirmed — do not change)

- **Sidebar: KEEP CUSTOM.** No migration to shadcn `Sidebar` (too coupled with i18n, auto-expand, auto-scroll, mobile drawer, RTL logical properties). Internals may only be restyled with existing ASAS tokens.
- **Marketing pages: SWAP CONTROLS ONLY** (raw button/input/badge → ui/*). Keep `MarketingPageFrame` and the marketing visual identity. Marketing is forced-light.
- **Approved design tweaks — ONLY these three:**
  1. Skeleton loading states in `QueryState`.
  2. Tooltips on collapsed sidebar icons (wire the unused `ui/tooltip`).
  3. `ui/alert-dialog` for destructive ConfirmDialogs (branch inside ConfirmDialog when `danger`).
- **Onboarding choice cards: ADOPT Radio Group** (`@radix-ui/react-radio-group`; visual look stays identical).
- **Pagination: KEEP hand-rolled** Prev/Next + "Page X of Y" (shadcn Pagination renders numbered links = UX change). Only restyle its buttons with ui/button.
- **NOT included:** shadcn `Empty`, `ui/sheet` mobile sidebar, toasts/sonner, any form library, any schema validation, any date picker. Existing feedback patterns (inline Alert banners + ad-hoc `role="status"` chips in ProductCatalog/Payroll/AccountsPayable/DashboardOverview) stay as they are.

## 4. TECH FACTS (verified)

- React 19 + Vite 6 + Tailwind **v4 CSS-first** (`@theme` in `src/index.css`). **No** `tailwind.config.js`, **no** `@` alias — all imports are **relative**. **No** `components.json`. New primitives are hand-committed into `src/components/ui/` matching existing file style.
- `cn()` = twMerge(clsx) at `src/lib/utils.js`.
- Dark mode = `html.dark` class overriding only ASAS tokens in index.css; **zero `dark:` variants in src** — all theming flows through tokens. RTL via `html[dir="rtl"]` (Cairo font).
- 21 shadcn primitives exist in `src/components/ui/`. Unused-by-pages: `sheet`, `accordion`, `alert-dialog`, `tooltip`, `select`, `tabs`, `command`, `separator`.
- Dialog chrome is centralized: `common/FormDialog.jsx` + `common/ConfirmDialog.jsx` back every create/edit/delete flow. `common/QueryState.jsx` handles loading/error/empty. `common/StatCard.jsx` wraps Card+Badge.
- Button variants: default/destructive/outline/secondary/ghost/link; sizes: default(h-9)/sm/lg/icon.
- Tokens: surfaces (`surface`, `-raised`, `-muted`, `-active`, `-strong`), borders (`faint/subtle/default/strong`), text scale (`heading/body/body-light/muted/caption/faint/on-primary`), radii (`rounded-card/-card-sm/-button/-input/-badge/-xs`), shadows (`shadow-card/-card-hover/-elevated/-panel`).

## 5. THE PHASED PLAN (approved)

### Phase 0 — Foundation
Add primitives: `skeleton` ✅, `kbd` ✅, `label` ✅, `radio-group` ⬜, `breadcrumb` ⬜. Dep `@radix-ui/react-radio-group` ✅ (^1.5.1). Fix `table.jsx` TableHead: `text-left` → `text-left rtl:text-right` ⬜. Verification: `pnpm test` + `pnpm build`. Commit.

### Phase 1 — Layout shell (`src/layouts/DashboardLayout.jsx`, markup-only)
- Breadcrumb block (~lines 1036–1060) → `ui/breadcrumb`. Preserve: `BREADCRUMB_LABELS`, `BREADCRUMB_I18N`, `t()` calls, `aria-current="page"`, separator `rtl:rotate-180`, Link navigation, truncation (`truncate max-w-[140px]`), `title` attrs.
- Inline `<kbd>` (line ~1081) → `ui/kbd`.
- `CommandPalette` → `ui/command` (see §6).
- Untouched: NAV/BOTTOM_NAV configs, all hooks/state/handlers, portal `#topbar-actions-portal`, unverified banner, user menu, Quick Entry, workspace switcher, mobile focus trap.

### Phase 2 — Common components (prop APIs preserved)
- `QueryState`: add skeleton loading branch; error/empty branches identical.
- `ConfirmDialog`: when `danger`, render `ui/alert-dialog` (same props, busy state, error Alert); non-destructive keeps `ui/dialog`.
- `StatCard`: verify only.

### Phase 3 — Tables (18 raw `<table>` blocks in 13 files → `ui/table`)
SalesPerformance, RevenueForecast, AccountsReceivable, BankReconciliation, PortfolioOverview, Expenses, FinanceOverview, RecruitmentPipeline, ProductCatalog ×3, TrialBalance, TimeAttendance ×2, Payroll ×3, StockMovements. (EmployeeList + AccountsPayable already done.) Mechanical markup swap to Table/TableHeader/TableBody/TableRow/TableHead/TableCell; preserve per-cell classNames, row onClick, checkbox stopPropagation, pagination footers. Split by module; verification gate per module.

### Phase 4 — Form controls (largest surface)
- Native `<select>` → `ui/select` (70 sites / 18 files; heaviest: TimeAttendance 14, Payroll 12, EmployeeList 9, ProductCatalog 6, DataExport 6). `ui/select.jsx` is complete and token-styled — pure adoption. **Radix constraint:** `SelectItem value=""` throws — use `__all__` sentinel in JSX wiring only (`value={x || '__all__'}`, `onValueChange={v => setX(v === '__all__' ? '' : v)}`). State/handlers unchanged.
- Raw `<button>` → `ui/button` (65 sites / 24 files).
- Raw `<input>` → `ui/input` (20 sites / 10 files).
- Split by module (auth → CRM → finance → HR → inventory → projects → settings), verification gate per module.

### Phase 5 — Settings tabs + small surfaces
- `SettingsTabs` → `ui/tabs` route-driven: `value={pathname}`, `onValueChange={navigate(path)}`; keep 6 tabs, underline indicator, deep links.
- Onboarding choice cards → `ui/radio-group` (never touch its `finish()` API calls).
- Marketing control swaps; DashboardPlaceholder + 404.

### Phase 6 — Approved tweaks
Sidebar-icon tooltips (collapsed state); destructive ConfirmDialog call-sites onto alert-dialog branch.

### Phase 7 — Final sweep
Dark-mode pass, RTL/AR pass, unused-import/primitive audit, grep audit (no leftover raw equivalents in converted pages).

## 6. KEY MIGRATION DESIGNS

**CommandPalette → ui/command:** Keep `COMMAND_ITEMS` registry (id/title/subtitle/category/path/icon/keywords), category grouping (Quick Actions, Navigation), footer hint bar, `isOpen`/`onClose` prop API, `navigate(item.path)` + `onClose()` on select, `?new=1` deep links; Ctrl+K listener stays in DashboardLayout. **Deterministic behavior:** override cmdk's `filter` with a substring matcher (current code does `.includes()`; cmdk default is fuzzy):

```jsx
const substringFilter = (value, search, keywords) => {
  const q = search.toLowerCase()
  if (value.toLowerCase().includes(q)) return 1
  if (keywords?.some(k => k.toLowerCase().includes(q))) return 1
  return 0
}
```

Use `CommandDialog`/`CommandInput`/`CommandList`/`CommandEmpty`/`CommandGroup`/`CommandItem` from the existing `ui/command.jsx`. ESC handled by Dialog; cmdk auto-focus removes the `setTimeout(...focus, 50)` hack.

**SettingsTabs → ui/tabs:** `Tabs value={pathname} onValueChange={navigate}`; TabsList styled transparent/rounded-none with `border-b border-border-default`; trigger active = `text-heading` + underline div `h-0.5 bg-primary`; no TabsContent.

**breadcrumb.jsx:** adapt shadcn new-york-v4; `@radix-ui/react-slot` (already installed); exports Breadcrumb/List/Item/Link/Page/Separator/Ellipsis; separator `ChevronRight` with `rtl:rotate-180`; ASAS tokens (`text-heading`/`text-muted`/`text-caption`).

## 7. CURRENT STATE — WHERE WE LEFT OFF (2026-10-18)

**Phase 0 is IN PROGRESS.** Completed so far:

| Item | Status |
|---|---|
| Baseline test suite | ✅ 44 pass / 0 fail |
| `@radix-ui/react-radio-group` ^1.5.1 in package.json | ✅ |
| `src/components/ui/skeleton.jsx` | ✅ created (`animate-pulse rounded-input bg-surface-strong`) |
| `src/components/ui/kbd.jsx` | ✅ created (`Kbd` + `KbdGroup`) |
| `src/components/ui/label.jsx` | ✅ created (no Radix dep; `text-body-light`) |
| `src/components/ui/radio-group.jsx` | ⬜ **NEXT** |
| `src/components/ui/breadcrumb.jsx` | ⬜ |
| `table.jsx` TableHead RTL fix | ⬜ (`text-left` → `text-left rtl:text-right`, line 64) |
| Phase 0 verification (`pnpm test` + `pnpm build`) | ⬜ |
| Phase 0 commit | ⬜ |

**Nothing has been committed yet** — all Phase 0 work so far is uncommitted working-tree changes. Phases 1–7 not started.

### Next steps in order
1. Create `src/components/ui/radio-group.jsx` (wrap `@radix-ui/react-radio-group`, ASAS tokens, relative imports).
2. Create `src/components/ui/breadcrumb.jsx` (§6 design).
3. Edit `src/components/ui/table.jsx` TableHead className: add `rtl:text-right`.
4. Run `pnpm.cmd test` (expect 44 pass) and `pnpm.cmd build`.
5. Commit Phase 0. Update `MIGRATION_PROGRESS.md`. Proceed to Phase 1.

## 8. VERIFICATION (every phase)

1. `pnpm.cmd test` — full suite, real pass counts.
2. `pnpm.cmd build`.
3. Compiled API (`pnpm build` in apps/api → `node dist/server.js`) + `pnpm dev` web; drive each migrated surface: CRUD dialogs, pagination, `?new=1` deep links, palette keyboard nav (type "payroll"/"create deal", arrows + Enter + ESC), dark toggle, AR/RTL toggle, onboarding, payroll multi-phase.
4. Grep audit: no leftover raw equivalents in converted pages; no removed logic imports.
5. Diff review: zero changes to hook/handler/API lines on logic-bearing pages.

## 9. TOP RISKS

- Radix Select rejects `""` item values → `__all__` sentinel (§5 Phase 4).
- Tabs routing regression → value from pathname; test each settings URL directly.
- cmdk fuzzy vs substring → eliminated by filter override (§6).
- RTL: table headers (fixed Phase 0), breadcrumb separator rotation, select popovers — AR pass every phase.
- Never touch: portal div, Payroll phase state machine, Onboarding `finish()`, MarketingLayout dark-class removal.