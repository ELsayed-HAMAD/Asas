import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady

  // Minimal schema with User, Tenant, Employee, SupportTicket
  await db.exec(`
    CREATE TABLE "User" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT UNIQUE NOT NULL
    );

    CREATE TABLE "Tenant" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL
    );

    CREATE TABLE "Employee" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "name" TEXT NOT NULL
    );

    CREATE TABLE "SupportTicket" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "subject" TEXT NOT NULL
    );
  `)

  // Apply Phase 4 migration
  const migration = readFileSync(
    new URL('../prisma/migrations/20261021030000_credential_encryption_and_security_hardening/migration.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)

  // Create standard application role so RLS is actively enforced (superusers bypass RLS by design in Postgres)
  await db.exec(`
    CREATE ROLE app_user LOGIN;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
  `)
}, 30000)

afterAll(async () => {
  await db?.close()
})

describe('Finding 8: PostgreSQL Row-Level Security (RLS) Isolation', () => {
  it('enforces row-level security policies strictly isolating tenant queries', async () => {
    // Populate data under administrative bypass
    await db.exec("SET app.bypass_rls = 'on'")
    await db.query('INSERT INTO "Tenant" ("id", "name") VALUES ($1, $2)', ['tenant_alpha', 'Alpha Inc'])
    await db.query('INSERT INTO "Tenant" ("id", "name") VALUES ($1, $2)', ['tenant_beta', 'Beta LLC'])

    await db.query('INSERT INTO "Employee" ("id", "tenantId", "name") VALUES ($1, $2, $3)', ['emp_a1', 'tenant_alpha', 'Alice'])
    await db.query('INSERT INTO "Employee" ("id", "tenantId", "name") VALUES ($1, $2, $3)', ['emp_b1', 'tenant_beta', 'Bob'])

    await db.query('INSERT INTO "SupportTicket" ("id", "tenantId", "subject") VALUES ($1, $2, $3)', ['tick_a1', 'tenant_alpha', 'Alpha Ticket'])
    await db.query('INSERT INTO "SupportTicket" ("id", "tenantId", "subject") VALUES ($1, $2, $3)', ['tick_b1', 'tenant_beta', 'Beta Ticket'])

    // Reset bypass flag and switch to standard application role
    await db.exec("RESET app.bypass_rls")
    await db.exec("SET ROLE app_user")

    // Test 1: With tenant_alpha context, only Alpha records are visible
    await db.exec("SET app.tenant_id = 'tenant_alpha'")
    const alphaEmployees = (await db.query<{ id: string; name: string }>('SELECT "id", "name" FROM "Employee"')).rows
    const alphaTickets = (await db.query<{ id: string; subject: string }>('SELECT "id", "subject" FROM "SupportTicket"')).rows

    expect(alphaEmployees.length).toBe(1)
    expect(alphaEmployees[0]?.name).toBe('Alice')
    expect(alphaTickets.length).toBe(1)
    expect(alphaTickets[0]?.subject).toBe('Alpha Ticket')

    // Test 2: Switch to tenant_beta context, only Beta records are visible
    await db.exec("SET app.tenant_id = 'tenant_beta'")
    const betaEmployees = (await db.query<{ id: string; name: string }>('SELECT "id", "name" FROM "Employee"')).rows
    const betaTickets = (await db.query<{ id: string; subject: string }>('SELECT "id", "subject" FROM "SupportTicket"')).rows

    expect(betaEmployees.length).toBe(1)
    expect(betaEmployees[0]?.name).toBe('Bob')
    expect(betaTickets.length).toBe(1)
    expect(betaTickets[0]?.subject).toBe('Beta Ticket')

    // Test 3: Negative isolation test — with unset/empty tenant_id, 0 rows returned
    await db.exec("RESET app.tenant_id")
    const unscopedEmployees = (await db.query('SELECT * FROM "Employee"')).rows
    const unscopedTickets = (await db.query('SELECT * FROM "SupportTicket"')).rows

    expect(unscopedEmployees.length).toBe(0)
    expect(unscopedTickets.length).toBe(0)

    // Test 4: Audited administrative bypass returns all rows across tenants
    await db.exec("SET app.bypass_rls = 'on'")
    const allEmployees = (await db.query('SELECT * FROM "Employee"')).rows
    expect(allEmployees.length).toBe(2)
  })
})
