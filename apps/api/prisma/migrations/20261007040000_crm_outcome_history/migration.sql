-- Expected close dates and last-edit timestamps are not evidence of actual closure.
-- Preserve legacy records without fabricating historical outcomes or transitions.
ALTER TABLE "Deal" ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE INDEX "Deal_tenantId_closedAt_idx" ON "Deal"("tenantId", "closedAt");

CREATE TABLE "DealStageHistory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "fromStage" "DealStage",
  "toStage" "DealStage" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "ownerEmployeeId" TEXT,
  "value" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealStageHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DealStageHistory_dealId_tenantId_fkey" FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DealStageHistory_stage_change_check" CHECK ("fromStage" IS NULL OR "fromStage" <> "toStage")
);
CREATE INDEX "DealStageHistory_tenantId_occurredAt_idx" ON "DealStageHistory"("tenantId", "occurredAt");
CREATE INDEX "DealStageHistory_dealId_occurredAt_idx" ON "DealStageHistory"("dealId", "occurredAt");
