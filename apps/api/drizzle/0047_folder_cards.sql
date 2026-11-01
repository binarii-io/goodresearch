-- The assistant proposes a study's folder, or leads to the source's connection (spec 022).
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study', 'propose_interview_guide', 'report_guide_progress', 'report_project_progress', 'report_study_progress', 'load_skill', 'check_guide_questions', 'attach_study', 'detach_study', 'update_study_goal', 'delete_project', 'attach_folder', 'connect_source'));
