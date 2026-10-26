-- Spec 009 FR-020: a person validates every interview. Interviews validated by the app (no person
-- decided them) go back to "to decide".
UPDATE "ingestion_sessions" SET "state" = 'proposed', "decided_at" = NULL WHERE "state" = 'validated' AND "decided_by" IS NULL;
