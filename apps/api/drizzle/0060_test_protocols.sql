CREATE TABLE "research_protocol_checks" (
	"study_id" text NOT NULL,
	"kind" text NOT NULL,
	"protocol_version" integer NOT NULL,
	"marked_by" text,
	"marked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "research_protocol_checks_study_id_kind_pk" PRIMARY KEY("study_id","kind")
);
--> statement-breakpoint
CREATE TABLE "research_test_protocols" (
	"study_id" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"origin" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_protocol_checks" ADD CONSTRAINT "research_protocol_checks_study_id_research_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_protocol_checks" ADD CONSTRAINT "research_protocol_checks_marked_by_auth_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_test_protocols" ADD CONSTRAINT "research_test_protocols_study_id_research_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_test_protocols" ADD CONSTRAINT "research_test_protocols_updated_by_auth_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_test_protocols" ADD CONSTRAINT "research_test_protocols_origin_check" CHECK ("origin" IN ('assistant', 'person', 'drive'));
--> statement-breakpoint
ALTER TABLE "research_protocol_checks" ADD CONSTRAINT "research_protocol_checks_kind_check" CHECK ("kind" IN ('pilot', 'interface', 'review'));
--> statement-breakpoint
ALTER TABLE "research_studies" DROP CONSTRAINT "research_studies_type_check";
--> statement-breakpoint
ALTER TABLE "research_studies" ADD CONSTRAINT "research_studies_type_check" CHECK ("type" IN ('interviews', 'survey', 'usability-test'));
--> statement-breakpoint
ALTER TABLE "publishing_documents" DROP CONSTRAINT "publishing_documents_kind_check";
--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD CONSTRAINT "publishing_documents_kind_check" CHECK ("kind" IN ('guide', 'best-practices', 'schedule', 'questionnaire', 'protocol', 'participant-sheet'));
--> statement-breakpoint
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study', 'propose_interview_guide', 'report_guide_progress', 'report_project_progress', 'report_study_progress', 'load_skill', 'check_guide_questions', 'attach_study', 'detach_study', 'update_study_goal', 'delete_project', 'attach_folder', 'connect_source', 'offer_choices', 'publish_preparation', 'browse_folder', 'read_file', 'propose_folder_changes', 'folder_consent', 'find_files', 'count_interviews', 'list_interviews', 'propose_analysis', 'propose_accepting_suggestions', 'propose_validating_interviews', 'propose_excluding_interviews', 'propose_questionnaire', 'report_questionnaire_progress', 'check_questionnaire_items', 'count_responses', 'propose_opening_form', 'propose_closing_form', 'propose_target_rule', 'survey_analysis_state', 'read_figures', 'propose_survey_facts', 'propose_theme_analysis', 'propose_protocol', 'report_protocol_progress', 'check_protocol_tasks'));
