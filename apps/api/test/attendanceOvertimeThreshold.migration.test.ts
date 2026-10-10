import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "Timesheet" ("id" TEXT PRIMARY KEY);
    INSERT INTO "Tenant" VALUES ('tenant_1');
    INSERT INTO "Timesheet" VALUES ('sheet_1');
  `)
  await db.exec(readFileSync(new URL('../prisma/migrations/20261010000000_attendance_overtime_threshold/migration.sql', import.meta.url), 'utf8'))
}, 30_000)

afterAll(async () => { await db?.close() })

describe('attendance overtime threshold migration', () => {
  it('preserves the existing eight-hour rule for tenants and timesheets', async () => {
    const tenant = await db.query<{ overtimeThresholdHours: number }>('SELECT "overtimeThresholdHours" FROM "Tenant" WHERE "id" = $1', ['tenant_1'])
    const sheet = await db.query<{ overtimeThresholdHours: number }>('SELECT "overtimeThresholdHours" FROM "Timesheet" WHERE "id" = $1', ['sheet_1'])
    expect(tenant.rows[0]?.overtimeThresholdHours).toBe(8)
    expect(sheet.rows[0]?.overtimeThresholdHours).toBe(8)
  })

  it('allows thresholds from one to 24 hours and rejects invalid values', async () => {
    await db.query('UPDATE "Tenant" SET "overtimeThresholdHours" = 10.5 WHERE "id" = $1', ['tenant_1'])
    await expect(db.query('UPDATE "Tenant" SET "overtimeThresholdHours" = 0 WHERE "id" = $1', ['tenant_1'])).rejects.toThrow()
    await expect(db.query('UPDATE "Timesheet" SET "overtimeThresholdHours" = 24.5 WHERE "id" = $1', ['sheet_1'])).rejects.toThrow()
  })
})
