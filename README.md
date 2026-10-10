# Asas Enterprise Platform

![CI](https://github.com/ELsayed-HAMAD/asas/actions/workflows/ci.yml/badge.svg)
![Status](https://img.shields.io/badge/Status-Active_Development-success?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TailwindCSS v4](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css)
![Fastify](https://img.shields.io/badge/Fastify-5-black?style=flat-square&logo=fastify)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=flat-square&logo=postgresql)

**Asas** is a modern, premium, tenant-aware enterprise operations platform. It brings HR, Finance, CRM, Inventory, and Projects into one unified, visually stunning dashboard.

The platform is designed with a strict focus on top-tier professional aesthetics, leveraging a bespoke design system, Tailwind CSS v4, and a highly polished user experience.

---

## Key Features

* **Premium UI/UX:** Built on a custom Tailwind v4 `@theme`, featuring tailored spacing, subtle hover states, micro-animations, and a completely custom, scrollbar-free sidebar navigation.
* **Tenant Isolation:** Fastify API with Better Auth session cookies and strict tenant-level data boundaries via organization membership.
* **Typed Domain Models:** Full Prisma schema with 72 models across typed modules for HR, Finance, CRM, Inventory, and Projects.
* **Unified Workspace:** A single-page application (React + Vite) that seamlessly routes between distinct business modules.
* **Audit Logging:** Full audit trail for sensitive operations with searchable, filterable log views.
* **PostgreSQL via Prisma:** Runs against a local or hosted PostgreSQL instance; the schema is the single source of truth.

## Core Modules

* **HR & Payroll:** Employee directory, time & attendance tracking (punch clock, leave policies, overtime thresholds), payroll processing with settlement journals, and recruitment pipelines with candidate interviews and export.
* **Finance:** Accounts payable/receivable, expense tracking with reimbursement journals, trial balance / general ledger, multi-currency FX support, invoice recognition controls, and financial overviews with period filtering.
* **CRM (Sales):** Deal pipelines with activity tracking, revenue forecasting, outcome history, and sales performance leaderboards.
* **Projects:** Portfolio overview with finance spend tracking, active sprints with burndown, work tracking, and product roadmaps with export.
* **Inventory:** Product catalog with stock-level tracking, integrity checks, and warehouse management.
* **Audit Log:** Searchable audit trail for all sensitive operations across modules.

---

## Architecture

This is a **pnpm monorepo** with Turborepo orchestration:

```
asas/
├─ apps/
│  ├─ api/           ← Fastify 5 + Prisma + Better Auth (TypeScript)
│  └─ web/           ← React 19 + Vite + Tailwind v4 + shadcn/ui (JSX)
├─ packages/
│  ├─ contracts/     ← Zod schemas + generated Prisma enums + shared types
│  └─ domain/        ← Pure calculation layer: Money, payroll periods, aging
├─ scripts/          ← Repo-level utility scripts
├─ .github/
│  └─ workflows/
│     └─ ci.yml      ← Lint → Typecheck → Test → Build on every push/PR
├─ pnpm-workspace.yaml
└─ turbo.json
```

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS v4, shadcn/ui (Radix), Recharts 3, TanStack Query, Zustand, Framer Motion |
| Backend | Fastify 5, Prisma 6, Better Auth (organization plugin, httpOnly cookies) |
| Database | PostgreSQL 17 (Neon or local Docker) |
| Domain | TypeScript pure functions: integer-cent Money, payroll periods, AR aging |
| Contracts | Zod → `fastify-type-provider-zod` → shared `@asas/contracts` |
| Jobs | pg-boss (Postgres-backed) for PDF / export / email |
| Real-time | SSE push for cross-tab cache invalidation |
| Linting | oxlint (web), TypeScript strict mode (API, contracts, domain) |
| Testing | Vitest (unit / domain / API integration) |
| CI | GitHub Actions — lint, typecheck, test, build on every push and PR |

### Key Design Decisions

* **Money is integer cents.** All money columns are `Decimal @db.Decimal(19,4)` in Prisma. The domain layer's `Money` class uses bigint minor units with explicit rounding — no Float arithmetic anywhere.
* **All calculations are backend.** KPI cards, AR aging, payroll totals, attendance rate — every business number is a SQL aggregate or domain function, never a client-side `.reduce()`.
* **No fabricated data.** CRM funnel, win rate, forecast — all computed from real `Deal` rows, not hardcoded constants.
* **RBAC enforced.** A declarative permission map gates every write endpoint; payroll approval and salary visibility are audit-logged.
* **Multi-currency.** Workspace-level currency settings with FX rates and proper journal accounting for foreign-currency transactions.

---

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 11+
- PostgreSQL 17+ (local Docker, or a Neon instance)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment templates
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL, AUTH_SECRET
cp apps/web/.env.example apps/web/.env   # set VITE_API_URL

# Generate Prisma client
pnpm --filter @asas/api run prisma:generate

# Run migrations (requires a running Postgres)
pnpm --filter @asas/api run prisma:migrate

# Start the dev servers (API on :4000, web on :5173)
pnpm dev
```

### Docker for local Postgres (optional)

```bash
docker run -d --name asas-db -p 5432:5432 \
  -e POSTGRES_USER=asas -e POSTGRES_PASSWORD=asas -e POSTGRES_DB=asas \
  postgres:17-alpine
```

---

## Useful Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run API + web in parallel (Turborepo) |
| `pnpm run build` | Build all packages |
| `pnpm run typecheck` | Typecheck all workspaces |
| `pnpm run lint` | Lint all workspaces |
| `pnpm run test` | Run unit tests (Vitest) |
| `pnpm --filter @asas/api run prisma:generate` | Generate Prisma client |
| `pnpm --filter @asas/api run prisma:migrate` | Run Prisma migrations |
| `pnpm --filter @asas/api run prisma:deploy` | Deploy migrations (production) |

---

## Project Structure

```
apps/api/
├─ prisma/             # Schema + migrations
├─ seeds/              # Onboarding sample data packs
├─ src/
│  ├─ config/          # Environment validation
│  ├─ middlewares/      # Error handling, RBAC, permissions
│  ├─ modules/         # Route + service modules per domain
│  │  ├─ auditLog/
│  │  ├─ crm/
│  │  ├─ exports/
│  │  ├─ finance/
│  │  ├─ hr/
│  │  ├─ inventory/
│  │  ├─ onboarding/
│  │  ├─ projects/
│  │  ├─ settings/
│  │  └─ support/
│  ├─ plugins/         # Fastify plugins (auth, prisma, SSE, sentry)
│  ├─ services/        # Shared services (audit, export, money, PDF, queue)
│  └─ utils/           # Error types, date helpers
└─ test/               # Vitest test files

apps/web/
├─ public/             # Static assets (favicon, icons)
├─ src/
│  ├─ components/      # Shared UI components
│  ├─ guards/          # Auth route guards
│  ├─ layouts/         # Dashboard, Auth, Marketing layouts
│  ├─ lib/             # API clients, formatting, SSE, auth, CSV export
│  └─ pages/           # Route pages per module
└─ test/               # Frontend tests

packages/contracts/    # Zod schemas, generated enums, shared types
packages/domain/       # Pure business logic (Money, payroll, rounding)
```

---

## Documentation

- API setup and endpoint details: [apps/api/README.md](apps/api/README.md)
- OpenAPI docs available at `/docs` when the API is running
