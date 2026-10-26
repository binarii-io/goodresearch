CREATE TABLE "ingestion_analysis_consents" (
	"account_id" text NOT NULL,
	"study_id" text NOT NULL,
	"provider" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ingestion_analysis_consents_account_id_study_id_provider_pk" PRIMARY KEY("account_id","study_id","provider")
);
--> statement-breakpoint
CREATE TABLE "ingestion_analysis_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"started_by" text NOT NULL,
	"session_ids" jsonb NOT NULL,
	"state" text NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingestion_pseudonyms" (
	"study_id" text NOT NULL,
	"name_key" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ingestion_pseudonyms_study_id_name_key_pk" PRIMARY KEY("study_id","name_key")
);
--> statement-breakpoint
ALTER TABLE "research_studies" ADD COLUMN "anonymised" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD COLUMN "interview_date" date;--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_analysis_runs_running_idx" ON "ingestion_analysis_runs" USING btree ("study_id") WHERE "ingestion_analysis_runs"."state" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_pseudonyms_code_idx" ON "ingestion_pseudonyms" USING btree ("study_id","code");--> statement-breakpoint
-- Foreign keys to another module: in SQL only (docs/standards.md §6). A deleted study takes them.
ALTER TABLE "ingestion_analysis_runs" ADD CONSTRAINT "ingestion_analysis_runs_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ingestion_pseudonyms" ADD CONSTRAINT "ingestion_pseudonyms_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ingestion_analysis_consents" ADD CONSTRAINT "ingestion_analysis_consents_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ingestion_analysis_runs" ADD CONSTRAINT "ingestion_analysis_runs_state_check" CHECK ("state" IN ('running', 'stopped', 'done'));--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD CONSTRAINT "ingestion_sessions_language_check" CHECK ("language" IN ('en', 'fr', 'other'));
