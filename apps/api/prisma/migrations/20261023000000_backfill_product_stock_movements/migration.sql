-- Preserve existing product quantities when stock reads switch to movement-derived values.
-- Only products with no movement history are backfilled, so existing audit history is never
-- rewritten and products that already have movements are not double-counted.
INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta", "note", "createdAt")
SELECT
  'stock_opening_' || product."id",
  product."tenantId",
  product."id",
  product."stock",
  'Opening stock balance (migration backfill)',
  product."createdAt"
FROM "Product" AS product
WHERE product."stock" <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM "StockMovement" AS movement
    WHERE movement."productId" = product."id"
      AND movement."tenantId" = product."tenantId"
  );
