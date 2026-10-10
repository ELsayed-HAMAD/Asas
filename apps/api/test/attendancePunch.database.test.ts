import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'prisma/migrations/20261007170000_attendance_punch_timestamps/migration.sql')

describe('attendance timestamp migration', () => {
  let db: PGlite | undefined

  afterEach(async () => {
    await db?.close()
    db = undefined
  }, 30_000)

  it('preserves legacy wall-clock values and accepts timestamp-backed overnight punches', async () => {
    db = new PGlite()
    await db.exec(`CREATE TABLE "TimesheetDay" (
      "id" text PRIMARY KEY, "timesheetId" text NOT NULL, "date" date, "dayLabel" text NOT NULL,
      "clockIn" text, "clockOut" text, "totalHours" double precision
    )`)
    await db.exec(`INSERT INTO "TimesheetDay" ("id", "timesheetId", "date", "dayLabel", "clockIn", "clockOut")
      VALUES ('legacy', 'sheet_1', '2026-10-06', 'Mon', '09:00', '17:00')`)
    await db.exec(await readFile(migrationPath, 'utf8'))
    await db.exec(`INSERT INTO "TimesheetDay" ("id", "timesheetId", "date", "dayLabel", "clockIn", "clockOut", "clockInAt", "clockOutAt")
      VALUES ('overnight', 'sheet_2', '2026-10-06', 'Tue', '23:00', '01:00', '2026-10-06T20:00:00Z', '2026-10-06T22:00:00Z')`)
    const rows = await db.query<{ id: string; clockIn: string; clockOut: string; clockInAt: Date | null; clockOutAt: Date | null }>(
      `SELECT "id", "clockIn", "clockOut", "clockInAt", "clockOutAt" FROM "TimesheetDay" ORDER BY "id"`,
    )
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows[0]).toMatchObject({ id: 'legacy', clockIn: '09:00', clockOut: '17:00', clockInAt: null, clockOutAt: null })
    expect(rows.rows[1]?.clockOutAt?.getTime()).toBeGreaterThan(rows.rows[1]?.clockInAt?.getTime() ?? 0)
  }, 30_000)

  it('rejects checkout timestamps without a start or before the start', async () => {
    db = new PGlite()
    await db.exec(`CREATE TABLE "TimesheetDay" (
      "id" text PRIMARY KEY, "timesheetId" text NOT NULL, "date" date, "dayLabel" text NOT NULL,
      "clockIn" text, "clockOut" text, "totalHours" double precision
    )`)
    await db.exec(await readFile(migrationPath, 'utf8'))
    await expect(db.exec(`INSERT INTO "TimesheetDay" ("id", "timesheetId", "date", "dayLabel", "clockOutAt")
      VALUES ('missing_start', 'sheet_1', '2026-10-06', 'Tue', '2026-10-06T22:00:00Z')`)).rejects.toThrow()
    await expect(db.exec(`INSERT INTO "TimesheetDay" ("id", "timesheetId", "date", "dayLabel", "clockInAt", "clockOutAt")
      VALUES ('negative', 'sheet_1', '2026-10-06', 'Tue', '2026-10-06T22:00:00Z', '2026-10-06T21:59:59Z')`)).rejects.toThrow()
  }, 30_000)
})
