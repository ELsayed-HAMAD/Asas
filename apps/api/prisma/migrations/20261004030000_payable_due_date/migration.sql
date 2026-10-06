ALTER TABLE "PayableInvoice" ADD COLUMN "dueDate" TIMESTAMP(3);

-- Existing invoices keep their current date as the best available due date.
UPDATE "PayableInvoice" SET "dueDate" = "date";

CREATE INDEX "PayableInvoice_tenantId_dueDate_idx" ON "PayableInvoice"("tenantId", "dueDate");
