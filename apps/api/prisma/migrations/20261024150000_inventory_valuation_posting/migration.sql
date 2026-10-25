-- Additive acquisition-cost storage for purchase-order lines. Historical lines keep NULL so no
-- inventory cost is invented for them; receipt requires a cost only after a workspace explicitly
-- configures perpetual inventory valuation.
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "unitCost" DECIMAL(19,4);
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "currency" TEXT;

ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_unitCost_check"
    CHECK ("unitCost" IS NULL OR "unitCost" >= 0);

ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_currency_check"
    CHECK ("currency" IS NULL OR length("currency") = 3);
