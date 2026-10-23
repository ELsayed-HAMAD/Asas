-- Deal history also records value and owner snapshots. Those events may keep the same stage.
-- Preserve existing history while allowing the application to record these real changes.
ALTER TABLE "DealStageHistory"
  DROP CONSTRAINT IF EXISTS "DealStageHistory_stage_change_check";
