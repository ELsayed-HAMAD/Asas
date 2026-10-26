-- Manual stock movements now carry a client-generated request key. A retry with the same key
-- returns the original movement instead of advancing stock twice; a changed payload reusing the
-- key is rejected. System movements (opening stock, purchase receipts, receivable issues,
-- migration imports) remain state-guarded or transaction-derived and leave both columns NULL.
-- Existing movements stay valid with NULL request fields.

ALTER TABLE "StockMovement" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "requestHash" TEXT;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_request_key_shape_check" CHECK (
    ("requestKey" IS NULL AND "requestHash" IS NULL)
    OR ("requestKey" IS NOT NULL AND "requestHash" IS NOT NULL)
);

CREATE UNIQUE INDEX "StockMovement_tenantId_requestKey_key"
    ON "StockMovement"("tenantId", "requestKey");
