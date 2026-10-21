import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady

  // Minimal schema matching Prisma models
  await db.exec(`
    CREATE TABLE "Tenant" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "archivedAt" TIMESTAMP(3)
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

    CREATE TABLE "Member" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'MEMBER'
    );

    CREATE TABLE "Session" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "activeOrganizationId" TEXT
    );

    CREATE TABLE "Subscription" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE'
    );
  `)

  // Apply Phase 3 migration with trigger definitions
  const migration = readFileSync(
    new URL('../prisma/migrations/20261021020000_identity_lifecycle_and_tenant_archival/migration.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)

  // Attach the append-only trigger to JournalEntry and JournalLine
  await db.exec(`
    DROP TRIGGER IF EXISTS trg_journal_entry_immutable_posting ON "JournalEntry";
    CREATE TRIGGER trg_journal_entry_immutable_posting
      BEFORE DELETE ON "JournalEntry"
      FOR EACH ROW
      EXECUTE FUNCTION asas_immutable_posting();

    DROP TRIGGER IF EXISTS trg_journal_line_immutable_posting ON "JournalLine";
    CREATE TRIGGER trg_journal_line_immutable_posting
      BEFORE DELETE ON "JournalLine"
      FOR EACH ROW
      EXECUTE FUNCTION asas_immutable_posting();
  `)
}, 30000)

afterAll(async () => {
  await db?.close()
})

describe('Finding 16: End-to-End Journal Integrity vs Compliant Tenant Purge', () => {
  it('unconditionally blocks raw deletion of posted journals when purge flag is off', async () => {
    await db.query('INSERT INTO "Tenant" ("id", "name") VALUES ($1, $2)', ['tenant_test_1', 'Audit Corp'])
    await db.query(
      'INSERT INTO "JournalEntry" ("id", "tenantId", "status") VALUES ($1, $2, $3)',
      ['je_audit_1', 'tenant_test_1', 'POSTED'],
    )
    await db.query(
      'INSERT INTO "JournalLine" ("id", "entryId", "tenantId", "amount") VALUES ($1, $2, $3, $4)',
      ['jl_audit_1', 'je_audit_1', 'tenant_test_1', 500],
    )

    // Attempting raw delete without setting allow_tenant_purge must fail
    await expect(
      db.query('DELETE FROM "JournalEntry" WHERE "id" = $1', ['je_audit_1']),
    ).rejects.toThrowError(/ASAS_JOURNAL_INTEGRITY/)
  })

  it('allows deleteWorkspace to execute compliant purge with allow_tenant_purge enabled', async () => {
    // Setup tenant with memberships, subscription, session, and journals
    await db.query('INSERT INTO "Tenant" ("id", "name") VALUES ($1, $2)', ['tenant_purge_1', 'Purge Corp'])
    await db.query(
      'INSERT INTO "JournalEntry" ("id", "tenantId", "status") VALUES ($1, $2, $3)',
      ['je_purge_1', 'tenant_purge_1', 'POSTED'],
    )
    await db.query(
      'INSERT INTO "JournalLine" ("id", "entryId", "tenantId", "amount") VALUES ($1, $2, $3, $4)',
      ['jl_purge_1', 'je_purge_1', 'tenant_purge_1', 1000],
    )
    await db.query(
      'INSERT INTO "Member" ("id", "tenantId", "userId", "role") VALUES ($1, $2, $3, $4)',
      ['m_purge_owner', 'tenant_purge_1', 'u_purge_1', 'OWNER'],
    )
    await db.query(
      'INSERT INTO "Session" ("id", "userId", "activeOrganizationId") VALUES ($1, $2, $3)',
      ['s_purge_1', 'u_purge_1', 'tenant_purge_1'],
    )
    await db.query(
      'INSERT INTO "Subscription" ("id", "tenantId", "status") VALUES ($1, $2, $3)',
      ['sub_purge_1', 'tenant_purge_1', 'ACTIVE'],
    )

    // Create a real PrismaClient proxy backed by our PGlite instance for deleteWorkspace
    const mockPrisma = {
      tenant: {
        findUnique: async ({ where }: any) => {
          const res = await db.query('SELECT "id" FROM "Tenant" WHERE "id" = $1', [where.id])
          return res.rows[0] || null
        },
        update: async ({ where, data }: any) => {
          await db.query('UPDATE "Tenant" SET "status" = $1, "archivedAt" = NOW() WHERE "id" = $2', [data.status, where.id])
          return { id: where.id }
        },
      },
      session: {
        updateMany: async ({ where, data }: any) => {
          await db.query('UPDATE "Session" SET "activeOrganizationId" = $1 WHERE "activeOrganizationId" = $2', [data.activeOrganizationId, where.activeOrganizationId])
          return { count: 1 }
        },
      },
      subscription: {
        updateMany: async ({ where, data }: any) => {
          await db.query('UPDATE "Subscription" SET "status" = $1 WHERE "tenantId" = $2', [data.status, where.tenantId])
          return { count: 1 }
        },
      },
      $transaction: async (fn: any) => {
        // Execute inside transaction block
        await db.exec('BEGIN')
        try {
          const tx = {
            $executeRawUnsafe: async (sql: string) => {
              await db.exec(sql)
            },
            journalLine: {
              deleteMany: async ({ where }: any) => {
                await db.query('DELETE FROM "JournalLine" WHERE "tenantId" = $1', [where.entry?.tenantId || where.tenantId])
                return { count: 1 }
              },
            },
            journalEntry: {
              deleteMany: async ({ where }: any) => {
                await db.query('DELETE FROM "JournalEntry" WHERE "tenantId" = $1', [where.tenantId])
                return { count: 1 }
              },
            },
            ledgerAccount: {
              deleteMany: async ({ where }: any) => {
                await db.query('DELETE FROM "LedgerAccount" WHERE "tenantId" = $1', [where.tenantId])
                return { count: 0 }
              },
            },
            exchangeRate: {
              deleteMany: async ({ where }: any) => {
                await db.query('DELETE FROM "ExchangeRate" WHERE "tenantId" = $1', [where.tenantId])
                return { count: 0 }
              },
            },
            invitation: {
              deleteMany: async ({ where }: any) => {
                await db.query('DELETE FROM "Invitation" WHERE "tenantId" = $1', [where.tenantId])
                return { count: 0 }
              },
            },
            member: {
              deleteMany: async ({ where }: any) => {
                await db.query('DELETE FROM "Member" WHERE "tenantId" = $1', [where.tenantId])
                return { count: 1 }
              },
            },
            tenant: {
              delete: async ({ where }: any) => {
                await db.query('DELETE FROM "Tenant" WHERE "id" = $1', [where.id])
                return { id: where.id }
              },
            },
          }
          const res = await fn(tx)
          await db.exec('COMMIT')
          return res
        } catch (err) {
          await db.exec('ROLLBACK')
          throw err
        }
      },
    } as unknown as PrismaClient

    const { deleteWorkspace } = await import('../src/modules/settings/settings.service.js')
    const result = await deleteWorkspace(mockPrisma, 'tenant_purge_1', 'u_purge_1')

    expect(result).toEqual({ success: true })

    // Verify database state after deleteWorkspace
    const tenantRow = (await db.query('SELECT * FROM "Tenant" WHERE "id" = $1', ['tenant_purge_1'])).rows
    const journalRows = (await db.query('SELECT * FROM "JournalEntry" WHERE "tenantId" = $1', ['tenant_purge_1'])).rows
    const memberRows = (await db.query('SELECT * FROM "Member" WHERE "tenantId" = $1', ['tenant_purge_1'])).rows
    const sessionRow = (await db.query<{ activeOrganizationId: string | null }>('SELECT "activeOrganizationId" FROM "Session" WHERE "id" = $1', ['s_purge_1'])).rows[0]
    const subRow = (await db.query<{ status: string }>('SELECT "status" FROM "Subscription" WHERE "id" = $1', ['sub_purge_1'])).rows[0]

    expect(tenantRow.length).toBe(0)
    expect(journalRows.length).toBe(0)
    expect(memberRows.length).toBe(0)
    expect(sessionRow?.activeOrganizationId).toBeNull()
    expect(subRow?.status).toBe('CANCELED')
  })
})

