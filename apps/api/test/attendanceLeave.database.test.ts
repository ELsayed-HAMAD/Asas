import { PGlite } from '@electric-sql/pglite'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { syncApprovedLeaveEmployeeStatuses } from '../src/modules/hr/attendance.service.js'

describe('approved leave date synchronization SQL', () => {
  it('starts and ends leave on tenant-local dates and writes system audit records', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'ARCHIVED');
        CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
        CREATE TABLE "Tenant" ("id" text PRIMARY KEY, "timezone" text NOT NULL);
        CREATE TABLE "Employee" (
          "id" text PRIMARY KEY, "tenantId" text NOT NULL, "status" "EmployeeStatus" NOT NULL,
          "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "LeaveRequest" (
          "id" text PRIMARY KEY, "tenantId" text NOT NULL, "employeeId" text NOT NULL,
          "startDate" timestamptz NOT NULL, "endDate" timestamptz, "status" "LeaveRequestStatus" NOT NULL
        );
        CREATE TABLE "AuditLog" (
          "id" serial PRIMARY KEY, "tenantId" text NOT NULL, "actorId" text, "action" text NOT NULL,
          "targetType" text, "targetId" text, "metadata" text
        );
        INSERT INTO "Tenant" VALUES ('tenant_1', 'UTC');
        INSERT INTO "Employee" ("id", "tenantId", "status") VALUES
          ('start_today', 'tenant_1', 'ACTIVE'), ('ended', 'tenant_1', 'ON_LEAVE'),
          ('manual_leave', 'tenant_1', 'ON_LEAVE'), ('future', 'tenant_1', 'ACTIVE'),
          ('archived', 'tenant_1', 'ARCHIVED');
        INSERT INTO "LeaveRequest" VALUES
          ('start_request', 'tenant_1', 'start_today', CURRENT_DATE - 1, CURRENT_DATE + 1, 'APPROVED'),
          ('ended_request', 'tenant_1', 'ended', CURRENT_DATE - 5, CURRENT_DATE - 1, 'APPROVED'),
          ('future_request', 'tenant_1', 'future', CURRENT_DATE + 3, CURRENT_DATE + 3, 'APPROVED'),
          ('archived_request', 'tenant_1', 'archived', CURRENT_DATE - 1, CURRENT_DATE + 1, 'APPROVED');
      `)
      const tx = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''), '')
          const result = await db.query(sql, values)
          return result.rows
        },
        auditLog: {
          createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
            for (const row of data) {
              await db.query(`INSERT INTO "AuditLog" ("tenantId", "actorId", "action", "targetType", "targetId", "metadata") VALUES ($1,$2,$3,$4,$5,$6)`, [
                row.tenantId, row.actorId, row.action, row.targetType, row.targetId, row.metadata,
              ])
            }
            return { count: data.length }
          }),
        },
      }
      const prisma = { $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) } as unknown as PrismaClient

      await expect(syncApprovedLeaveEmployeeStatuses(prisma)).resolves.toEqual({ started: 1, ended: 1 })
      const states = await db.query<{ id: string; status: string }>(`SELECT "id", "status" FROM "Employee" ORDER BY "id"`)
      expect(states.rows).toEqual([
        { id: 'archived', status: 'ARCHIVED' }, { id: 'ended', status: 'ACTIVE' },
        { id: 'future', status: 'ACTIVE' }, { id: 'manual_leave', status: 'ON_LEAVE' },
        { id: 'start_today', status: 'ON_LEAVE' },
      ])
      const audit = await db.query<{ action: string; actorId: string | null; targetId: string }>(`SELECT "action", "actorId", "targetId" FROM "AuditLog" ORDER BY "action"`)
      expect(audit.rows).toEqual([
        { action: 'hr.leave.employee.active', actorId: null, targetId: 'ended' },
        { action: 'hr.leave.employee.on_leave', actorId: null, targetId: 'start_today' },
      ])
    } finally {
      await db.close()
    }
  }, 30_000)
})
