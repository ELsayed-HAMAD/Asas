-- A quiet-hours window must not collapse into a full-day mute. The API validates the merged
-- window, but a concurrent partial update could otherwise produce equal start/end values.
-- Existing rows are preserved; NOT VALID enforces the check for new inserts and updates.
ALTER TABLE "QuietHours"
  ADD CONSTRAINT "QuietHours_start_end_distinct" CHECK ("start" <> "end") NOT VALID;
