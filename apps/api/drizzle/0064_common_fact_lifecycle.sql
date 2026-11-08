ALTER TABLE "evidence_usability_supports" ALTER COLUMN "observation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_usability_supports" ALTER COLUMN "moment_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_usability_supports" ADD COLUMN "study_id" text;--> statement-breakpoint
ALTER TABLE "evidence_usability_supports" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "evidence_usability_supports" ADD COLUMN "outcomes" jsonb;--> statement-breakpoint
ALTER TABLE "evidence_usability_supports" ADD COLUMN "sessions" integer;--> statement-breakpoint
ALTER TABLE "evidence_usability_supports" ADD COLUMN "figures_changed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_usability_supports_task_idx" ON "evidence_usability_supports" USING btree ("study_id","task_id");--> statement-breakpoint
-- Spec 039: a usability support is an observation's or a task's, never both.
ALTER TABLE "evidence_usability_supports" ADD CONSTRAINT "evidence_usability_supports_kind_check" CHECK (("observation_id" IS NULL) <> ("task_id" IS NULL) AND ("task_id" IS NULL OR ("study_id" IS NOT NULL AND "outcomes" IS NOT NULL AND "sessions" IS NOT NULL)) AND ("observation_id" IS NULL OR "moment_ms" IS NOT NULL));
--> statement-breakpoint
-- Spec 039: a usability task fact belongs to its study, not to a session.
ALTER TABLE "evidence_facts" DROP CONSTRAINT "evidence_facts_session_source_check";
--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_session_source_check" CHECK (("source" = 'interview' AND "session_id" IS NOT NULL) OR ("source" = 'survey' AND "session_id" IS NULL) OR "source" = 'usability');
