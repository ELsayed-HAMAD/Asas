import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('integration endpoint health migration', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TYPE "IntegrationStatus" AS ENUM ('CONFIGURE', 'CONNECTED', 'DISCONNECTED');
      CREATE TABLE "Integration" (
        "id" TEXT PRIMARY KEY,
        "status" "IntegrationStatus" NOT NULL DEFAULT 'CONFIGURE',
        "syncPullRequests" BOOLEAN NOT NULL DEFAULT FALSE,
        "syncCiCdStatus" BOOLEAN NOT NULL DEFAULT FALSE
      );
      INSERT INTO "Integration" ("id", "status", "syncPullRequests", "syncCiCdStatus") VALUES
        ('legacy-connected', 'CONNECTED', TRUE, TRUE),
        ('legacy-disconnected', 'DISCONNECTED', FALSE, FALSE),
        ('already-configured', 'CONFIGURE', FALSE, FALSE);
    `)
    const migration = readFileSync(
      new URL('../prisma/migrations/20261021070000_integration_endpoint_health_truth/migration.sql', import.meta.url),
      'utf8',
    )
    await db.exec(migration)
  })

  afterAll(async () => {
    await db.close()
  })

  it('resets legacy health and inactive sync claims while preserving endpoint records', async () => {
    const result = await db.query<{ id: string; status: string; syncPullRequests: boolean; syncCiCdStatus: boolean }>(
      'SELECT "id", "status", "syncPullRequests", "syncCiCdStatus" FROM "Integration" ORDER BY "id"',
    )
    expect(result.rows).toEqual([
      { id: 'already-configured', status: 'CONFIGURE', syncPullRequests: false, syncCiCdStatus: false },
      { id: 'legacy-connected', status: 'CONFIGURE', syncPullRequests: false, syncCiCdStatus: false },
      { id: 'legacy-disconnected', status: 'CONFIGURE', syncPullRequests: false, syncCiCdStatus: false },
    ])
  })
})
