ALTER TABLE "Tenant"
  ADD COLUMN "overtimeThresholdHours" DOUBLE PRECISION NOT NULL DEFAULT 8;

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_overtimeThresholdHours_check"
  CHECK ("overtimeThresholdHours" >= 1 AND "overtimeThresholdHours" <= 24);

ALTER TABLE "Timesheet"
  ADD COLUMN "overtimeThresholdHours" DOUBLE PRECISION NOT NULL DEFAULT 8;

ALTER TABLE "Timesheet"
  ADD CONSTRAINT "Timesheet_overtimeThresholdHours_check"
  CHECK ("overtimeThresholdHours" >= 1 AND "overtimeThresholdHours" <= 24);
