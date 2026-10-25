-- Additive inventory valuation storage. Existing quantity-only movements remain intact and
-- have no valuation event until an administrator establishes a validated opening position.
CREATE TYPE "InventoryCostingMethod" AS ENUM ('FIFO', 'WEIGHTED_AVERAGE');
CREATE TYPE "InventoryCostReason" AS ENUM (
    'PURCHASE_RECEIPT',
    'OPENING_BALANCE',
    'SALE',
    'CONSUMPTION',
    'DAMAGE',
    'COUNT_ADJUSTMENT',
    'CUSTOMER_RETURN',
    'SUPPLIER_RETURN'
);

CREATE UNIQUE INDEX "StockMovement_id_tenantId_key"
    ON "StockMovement"("id", "tenantId");

-- Make the existing movement-to-product relationship tenant-safe at the database boundary.
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_productId_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_tenantId_fkey"
    FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InventoryValuationConfig" (
    "tenantId" TEXT NOT NULL,
    "costingMethod" "InventoryCostingMethod" NOT NULL,
    "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryValuationConfig_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "InventoryValuationAccountMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "inventoryAssetAccountCode" TEXT NOT NULL,
    "costOfGoodsSoldAccountCode" TEXT NOT NULL,
    "goodsReceivedNotInvoicedAccountCode" TEXT NOT NULL,
    "adjustmentExpenseAccountCode" TEXT NOT NULL,
    "adjustmentGainAccountCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryValuationAccountMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryValuationBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "onHandQuantity" INTEGER NOT NULL DEFAULT 0,
    "inventoryValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryValuationBalance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryValuationBalance_quantity_check" CHECK ("onHandQuantity" >= 0),
    CONSTRAINT "InventoryValuationBalance_value_check" CHECK ("inventoryValue" >= 0),
    CONSTRAINT "InventoryValuationBalance_empty_check" CHECK ("onHandQuantity" <> 0 OR "inventoryValue" = 0)
);

CREATE TABLE "InventoryCostLayer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceMovementId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "originalQuantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "originalValue" DECIMAL(19,4) NOT NULL,
    "remainingValue" DECIMAL(19,4) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCostLayer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryCostLayer_quantity_check" CHECK ("originalQuantity" > 0 AND "remainingQuantity" >= 0 AND "remainingQuantity" <= "originalQuantity"),
    CONSTRAINT "InventoryCostLayer_value_check" CHECK ("originalValue" >= 0 AND "remainingValue" >= 0 AND "remainingValue" <= "originalValue"),
    CONSTRAINT "InventoryCostLayer_empty_check" CHECK ("remainingQuantity" <> 0 OR "remainingValue" = 0)
);

CREATE TABLE "InventoryValuationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "costingMethod" "InventoryCostingMethod" NOT NULL,
    "reason" "InventoryCostReason" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "costValue" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryValuationEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryValuationEvent_quantity_check" CHECK ("quantityDelta" <> 0),
    CONSTRAINT "InventoryValuationEvent_value_check" CHECK ("costValue" >= 0)
);

CREATE TABLE "InventoryCostAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCostAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryCostAllocation_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "InventoryCostAllocation_value_check" CHECK ("value" >= 0)
);

CREATE UNIQUE INDEX "InventoryValuationBalance_productId_tenantId_key"
    ON "InventoryValuationBalance"("productId", "tenantId");
CREATE UNIQUE INDEX "InventoryValuationBalance_id_tenantId_key"
    ON "InventoryValuationBalance"("id", "tenantId");
CREATE INDEX "InventoryValuationBalance_tenantId_currency_idx"
    ON "InventoryValuationBalance"("tenantId", "currency");

CREATE UNIQUE INDEX "InventoryCostLayer_sourceMovementId_tenantId_key"
    ON "InventoryCostLayer"("sourceMovementId", "tenantId");
CREATE UNIQUE INDEX "InventoryCostLayer_id_tenantId_key"
    ON "InventoryCostLayer"("id", "tenantId");
CREATE INDEX "InventoryCostLayer_tenantId_productId_receivedAt_id_idx"
    ON "InventoryCostLayer"("tenantId", "productId", "receivedAt", "id");

CREATE UNIQUE INDEX "InventoryValuationEvent_stockMovementId_tenantId_key"
    ON "InventoryValuationEvent"("stockMovementId", "tenantId");
CREATE UNIQUE INDEX "InventoryValuationEvent_journalEntryId_tenantId_key"
    ON "InventoryValuationEvent"("journalEntryId", "tenantId");
CREATE UNIQUE INDEX "InventoryValuationEvent_id_tenantId_key"
    ON "InventoryValuationEvent"("id", "tenantId");
CREATE INDEX "InventoryValuationEvent_tenantId_productId_postedAt_id_idx"
    ON "InventoryValuationEvent"("tenantId", "productId", "postedAt", "id");

CREATE UNIQUE INDEX "InventoryCostAllocation_tenantId_eventId_layerId_key"
    ON "InventoryCostAllocation"("tenantId", "eventId", "layerId");
CREATE INDEX "InventoryCostAllocation_tenantId_layerId_idx"
    ON "InventoryCostAllocation"("tenantId", "layerId");

ALTER TABLE "InventoryValuationConfig" ADD CONSTRAINT "InventoryValuationConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationAccountMapping" ADD CONSTRAINT "InventoryValuationAccountMapping_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationBalance" ADD CONSTRAINT "InventoryValuationBalance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationBalance" ADD CONSTRAINT "InventoryValuationBalance_productId_tenantId_fkey"
    FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostLayer" ADD CONSTRAINT "InventoryCostLayer_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCostLayer" ADD CONSTRAINT "InventoryCostLayer_productId_tenantId_fkey"
    FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostLayer" ADD CONSTRAINT "InventoryCostLayer_sourceMovementId_tenantId_fkey"
    FOREIGN KEY ("sourceMovementId", "tenantId") REFERENCES "StockMovement"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationEvent" ADD CONSTRAINT "InventoryValuationEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationEvent" ADD CONSTRAINT "InventoryValuationEvent_productId_tenantId_fkey"
    FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationEvent" ADD CONSTRAINT "InventoryValuationEvent_stockMovementId_tenantId_fkey"
    FOREIGN KEY ("stockMovementId", "tenantId") REFERENCES "StockMovement"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationEvent" ADD CONSTRAINT "InventoryValuationEvent_journalEntryId_tenantId_fkey"
    FOREIGN KEY ("journalEntryId", "tenantId") REFERENCES "JournalEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostAllocation" ADD CONSTRAINT "InventoryCostAllocation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCostAllocation" ADD CONSTRAINT "InventoryCostAllocation_eventId_tenantId_fkey"
    FOREIGN KEY ("eventId", "tenantId") REFERENCES "InventoryValuationEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostAllocation" ADD CONSTRAINT "InventoryCostAllocation_layerId_tenantId_fkey"
    FOREIGN KEY ("layerId", "tenantId") REFERENCES "InventoryCostLayer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "InventoryValuationAccountMapping_tenantId_currency_key"
    ON "InventoryValuationAccountMapping"("tenantId", "currency");
CREATE UNIQUE INDEX "InventoryValuationAccountMapping_id_tenantId_key"
    ON "InventoryValuationAccountMapping"("id", "tenantId");
CREATE INDEX "InventoryValuationAccountMapping_tenantId_idx"
    ON "InventoryValuationAccountMapping"("tenantId");
