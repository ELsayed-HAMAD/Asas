import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const terminationMigration = readFileSync(new URL('../prisma/migrations/20261012050000_employee_termination_date/migration.sql', import.meta.url), 'utf8')
const salaryMigration = readFileSync(new URL('../prisma/migrations/20261012060000_effective_dated_employee_salary/migration.sql', import.meta.url), 'utf8')

describe('effective-dated salary migrations', () => {
  it('preserves existing salaries from the cutover date and enforces tenant/date identity', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TYPE "SalaryBasis" AS ENUM ('ANNUAL', 'MONTHLY');
        CREATE TABLE "Tenant" ("id" TEXT NOT NULL PRIMARY KEY, "currency" TEXT NOT NULL);
        CREATE TABLE "Employee" (
          "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "salary" DECIMAL(19,4),
          "salaryBasis" "SalaryBasis", "currency" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"), CONSTRAINT "Employee_id_tenantId_key" UNIQUE ("id", "tenantId")
        );
        CREATE TABLE "PayrollLine" ("id" TEXT NOT NULL PRIMARY KEY);
        INSERT INTO "Tenant" VALUES ('tenant_1', 'USD'), ('tenant_2', 'EUR');
        INSERT INTO "Employee" ("id", "tenantId", "salary", "salaryBasis") VALUES ('emp_1', 'tenant_1', 120000, 'ANNUAL');
        INSERT INTO "Employee" ("id", "tenantId", "salary", "salaryBasis", "currency") VALUES ('emp_2', 'tenant_2', 60000, 'MONTHLY', 'EUR');
        INSERT INTO "Employee" ("id", "tenantId", "salary") VALUES ('emp_3', 'tenant_1', NULL);
      `)
      await db.exec(terminationMigration)
      await db.exec(salaryMigration)

      const rows = await db.query<{ employeeId: string; currency: string; salaryBasis: string | null; effectiveFrom: string }>(
        `SELECT "employeeId", "currency", "salaryBasis", "effectiveFrom"::text FROM "EmployeeSalaryHistory" ORDER BY "employeeId"`,
      )
      expect(rows.rows).toEqual([
        { employeeId: 'emp_1', currency: 'USD', salaryBasis: 'ANNUAL', effectiveFrom: expect.any(String) },
        { employeeId: 'emp_2', currency: 'EUR', salaryBasis: 'MONTHLY', effectiveFrom: expect.any(String) },
      ])
      expect(rows.rows[0]?.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      await expect(db.exec(`INSERT INTO "EmployeeSalaryHistory" ("id", "tenantId", "employeeId", "salary", "currency", "effectiveFrom") VALUES ('dup', 'tenant_1', 'emp_1', 1, 'USD', CURRENT_DATE)`)).rejects.toThrow()
      await expect(db.exec(`INSERT INTO "EmployeeSalaryHistory" ("id", "tenantId", "employeeId", "salary", "currency", "effectiveFrom") VALUES ('cross', 'tenant_2', 'emp_1', 1, 'EUR', CURRENT_DATE + 1)`)).rejects.toThrow()
      const lineColumn = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'PayrollLine' AND column_name = 'salaryRateSegments'`)
      expect(lineColumn.rows).toHaveLength(1)
    } finally {
      await db.close()
    }
  }, 20_000)
})
