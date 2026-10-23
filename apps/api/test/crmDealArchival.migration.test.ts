import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261023020000_crm_deal_archival/migration.sql', import.meta.url),
  'utf8',
)

describe('CRM deal archival migration', () => {
  it('adds archive state without removing the deal or its activity/history', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Deal" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL
        );
        CREATE TABLE "DealStageHistory" (
          "id" TEXT PRIMARY KEY, "dealId" TEXT NOT NULL REFERENCES "Deal"("id") ON DELETE CASCADE
        );
        CREATE TABLE "DealActivity" (
          "id" TEXT PRIMARY KEY, "dealId" TEXT NOT NULL REFERENCES "Deal"("id") ON DELETE CASCADE
        );
        INSERT INTO "Deal" VALUES ('deal-1', 'tenant-1', 'Retained deal');
        INSERT INTO "DealStageHistory" VALUES ('history-1', 'deal-1');
        INSERT INTO "DealActivity" VALUES ('activity-1', 'deal-1');
      `)
      await db.exec(migration)
      const deal = await db.query<{ name: string; archivedAt: Date | null }>('SELECT "name", "archivedAt" FROM "Deal" WHERE "id" = $1', ['deal-1'])
      const history = await db.query<{ id: string }>('SELECT "id" FROM "DealStageHistory"')
      const activities = await db.query<{ id: string }>('SELECT "id" FROM "DealActivity"')
      expect(deal.rows).toEqual([{ name: 'Retained deal', archivedAt: null }])
      expect(history.rows).toEqual([{ id: 'history-1' }])
      expect(activities.rows).toEqual([{ id: 'activity-1' }])
    } finally {
      await db.close()
    }
  })
})
