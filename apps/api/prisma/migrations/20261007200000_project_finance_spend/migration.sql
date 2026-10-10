ALTER TABLE "PayableInvoice" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "projectId" TEXT;

CREATE INDEX "PayableInvoice_tenantId_projectId_idx" ON "PayableInvoice"("tenantId", "projectId");
CREATE INDEX "Expense_tenantId_projectId_idx" ON "Expense"("tenantId", "projectId");

ALTER TABLE "PayableInvoice" ADD CONSTRAINT "PayableInvoice_projectId_tenantId_fkey"
  FOREIGN KEY ("projectId", "tenantId") REFERENCES "Project"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_tenantId_fkey"
  FOREIGN KEY ("projectId", "tenantId") REFERENCES "Project"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
