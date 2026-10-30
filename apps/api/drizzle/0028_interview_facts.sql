CREATE TABLE "evidence_consents" (
	"account_id" text NOT NULL,
	"study_id" text NOT NULL,
	"provider" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	CONSTRAINT "evidence_consents_account_id_study_id_pk" PRIMARY KEY("account_id","study_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_fact_verbatims" (
	"fact_id" text NOT NULL,
	"verbatim_id" text NOT NULL,
	CONSTRAINT "evidence_fact_verbatims_fact_id_verbatim_id_pk" PRIMARY KEY("fact_id","verbatim_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"study_id" text NOT NULL,
	"statement_en" text NOT NULL,
	"statement_fr" text NOT NULL,
	"translation" text DEFAULT 'done' NOT NULL,
	"polarity" text NOT NULL,
	"theme_id" text,
	"theme_title" text,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"run_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_readings" (
	"session_id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"run_id" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"raw_imported_at" timestamp with time zone NOT NULL,
	"text_analysed" text NOT NULL,
	"anonymised" boolean NOT NULL,
	"fingerprint" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"team_id" text NOT NULL,
	"started_by" text NOT NULL,
	"sessions" jsonb NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"left_out" jsonb DEFAULT '{"verbatims":0,"facts":0}'::jsonb NOT NULL,
	"failure" text,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence_speakers" (
	"session_id" text NOT NULL,
	"speaker" text NOT NULL,
	"participant" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "evidence_speakers_session_id_speaker_pk" PRIMARY KEY("session_id","speaker")
);
--> statement-breakpoint
CREATE TABLE "evidence_verbatims" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"study_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"offset" integer NOT NULL,
	"length" integer NOT NULL,
	"text" text NOT NULL,
	"speaker" text,
	"participant" text,
	"reason" text,
	"origin" text NOT NULL,
	"run_id" text,
	"set_aside" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_studies" ADD COLUMN "text_analysed" text DEFAULT 'with-corrections' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_fact_verbatims" ADD CONSTRAINT "evidence_fact_verbatims_fact_id_evidence_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "evidence_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_fact_verbatims" ADD CONSTRAINT "evidence_fact_verbatims_verbatim_id_evidence_verbatims_id_fk" FOREIGN KEY ("verbatim_id") REFERENCES "evidence_verbatims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_fact_verbatims_verbatim_idx" ON "evidence_fact_verbatims" USING btree ("verbatim_id");--> statement-breakpoint
CREATE INDEX "evidence_facts_session_idx" ON "evidence_facts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "evidence_facts_study_idx" ON "evidence_facts" USING btree ("study_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_runs_open_idx" ON "evidence_runs" USING btree ("study_id") WHERE "evidence_runs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "evidence_runs_study_idx" ON "evidence_runs" USING btree ("study_id","started_at");--> statement-breakpoint
CREATE INDEX "evidence_verbatims_session_idx" ON "evidence_verbatims" USING btree ("session_id","segment_id");--> statement-breakpoint
-- Foreign keys to another module: in SQL only (docs/standards.md §6).
ALTER TABLE "evidence_runs" ADD CONSTRAINT "evidence_runs_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evidence_readings" ADD CONSTRAINT "evidence_readings_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evidence_verbatims" ADD CONSTRAINT "evidence_verbatims_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evidence_speakers" ADD CONSTRAINT "evidence_speakers_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evidence_consents" ADD CONSTRAINT "evidence_consents_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_status_check" CHECK ("status" IN ('proposed', 'accepted', 'edited', 'rejected'));--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_polarity_check" CHECK ("polarity" IN ('positive', 'negative', 'neutral'));--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_origin_check" CHECK ("origin" IN ('ai', 'person'));--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_translation_check" CHECK ("translation" IN ('done', 'translating', 'not-translated'));--> statement-breakpoint
ALTER TABLE "evidence_verbatims" ADD CONSTRAINT "evidence_verbatims_origin_check" CHECK ("origin" IN ('ai', 'person'));--> statement-breakpoint
ALTER TABLE "research_studies" ADD CONSTRAINT "research_studies_text_analysed_check" CHECK ("text_analysed" IN ('with-corrections', 'clean-only'));
