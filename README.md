# Asas Enterprise Platform

![Asas Enterprise Platform](https://img.shields.io/badge/Status-Active_Development-success?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TailwindCSS v4](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css)
![Fastify](https://img.shields.io/badge/Fastify-5-black?style=flat-square&logo=fastify)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=flat-square&logo=postgresql)

**Asas** is a modern, premium, tenant-aware enterprise operations platform. It brings HR, Finance, CRM, Inventory, and Projects into one unified, visually stunning dashboard.

The platform is designed with a strict focus on top-tier professional aesthetics, leveraging a bespoke design system, Tailwind CSS v4, and a highly polished user experience.

---

## 🌟 Key Features

* **Premium UI/UX:** Built on a custom Tailwind v4 `@theme`, featuring tailored spacing, subtle hover states, micro-animations, and a completely custom, scrollbar-free sidebar navigation.
* **Tenant Isolation:** Fastify API with Better Auth session cookies and strict tenant-level data boundaries via organization membership.
* **Typed Domain Models:** Full Prisma schema with typed modules for HR, Finance, CRM, Inventory, and Projects.
* **Unified Workspace:** A single-page application (React + Vite) that seamlessly routes between distinct business modules.
* **PostgreSQL via Prisma:** Runs against a local or hosted PostgreSQL instance; the schema is the single source of truth for all 60 models.

## 📦 Core Modules

* **HR & Payroll:** Employee directory, time & attendance tracking, payroll processing, and recruitment pipelines.
* **Finance:** Accounts payable/receivable, detailed expense tracking, and financial overviews.
* **CRM (Sales):** Deal pipelines, revenue forecasting, and sales performance leaderboards.
* **Projects:** Portfolio overview, active sprints, and product roadmaps.
* **Inventory:** Product catalog with stock-level tracking and warehouse management.

---

## 🏗️ Architecture

This is a **pnpm monorepo** with Turborepo orchestration:

```
asas/
├─ apps/
│  ├─ api/           ← Fastify 5 + Prisma + Better Auth (TypeScript)
│  └─ web/           ← React 19 + Vite + Tailwind v4 + shadcn/ui (TypeScript)
├─ packages/
│  ├─ contracts/     ← Zod schemas + generated Prisma enums + shared types
│  └─ domain/        ← Pure calculation layer: Money, payroll, aging
├─ pnpm-workspace.yaml
└─ turbo.json
```

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS v4, shadcn/ui (Radix), Recharts 3, TanStack Query |
| Backend | Fastify 5, Prisma 6, Better Auth (organization plugin, httpOnly cookies) |
| Database | PostgreSQL 17 (Neon or local Docker) |
| Domain | TypeScript pure functions: integer-cent Money, payroll, AR aging |
| Contracts | Zod → `fastify-type-provider-zod` → shared `@asas/contracts` |
| Jobs | pg-boss (Postgres-backed) for PDF / export / email |
| Real-time | SSE push for cross-tab cache invalidation |
| Testing | Vitest (unit/domain/API), browser verification against `apps/web` |

### Key Design Decisions

* **Money is integer cents.** All 39 money columns are `Decimal @db.Decimal(19,4)` in Prisma. The domain layer's `Money` class uses bigint minor units with explicit rounding — no Float arithmetic anywhere.
* **All calculations are backend.** KPI cards, AR aging, payroll totals, attendance rate — every business number is a SQL aggregate or domain function, never a client-side `.reduce()`.
* **No fabricated data.** CRM funnel, win rate, forecast — all computed from real `Deal` rows, not hardcoded constants.
* **RBAC enforced.** A declarative permission map gates every write endpoint; payroll approval and salary visibility are audit-logged.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- pnpm 11+
- PostgreSQL 17+ (local Docker, or a Neon instance)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment templates
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL, BETTER_AUTH_SECRET
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

## 🔐 Environment Variables

The following environment variables are required for the API (`apps/api/.env`):

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `BETTER_AUTH_SECRET` | Secret for session signing (min 32 chars) | (generate with `openssl rand -base64 32`) |
| `PORT` | API server port | `4000` |

The following environment variables are required for the frontend (`apps/web/.env`):

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | API base URL | `http://127.0.0.1:4000` |

> ⚠️ `.env` files are gitignored. Only `.env.example` templates are committed.

---

## 💻 Useful Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run API + web in parallel (Turborepo) |
| `pnpm run build` | Build all packages |
| `pnpm run typecheck` | Typecheck all workspaces |
| `pnpm run lint` | Lint all workspaces |
| `pnpm run test` | Run unit tests (Vitest) |
| `pnpm --filter @asas/api run prisma:generate` | Generate Prisma client |
| `pnpm --filter @asas/api run prisma:migrate` | Run Prisma migrations |

---

## 📚 Documentation

- API setup and endpoint details: [apps/api/README.md](apps/api/README.md)
