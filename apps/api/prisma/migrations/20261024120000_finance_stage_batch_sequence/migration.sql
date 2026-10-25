-- Establish a stable, auditable sequence for batches within each entity/project.
ALTER TABLE "DataMigrationStageBatch"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "tenantId", "projectId", "entity"
    ORDER BY "createdAt" ASC, "id" ASC
  )::INTEGER AS "sequence"
  FROM "DataMigrationStageBatch"
)
UPDATE "DataMigrationStageBatch" AS batch
SET "sequence" = ranked."sequence"
FROM ranked
WHERE batch."id" = ranked."id";

CREATE UNIQUE INDEX "DataMigrationStageBatch_tenantId_projectId_entity_sequence_key"
  ON "DataMigrationStageBatch"("tenantId", "projectId", "entity", "sequence");
