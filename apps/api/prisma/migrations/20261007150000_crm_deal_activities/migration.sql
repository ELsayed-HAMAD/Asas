-- Backfill each existing activity's tenant from its existing deal relation, then enforce
-- tenant-safe parent linkage for all current and future activity records.
CREATE TYPE "DealActivityType" AS ENUM ('CALL', 'EMAIL', 'NOTE');

ALTER TABLE "DealActivity"
  ADD COLUMN "tenantId" TEXT,
  ADD COLUMN "type" "DealActivityType" NOT NULL DEFAULT 'NOTE',
  ADD COLUMN "body" TEXT,
  ADD COLUMN "actorId" TEXT,
  ADD COLUMN "actorName" TEXT;

UPDATE "DealActivity" AS activity
SET "tenantId" = deal."tenantId"
FROM "Deal" AS deal
WHERE deal."id" = activity."dealId";

ALTER TABLE "DealActivity" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "DealActivity" DROP CONSTRAINT "DealActivity_dealId_fkey";
ALTER TABLE "DealActivity"
  ADD CONSTRAINT "DealActivity_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DealActivity_dealId_tenantId_fkey"
  FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DealActivity_tenantId_dealId_createdAt_idx"
  ON "DealActivity"("tenantId", "dealId", "createdAt");
