ALTER TYPE "EmployeeStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "PayrollLine" DROP CONSTRAINT "PayrollLine_employeeId_fkey";
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Timesheet" DROP CONSTRAINT "Timesheet_employeeId_fkey";
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
