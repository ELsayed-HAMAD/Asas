-- Preserve every staged Finance source row while allowing corrected revisions.
-- Existing rows become revision 1 and remain the current source version.
DROP INDEX "DataMigrationStagedRecord_tenantId_projectId_entity_sourceId_key";

ALTER TABLE "DataMigrationStagedRecord"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX "DataMigrationStagedRecord_tenantId_projectId_entity_sourceId_revision_key"
  ON "DataMigrationStagedRecord"("tenantId", "projectId", "entity", "sourceId", "revision");
CREATE INDEX "DataMigrationStagedRecord_tenantId_projectId_entity_sourceId_isCurrent_idx"
  ON "DataMigrationStagedRecord"("tenantId", "projectId", "entity", "sourceId", "isCurrent");
