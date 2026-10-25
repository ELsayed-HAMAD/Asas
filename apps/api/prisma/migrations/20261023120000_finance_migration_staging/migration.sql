-- Finance migration rows are durable review artifacts. Operational invoices and journals are
-- created only by a later, atomic cutover step after reconciliation.
ALTER TYPE "DataMigrationEntity" ADD VALUE 'FINANCE_AP_OPEN_ITEMS';
ALTER TYPE "DataMigrationEntity" ADD VALUE 'FINANCE_AR_OPEN_ITEMS';
ALTER TYPE "DataMigrationEntity" ADD VALUE 'FINANCE_OPENING_BALANCE';

CREATE TYPE "DataMigrationStageStatus" AS ENUM ('STAGED', 'COMPLETED');

CREATE TABLE "DataMigrationStageBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entity" "DataMigrationEntity" NOT NULL,
    "status" "DataMigrationStageStatus" NOT NULL DEFAULT 'STAGED',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "stagedRows" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "DataMigrationStageBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataMigrationStagedRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entity" "DataMigrationEntity" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataMigrationStagedRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataMigrationStageBatch_tenantId_projectId_entity_idempotencyKey_key"
    ON "DataMigrationStageBatch"("tenantId", "projectId", "entity", "idempotencyKey");
CREATE INDEX "DataMigrationStageBatch_tenantId_projectId_createdAt_idx"
    ON "DataMigrationStageBatch"("tenantId", "projectId", "createdAt");
CREATE INDEX "DataMigrationStageBatch_tenantId_projectId_entity_status_idx"
    ON "DataMigrationStageBatch"("tenantId", "projectId", "entity", "status");
CREATE UNIQUE INDEX "DataMigrationStagedRecord_tenantId_projectId_entity_sourceId_key"
    ON "DataMigrationStagedRecord"("tenantId", "projectId", "entity", "sourceId");
CREATE INDEX "DataMigrationStagedRecord_tenantId_projectId_entity_batchId_idx"
    ON "DataMigrationStagedRecord"("tenantId", "projectId", "entity", "batchId");

ALTER TABLE "DataMigrationStageBatch" ADD CONSTRAINT "DataMigrationStageBatch_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigrationStageBatch" ADD CONSTRAINT "DataMigrationStageBatch_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "DataMigrationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigrationStagedRecord" ADD CONSTRAINT "DataMigrationStagedRecord_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigrationStagedRecord" ADD CONSTRAINT "DataMigrationStagedRecord_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "DataMigrationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigrationStagedRecord" ADD CONSTRAINT "DataMigrationStagedRecord_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "DataMigrationStageBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
