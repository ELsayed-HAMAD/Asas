ALTER TABLE "Product" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Product_tenantId_archivedAt_idx" ON "Product"("tenantId", "archivedAt");
