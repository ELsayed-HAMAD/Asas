# Asas API

Fastify 5 API for the Asas platform. It uses PostgreSQL through Prisma, Better Auth session cookies, shared Zod contracts, and the domain package for business calculations.

## Local setup

From the repository root:

```bash
pnpm install
pnpm --filter @asas/api run prisma:generate
pnpm --filter @asas/api run prisma:migrate
pnpm --filter @asas/api run dev
```

Copy `.env.example` to `.env` first and set `DATABASE_URL` and `AUTH_SECRET`.

The API listens on `http://127.0.0.1:4000` by default. OpenAPI is available at `/docs`.

## Checks

```bash
pnpm --filter @asas/api run typecheck
pnpm --filter @asas/api run test
pnpm --filter @asas/api run build
```
