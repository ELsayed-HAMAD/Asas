import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TABLE "Project" ("id" text NOT NULL, "tenantId" text NOT NULL, UNIQUE ("id", "tenantId"));
    CREATE TABLE "PayableInvoice" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
    CREATE TABLE "Expense" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
    INSERT INTO "Project" VALUES ('project_1', 'tenant_1'), ('project_2', 'tenant_2');
    INSERT INTO "PayableInvoice" VALUES ('legacy_bill', 'tenant_1');
    INSERT INTO "Expense" VALUES ('legacy_expense', 'tenant_1');
  `)
  await db.exec(readFileSync(new URL('../prisma/migrations/20261007200000_project_finance_spend/migration.sql', import.meta.url), 'utf8'))
}, 30_000)

afterAll(async () => { await db?.close() })

describe('project finance spend migration', () => {
  it('preserves existing finance records without assigning projects', async () => {
    const rows = await db.query<{ projectId: string | null }>(`
      SELECT "projectId" FROM "PayableInvoice" WHERE "id" = 'legacy_bill'
      UNION ALL SELECT "projectId" FROM "Expense" WHERE "id" = 'legacy_expense'
    `)
    expect(rows.rows).toEqual([{ projectId: null }, { projectId: null }])
  })

  it('allows a same-tenant project link and rejects a cross-tenant link', async () => {
    await db.query('UPDATE "PayableInvoice" SET "projectId" = $1 WHERE "id" = $2', ['project_1', 'legacy_bill'])
    await expect(db.query('UPDATE "Expense" SET "projectId" = $1 WHERE "id" = $2', ['project_2', 'legacy_expense'])).rejects.toThrow()
  })
})
