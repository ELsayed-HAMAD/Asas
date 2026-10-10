-- Do not infer provenance for legacy workspaces: they may contain real records.
ALTER TABLE "Tenant" ADD COLUMN "sampleDataManifest" JSONB;
