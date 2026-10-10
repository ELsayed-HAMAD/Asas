-- Keep legacy wall-clock fields for compatibility while recording exact instants for new punches.
-- Historical strings are deliberately not converted: their timezone and overnight meaning are unknown.
ALTER TABLE "TimesheetDay"
  ADD COLUMN "clockInAt" TIMESTAMPTZ(3),
  ADD COLUMN "clockOutAt" TIMESTAMPTZ(3);

ALTER TABLE "TimesheetDay"
  ADD CONSTRAINT "TimesheetDay_punch_timestamps_check"
  CHECK ("clockOutAt" IS NULL OR ("clockInAt" IS NOT NULL AND "clockOutAt" >= "clockInAt"));

CREATE INDEX "TimesheetDay_open_punch_idx"
  ON "TimesheetDay" ("timesheetId", "clockInAt")
  WHERE "clockInAt" IS NOT NULL AND "clockOutAt" IS NULL;
