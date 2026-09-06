# Asas API

Fastify 5 + Prisma + Better Auth backend for the Asas platform. Multi-tenant by
construction: every query is scoped to the authenticated session's active organization,
and money is handled as `Decimal` columns surfaced over the wire as integer minor units.

> Part of a pnpm + Turborepo monorepo. From the repo root, filter to this app with
> `pnpm --filter @asas/api …`. The web app is `apps/web`; shared types live in
> `packages/contracts`, pure calculation logic in `packages/domain`.

---

## 🚀 Getting started

```bash
# 1. Install workspace dependencies (from repo root)
pnpm install

# 2. Configure the environment
cp .env.example .env      # then set DATABASE_URL and BETTER_AUTH_SECRET (min 32 chars)

# 3. Generate the Prisma client
pnpm --filter @asas/api run prisma:generate

# 4. Apply migrations (needs a running PostgreSQL 17)
pnpm --filter @asas/api run prisma:migrate

# 5. Run
pnpm --filter @asas/api run dev        # node --watch src/server.ts  (API on :4000)
```

### Environment variables (`apps/api/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string, must match `provider` in `prisma/schema.prisma` (append `?sslmode=require` for Neon). |
| `AUTH_SECRET` | ✅ in prod | Signs/encrypts session cookies. `openssl rand -base64 32`. Tolerated empty in dev only. |
| `PORT` | — | Default `4000`. |
| `HOST` | — | Default `127.0.0.1`. |
| `FRONTEND_ORIGIN` | — | Default `http://localhost:5173`; used for CORS/Cookie origin. |
| `QUEUE_URL` | — | Postgres string for pg-boss. When set, bulk exports (employee directory, general ledger) queue on pg-boss; when empty they run inline in-process. Job bookkeeping is identical either way. |
| `SENTRY_DSN` | — | When set, enables `@sentry/node` (5xx capture + traces). |

> ⚠️ `.env` is gitignored. Only `.env.example` is committed.

---

## 📦 Modules

All routes are mounted under `/api/v1` and read `tenantId` only from the resolved Better
Auth session (never from a request parameter). Reads are gated `requireRole('MEMBER')`;
writes are gated by named permissions in `src/middlewares/permissions.ts`. Successful
writes publish an SSE invalidation so other open tabs refetch.

| Module | Prefix | What it does |
|---|---|---|
| **Auth** | `/auth` | Better Auth (organization plugin). httpOnly + Secure + SameSite cookies with rotation — no bearer tokens, nothing in `localStorage`. |
| **HR** | `/hr` | Employees, departments, candidates (incl. signed CV upload), leave, attendance, payroll runs + payslip PDF. |
| **Finance** | `/finance` | Accounts payable/receivable, AR aging (SQL `CASE WHEN` buckets), expenses, cash-flow overview, invoice PDF. |
| **CRM** | `/crm` | Deals, pipeline overview, forecast, sales performance — all real `Deal`/`ForecastSnapshot`/`SalesQuota` aggregates, no fabricated constants. |
| **Projects** | `/projects` | Projects, sprints, issues, roadmap; burndown and portfolio utilization computed in SQL. |
| **Inventory** | `/inventory` | Products, stock levels and alerts derived from `StockMovement` aggregates, warehouses. |
| **Settings** | `/settings` | General settings, integrations, notifications. |
| **Exports** | `/exports` | Job-based bulk exports (employee directory xlsx, general ledger xlsx) — queued via pg-boss or run inline. |
| **Onboarding** | `/onboarding` | 3-path workspace seeding (empty / sample / import) from the onboarding packs. |

Plus `GET /api/v1/health` (liveness) and `GET /api/v1/events` (the SSE stream).

---

## 🔐 Auth & RBAC

- **Session, not JWT.** Better Auth's organization plugin maps onto the existing `Tenant`
  table, so `tenantId` stays the column name across every model. Membership is a `Member`
  join table; `User` carries no `tenantId`/`passwordHash`/`role`.
- **Transport.** httpOnly + Secure + SameSite cookies with rotation. The web app sends
  `credentials: 'include'`; there is no `Authorization` header and nothing auth-related in
  `localStorage`.
- **Authorization.** A declarative permission map (role-rank, `src/middlewares/rbac.ts`)
  applied as a Fastify `preHandler`. `payroll.approve` is ADMIN-gated and audit-logged; the
  append-only `AuditLog` table records privileged actions.

---

## 🧪 Scripts

| Script | Purpose |
|---|---|
| `pnpm --filter @asas/api run dev` | Run with `node --watch` (API on `:4000`). |
| `pnpm --filter @asas/api run build` | `tsc -p tsconfig.build.json` → `dist/`. |
| `pnpm --filter @asas/api run typecheck` | `tsc -p tsconfig.json`. |
| `pnpm --filter @asas/api run test` | Vitest unit tests. |
| `pnpm --filter @asas/api run prisma:generate` | Regenerate the Prisma client. |
| `pnpm --filter @asas/api run prisma:migrate` | `prisma migrate dev`. |

The web app runs its Playwright E2E suite from `apps/web` (`pnpm --filter @asas/web run e2e`);
CI (`.github/workflows/ci.yml`) spins up a `postgres:17` service, runs `prisma migrate`,
then executes lint, typecheck, tests, build, a 500 kB/chunk bundle budget, and the E2E suite.

---

## 🗃️ Migrations

`prisma/migrations/` is the single source of truth for schema changes and is committed.
Apply from a fresh database with `prisma migrate dev` (no `db push`). To verify the runtime
against the live schema without a browser, see `scripts/verify-runtime.mjs`.
