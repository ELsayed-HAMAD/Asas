import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLeaveRequestInTransaction, getLeaveBalances } from '../src/modules/hr/attendance.service.js'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'PERSONAL');
    CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    CREATE TABLE "Tenant" ("id" text PRIMARY KEY, "timezone" text NOT NULL);
    CREATE TABLE "Employee" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "name" text NOT NULL, "departmentId" text, "status" text NOT NULL);
    CREATE TABLE "LeaveRequest" (
      "id" text PRIMARY KEY, "tenantId" text NOT NULL, "employeeId" text NOT NULL,
      "type" "LeaveType" NOT NULL, "startDate" timestamp NOT NULL, "endDate" timestamp,
      "status" "LeaveRequestStatus" NOT NULL
    );
    INSERT INTO "Tenant" VALUES ('tenant_1', 'UTC');
  `)
  await db.exec(readFileSync(new URL('../prisma/migrations/20261008230000_leave_policies/migration.sql', import.meta.url), 'utf8'))
}, 30_000)

afterAll(async () => { await db?.close() })

describe('leave policies migration', () => {
  it('supports one configurable allowance per leave type and rejects invalid allowances', async () => {
    await db.query(`INSERT INTO "LeavePolicy" ("id", "tenantId", "type", "annualAllowanceDays", "updatedAt") VALUES ('policy_1', 'tenant_1', 'VACATION', 20, CURRENT_TIMESTAMP)`)
    await expect(db.query(`INSERT INTO "LeavePolicy" ("id", "tenantId", "type", "annualAllowanceDays", "updatedAt") VALUES ('policy_2', 'tenant_1', 'VACATION', 10, CURRENT_TIMESTAMP)`)).rejects.toThrow()
    await expect(db.query(`INSERT INTO "LeavePolicy" ("id", "tenantId", "type", "annualAllowanceDays", "updatedAt") VALUES ('policy_3', 'tenant_1', 'SICK', -1, CURRENT_TIMESTAMP)`)).rejects.toThrow()
    const rows = await db.query<{ type: string; annualAllowanceDays: number; weekdaysOnly: boolean }>(`SELECT "type", "annualAllowanceDays", "weekdaysOnly" FROM "LeavePolicy"`)
    expect(rows.rows).toEqual([{ type: 'VACATION', annualAllowanceDays: 20, weekdaysOnly: false }])
  })

  it('calculates annual weekday balances across pending and approved requests in the database', async () => {
    await db.exec(`
      INSERT INTO "Employee" VALUES ('employee_1', 'tenant_1', 'Rana', NULL, 'ACTIVE');
      UPDATE "LeavePolicy" SET "weekdaysOnly" = true WHERE "tenantId" = 'tenant_1' AND "type" = 'VACATION';
      INSERT INTO "LeaveRequest" VALUES
        ('approved_1', 'tenant_1', 'employee_1', 'VACATION', '2026-10-09', '2026-10-13', 'APPROVED'),
        ('pending_1', 'tenant_1', 'employee_1', 'VACATION', '2026-10-10', '2026-10-12', 'PENDING'),
        ('other_tenant', 'tenant_other', 'employee_1', 'VACATION', '2026-10-01', '2026-10-02', 'APPROVED');
    `)
    const prisma = {
      tenant: { findUnique: async () => ({ timezone: 'UTC' }) },
      employee: { findMany: async () => [{ id: 'employee_1', name: 'Rana', departmentId: null }] },
      leavePolicy: { findMany: async () => [{ type: 'VACATION', annualAllowanceDays: 20, weekdaysOnly: true }] },
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((sql, part, index) => sql + part + (index < values.length ? `$${index + 1}` : ''), '')
        const result = await db.query(query, values)
        return result.rows
      },
    } as unknown as PrismaClient
    const result = await getLeaveBalances(prisma, 'tenant_1', { year: 2026 })
    expect(result.items.find(item => item.type === 'VACATION')).toMatchObject({ approvedDays: 3, pendingDays: 1, remainingDays: 16 })
  }, 30_000)

  it('uses the stored annual allowance to reject requests that exceed the remaining weekday balance', async () => {
    const tx = {
      employee: { findFirst: async () => ({ id: 'employee_1' }) },
      leavePolicy: { findUnique: async () => ({ annualAllowanceDays: 20, weekdaysOnly: true }) },
      leaveRequest: { findFirst: async () => null, create: async () => { throw new Error('Request should not be created') } },
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((sql, part, index) => sql + part + (index < values.length ? `$${index + 1}` : ''), '')
        const result = await db.query(query, values)
        return result.rows
      },
    }
    await expect(createLeaveRequestInTransaction(tx as unknown as import('@prisma/client').Prisma.TransactionClient, 'tenant_1', 'employee_1', {
      type: 'VACATION', startDate: '2026-10-01', endDate: '2026-10-26',
    })).rejects.toThrow('allowance for 2026 would be exceeded')
  }, 30_000)
})
