# shadcn/ui Migration — Progress Log

> Plan: [MIGRATION_PLAN.md](MIGRATION_PLAN.md)
> Last updated: 2026-10-18

---

## Phase 0 — Foundation

### Status: ✅ COMPLETE (2026-10-18)

| Task | Status | Notes |
|---|---|---|
| `@radix-ui/react-radio-group` added | ✅ Done | ^1.5.1 added via pnpm |
| `skeleton.jsx` created | ✅ Done | `animate-pulse rounded-input bg-surface-strong` |
| `kbd.jsx` created | ✅ Done | `Kbd` + `KbdGroup` exports |
| `label.jsx` created | ✅ Done | No Radix dep; ASAS `text-body-light` |
| `radio-group.jsx` created | ✅ Done | Radix wrapper; `border-border-strong` ring, filled-dot indicator, `focus-visible:ring-accent` |
| `breadcrumb.jsx` created | ✅ Done | new-york-v4 adapted; Slot-based Link, `rtl:rotate-180` chevron, ASAS text tokens |
| `table.jsx` RTL fix | ✅ Done | `text-left rtl:text-right` on TableHead |
| Verification gate | ✅ Done | `pnpm test`: web 44/44 (full suite green) · `pnpm build`: 4/4 packages OK |

### Baseline
- Test suite: **44 pass, 0 fail** (confirmed before starting)
- Post-Phase 0: web **44 pass / 0 fail** · domain 149 · contracts 129 · api 565 — all green

---

## Phase 1 — Layout Shell

### Status: ✅ COMPLETE (2026-10-18)

| Task | Status | Notes |
|---|---|---|
| Breadcrumb block → `ui/breadcrumb` | ✅ Done | BREADCRUMB_LABELS/I18N, `t()`, `aria-current`, `rtl:rotate-180` separator, `truncate max-w-[140px]`, `title` attrs all preserved |
| Inline `<kbd>` → `ui/kbd` | ✅ Done | Topbar ⌘K chip |
| `CommandPalette` → `ui/command` + Dialog | ✅ Done | COMMAND_ITEMS registry, category grouping, footer hint bar, `isOpen`/`onClose` API, `?new=1` deep links preserved; substring `filter` override keeps `.includes()` matching; cmdk handles focus/arrows/ESC (removed `setTimeout` focus hack + manual key handlers) |
| Supporting primitive edits | ✅ Done | `DialogContent` gains `hideCloseButton`; `CommandDialog`/`CommandInput` gain passthrough styling props (defaults unchanged) |
| Verification gate | ✅ Done | `pnpm test`: web 44/44 (full suite green) · `pnpm build`: 4/4 OK · grep audit: no leftover raw breadcrumb/kbd/palette markup |

---

## Phase 2 — Common Components

### Status: ✅ COMPLETE (2026-10-18)

| Task | Status | Notes |
|---|---|---|
| `QueryState` skeleton loading | ✅ Done | Old centered Loader2 spinner → stacked `Skeleton` lines (approved tweak); `role="status"` + `aria-label="Loading"`; error/empty branches untouched |
| `ConfirmDialog` alert-dialog branch | ✅ Done | `danger` → `ui/alert-dialog` primitives (screen readers announce as alertdialog); non-destructive keeps `ui/dialog`; same props, busy state, error `Alert` banner in both branches; component-level Root/Content/Header/Title/Description/Footer branching |
| `StatCard` verification | ✅ Done | Already on `ui/card` + `ui/badge` — no changes needed |
| Verification gate | ✅ Done | `pnpm test`: web 44/44 (full suite green) · `pnpm build`: 4/4 packages OK · diagnostics clean on both edited files |

---

## Phase 3 — Tables

### Status: ✅ COMPLETE (2026-10-18)

| Task / File | Status | Notes |
|---|---|---|
| `SalesPerformance.jsx` | ✅ Done | Rep ranking table → `ui/table` with colgroup & sticky header |
| `RevenueForecast.jsx` | ✅ Done | Rep quota breakdown table → `ui/table` |
| `AccountsReceivable.jsx` | ✅ Done | Customer balance table → `ui/table` with checkbox select & row select |
| `BankReconciliation.jsx` | ✅ Done | Statement row matching table → `ui/table` |
| `Expenses.jsx` | ✅ Done | Expense list table → `ui/table` with colgroup, sticky header & selection indicators |
| `FinanceOverview.jsx` | ✅ Done | Recent transactions table → `ui/table` with sticky header & credit/debit styling |
| `TrialBalance.jsx` | ✅ Done | Ledger accounts table + totals footer → `ui/table` + `TableFooter` |
| `PortfolioOverview.jsx` | ✅ Done | Project portfolio table → `ui/table` with colgroup, sticky header & status badges |
| `RecruitmentPipeline.jsx` | ✅ Done | Candidates table → `ui/table` with sticky header & stage badges |
| `TimeAttendance.jsx` (×2) | ✅ Done | Timesheets list table + daily punch breakdown table → `ui/table` |
| `Payroll.jsx` (×3) | ✅ Done | Payslips table + rounding review table + main payroll run table → `ui/table` |
| `ProductCatalog.jsx` (×3) | ✅ Done | Products table + purchase orders table + stock movements table → `ui/table` |
| `StockMovements.jsx` | ✅ Done | Inventory stock movements log table → `ui/table` |
| Verification gate | ✅ Done | `pnpm test`: web 44/44 pass · `pnpm build`: clean build · grep audit: 0 raw `<table>` in `src/pages/` (only `ui/table.jsx` remains) |

---

## Phase 4 — Form Controls

### Status: NOT STARTED

---

## Phase 5 — Settings Tabs + Small Surfaces

### Status: NOT STARTED

---

## Phase 6 — Approved Tweaks

### Status: NOT STARTED

---

## Phase 7 — Final Sweep

### Status: NOT STARTED