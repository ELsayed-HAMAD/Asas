import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TYPE "DealStage" AS ENUM ('LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
    CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "Deal" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "stage" "DealStage" NOT NULL,
      "ownerEmployeeId" TEXT, "value" DECIMAL(19,4) NOT NULL
    );
    CREATE TABLE "DealStageHistory" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "dealId" TEXT NOT NULL,
      "fromStage" "DealStage", "toStage" "DealStage" NOT NULL,
      "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "actorId" TEXT, "ownerEmployeeId" TEXT, "value" DECIMAL(19,4) NOT NULL,
      CONSTRAINT "DealStageHistory_stage_change_check" CHECK ("fromStage" IS NULL OR "fromStage" <> "toStage")
    );
    INSERT INTO "Tenant" VALUES ('tenant_1'), ('tenant_2');
    INSERT INTO "Deal" VALUES ('legacy_open', 'tenant_1', 'PROPOSAL', NULL, 500), ('legacy_closed', 'tenant_1', 'CLOSED_WON', NULL, 900);
    INSERT INTO "DealStageHistory" ("id", "tenantId", "dealId", "fromStage", "toStage", "value")
      VALUES ('known_event', 'tenant_1', 'legacy_open', 'LEADS', 'PROPOSAL', 500);
  `)
  await db.exec(readFileSync(new URL('../prisma/migrations/20261009000000_crm_history_coverage/migration.sql', import.meta.url), 'utf8'))
}, 30_000)

afterAll(async () => { await db?.close() })

describe('CRM history coverage migration', () => {
  it('records the history boundary and a baseline stage for every pre-existing deal', async () => {
    const coverage = await db.query<{ tenantId: string; startsAt: Date }>(`SELECT "tenantId", "startsAt" FROM "CrmHistoryCoverage" ORDER BY "tenantId"`)
    expect(coverage.rows).toHaveLength(2)
    const settlementCoverage = await db.query<{ tenantId: string; startsAt: Date }>(`SELECT "tenantId", "startsAt" FROM "SettlementHistoryCoverage" ORDER BY "tenantId"`)
    expect(settlementCoverage.rows).toHaveLength(2)
    expect(settlementCoverage.rows.map(row => row.tenantId)).toEqual(coverage.rows.map(row => row.tenantId))
    expect(settlementCoverage.rows[0]!.startsAt.getTime()).toBe(coverage.rows[0]!.startsAt.getTime())

    const baselines = await db.query<{ dealId: string; toStage: string; isBaseline: boolean; occurredAt: Date }>(`
      SELECT "dealId", "toStage"::text AS "toStage", "isBaseline", "occurredAt"
      FROM "DealStageHistory" WHERE "isBaseline" = TRUE ORDER BY "dealId"
    `)
    expect(baselines.rows).toHaveLength(2)
    expect(baselines.rows.map(row => [row.dealId, row.toStage, row.isBaseline])).toEqual([
      ['legacy_closed', 'CLOSED_WON', true],
      ['legacy_open', 'PROPOSAL', true],
    ])
    expect(baselines.rows.every(row => row.occurredAt.getTime() === coverage.rows[0]!.startsAt.getTime())).toBe(true)
    expect(coverage.rows[0]!.startsAt.getTime()).toBe(coverage.rows[1]!.startsAt.getTime())
  })

  it('starts coverage for tenants created after the migration', async () => {
    await db.query('INSERT INTO "Tenant" VALUES ($1)', ['tenant_3'])
    const coverage = await db.query<{ startsAt: Date }>('SELECT "startsAt" FROM "CrmHistoryCoverage" WHERE "tenantId" = $1', ['tenant_3'])
    const settlementCoverage = await db.query<{ startsAt: Date }>('SELECT "startsAt" FROM "SettlementHistoryCoverage" WHERE "tenantId" = $1', ['tenant_3'])
    expect(coverage.rows).toHaveLength(1)
    expect(settlementCoverage.rows).toHaveLength(1)
    expect(coverage.rows[0]!.startsAt).toBeInstanceOf(Date)
    expect(settlementCoverage.rows[0]!.startsAt.getTime()).toBe(coverage.rows[0]!.startsAt.getTime())
  })
})
