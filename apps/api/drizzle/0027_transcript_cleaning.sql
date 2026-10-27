CREATE TABLE "transcripts_ai_suggestions" (
	"term_id" text NOT NULL,
	"session_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"offset" integer NOT NULL,
	"is_term" boolean NOT NULL,
	"reason" text,
	"run_id" text NOT NULL,
	CONSTRAINT "transcripts_ai_suggestions_term_id_segment_id_offset_pk" PRIMARY KEY("term_id","segment_id","offset")
);
--> statement-breakpoint
CREATE TABLE "transcripts_clean_folders" (
	"study_id" text PRIMARY KEY NOT NULL,
	"folder_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts_clean_publications" (
	"session_id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"web_link" text NOT NULL,
	"version_number" integer NOT NULL,
	"revision" text,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts_clean_versions" (
	"session_id" text NOT NULL,
	"number" integer NOT NULL,
	"segments" jsonb NOT NULL,
	"raw_imported_at" timestamp with time zone NOT NULL,
	"anonymised" boolean NOT NULL,
	"fingerprint" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcripts_clean_versions_session_id_number_pk" PRIMARY KEY("session_id","number")
);
--> statement-breakpoint
CREATE TABLE "transcripts_cleanings" (
	"session_id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"ai_read_segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"anonymised" boolean NOT NULL,
	"last_run_id" text,
	"cleaned_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts_correction_decisions" (
	"session_id" text NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"edited" text,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcripts_correction_decisions_session_id_key_pk" PRIMARY KEY("session_id","key")
);
--> statement-breakpoint
CREATE TABLE "transcripts_correction_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"team_id" text NOT NULL,
	"started_by" text NOT NULL,
	"mode" text NOT NULL,
	"sessions" jsonb NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"left_out" integer DEFAULT 0 NOT NULL,
	"failure" text,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transcripts_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"session_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"target" text NOT NULL,
	"offset" integer NOT NULL,
	"length" integer NOT NULL,
	"original" text NOT NULL,
	"replacement" text NOT NULL,
	"edited" text,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"confidence" text,
	"status" text NOT NULL,
	"run_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts_consents" ADD COLUMN "purpose" text DEFAULT 'lexicon' NOT NULL;--> statement-breakpoint
ALTER TABLE "transcripts_consents" DROP CONSTRAINT "transcripts_consents_account_id_study_id_provider_pk";--> statement-breakpoint
ALTER TABLE "transcripts_consents" ADD CONSTRAINT "transcripts_consents_account_id_study_id_provider_purpose_pk" PRIMARY KEY("account_id","study_id","provider","purpose");--> statement-breakpoint
ALTER TABLE "transcripts_ai_suggestions" ADD CONSTRAINT "transcripts_ai_suggestions_term_id_transcripts_lexicon_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."transcripts_lexicon_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts_ai_suggestions" ADD CONSTRAINT "transcripts_ai_suggestions_session_id_transcripts_transcripts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."transcripts_transcripts"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts_clean_publications" ADD CONSTRAINT "transcripts_clean_publications_session_id_transcripts_transcripts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."transcripts_transcripts"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts_clean_versions" ADD CONSTRAINT "transcripts_clean_versions_session_id_transcripts_transcripts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."transcripts_transcripts"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts_cleanings" ADD CONSTRAINT "transcripts_cleanings_session_id_transcripts_transcripts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."transcripts_transcripts"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts_correction_decisions" ADD CONSTRAINT "transcripts_correction_decisions_session_id_transcripts_transcripts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."transcripts_transcripts"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts_corrections" ADD CONSTRAINT "transcripts_corrections_session_id_transcripts_transcripts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."transcripts_transcripts"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcripts_ai_suggestions_session_idx" ON "transcripts_ai_suggestions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_correction_runs_open_idx" ON "transcripts_correction_runs" USING btree ("study_id") WHERE "transcripts_correction_runs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "transcripts_correction_runs_study_idx" ON "transcripts_correction_runs" USING btree ("study_id","started_at");--> statement-breakpoint
CREATE INDEX "transcripts_corrections_session_idx" ON "transcripts_corrections" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_corrections_same_idx" ON "transcripts_corrections" USING btree ("session_id","segment_id","target","offset","original","replacement");--> statement-breakpoint
-- Foreign keys to another module: in SQL only (docs/standards.md §6).
ALTER TABLE "transcripts_corrections" ADD CONSTRAINT "transcripts_corrections_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_cleanings" ADD CONSTRAINT "transcripts_cleanings_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_clean_folders" ADD CONSTRAINT "transcripts_clean_folders_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_correction_runs" ADD CONSTRAINT "transcripts_correction_runs_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts_corrections" ADD CONSTRAINT "transcripts_corrections_status_check" CHECK ("status" IN ('proposed', 'accepted', 'edited', 'rejected'));--> statement-breakpoint
ALTER TABLE "transcripts_corrections" ADD CONSTRAINT "transcripts_corrections_target_check" CHECK ("target" IN ('text', 'speaker'));--> statement-breakpoint
ALTER TABLE "transcripts_correction_runs" ADD CONSTRAINT "transcripts_correction_runs_mode_check" CHECK ("mode" IN ('lexicon', 'ai'));--> statement-breakpoint
ALTER TABLE "transcripts_consents" ADD CONSTRAINT "transcripts_consents_purpose_check" CHECK ("purpose" IN ('lexicon', 'cleaning'));
