-- Preserve source document face and paid-to-date totals on migrated open items. These are
-- descriptive source totals; they do not fabricate historical settlement journals.
ALTER TABLE "PayableInvoice"
  ADD COLUMN "sourceOriginalAmount" DECIMAL(19,4),
  ADD COLUMN "sourcePaidAmount" DECIMAL(19,4);

ALTER TABLE "ReceivableInvoice"
  ADD COLUMN "sourceOriginalAmount" DECIMAL(19,4),
  ADD COLUMN "sourcePaidAmount" DECIMAL(19,4);
