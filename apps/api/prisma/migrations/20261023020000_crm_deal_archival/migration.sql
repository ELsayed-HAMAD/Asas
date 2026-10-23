ALTER TABLE "Deal" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Deal_tenantId_archivedAt_idx" ON "Deal"("tenantId", "archivedAt");
