import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TABLE "Employee" ("id" text NOT NULL, "tenantId" text NOT NULL, UNIQUE ("id", "tenantId"));
    CREATE TABLE "Candidate" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "stage" text NOT NULL);
    INSERT INTO "Employee" VALUES ('employee_1', 'tenant_1'), ('employee_2', 'tenant_2');
    INSERT INTO "Candidate" VALUES ('legacy_hire', 'tenant_1', 'HIRED');
  `)
  await db.exec(readFileSync(new URL('../prisma/migrations/20261007210000_hired_candidate_employee_link/migration.sql', import.meta.url), 'utf8'))
}, 30_000)

afterAll(async () => { await db?.close() })

describe('hired candidate employee link migration', () => {
  it('does not guess employee links for historical hires', async () => {
    const row = await db.query<{ employeeId: string | null }>('SELECT "employeeId" FROM "Candidate" WHERE "id" = $1', ['legacy_hire'])
    expect(row.rows[0]?.employeeId).toBeNull()
  })

  it('enforces same-tenant, one-to-one links', async () => {
    await db.query('UPDATE "Candidate" SET "employeeId" = $1 WHERE "id" = $2', ['employee_1', 'legacy_hire'])
    await db.query('INSERT INTO "Candidate" VALUES ($1, $2, $3, $4)', ['candidate_2', 'tenant_1', 'HIRED', null])
    await expect(db.query('UPDATE "Candidate" SET "employeeId" = $1 WHERE "id" = $2', ['employee_2', 'candidate_2'])).rejects.toThrow()
    await expect(db.query('UPDATE "Candidate" SET "employeeId" = $1 WHERE "id" = $2', ['employee_1', 'candidate_2'])).rejects.toThrow()
  })
})
