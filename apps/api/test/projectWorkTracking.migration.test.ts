import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TABLE "Project" ("id" text PRIMARY KEY);
    CREATE TABLE "Sprint" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
    CREATE TABLE "Issue" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "sprintId" text);
    INSERT INTO "Project" VALUES ('project_1');
    INSERT INTO "Sprint" VALUES ('sprint_1', 'tenant_1');
    INSERT INTO "Issue" VALUES ('legacy_done', 'tenant_1', 'sprint_1');
  `)
  await db.exec(readFileSync(new URL('../prisma/migrations/20261007190000_project_work_tracking/migration.sql', import.meta.url), 'utf8'))
}, 30_000)

afterAll(async () => { await db?.close() })

describe('project work tracking migration', () => {
  it('leaves unknown historical sprint and completion dates null', async () => {
    const row = await db.query<{ startsAt: Date | null; completedAt: Date | null; storyPoints: number | null }>(`
      SELECT s."startsAt", i."completedAt", i."storyPoints"
      FROM "Sprint" s JOIN "Issue" i ON i."sprintId" = s."id"
      WHERE i."id" = 'legacy_done'
    `)
    expect(row.rows[0]).toEqual({ startsAt: null, completedAt: null, storyPoints: null })
  })

  it('accepts scoped project links and rejects story points outside the supported range', async () => {
    await db.query('INSERT INTO "Issue" ("id", "tenantId", "projectId", "storyPoints") VALUES ($1, $2, $3, $4)', ['new_issue', 'tenant_1', 'project_1', 5])
    await expect(db.query('INSERT INTO "Issue" ("id", "tenantId", "storyPoints") VALUES ($1, $2, $3)', ['bad_issue', 'tenant_1', -1])).rejects.toThrow()
    await expect(db.query('INSERT INTO "Issue" ("id", "tenantId", "projectId") VALUES ($1, $2, $3)', ['foreign_project', 'tenant_1', 'missing'])).rejects.toThrow()
  })
})
