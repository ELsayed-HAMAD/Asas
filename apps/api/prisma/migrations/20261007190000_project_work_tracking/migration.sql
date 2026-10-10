ALTER TABLE "Sprint"
  ADD COLUMN "startsAt" TIMESTAMP(3);

ALTER TABLE "Issue"
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "storyPoints" INTEGER,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_storyPoints_check"
  CHECK ("storyPoints" IS NULL OR ("storyPoints" >= 0 AND "storyPoints" <= 1000));

CREATE INDEX "Issue_tenantId_projectId_idx" ON "Issue"("tenantId", "projectId");
CREATE INDEX "Issue_tenantId_sprintId_completedAt_idx" ON "Issue"("tenantId", "sprintId", "completedAt");

-- Existing sprint start and issue completion timestamps are intentionally left null. Their
-- actual historical start/completion dates cannot be reconstructed from createdAt/updatedAt.
