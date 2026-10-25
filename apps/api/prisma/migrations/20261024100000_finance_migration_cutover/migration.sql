-- Preserve the source invoice date for migrated AR documents. Existing invoices retain
-- their creation-time date; new records can supply the real source document date.
ALTER TABLE "ReceivableInvoice"
ADD COLUMN "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
