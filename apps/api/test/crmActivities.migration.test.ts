import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "Deal" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      UNIQUE ("id", "tenantId")
    );
    CREATE TABLE "DealActivity" (
      "id" TEXT PRIMARY KEY,
      "dealId" TEXT NOT NULL REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "title" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO "Tenant" VALUES ('tenant_1'), ('tenant_2');
    INSERT INTO "Deal" VALUES ('deal_1', 'tenant_1'), ('deal_2', 'tenant_2');
    INSERT INTO "DealActivity" ("id", "dealId", "title") VALUES ('activity_1', 'deal_1', 'Legacy activity');
  `)
  const migration = readFileSync(new URL('../prisma/migrations/20261007150000_crm_deal_activities/migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
}, 30_000)

afterAll(async () => { await db?.close() })

describe('CRM deal activity migration', () => {
  it('backfills existing tenant ownership and keeps old rows as notes', async () => {
    const result = await db.query('SELECT "tenantId", "type"::text AS type, "body", "actorId", "actorName" FROM "DealActivity" WHERE "id" = $1', ['activity_1'])
    expect(result.rows[0]).toEqual({ tenantId: 'tenant_1', type: 'NOTE', body: null, actorId: null, actorName: null })
  })

  it('enforces that the activity deal and tenant pair belong together', async () => {
    await expect(db.query(
      'INSERT INTO "DealActivity" ("id", "tenantId", "dealId", "type", "title") VALUES ($1, $2, $3, $4, $5)',
      ['cross_tenant', 'tenant_2', 'deal_1', 'CALL', 'Invalid cross-tenant activity'],
    )).rejects.toMatchObject({ code: '23503' })
  })
})
