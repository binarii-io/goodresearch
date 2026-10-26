ALTER TABLE "transcripts_transcripts" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
-- Interviews of readings that went through to the end (not stopped, no AI failure) stay read.
UPDATE "transcripts_transcripts" t SET "read_at" = t."imported_at" WHERE EXISTS (SELECT 1 FROM "transcripts_lexicon_runs" r, jsonb_array_elements(r."sessions") s WHERE r."finished_at" IS NOT NULL AND r."failure" IS NULL AND NOT r."stop_requested" AND r."phase" = 'finished' AND s->>'sessionId' = t."session_id" AND s->>'state' = 'done');
