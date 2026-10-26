CREATE TABLE "transcripts_consents" (
	"account_id" text NOT NULL,
	"study_id" text NOT NULL,
	"provider" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcripts_consents_account_id_study_id_provider_pk" PRIMARY KEY("account_id","study_id","provider")
);
--> statement-breakpoint
CREATE TABLE "transcripts_lexicon_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"team_id" text NOT NULL,
	"started_by" text NOT NULL,
	"sessions" jsonb NOT NULL,
	"phase" text NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"left_out" integer DEFAULT 0 NOT NULL,
	"failure" text,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transcripts_lexicon_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"language" text NOT NULL,
	"form" text NOT NULL,
	"folded_form" text NOT NULL,
	"kind" text NOT NULL,
	"correction" text,
	"category" text NOT NULL,
	"definition" text,
	"status" text NOT NULL,
	"merged_into" text,
	"origin" text NOT NULL,
	"quote" text,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts_occurrences" (
	"term_id" text NOT NULL,
	"spelling" text NOT NULL,
	"session_id" text NOT NULL,
	"study_id" text NOT NULL,
	"count" integer NOT NULL,
	"anchors" jsonb NOT NULL,
	CONSTRAINT "transcripts_occurrences_term_id_spelling_session_id_pk" PRIMARY KEY("term_id","spelling","session_id")
);
--> statement-breakpoint
CREATE TABLE "transcripts_transcripts" (
	"session_id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"file_id" text NOT NULL,
	"file_modified_at" timestamp with time zone,
	"language" text NOT NULL,
	"segments" jsonb NOT NULL,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts_occurrences" ADD CONSTRAINT "transcripts_occurrences_term_id_transcripts_lexicon_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."transcripts_lexicon_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_lexicon_runs_open_idx" ON "transcripts_lexicon_runs" USING btree ("study_id") WHERE "transcripts_lexicon_runs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "transcripts_lexicon_runs_study_idx" ON "transcripts_lexicon_runs" USING btree ("study_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_lexicon_terms_form_idx" ON "transcripts_lexicon_terms" USING btree ("team_id","language","folded_form") WHERE "transcripts_lexicon_terms"."status" <> 'merged';--> statement-breakpoint
CREATE INDEX "transcripts_lexicon_terms_team_idx" ON "transcripts_lexicon_terms" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "transcripts_occurrences_study_idx" ON "transcripts_occurrences" USING btree ("study_id");--> statement-breakpoint
-- Foreign keys to other modules: in SQL only (docs/standards.md §6). A deleted session takes its
-- text and occurrences; a deleted study or team takes what belongs to it.
ALTER TABLE "transcripts_transcripts" ADD CONSTRAINT "transcripts_transcripts_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_transcripts" ADD CONSTRAINT "transcripts_transcripts_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_occurrences" ADD CONSTRAINT "transcripts_occurrences_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_occurrences" ADD CONSTRAINT "transcripts_occurrences_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_terms" ADD CONSTRAINT "transcripts_lexicon_terms_team_fk" FOREIGN KEY ("team_id") REFERENCES "workspace_teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_runs" ADD CONSTRAINT "transcripts_lexicon_runs_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_consents" ADD CONSTRAINT "transcripts_consents_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_terms" ADD CONSTRAINT "transcripts_lexicon_terms_status_check" CHECK ("status" IN ('proposed', 'accepted', 'edited', 'rejected', 'merged'));--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_terms" ADD CONSTRAINT "transcripts_lexicon_terms_kind_check" CHECK ("kind" IN ('domain', 'suspect'));--> statement-breakpoint
ALTER TABLE "transcripts_lexicon_runs" ADD CONSTRAINT "transcripts_lexicon_runs_phase_check" CHECK ("phase" IN ('import', 'candidates', 'ai', 'counting', 'finished'));
