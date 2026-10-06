ALTER TABLE "TimesheetDay" ADD COLUMN "date" DATE;
ALTER TABLE "Timesheet" ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "TimesheetDay_timesheetId_date_key" ON "TimesheetDay"("timesheetId", "date");
