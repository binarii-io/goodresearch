-- Spec 008: an interview with its transcript is validated by the app (decided_by stays empty) until
-- a person decides. Sessions proposed so far with a transcript and no decision are validated now.
UPDATE "ingestion_sessions" SET "state" = 'validated', "decided_at" = "updated_at"
WHERE "state" = 'proposed' AND "transcript_file_id" IS NOT NULL AND "decided_by" IS NULL;
