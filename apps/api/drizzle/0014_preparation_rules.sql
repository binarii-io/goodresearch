-- Preparation rules the ORM schema does not express (spec 006).
ALTER TABLE "research_interview_guides" ADD CONSTRAINT "research_interview_guides_origin_check" CHECK ("origin" IN ('assistant', 'person'));
--> statement-breakpoint
ALTER TABLE "research_planned_interviews" ADD CONSTRAINT "research_planned_interviews_status_check" CHECK ("status" IN ('to-contact', 'invited', 'scheduled', 'done', 'postponed', 'cancelled'));
--> statement-breakpoint
-- The assistant proposes an interview guide, reports the design progress, loads skills and
-- checks question wordings.
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study', 'propose_interview_guide', 'report_guide_progress', 'load_skill', 'check_guide_questions'));
