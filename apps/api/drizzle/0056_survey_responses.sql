CREATE TABLE "surveys_item_wordings" (
	"study_id" text NOT NULL,
	"item_id" text NOT NULL,
	"text" text NOT NULL,
	"until" timestamp with time zone NOT NULL,
	CONSTRAINT "surveys_item_wordings_study_id_item_id_until_pk" PRIMARY KEY("study_id","item_id","until")
);
--> statement-breakpoint
CREATE TABLE "surveys_readings" (
	"study_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"read_by" text,
	"unknown_questions" integer NOT NULL,
	"unknown_values" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys_responses" (
	"study_id" text NOT NULL,
	"source_id" text NOT NULL,
	"form_file_id" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"consent" text NOT NULL,
	"answers" jsonb NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "surveys_responses_study_id_source_id_pk" PRIMARY KEY("study_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "surveys_target_rules" (
	"study_id" text PRIMARY KEY NOT NULL,
	"accepted" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"origin" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD COLUMN "responder_link" text;--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD COLUMN "opened_by" text;--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "surveys_responses_form_idx" ON "surveys_responses" USING btree ("study_id","form_file_id","submitted_at");--> statement-breakpoint
ALTER TABLE "surveys_responses" ADD CONSTRAINT "surveys_responses_consent_check" CHECK ("consent" IN ('given', 'refused'));
--> statement-breakpoint
ALTER TABLE "surveys_readings" ADD CONSTRAINT "surveys_readings_status_check" CHECK ("status" IN ('done', 'failed', 'stopped'));
--> statement-breakpoint
ALTER TABLE "surveys_target_rules" ADD CONSTRAINT "surveys_target_rules_origin_check" CHECK ("origin" IN ('person', 'assistant'));
--> statement-breakpoint
ALTER TABLE "surveys_responses" ADD CONSTRAINT "surveys_responses_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "surveys_readings" ADD CONSTRAINT "surveys_readings_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "surveys_target_rules" ADD CONSTRAINT "surveys_target_rules_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "surveys_item_wordings" ADD CONSTRAINT "surveys_item_wordings_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study', 'propose_interview_guide', 'report_guide_progress', 'report_project_progress', 'report_study_progress', 'load_skill', 'check_guide_questions', 'attach_study', 'detach_study', 'update_study_goal', 'delete_project', 'attach_folder', 'connect_source', 'offer_choices', 'publish_preparation', 'browse_folder', 'read_file', 'propose_folder_changes', 'folder_consent', 'find_files', 'count_interviews', 'list_interviews', 'propose_analysis', 'propose_accepting_suggestions', 'propose_validating_interviews', 'propose_excluding_interviews', 'propose_questionnaire', 'report_questionnaire_progress', 'check_questionnaire_items', 'count_responses', 'propose_opening_form', 'propose_closing_form', 'propose_target_rule'));
