ALTER TABLE "Candidate"
  ADD COLUMN "stageEnteredAt" TIMESTAMP(3);

UPDATE "Candidate"
SET "stageEnteredAt" = "updatedAt";

ALTER TABLE "Candidate"
  ALTER COLUMN "stageEnteredAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "stageEnteredAt" SET NOT NULL;

ALTER TABLE "CandidateActivity"
  ADD COLUMN "fromStage" "CandidateStage",
  ADD COLUMN "toStage" "CandidateStage";

CREATE INDEX "Candidate_tenantId_stageEnteredAt_idx"
  ON "Candidate" ("tenantId", "stageEnteredAt");

CREATE INDEX "CandidateActivity_candidateId_createdAt_idx"
  ON "CandidateActivity" ("candidateId", "createdAt");
