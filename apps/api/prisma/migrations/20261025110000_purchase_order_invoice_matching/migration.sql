-- Exact supplier-invoice / purchase-receipt matching. A purchase order gains an optional Finance
-- vendor, and a valued purchase receipt records the purchase order that created its GRNI credit.
-- A supplier bill may then be linked to that receipt; approval clears GRNI through the exact
-- receipt journal account. Partial receipts and price/tax variance matching are deliberately
-- unsupported until their accounting treatment is defined. Existing purchase orders, receipts,
-- invoices, and journals remain valid with NULL links.

CREATE UNIQUE INDEX "Vendor_id_tenantId_key"
    ON "Vendor"("id", "tenantId");

ALTER TABLE "PurchaseOrder" ADD COLUMN "vendorId" TEXT;
CREATE UNIQUE INDEX "PurchaseOrder_id_tenantId_key"
    ON "PurchaseOrder"("id", "tenantId");
CREATE INDEX "PurchaseOrder_tenantId_vendorId_idx"
    ON "PurchaseOrder"("tenantId", "vendorId");
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_tenantId_fkey"
    FOREIGN KEY ("vendorId", "tenantId") REFERENCES "Vendor"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryValuationEvent" ADD COLUMN "purchaseOrderId" TEXT;
CREATE INDEX "InventoryValuationEvent_tenantId_purchaseOrderId_idx"
    ON "InventoryValuationEvent"("tenantId", "purchaseOrderId");
ALTER TABLE "InventoryValuationEvent" ADD CONSTRAINT "InventoryValuationEvent_purchaseOrderId_tenantId_fkey"
    FOREIGN KEY ("purchaseOrderId", "tenantId") REFERENCES "PurchaseOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayableInvoice" ADD COLUMN "purchaseOrderId" TEXT;
CREATE INDEX "PayableInvoice_tenantId_purchaseOrderId_idx"
    ON "PayableInvoice"("tenantId", "purchaseOrderId");
ALTER TABLE "PayableInvoice" ADD CONSTRAINT "PayableInvoice_purchaseOrderId_tenantId_fkey"
    FOREIGN KEY ("purchaseOrderId", "tenantId") REFERENCES "PurchaseOrder"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrderInvoiceMatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "payableInvoiceId" TEXT NOT NULL,
    "valuationEventId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "activePurchaseOrderId" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrderInvoiceMatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrderInvoiceMatch_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "PurchaseOrderInvoiceMatch_currency_check" CHECK (length("currency") = 3),
    CONSTRAINT "PurchaseOrderInvoiceMatch_status_check" CHECK ("status" IN ('ACTIVE', 'REVERSED')),
    CONSTRAINT "PurchaseOrderInvoiceMatch_active_shape_check" CHECK (
        ("status" = 'ACTIVE' AND "activePurchaseOrderId" = "purchaseOrderId" AND "reversedAt" IS NULL)
        OR ("status" = 'REVERSED' AND "activePurchaseOrderId" IS NULL AND "reversedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "PurchaseOrderInvoiceMatch_id_tenantId_key"
    ON "PurchaseOrderInvoiceMatch"("id", "tenantId");
CREATE INDEX "PurchaseOrderInvoiceMatch_tenantId_payableInvoiceId_idx"
    ON "PurchaseOrderInvoiceMatch"("tenantId", "payableInvoiceId");
CREATE UNIQUE INDEX "PurchaseOrderInvoiceMatch_tenantId_activePurchaseOrderId_key"
    ON "PurchaseOrderInvoiceMatch"("tenantId", "activePurchaseOrderId");
CREATE INDEX "PurchaseOrderInvoiceMatch_tenantId_purchaseOrderId_idx"
    ON "PurchaseOrderInvoiceMatch"("tenantId", "purchaseOrderId");
CREATE INDEX "PurchaseOrderInvoiceMatch_tenantId_valuationEventId_idx"
    ON "PurchaseOrderInvoiceMatch"("tenantId", "valuationEventId");
CREATE INDEX "PurchaseOrderInvoiceMatch_tenantId_journalEntryId_idx"
    ON "PurchaseOrderInvoiceMatch"("tenantId", "journalEntryId");

ALTER TABLE "PurchaseOrderInvoiceMatch" ADD CONSTRAINT "PurchaseOrderInvoiceMatch_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderInvoiceMatch" ADD CONSTRAINT "PurchaseOrderInvoiceMatch_purchaseOrderId_tenantId_fkey"
    FOREIGN KEY ("purchaseOrderId", "tenantId") REFERENCES "PurchaseOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderInvoiceMatch" ADD CONSTRAINT "PurchaseOrderInvoiceMatch_payableInvoiceId_tenantId_fkey"
    FOREIGN KEY ("payableInvoiceId", "tenantId") REFERENCES "PayableInvoice"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderInvoiceMatch" ADD CONSTRAINT "PurchaseOrderInvoiceMatch_valuationEventId_tenantId_fkey"
    FOREIGN KEY ("valuationEventId", "tenantId") REFERENCES "InventoryValuationEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderInvoiceMatch" ADD CONSTRAINT "PurchaseOrderInvoiceMatch_journalEntryId_tenantId_fkey"
    FOREIGN KEY ("journalEntryId", "tenantId") REFERENCES "JournalEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
