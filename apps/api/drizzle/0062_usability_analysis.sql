CREATE TABLE "evidence_usability_supports" (
	"fact_id" text PRIMARY KEY NOT NULL,
	"observation_id" text NOT NULL,
	"quote" text,
	"moment_ms" integer NOT NULL,
	"screenshot_key" text,
	"participant" text,
	CONSTRAINT "evidence_usability_supports_observation_id_unique" UNIQUE("observation_id")
);
--> statement-breakpoint
CREATE TABLE "usability_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"session_id" text NOT NULL,
	"protocol_version" integer NOT NULL,
	"video_file_id" text NOT NULL,
	"video_modified_at" text,
	"video_size" bigint,
	"state" text NOT NULL,
	"stage" text,
	"failure" text,
	"run_id" text,
	"started_by" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usability_analysis_runs" (
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
CREATE TABLE "usability_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"task_id" text,
	"kind" text NOT NULL,
	"moment_ms" integer NOT NULL,
	"text" text NOT NULL,
	"quote" text,
	"seen" text,
	"sus_item" integer,
	"sus_value" integer,
	"screenshot_key" text,
	"judge" text,
	"judge_reason" text,
	"arbiter" text,
	"arbiter_reason" text,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usability_screenshots" (
	"key" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usability_task_results" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"task_id" text NOT NULL,
	"outcome" text NOT NULL,
	"start_ms" integer,
	"end_ms" integer,
	"time_on_task_ms" integer,
	"path" text DEFAULT '' NOT NULL,
	"ease" integer,
	"status" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usability_transcripts" (
	"analysis_id" text PRIMARY KEY NOT NULL,
	"language" text,
	"segments" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_usability_supports" ADD CONSTRAINT "evidence_usability_supports_fact_id_evidence_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "evidence_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usability_analyses_session_idx" ON "usability_analyses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "usability_analyses_study_idx" ON "usability_analyses" USING btree ("study_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usability_analysis_runs_running_idx" ON "usability_analysis_runs" USING btree ("study_id") WHERE "usability_analysis_runs"."state" = 'running';--> statement-breakpoint
CREATE INDEX "usability_observations_analysis_idx" ON "usability_observations" USING btree ("analysis_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usability_task_results_task_idx" ON "usability_task_results" USING btree ("analysis_id","task_id");--> statement-breakpoint
-- Spec 038: foreign keys across modules and checks, hand-written (docs/standards.md §6). An analysis
-- goes with its session and its study; its transcript, task results and observations go with it.
ALTER TABLE "usability_analyses" ADD CONSTRAINT "usability_analyses_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "usability_analyses" ADD CONSTRAINT "usability_analyses_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "usability_analysis_runs" ADD CONSTRAINT "usability_analysis_runs_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "usability_transcripts" ADD CONSTRAINT "usability_transcripts_analysis_fk" FOREIGN KEY ("analysis_id") REFERENCES "usability_analyses"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "usability_task_results" ADD CONSTRAINT "usability_task_results_analysis_fk" FOREIGN KEY ("analysis_id") REFERENCES "usability_analyses"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "usability_observations" ADD CONSTRAINT "usability_observations_analysis_fk" FOREIGN KEY ("analysis_id") REFERENCES "usability_analyses"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "usability_analyses" ADD CONSTRAINT "usability_analyses_state_check" CHECK ("state" IN ('waiting', 'analysing', 'done', 'failed', 'stopped'));
--> statement-breakpoint
ALTER TABLE "usability_analyses" ADD CONSTRAINT "usability_analyses_stage_check" CHECK ("stage" IS NULL OR "stage" IN ('preparing', 'transcript', 'screen-log', 'task-map', 'tasks', 'checks'));
--> statement-breakpoint
ALTER TABLE "usability_analyses" ADD CONSTRAINT "usability_analyses_failure_check" CHECK ("failure" IS NULL OR "failure" IN ('VIDEO_UNREADABLE', 'AI_PROVIDER_REQUIRED', 'MEDIA_NOT_SUPPORTED', 'AI_FAILED', 'STAGING_FAILED', 'STOPPED'));
--> statement-breakpoint
ALTER TABLE "usability_analysis_runs" ADD CONSTRAINT "usability_analysis_runs_state_check" CHECK ("state" IN ('running', 'stopped', 'done'));
--> statement-breakpoint
ALTER TABLE "usability_task_results" ADD CONSTRAINT "usability_task_results_outcome_check" CHECK ("outcome" IN ('success', 'partial', 'failure', 'not-attempted'));
--> statement-breakpoint
ALTER TABLE "usability_task_results" ADD CONSTRAINT "usability_task_results_status_check" CHECK ("status" IN ('proposed', 'accepted', 'edited'));
--> statement-breakpoint
ALTER TABLE "usability_task_results" ADD CONSTRAINT "usability_task_results_limits_check" CHECK (char_length("path") <= 500 AND ("ease" IS NULL OR "ease" BETWEEN 1 AND 7));
--> statement-breakpoint
ALTER TABLE "usability_observations" ADD CONSTRAINT "usability_observations_kind_check" CHECK ("kind" IN ('difficulty', 'error', 'positive', 'verbatim', 'assisted', 'sus-answer'));
--> statement-breakpoint
ALTER TABLE "usability_observations" ADD CONSTRAINT "usability_observations_status_check" CHECK ("status" IN ('proposed', 'accepted', 'edited', 'rejected'));
--> statement-breakpoint
ALTER TABLE "usability_observations" ADD CONSTRAINT "usability_observations_origin_check" CHECK ("origin" IN ('ai', 'person'));
--> statement-breakpoint
ALTER TABLE "usability_observations" ADD CONSTRAINT "usability_observations_verdicts_check" CHECK (("judge" IS NULL OR "judge" IN ('kept', 'not-confirmed', 'rejected')) AND ("arbiter" IS NULL OR "arbiter" IN ('kept', 'rejected')));
--> statement-breakpoint
ALTER TABLE "usability_observations" ADD CONSTRAINT "usability_observations_limits_check" CHECK (char_length("text") BETWEEN 1 AND 400 AND ("quote" IS NULL OR char_length("quote") <= 300) AND "moment_ms" >= 0 AND ("sus_item" IS NULL OR "sus_item" BETWEEN 1 AND 10) AND ("sus_value" IS NULL OR "sus_value" BETWEEN 1 AND 5));
--> statement-breakpoint
-- Spec 038: facts of decided usability observations; like interview facts, they belong to a session.
ALTER TABLE "evidence_facts" DROP CONSTRAINT "evidence_facts_source_check";
--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_source_check" CHECK ("source" IN ('interview', 'survey', 'usability'));
--> statement-breakpoint
ALTER TABLE "evidence_facts" DROP CONSTRAINT "evidence_facts_session_source_check";
--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_session_source_check" CHECK (("source" IN ('interview', 'usability')) = ("session_id" IS NOT NULL));
