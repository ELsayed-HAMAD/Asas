-- Keep the onboarding-created company migration identifiable and resumable after imports
-- transition it from PLANNING to IN_PROGRESS. Existing migration projects are preserved.
ALTER TABLE "DataMigrationProject"
    ADD COLUMN "createdDuringOnboarding" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "DataMigrationProject_tenantId_createdDuringOnboarding_status_updatedAt_idx"
    ON "DataMigrationProject"("tenantId", "createdDuringOnboarding", "status", "updatedAt");
