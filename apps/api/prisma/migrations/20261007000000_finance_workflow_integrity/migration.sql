ALTER TABLE "PayableInvoice"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3);

ALTER TABLE "ReceivableInvoice" ADD COLUMN "paidAt" TIMESTAMP(3);

ALTER TABLE "Expense"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Historical records have no payment event timestamp; preserve the best available estimate.
UPDATE "PayableInvoice" SET "paidAt" = "updatedAt" WHERE "status" = 'PAID';
UPDATE "ReceivableInvoice" SET "paidAt" = "updatedAt" WHERE "status" = 'PAID';
