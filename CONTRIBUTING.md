# Contributing to Asas

Asas is a proprietary project. By submitting a contribution, you agree that it
may be used, modified, and distributed under the terms in [LICENSE](LICENSE).

## Before you start

- Read [SECURITY.md](SECURITY.md). Never report a vulnerability in a public
  issue or pull request.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- For significant changes, open an issue first so the approach can be agreed
  before implementation.
- Do not include real employee, customer, payroll, bank, or tenant data in
  code, tests, fixtures, screenshots, commits, or issues. Use synthetic data.

## Development setup

Prerequisites:

- Node.js 22 or later.
- pnpm 11.9.0 through Corepack.
- PostgreSQL 17 for API development and migrations.
- Optional: Redis for distributed rate limits and SSE fan-out.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm --filter @asas/api run prisma:generate
pnpm --filter @asas/api run prisma:migrate
pnpm dev
```

Set a local `DATABASE_URL`, a random `AUTH_SECRET`, and independent random
`ENCRYPTION_KEY` and `BANK_DATA_ENCRYPTION_KEY` values in `apps/api/.env`.
Never commit `.env` files or real provider credentials. The Compose database
credentials are for local development only.

## Required checks

Run the same checks as CI before opening a pull request:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm audit --prod --audit-level high
```

A change is not ready to merge while any required check fails. Do not lower an
audit threshold or suppress a finding without a documented, reviewed reason.

## Security rules for changes

- **Tenant isolation is mandatory.** Every tenant-owned query and mutation must
  be scoped to the authenticated tenant. The Prisma tenant guard is a safety
  net, not a substitute for correct query design. Cross-tenant access requires
  an explicit, reviewed `withCrossTenantAccess` use and a test proving the
  scope is intentional.
- **Authorization happens on the server.** UI checks are not authorization.
  Protected routes must use the existing RBAC or permission pre-handlers.
- **Never trust client input.** Validate request bodies, query parameters, and
  uploaded files at the API boundary. Keep response schemas explicit.
- **Use parameterized SQL.** Do not interpolate user input into `$queryRaw` or
  `$executeRaw`. Add a tenant filter or call the reviewed cross-tenant helper.
- **Do not log secrets or personal data.** Use the structured logger, mask
  email addresses, and never log session tokens, bank details, or credentials.
- **Encrypt sensitive fields with the existing services.** Do not add new
  cryptographic primitives or key fallbacks.
- **New environment variables must fail closed.** Production must reject
  missing or weak values. Update `.env.example` and the environment tests.
- **Security headers and origins are part of the product.** Do not loosen the
  CSP, CORS allow-list, proxy trust boundary, or cookie settings without a
  documented threat-model review.

## Database migrations

- Migrations are forward-only. Never edit a migration that has been applied.
- Include tenant constraints, foreign keys, indexes, and any required RLS
  policies in the same migration as the schema change.
- Test migrations against PostgreSQL 17, not SQLite.
- Call out destructive or long-running changes in the pull request and include
  a rollback or recovery plan.
- Do not include production data, dumps, or exports in a migration.

## Pull requests

- Keep changes focused and explain the security impact.
- Add or update tests for behavior and authorization boundaries.
- Update documentation when configuration or operational behavior changes.
- Complete the pull request template, including the security checklist.
- Resolve review conversations before merging.
- Do not force-push to `main`; use a branch and a pull request.

## Commit messages

Use conventional commit prefixes where practical:

```text
feat(api): add purchase order matching
fix(web): prevent stale invoice totals
test(api): cover cross-tenant rejection
docs: document proxy trust configuration
chore(deps): update fastify
```

Keep commits reviewable. Do not commit generated build output, local storage,
screenshots, coverage reports, or database dumps.

## Reporting conduct issues

Report conduct concerns privately to the repository owner through GitHub. Do
not use public issues for reports that include personal information.
