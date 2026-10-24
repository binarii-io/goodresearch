-- The assistant can open a project or a study page (spec 005 US5).
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study'));
