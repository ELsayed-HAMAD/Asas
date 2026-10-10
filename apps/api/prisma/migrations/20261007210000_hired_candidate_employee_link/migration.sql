ALTER TABLE "Candidate" ADD COLUMN "employeeId" TEXT;

CREATE INDEX "Candidate_tenantId_employeeId_idx" ON "Candidate"("tenantId", "employeeId");
CREATE UNIQUE INDEX "Candidate_employeeId_tenantId_key" ON "Candidate"("employeeId", "tenantId");

ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_employeeId_tenantId_fkey"
  FOREIGN KEY ("employeeId", "tenantId") REFERENCES "Employee"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
