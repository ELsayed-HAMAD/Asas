import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady

  // Minimal schema needed for migration triggers & purge procedure
  await db.exec(`
    CREATE TABLE "Tenant" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "archivedAt" TIMESTAMP(3)
    );

    CREATE TABLE "Member" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'MEMBER'
    );

    CREATE TABLE "JournalEntry" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'POSTED'
    );

    CREATE TABLE "JournalLine" (
      "id" TEXT PRIMARY KEY,
      "entryId" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "amount" NUMERIC NOT NULL DEFAULT 0
    );

    CREATE TABLE "LedgerAccount" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "name" TEXT NOT NULL
    );

    CREATE TABLE "ExchangeRate" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "rate" NUMERIC NOT NULL
    );

    CREATE TABLE "Invitation" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "email" TEXT NOT NULL
    );

    CREATE TABLE "Session" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "activeOrganizationId" TEXT
    );
  `)

  // Apply Phase 3 migration
  const migration = readFileSync(
    new URL('../prisma/migrations/20261021020000_identity_lifecycle_and_tenant_archival/migration.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
}, 30000)

afterAll(async () => {
  await db?.close()
})

describe('Finding 24: Last-Owner Invariant Trigger', () => {
  it('allows inserting members and owners', async () => {
    await db.query('INSERT INTO "Tenant" ("id", "name") VALUES ($1, $2)', ['t_1', 'Acme Corp'])
    await db.query(
      'INSERT INTO "Member" ("id", "tenantId", "userId", "role") VALUES ($1, $2, $3, $4)',
      ['m_owner_1', 't_1', 'u_1', 'OWNER'],
    )
    await db.query(
      'INSERT INTO "Member" ("id", "tenantId", "userId", "role") VALUES ($1, $2, $3, $4)',
      ['m_member_1', 't_1', 'u_2', 'MEMBER'],
    )

    const count = (await db.query<{ count: string }>('SELECT COUNT(*) as count FROM "Member" WHERE "tenantId" = $1', ['t_1'])).rows[0]?.count
    expect(Number(count)).toBe(2)
  })

  it('allows removing or demoting non-owner members freely', async () => {
    await db.query('DELETE FROM "Member" WHERE "id" = $1', ['m_member_1'])
    const count = (await db.query<{ count: string }>('SELECT COUNT(*) as count FROM "Member" WHERE "tenantId" = $1', ['t_1'])).rows[0]?.count
    expect(Number(count)).toBe(1)
  })

  it('rejects deleting the sole remaining owner of a workspace', async () => {
    await expect(
      db.query('DELETE FROM "Member" WHERE "id" = $1', ['m_owner_1']),
    ).rejects.toThrowError(/Cannot remove or demote the last owner of the workspace/)
  })

  it('rejects demoting the sole remaining owner to MEMBER', async () => {
    await expect(
      db.query('UPDATE "Member" SET "role" = $1 WHERE "id" = $2', ['MEMBER', 'm_owner_1']),
    ).rejects.toThrowError(/Cannot remove or demote the last owner of the workspace/)
  })

  it('allows demoting or removing an owner when another owner exists', async () => {
    await db.query(
      'INSERT INTO "Member" ("id", "tenantId", "userId", "role") VALUES ($1, $2, $3, $4)',
      ['m_owner_2', 't_1', 'u_3', 'OWNER'],
    )

    // Now there are 2 owners: m_owner_1 and m_owner_2
    // Demote m_owner_1 to ADMIN
    await db.query('UPDATE "Member" SET "role" = $1 WHERE "id" = $2', ['ADMIN', 'm_owner_1'])
    const role = (await db.query<{ role: string }>('SELECT "role" FROM "Member" WHERE "id" = $1', ['m_owner_1'])).rows[0]?.role
    expect(role).toBe('ADMIN')

    // Delete m_owner_1 completely
    await db.query('DELETE FROM "Member" WHERE "id" = $1', ['m_owner_1'])

    // Only m_owner_2 remains as owner
    const owners = (await db.query<{ count: string }>('SELECT COUNT(*) as count FROM "Member" WHERE "tenantId" = $1 AND "role" = \'OWNER\'', ['t_1'])).rows[0]?.count
    expect(Number(owners)).toBe(1)
  })
})

describe('Finding 16: Archival & Compliant Purge Procedure', () => {
  it('rejects purging a tenant that is still ACTIVE', async () => {
    await expect(
      db.query('SELECT purge_archived_tenant($1)', ['t_1']),
    ).rejects.toThrowError(/must be in ARCHIVED status/)
  })

  it('successfully purges an ARCHIVED tenant including posted journals and last owners', async () => {
    // Insert journals and sessions for tenant t_1
    await db.query('INSERT INTO "JournalEntry" ("id", "tenantId", "status") VALUES ($1, $2, $3)', ['je_1', 't_1', 'POSTED'])
    await db.query('INSERT INTO "JournalLine" ("id", "entryId", "tenantId", "amount") VALUES ($1, $2, $3, $4)', ['jl_1', 'je_1', 't_1', 100])
    await db.query('INSERT INTO "Session" ("id", "userId", "activeOrganizationId") VALUES ($1, $2, $3)', ['s_1', 'u_3', 't_1'])

    // Transition tenant to ARCHIVED
    await db.query('UPDATE "Tenant" SET "status" = $1, "archivedAt" = NOW() WHERE "id" = $2', ['ARCHIVED', 't_1'])

    // Execute privileged purge
    await db.query('SELECT purge_archived_tenant($1)', ['t_1'])

    // Verify all records for t_1 were purged cleanly
    const tenantCount = (await db.query<{ count: string }>('SELECT COUNT(*) as count FROM "Tenant" WHERE "id" = $1', ['t_1'])).rows[0]?.count
    const memberCount = (await db.query<{ count: string }>('SELECT COUNT(*) as count FROM "Member" WHERE "tenantId" = $1', ['t_1'])).rows[0]?.count
    const journalCount = (await db.query<{ count: string }>('SELECT COUNT(*) as count FROM "JournalEntry" WHERE "tenantId" = $1', ['t_1'])).rows[0]?.count
    const sessionActive = (await db.query<{ activeOrganizationId: string | null }>('SELECT "activeOrganizationId" FROM "Session" WHERE "id" = $1', ['s_1'])).rows[0]?.activeOrganizationId

    expect(Number(tenantCount)).toBe(0)
    expect(Number(memberCount)).toBe(0)
    expect(Number(journalCount)).toBe(0)
    expect(sessionActive).toBeNull()
  })
})

