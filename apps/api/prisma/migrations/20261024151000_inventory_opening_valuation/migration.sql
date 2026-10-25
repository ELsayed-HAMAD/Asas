-- Opening valuation assigns cost to stock quantity that already exists. It is not a new stock
-- movement, so the layer/event anchors that referenced a movement must be optional. Existing
-- valued rows keep their movement link; no row is deleted or rewritten.
ALTER TABLE "InventoryCostLayer" ALTER COLUMN "sourceMovementId" DROP NOT NULL;
ALTER TABLE "InventoryValuationEvent" ALTER COLUMN "stockMovementId" DROP NOT NULL;
