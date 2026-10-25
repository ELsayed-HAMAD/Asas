-- Optional costed stock fulfillment for a receivable invoice. The invoice amount model is
-- unchanged: an invoice without lines remains valid, and every line keeps the original issue and
-- any later reversal evidence instead of deleting or rewriting history.
CREATE TABLE "ReceivableInventoryLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "costValue" DECIMAL(19,4) NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "valuationEventId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalStockMovementId" TEXT,
    "reversalValuationEventId" TEXT,
    "reversalJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReceivableInventoryLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReceivableInventoryLine_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "ReceivableInventoryLine_cost_value_check" CHECK ("costValue" >= 0),
    CONSTRAINT "ReceivableInventoryLine_currency_check" CHECK (length("currency") = 3),
    CONSTRAINT "ReceivableInventoryLine_reversal_shape_check" CHECK (
        ("reversedAt" IS NULL AND "reversalStockMovementId" IS NULL
            AND "reversalValuationEventId" IS NULL AND "reversalJournalEntryId" IS NULL)
        OR ("reversedAt" IS NOT NULL AND "reversalStockMovementId" IS NOT NULL
            AND "reversalValuationEventId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ReceivableInventoryLine_id_tenantId_key"
    ON "ReceivableInventoryLine"("id", "tenantId");
CREATE UNIQUE INDEX "ReceivableInventoryLine_invoiceId_productId_tenantId_key"
    ON "ReceivableInventoryLine"("invoiceId", "productId", "tenantId");
CREATE UNIQUE INDEX "ReceivableInventoryLine_stockMovementId_tenantId_key"
    ON "ReceivableInventoryLine"("stockMovementId", "tenantId");
CREATE UNIQUE INDEX "ReceivableInventoryLine_valuationEventId_tenantId_key"
    ON "ReceivableInventoryLine"("valuationEventId", "tenantId");
CREATE UNIQUE INDEX "ReceivableInventoryLine_journalEntryId_tenantId_key"
    ON "ReceivableInventoryLine"("journalEntryId", "tenantId");
CREATE UNIQUE INDEX "ReceivableInventoryLine_reversalStockMovementId_tenantId_key"
    ON "ReceivableInventoryLine"("reversalStockMovementId", "tenantId");
CREATE UNIQUE INDEX "ReceivableInventoryLine_reversalValuationEventId_tenantId_key"
    ON "ReceivableInventoryLine"("reversalValuationEventId", "tenantId");
CREATE UNIQUE INDEX "ReceivableInventoryLine_reversalJournalEntryId_tenantId_key"
    ON "ReceivableInventoryLine"("reversalJournalEntryId", "tenantId");
CREATE INDEX "ReceivableInventoryLine_tenantId_invoiceId_idx"
    ON "ReceivableInventoryLine"("tenantId", "invoiceId");
CREATE INDEX "ReceivableInventoryLine_tenantId_productId_idx"
    ON "ReceivableInventoryLine"("tenantId", "productId");

ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_invoiceId_tenantId_fkey"
    FOREIGN KEY ("invoiceId", "tenantId") REFERENCES "ReceivableInvoice"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_productId_tenantId_fkey"
    FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_stockMovementId_tenantId_fkey"
    FOREIGN KEY ("stockMovementId", "tenantId") REFERENCES "StockMovement"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_valuationEventId_tenantId_fkey"
    FOREIGN KEY ("valuationEventId", "tenantId") REFERENCES "InventoryValuationEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_journalEntryId_tenantId_fkey"
    FOREIGN KEY ("journalEntryId", "tenantId") REFERENCES "JournalEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_reversalStockMovementId_tenantId_fkey"
    FOREIGN KEY ("reversalStockMovementId", "tenantId") REFERENCES "StockMovement"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_reversalValuationEventId_tenantId_fkey"
    FOREIGN KEY ("reversalValuationEventId", "tenantId") REFERENCES "InventoryValuationEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableInventoryLine" ADD CONSTRAINT "ReceivableInventoryLine_reversalJournalEntryId_tenantId_fkey"
    FOREIGN KEY ("reversalJournalEntryId", "tenantId") REFERENCES "JournalEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
