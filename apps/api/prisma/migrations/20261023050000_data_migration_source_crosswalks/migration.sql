-- Make completed batches content-idempotent and preserve source IDs for dependent datasets.
ALTER TABLE "DataMigrationImportJob" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "DataMigrationImportJob" ADD COLUMN "requestHash" TEXT;
UPDATE "DataMigrationImportJob"
SET "idempotencyKey" = 'legacy:' || "id",
    "requestHash" = 'legacy'
WHERE "idempotencyKey" IS NULL OR "requestHash" IS NULL;
ALTER TABLE "DataMigrationImportJob" ALTER COLUMN "idempotencyKey" SET NOT NULL;
ALTER TABLE "DataMigrationImportJob" ALTER COLUMN "requestHash" SET NOT NULL;

CREATE UNIQUE INDEX "DataMigrationImportJob_tenantId_projectId_entity_idempotencyKey_key"
    ON "DataMigrationImportJob"("tenantId", "projectId", "entity", "idempotencyKey");

CREATE TABLE "DataMigrationRecordLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "sourceEntity" "DataMigrationEntity" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetEntity" "DataMigrationEntity" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataMigrationRecordLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataMigrationRecordLink_tenantId_projectId_sourceEntity_sourceId_key"
    ON "DataMigrationRecordLink"("tenantId", "projectId", "sourceEntity", "sourceId");
CREATE INDEX "DataMigrationRecordLink_tenantId_targetEntity_targetId_idx"
    ON "DataMigrationRecordLink"("tenantId", "targetEntity", "targetId");
CREATE INDEX "DataMigrationRecordLink_tenantId_importJobId_idx"
    ON "DataMigrationRecordLink"("tenantId", "importJobId");

ALTER TABLE "DataMigrationRecordLink" ADD CONSTRAINT "DataMigrationRecordLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigrationRecordLink" ADD CONSTRAINT "DataMigrationRecordLink_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "DataMigrationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigrationRecordLink" ADD CONSTRAINT "DataMigrationRecordLink_importJobId_fkey"
    FOREIGN KEY ("importJobId") REFERENCES "DataMigrationImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
