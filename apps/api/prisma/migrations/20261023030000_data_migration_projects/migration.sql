-- Persist a company migration plan so onboarding can create it and Settings can resume it later.
CREATE TYPE "DataMigrationModule" AS ENUM ('HR', 'CRM', 'FINANCE', 'INVENTORY', 'PROJECTS');
CREATE TYPE "DataMigrationProjectStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'RECONCILING', 'READY_FOR_CUTOVER', 'COMPLETED', 'PAUSED');
CREATE TYPE "DataMigrationEntity" AS ENUM ('HR_EMPLOYEES');
CREATE TYPE "DataMigrationImportStatus" AS ENUM ('COMPLETED');

CREATE TABLE "DataMigrationProject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceSystem" TEXT,
    "modules" "DataMigrationModule"[] NOT NULL DEFAULT ARRAY[]::"DataMigrationModule"[],
    "status" "DataMigrationProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "targetCutoverAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataMigrationProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataMigrationProject_tenantId_updatedAt_idx" ON "DataMigrationProject"("tenantId", "updatedAt");
CREATE INDEX "DataMigrationProject_tenantId_status_idx" ON "DataMigrationProject"("tenantId", "status");
ALTER TABLE "DataMigrationProject" ADD CONSTRAINT "DataMigrationProject_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DataMigrationImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entity" "DataMigrationEntity" NOT NULL,
    "status" "DataMigrationImportStatus" NOT NULL DEFAULT 'COMPLETED',
    "totalRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataMigrationImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataMigrationImportJob_tenantId_projectId_createdAt_idx" ON "DataMigrationImportJob"("tenantId", "projectId", "createdAt");
CREATE INDEX "DataMigrationImportJob_tenantId_entity_status_idx" ON "DataMigrationImportJob"("tenantId", "entity", "status");
ALTER TABLE "DataMigrationImportJob" ADD CONSTRAINT "DataMigrationImportJob_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigrationImportJob" ADD CONSTRAINT "DataMigrationImportJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "DataMigrationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
