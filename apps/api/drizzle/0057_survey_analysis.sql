CREATE TABLE "evidence_survey_supports" (
	"fact_id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"figure" jsonb,
	"theme_id" text,
	"theme_share" jsonb,
	"quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kept_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "surveys_theme_answers" (
	"theme_id" text NOT NULL,
	"study_id" text NOT NULL,
	"item_id" text NOT NULL,
	"source_id" text NOT NULL,
	"quote" text,
	CONSTRAINT "surveys_theme_answers_theme_id_source_id_pk" PRIMARY KEY("theme_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "surveys_theme_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"item_id" text NOT NULL,
	"state" text NOT NULL,
	"parts" integer NOT NULL,
	"parts_done" integer DEFAULT 0 NOT NULL,
	"answers_sent" integer DEFAULT 0 NOT NULL,
	"left_out" integer DEFAULT 0 NOT NULL,
	"dropped_quotes" integer DEFAULT 0 NOT NULL,
	"dropped_themes" integer DEFAULT 0 NOT NULL,
	"failure" text,
	"started_by" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "surveys_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"item_id" text NOT NULL,
	"label_en" text NOT NULL,
	"label_fr" text NOT NULL,
	"description_en" text NOT NULL,
	"description_fr" text NOT NULL,
	"translation" text DEFAULT 'done' NOT NULL,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"merged_into" text,
	"version" integer DEFAULT 1 NOT NULL,
	"run_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_facts" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD COLUMN "source" text DEFAULT 'interview' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_survey_supports" ADD CONSTRAINT "evidence_survey_supports_fact_id_evidence_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "evidence_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys_theme_answers" ADD CONSTRAINT "surveys_theme_answers_theme_id_surveys_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "surveys_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_theme_answers_one_idx" ON "surveys_theme_answers" USING btree ("study_id","item_id","source_id");--> statement-breakpoint
CREATE INDEX "surveys_theme_runs_item_idx" ON "surveys_theme_runs" USING btree ("study_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_theme_runs_live_idx" ON "surveys_theme_runs" USING btree ("study_id") WHERE "surveys_theme_runs"."state" = 'running';--> statement-breakpoint
CREATE INDEX "surveys_themes_item_idx" ON "surveys_themes" USING btree ("study_id","item_id","status");--> statement-breakpoint
CREATE INDEX "evidence_facts_study_source_idx" ON "evidence_facts" USING btree ("study_id","source","status");--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_source_check" CHECK ("source" IN ('interview', 'survey'));
--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_session_source_check" CHECK (("source" = 'interview') = ("session_id" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "evidence_survey_supports" ADD CONSTRAINT "evidence_survey_supports_kind_check" CHECK ("kind" IN ('figure', 'theme'));
--> statement-breakpoint
ALTER TABLE "surveys_themes" ADD CONSTRAINT "surveys_themes_status_check" CHECK ("status" IN ('proposed', 'accepted', 'rejected'));
--> statement-breakpoint
ALTER TABLE "surveys_themes" ADD CONSTRAINT "surveys_themes_origin_check" CHECK ("origin" IN ('ai', 'person'));
--> statement-breakpoint
ALTER TABLE "surveys_themes" ADD CONSTRAINT "surveys_themes_translation_check" CHECK ("translation" IN ('done', 'translating', 'not-translated'));
--> statement-breakpoint
ALTER TABLE "surveys_theme_runs" ADD CONSTRAINT "surveys_theme_runs_state_check" CHECK ("state" IN ('running', 'done', 'failed', 'stopped'));
--> statement-breakpoint
ALTER TABLE "surveys_themes" ADD CONSTRAINT "surveys_themes_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "surveys_theme_runs" ADD CONSTRAINT "surveys_theme_runs_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study', 'propose_interview_guide', 'report_guide_progress', 'report_project_progress', 'report_study_progress', 'load_skill', 'check_guide_questions', 'attach_study', 'detach_study', 'update_study_goal', 'delete_project', 'attach_folder', 'connect_source', 'offer_choices', 'publish_preparation', 'browse_folder', 'read_file', 'propose_folder_changes', 'folder_consent', 'find_files', 'count_interviews', 'list_interviews', 'propose_analysis', 'propose_accepting_suggestions', 'propose_validating_interviews', 'propose_excluding_interviews', 'propose_questionnaire', 'report_questionnaire_progress', 'check_questionnaire_items', 'count_responses', 'propose_opening_form', 'propose_closing_form', 'propose_target_rule', 'survey_analysis_state', 'read_figures', 'propose_survey_facts', 'propose_theme_analysis'));
