# Asas

[![CI](https://github.com/ELsayed-HAMAD/Asas/actions/workflows/ci.yml/badge.svg)](https://github.com/ELsayed-HAMAD/Asas/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)

Asas is a multi-tenant business operations platform for HR, payroll, finance, CRM, projects, and inventory. It is a pnpm monorepo with a React web app, a Fastify API, shared contracts, and a domain package.

The source is proprietary and all rights are reserved. See [LICENSE](LICENSE) for the terms that apply to this repository.

**Live:** https://asas-sigma-wheat.vercel.app

## Project at a glance

| | |
|---|---|
| Domain | Multi-tenant ERP: HR and payroll, finance and ledger, CRM, projects, inventory, platform console |
| Scale | 94 Prisma models, 38 enums, 81 migrations, 67 screens |
| Tests | ~680 API tests (Vitest, in-process PostgreSQL), ~98 Playwright browser tests |
| Tenancy | Shared schema with `tenantId`, PostgreSQL RLS, a Prisma tenant guard, and a CI guard against unscoped SQL |
| Deployment | Single Vercel project: React SPA plus a Fastify serverless function |

## Screenshots

<!-- Replace these placeholders with real captures: 1440px, light and dark, no browser chrome. -->

| Dashboard (dark) | Payroll |
|---|---|
| _add `docs/screenshots/dashboard-dark.png`_ | _add `docs/screenshots/payroll.png`_ |

| Inventory valuation | CRM pipeline |
|---|---|
| _add `docs/screenshots/valuation.png`_ | _add `docs/screenshots/crm.png`_ |

## Architecture

```text
Browser
  ├── public marketing routes
  └── authenticated workspace (React 19 SPA, route-level code splitting)
                    │
                    ▼
          Vercel edge (static assets + /api rewrite)
                    │
                    ▼
  Fastify 5 serverless function (Node 22, 300s budget)
  Zod-validated routes · Better Auth sessions · RBAC · Prisma tenant guard
        │                                   │
        ▼                                   ▼
  PostgreSQL 17 (Neon)              S3-compatible storage (presigned URLs)
  shared schema + tenantId          Resend / SMTP transactional email
  Row Level Security                Stripe billing webhooks
```

Request lifecycle: the SPA calls `/api/*` on the same origin, the API resolves the session and active organisation, the Prisma guard injects the tenant into every query, and business rules run in the API or the pure `@asas/domain` package. Postgres RLS re-checks the tenant at the database, so a guard bypass fails closed instead of leaking rows.

## Features

- **HR and payroll:** Employee directory, payroll runs and payslips, attendance punches, overtime thresholds, leave requests and balances, recruitment stages, interviews, and candidate exports.
- **Finance:** Accounts payable and receivable, expenses and reimbursements, a general ledger and trial balance, opening balances, multi-currency FX support, invoice recognition, settlement reversals, and bank statement reconciliation.
- **CRM:** Deal pipelines and activity, outcome history, quotas, weighted forecasts, and sales performance reporting.
- **Projects:** Portfolio and finance spend views, sprint work tracking and burndown, issue comments and checklists, and roadmap planning and export.
- **Inventory:** Product catalog, suppliers and purchase orders, warehouse stock movements, and stock integrity controls.
- **Workspace services:** Role-based access, audit logs, exports, email notifications, integrations, subscription billing, two-factor authentication, and English/Arabic UI with RTL support.

Arabic support ships in phases. Phase 1 covers the application shell, the sign-in, sign-up, password reset, two-factor, and email-verification screens, and the dashboard overview. Workspace onboarding, the workspace chooser, and the invitation screens, along with every other module, are still English-only and are translated one module at a time.

Some integrations require provider configuration. Email, Stripe, and S3-compatible storage are optional in development; see [API setup](apps/api/README.md) before enabling them in a deployment.

## Technology

| Area | Stack |
|---|---|
| Web | React 19, Vite, Tailwind CSS 4, TanStack Query, Recharts |
| API | Fastify 5, TypeScript, Prisma 6, Better Auth |
| Database | PostgreSQL 17 |
| Shared packages | Zod contracts and TypeScript domain calculations |
| Background jobs | pg-boss with PostgreSQL; optional Redis for distributed rate limits and SSE fan-out |
| Tests | Vitest, Node test runner, and Playwright |
| CI | GitHub Actions: lint, typecheck, tests, browser tests, dependency audit, and build |

## Prerequisites

- Node.js 22 (the version CI and the container images use; `.nvmrc` pins it)
- pnpm 11.9.0 (the repository's pinned package manager)
- PostgreSQL 17 for API development and migrations
- Docker Compose is optional for local PostgreSQL and Redis

## Local setup

Install dependencies from the repository root:

```sh
pnpm install
```

Copy the environment templates, then set a local PostgreSQL connection string and independent random secrets in `apps/api/.env`: `AUTH_SECRET`, `ENCRYPTION_KEY`, and `BANK_DATA_ENCRYPTION_KEY`. Set `VITE_API_URL` in `apps/web/.env` only if the API is not at its default address. See [apps/api/.env.example](apps/api/.env.example) for the full list.

PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

macOS/Linux:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Start PostgreSQL separately or use `docker compose up -d db redis` for local development. The Compose database uses development-only credentials; do not expose it to an untrusted network or reuse those credentials outside local development.

Generate Prisma Client and apply local development migrations:

```sh
pnpm --filter @asas/api run prisma:generate
pnpm --filter @asas/api run prisma:migrate
```

Start the web app and API:

```sh
pnpm dev
```

The web app is served at `http://localhost:5173` and the API at `http://127.0.0.1:4000`. API docs are available at `/docs` when enabled; production disables them by default.

### Optional services

- **Email:** Brevo's free plan (300 messages per day) over SMTP keeps delivery at $0 and is the recommended provider. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and a verified `MAIL_FROM`. A Resend API key is also supported and takes precedence when set. Set `QUEUE_URL` to use pg-boss retries; without it, email sends inline.
- **Object storage:** Local disk is the development default. Production requires S3-compatible storage; follow the private-bucket, CORS, and migration instructions in [apps/api/README.md](apps/api/README.md).
- **Stripe:** Billing stays disabled until Stripe keys, webhook secret, and allow-listed recurring monthly Price IDs are configured. Validate in test mode first.
- **Redis:** Local Compose starts Redis. The API can fall back to in-process behavior when Redis is not configured; multi-instance rate limiting and SSE fan-out require Redis.

Keep real credentials in local environment files or deployment secret stores. Never commit `.env` files, private keys, certificates, database dumps, or provider credentials. Only sanitized `.env.example` templates belong in Git.

## Security model

- PostgreSQL row-level security is enabled for tenant-owned tables as defence-in-depth.
- The API applies a Prisma tenant guard: once a request is authenticated, every operation on a tenant-owned model is constrained to the active tenant, and an explicit reference to another tenant is rejected. Cross-tenant maintenance code must use the reviewed `withCrossTenantAccess` escape hatch.
- Authentication is handled by Better Auth with server-side session validation, RBAC pre-handlers, rate limiting, audit logging, and secure cookie settings in production.
- Sensitive credentials and employee bank details use AES-256-GCM with independent, mandatory production keys. The API refuses to start in production without strong `AUTH_SECRET`, `ENCRYPTION_KEY`, and `BANK_DATA_ENCRYPTION_KEY` values.
- Production requires an explicit `FRONTEND_ORIGIN`, HTTPS origins, S3-compatible object storage, and `RLS_ENFORCEMENT=enforce`. Set `TRUSTED_PROXY_CIDRS` to the proxy hops in front of the API; without it every request reports the platform's own socket address, so rate limits collapse into one shared bucket and audit rows lose the real client IP. The API logs a warning when it is empty in production.
- The web container serves the SPA and proxies `/api` through the same origin, with CSP, HSTS, frame denial, Permissions-Policy, COOP, and CORP headers.

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/ELsayed-HAMAD/Asas/security/advisories/new), not in a public issue. See [SECURITY.md](SECURITY.md) for scope and expectations.

## Development commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run API and web development servers |
| `pnpm test` | Run API, contract, domain, and web unit/integration tests |
| `pnpm test:e2e` | Run Playwright browser tests (installs Chromium as required) |
| `pnpm lint` | Run workspace lint checks |
| `pnpm typecheck` | Typecheck the workspaces |
| `pnpm build` | Build all packages and applications |
| `pnpm --filter @asas/api run prisma:generate` | Generate Prisma Client |
| `pnpm --filter @asas/api run prisma:migrate` | Apply local development migrations |
| `pnpm --filter @asas/api run prisma:deploy` | Apply pending migrations in a deployment environment |

Run the standard checks before submitting changes:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Browser E2E tests currently mock the API and verify browser flows; they do not replace staging checks against PostgreSQL or external providers.

## Repository layout

```text
apps/
  api/          Fastify API, Prisma schema/migrations, and API tests
  web/          React application, browser tests, and web tests
packages/
  contracts/   Shared Zod request/response schemas and generated enums
  domain/      Pure business rules for money, payroll, banking, and more
.github/        CI workflows
```

## Data and calculation principles

- Business calculations and aggregate KPIs belong in the API/domain layer.
- Do not invent historical values when the source data is missing; expose the gap clearly.
- Financial writes and their audit records should remain transactionally consistent.
- Enforce tenant scope and permissions on the server for every protected operation.
- Preserve existing user-facing features when extending backend support.

## Deployment notes

Production database changes must be applied with `pnpm --filter @asas/api run prisma:deploy` before starting the API version that depends on them. Review migration contents and back up production data according to your deployment process. Then run the staging acceptance checks documented in [apps/api/README.md](apps/api/README.md) for configured email, billing, and storage providers. The repository does not assert that any environment has already been deployed; verify every environment independently.

The repository includes API and web Dockerfiles, an Nginx configuration, and a local Compose stack. The Compose stack is for development and is not a production security configuration.

## Documentation

- [API configuration, email, billing, reconciliation, storage, and tenant isolation](apps/api/README.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [CI workflow](.github/workflows/ci.yml)
- [Security workflow](.github/workflows/security.yml)

## License

Proprietary. Copyright (c) 2026 ELsayed-HAMAD. All rights reserved.

No part of this repository may be copied, modified, distributed, sublicensed, or used to operate a service without prior written permission. Reading the source for evaluation and review is permitted. See [LICENSE](LICENSE) for the full terms.
