# Asas

[![CI](https://github.com/ELsayed-HAMAD/asas/actions/workflows/ci.yml/badge.svg)](https://github.com/ELsayed-HAMAD/asas/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)

Asas is a multi-tenant business operations platform for HR, payroll, finance, CRM, projects, and inventory. It is a pnpm monorepo with a React web app, a Fastify API, shared contracts, and a domain package.

## Features

- **HR and payroll:** Employee directory, payroll runs and payslips, attendance punches, overtime thresholds, leave requests and balances, recruitment stages, interviews, and candidate exports.
- **Finance:** Accounts payable and receivable, expenses and reimbursements, a general ledger and trial balance, opening balances, multi-currency FX support, invoice recognition, settlement reversals, and bank statement reconciliation.
- **CRM:** Deal pipelines and activity, outcome history, quotas, weighted forecasts, and sales performance reporting.
- **Projects:** Portfolio and finance spend views, sprint work tracking and burndown, issue comments and checklists, and roadmap planning and export.
- **Inventory:** Product catalog, suppliers and purchase orders, warehouse stock movements, and stock integrity controls.
- **Workspace services:** Role-based access, audit logs, exports, email notifications, integrations, subscription billing, two-factor authentication, and English/Arabic UI with RTL support.

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

- Node.js 22 or later
- pnpm 11.9.0 (the repository's pinned package manager)
- PostgreSQL 17 for API development and migrations
- Docker Compose is optional for local PostgreSQL and Redis

## Local setup

Install dependencies from the repository root:

```sh
pnpm install
```

Copy the environment templates, then set a local PostgreSQL connection string and a strong `AUTH_SECRET` in `apps/api/.env`. Set `VITE_API_URL` in `apps/web/.env` if the API is not at its default address.

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

- **Email:** Configure `RESEND_API_KEY` and a verified `MAIL_FROM` sender. Set `QUEUE_URL` to use pg-boss retries; without it, email sends inline.
- **Object storage:** Local disk is the development default. Production requires S3-compatible storage; follow the private-bucket, CORS, and migration instructions in [apps/api/README.md](apps/api/README.md).
- **Stripe:** Billing stays disabled until Stripe keys, webhook secret, and allow-listed recurring monthly Price IDs are configured. Validate in test mode first.
- **Redis:** Local Compose starts Redis. The API can fall back to in-process behavior when Redis is not configured; multi-instance rate limiting and SSE fan-out require Redis.

Keep real credentials in local environment files or deployment secret stores. Never commit `.env` files, private keys, certificates, database dumps, or provider credentials. Only sanitized `.env.example` templates belong in Git.

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

Production database changes must be applied with `pnpm --filter @asas/api run prisma:deploy` before starting the API version that depends on them. Review migration contents and back up production data according to your deployment process. Then run the staging acceptance checks documented in [apps/api/README.md](apps/api/README.md) for configured email, billing, and storage providers.

The repository includes API and web Dockerfiles, an Nginx configuration, and a local Compose stack. The Compose stack is for development and is not a production security configuration.

## Documentation

- [API configuration, email, billing, reconciliation, and storage](apps/api/README.md)
- [CI workflow](.github/workflows/ci.yml)
