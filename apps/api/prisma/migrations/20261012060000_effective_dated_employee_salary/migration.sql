CREATE TABLE "EmployeeSalaryHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "salary" DECIMAL(19,4) NOT NULL,
    "salaryBasis" "SalaryBasis",
    "currency" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeSalaryHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeSalaryHistory_employeeId_effectiveFrom_key"
    ON "EmployeeSalaryHistory"("employeeId", "effectiveFrom");
CREATE INDEX "EmployeeSalaryHistory_tenantId_employeeId_effectiveFrom_idx"
    ON "EmployeeSalaryHistory"("tenantId", "employeeId", "effectiveFrom");
ALTER TABLE "EmployeeSalaryHistory"
    ADD CONSTRAINT "EmployeeSalaryHistory_employeeId_tenantId_fkey"
    FOREIGN KEY ("employeeId", "tenantId") REFERENCES "Employee"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollLine" ADD COLUMN "salaryRateSegments" JSONB;

-- Record the currently configured rate at cutover. Historical changes are unknown and are not inferred.
INSERT INTO "EmployeeSalaryHistory" ("id", "tenantId", "employeeId", "salary", "salaryBasis", "currency", "effectiveFrom")
SELECT 'salary_cutover_' || e."id", e."tenantId", e."id", e."salary", e."salaryBasis", COALESCE(e."currency", t."currency"), CURRENT_DATE
FROM "Employee" e
JOIN "Tenant" t ON t."id" = e."tenantId"
WHERE e."salary" IS NOT NULL;
