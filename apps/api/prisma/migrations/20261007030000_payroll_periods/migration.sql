-- Legacy salary bases and earning periods are unknown; do not invent or reprice them.
CREATE TYPE "SalaryBasis" AS ENUM ('ANNUAL', 'MONTHLY');
CREATE TYPE "PayFrequency" AS ENUM ('MONTHLY', 'SEMIMONTHLY', 'BIWEEKLY', 'WEEKLY');
ALTER TABLE "Employee" ADD COLUMN "salaryBasis" "SalaryBasis";
ALTER TABLE "PayrollRun"
  ADD COLUMN "periodStart" DATE,
  ADD COLUMN "periodEnd" DATE,
  ADD COLUMN "payFrequency" "PayFrequency",
  ADD COLUMN "periodsPerYear" INTEGER,
  ADD COLUMN "salaryBasis" "SalaryBasis",
  ADD COLUMN "prorationMethod" TEXT,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD CONSTRAINT "PayrollRun_period_dates_check" CHECK (
    ("periodStart" IS NULL AND "periodEnd" IS NULL) OR
    ("periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL AND "periodEnd" >= "periodStart")
  );
ALTER TABLE "PayrollLine"
  ADD COLUMN "sourceSalary" DECIMAL(19,4),
  ADD COLUMN "salaryBasis" "SalaryBasis",
  ADD COLUMN "eligibleDays" INTEGER,
  ADD COLUMN "periodDays" INTEGER,
  ADD CONSTRAINT "PayrollLine_period_days_check" CHECK (
    ("eligibleDays" IS NULL AND "periodDays" IS NULL) OR
    ("eligibleDays" IS NOT NULL AND "periodDays" IS NOT NULL AND "periodDays" > 0 AND "eligibleDays" BETWEEN 0 AND "periodDays")
  );
CREATE UNIQUE INDEX "PayrollRun_tenantId_requestKey_key" ON "PayrollRun"("tenantId", "requestKey");
CREATE INDEX "PayrollRun_tenantId_periodStart_periodEnd_idx" ON "PayrollRun"("tenantId", "periodStart", "periodEnd");
