import { describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { generateStalePunchExceptions } from '../src/modules/hr/attendance.service.js'

const stalePunch = { tenantId: 'tenant_1', employeeId: 'employee_1', date: new Date('2026-10-06T00:00:00.000Z') }

function setup(existing: Array<typeof stalePunch> = [], rows = [stalePunch]) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(rows),
    attendanceException: {
      findMany: vi.fn().mockResolvedValue(existing),
      createManyAndReturn: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => data.map((row, index) => ({
        ...row, id: `exception_${index + 1}`,
      }))),
    },
    auditLog: { createMany: vi.fn().mockResolvedValue({ count: rows.length }) },
  }
  const prisma = { $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work(tx)) }
  return { prisma, tx }
}

describe('stale attendance punch exceptions', () => {
  it('creates one admin-review exception and a system audit event for an open punch', async () => {
    const { prisma, tx } = setup()

    await expect(generateStalePunchExceptions(prisma as never)).resolves.toBe(1)

    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(tx.attendanceException.createManyAndReturn).toHaveBeenCalledWith({
      data: [{
        ...stalePunch,
        type: 'MISSING_OUT',
        label: 'Punch remained open for at least 24 hours; review and correct the time entry',
        alert: true,
      }],
      select: { id: true, tenantId: true },
    })
    expect(tx.auditLog.createMany).toHaveBeenCalledWith({ data: [{
      tenantId: 'tenant_1', actorId: null, action: 'hr.attendance.exception.missing_out.detected',
      targetType: 'AttendanceException', targetId: 'exception_1',
      metadata: JSON.stringify({ source: 'stale_punch_scan', thresholdHours: 24 }),
    }] })
  })

  it('does not recreate a previously reviewed missing-out exception', async () => {
    const { prisma, tx } = setup([stalePunch])

    await expect(generateStalePunchExceptions(prisma as never)).resolves.toBe(0)

    expect(tx.attendanceException.createManyAndReturn).not.toHaveBeenCalled()
    expect(tx.auditLog.createMany).not.toHaveBeenCalled()
  })

  it('does no follow-up reads or writes when no stale punches are found', async () => {
    const { prisma, tx } = setup([], [])

    await expect(generateStalePunchExceptions(prisma as never)).resolves.toBe(0)

    expect(tx.attendanceException.findMany).not.toHaveBeenCalled()
    expect(tx.attendanceException.createManyAndReturn).not.toHaveBeenCalled()
  })

  it('selects stale, unapproved, timestamped punches in PostgreSQL and skips existing alerts', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TYPE "AttendanceExceptionType" AS ENUM ('MISSING_IN', 'MISSING_OUT', 'OVERTIME');
        CREATE TABLE "Timesheet" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "employeeId" text NOT NULL, "approvedAt" timestamptz);
        CREATE TABLE "TimesheetDay" (
          "id" text PRIMARY KEY, "timesheetId" text NOT NULL, "date" date,
          "clockInAt" timestamptz, "clockOutAt" timestamptz
        );
        CREATE TABLE "AttendanceException" (
          "id" text PRIMARY KEY, "tenantId" text NOT NULL, "employeeId" text NOT NULL,
          "type" "AttendanceExceptionType" NOT NULL, "date" date NOT NULL
        );
        INSERT INTO "Timesheet" VALUES
          ('stale', 'tenant_1', 'employee_1', NULL),
          ('recent', 'tenant_1', 'employee_2', NULL),
          ('approved', 'tenant_1', 'employee_3', CURRENT_TIMESTAMP),
          ('already_flagged', 'tenant_1', 'employee_4', NULL);
        INSERT INTO "TimesheetDay" VALUES
          ('day_stale', 'stale', CURRENT_DATE - 1, CURRENT_TIMESTAMP - INTERVAL '25 hours', NULL),
          ('day_recent', 'recent', CURRENT_DATE, CURRENT_TIMESTAMP - INTERVAL '1 hour', NULL),
          ('day_approved', 'approved', CURRENT_DATE - 1, CURRENT_TIMESTAMP - INTERVAL '25 hours', NULL),
          ('day_flagged', 'already_flagged', CURRENT_DATE - 1, CURRENT_TIMESTAMP - INTERVAL '25 hours', NULL);
        INSERT INTO "AttendanceException" VALUES ('existing', 'tenant_1', 'employee_4', 'MISSING_OUT', CURRENT_DATE - 1);
      `)

      const rows = await db.query<{ tenantId: string; employeeId: string; date: string }>(`
        SELECT sheet."tenantId", sheet."employeeId", day."date"
        FROM "TimesheetDay" day
        JOIN "Timesheet" sheet ON sheet."id" = day."timesheetId"
        WHERE day."date" IS NOT NULL
          AND day."clockInAt" IS NOT NULL
          AND day."clockOutAt" IS NULL
          AND day."clockInAt" <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
          AND sheet."approvedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "AttendanceException" exception
            WHERE exception."tenantId" = sheet."tenantId"
              AND exception."employeeId" = sheet."employeeId"
              AND exception."type" = 'MISSING_OUT'::"AttendanceExceptionType"
              AND exception."date" = day."date"
          )
        ORDER BY day."clockInAt" ASC
        LIMIT 500
        FOR UPDATE OF day SKIP LOCKED
      `)

      expect(rows.rows).toEqual([{ tenantId: 'tenant_1', employeeId: 'employee_1', date: expect.anything() }])
    } finally {
      await db.close()
    }
  }, 20_000)
})
