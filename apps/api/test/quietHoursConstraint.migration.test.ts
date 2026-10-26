import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261026110000_quiet_hours_distinct/migration.sql', import.meta.url),
  'utf8',
)

describe('quiet hours distinct window migration', () => {
  it('preserves legacy full-day rows but rejects new or updated full-day windows', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "QuietHours" (
          "id" TEXT PRIMARY KEY,
          "tenantId" TEXT NOT NULL,
          "start" TEXT NOT NULL,
          "end" TEXT NOT NULL
        );
        INSERT INTO "QuietHours" ("id", "tenantId", "start", "end")
        VALUES ('legacy_equal', 'tenant_1', '22:00', '22:00');
        INSERT INTO "QuietHours" ("id", "tenantId", "start", "end")
        VALUES ('valid_existing', 'tenant_1', '22:00', '07:00');
      `)

      await db.exec(migration)

      const constraint = await db.query<{ convalidated: boolean }>(
        `SELECT "convalidated" FROM "pg_constraint" WHERE "conname" = $1`,
        ['QuietHours_start_end_distinct'],
      )
      expect(constraint.rows).toEqual([{ convalidated: false }])

      const legacy = await db.query<{ id: string; start: string; end: string }>(
        `SELECT "id", "start", "end" FROM "QuietHours" WHERE "id" = $1`,
        ['legacy_equal'],
      )
      expect(legacy.rows).toEqual([{ id: 'legacy_equal', start: '22:00', end: '22:00' }])

      await expect(db.query(
        `INSERT INTO "QuietHours" ("id", "tenantId", "start", "end")
         VALUES ($1, $2, $3, $4)`,
        ['new_equal', 'tenant_1', '13:00', '13:00'],
      )).rejects.toThrow(/QuietHours_start_end_distinct/)

      await db.query(
        `INSERT INTO "QuietHours" ("id", "tenantId", "start", "end")
         VALUES ($1, $2, $3, $4)`,
        ['new_valid', 'tenant_1', '13:00', '15:00'],
      )

      await expect(db.query(
        `UPDATE "QuietHours" SET "end" = '13:00' WHERE "id" = $1`,
        ['new_valid'],
      )).rejects.toThrow(/QuietHours_start_end_distinct/)
    } finally {
      await db.close()
    }
  })
})
