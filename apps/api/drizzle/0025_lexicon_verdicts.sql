CREATE TABLE "transcripts_verdicts" (
	"term_id" text NOT NULL,
	"session_id" text NOT NULL,
	"study_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"offset" integer NOT NULL,
	"verdict" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcripts_verdicts_term_id_segment_id_offset_pk" PRIMARY KEY("term_id","segment_id","offset")
);
--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_terms" ADD COLUMN "scope" text DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_terms" ADD COLUMN "scope_decided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transcripts_verdicts" ADD CONSTRAINT "transcripts_verdicts_term_id_transcripts_lexicon_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."transcripts_lexicon_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcripts_verdicts_study_idx" ON "transcripts_verdicts" USING btree ("study_id");--> statement-breakpoint
-- Foreign keys to another module: in SQL only (docs/standards.md §6).
ALTER TABLE "transcripts_verdicts" ADD CONSTRAINT "transcripts_verdicts_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_verdicts" ADD CONSTRAINT "transcripts_verdicts_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_verdicts" ADD CONSTRAINT "transcripts_verdicts_verdict_check" CHECK ("verdict" IN ('yes', 'no'));--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_terms" ADD CONSTRAINT "transcripts_lexicon_terms_scope_check" CHECK ("scope" IN ('global', 'case-by-case'));--> statement-breakpoint
-- Terms found before scopes existed: case by case when a spelling has 3 letters or less.
UPDATE "transcripts_lexicon_terms" SET "scope" = 'case-by-case' WHERE char_length("form") <= 3 OR EXISTS (SELECT 1 FROM jsonb_array_elements("variants") v WHERE v->>'status' <> 'rejected' AND char_length(v->>'spelling') <= 3);
