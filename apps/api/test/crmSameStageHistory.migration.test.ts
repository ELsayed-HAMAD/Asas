import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261023010000_allow_crm_same_stage_history_events/migration.sql', import.meta.url),
  'utf8',
)

describe('CRM same-stage history events migration', () => {
  it('allows value and ownership snapshots without changing stage and preserves prior history', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TYPE "DealStage" AS ENUM ('LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
        CREATE TABLE "DealStageHistory" (
          "id" TEXT PRIMARY KEY, "fromStage" "DealStage", "toStage" "DealStage" NOT NULL,
          CONSTRAINT "DealStageHistory_stage_change_check" CHECK ("fromStage" IS NULL OR "fromStage" <> "toStage")
        );
        INSERT INTO "DealStageHistory" VALUES ('transition', 'LEADS', 'PROPOSAL');
      `)
      await db.exec(migration)
      await db.query('INSERT INTO "DealStageHistory" VALUES ($1, $2, $3)', ['same-stage-edit', 'PROPOSAL', 'PROPOSAL'])
      const rows = await db.query<{ id: string }>('SELECT "id" FROM "DealStageHistory" ORDER BY "id"')
      expect(rows.rows).toEqual([{ id: 'same-stage-edit' }, { id: 'transition' }])
    } finally {
      await db.close()
    }
  })
})
