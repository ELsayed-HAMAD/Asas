# Asas API

Tenant-aware Fastify API for the Asas dashboard. It uses SQLite locally through Prisma and can be started independently from the React client.

## Run locally

```powershell
cd api
npm install
npm run db:generate
npm exec prisma db push
npm run dev
```

The API starts at `http://127.0.0.1:4000`. The frontend defaults to this address; set `VITE_API_URL` to override it.

## Available endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/tenant/current`
- CRUD at `/api/v1/{hr,finance,crm,inventory,projects,settings}`

All module endpoints require a bearer token. Records are scoped to the tenant embedded in that token.
