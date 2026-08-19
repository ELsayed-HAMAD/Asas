# Asas Enterprise

Asas is a tenant-aware enterprise operations platform. It brings HR, Finance, CRM, Inventory, and Projects into one dashboard.

## Current capabilities

- React dashboard with authenticated routes and live data workspaces
- Fastify API with JWT authentication and tenant isolation
- Prisma database schema using SQLite for local development
- Create, list, and delete records in HR, Finance, CRM, Inventory, Projects, and Settings

> The module data model is intentionally generic at this stage. Dedicated fields and workflows, such as employee profiles, invoices, deals, stock quantities, and project tasks, are the next development milestone.

## Project structure

```text
asas/   React + Vite frontend
api/    Fastify + Prisma backend
```

## Run locally

Use two terminals.

### 1. Start the API

```powershell
cd api
npm install
npm run db:generate
npm exec prisma db push
npm run dev
```

The API listens on `http://127.0.0.1:4000`.

### 2. Start the frontend

```powershell
cd asas
npm install
npm run dev
```

Open the Vite address shown in the terminal, normally `http://localhost:5173`.

## Configuration and secret safety

Copy the template when you need to configure the API:

```powershell
Copy-Item api/.env.example api/.env
```

Never commit `api/.env` or `api/prisma/dev.db`; both are ignored by Git. `api/.env.example` and `api/prisma/schema.prisma` are safe to commit because they contain placeholders and database structure, not credentials or local data.

Before a production deployment, replace `JWT_SECRET` with a long, unique secret and use a production database rather than the local SQLite file.

## Useful commands

| Location | Command | Purpose |
| --- | --- | --- |
| `api/` | `npm run dev` | Run the backend in watch mode |
| `api/` | `npm run db:generate` | Generate the Prisma client |
| `api/` | `npm run db:migrate` | Create and run a Prisma migration |
| `asas/` | `npm run dev` | Run the frontend locally |
| `asas/` | `npm run build` | Build the frontend for production |

## API

API documentation, endpoint details, and setup notes are available in [api/README.md](api/README.md).
