CREATE TABLE "ingestion_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"transcript_file_id" text NOT NULL,
	"media" jsonb NOT NULL,
	"media_edited" boolean DEFAULT false NOT NULL,
	"state" text NOT NULL,
	"excluded_reason" text,
	"title" text,
	"planned_interview_id" text,
	"linked_by" text,
	"roster" jsonb NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_sessions_transcript_idx" ON "ingestion_sessions" USING btree ("study_id","transcript_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_sessions_planned_idx" ON "ingestion_sessions" USING btree ("study_id","planned_interview_id") WHERE "ingestion_sessions"."planned_interview_id" is not null;--> statement-breakpoint
CREATE INDEX "ingestion_sessions_state_idx" ON "ingestion_sessions" USING btree ("study_id","state");--> statement-breakpoint
-- Foreign key to another module: in SQL only (docs/standards.md §6). A deleted study takes its sessions.
ALTER TABLE "ingestion_sessions" ADD CONSTRAINT "ingestion_sessions_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD CONSTRAINT "ingestion_sessions_state_check" CHECK ("state" IN ('proposed', 'validated', 'excluded'));
