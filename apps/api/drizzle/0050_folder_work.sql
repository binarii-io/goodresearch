-- The assistant works in a study's folder (spec 024): new proposal kinds.
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study', 'propose_interview_guide', 'report_guide_progress', 'report_project_progress', 'report_study_progress', 'load_skill', 'check_guide_questions', 'attach_study', 'detach_study', 'update_study_goal', 'delete_project', 'attach_folder', 'connect_source', 'offer_choices', 'publish_preparation', 'browse_folder', 'read_file', 'propose_folder_changes', 'folder_consent'));
