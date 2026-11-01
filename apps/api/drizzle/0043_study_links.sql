-- Spec 019: a study belongs to a team and has its own goal, and feeds zero or more projects.
ALTER TABLE "research_studies" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "research_studies" ADD COLUMN "goal" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "research_studies" s SET "team_id" = p."team_id", "goal" = p."goal" FROM "research_projects" p WHERE p."id" = s."project_id";--> statement-breakpoint
ALTER TABLE "research_studies" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
-- A team with studies cannot be deleted, as for projects (0001): this key stays out of the ORM schema.
ALTER TABLE "research_studies" ADD CONSTRAINT "research_studies_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "workspace_teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "research_studies" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
CREATE TABLE "research_study_projects" (
	"study_id" text NOT NULL,
	"project_id" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "research_study_projects_study_id_project_id_pk" PRIMARY KEY("study_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "research_study_projects" ADD CONSTRAINT "research_study_projects_study_id_research_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_study_projects" ADD CONSTRAINT "research_study_projects_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "research_study_projects" ("study_id", "project_id", "linked_at") SELECT "id", "project_id", "created_at" FROM "research_studies";--> statement-breakpoint
CREATE INDEX "research_study_projects_project_idx" ON "research_study_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "research_studies_team_updated_idx" ON "research_studies" USING btree ("team_id","updated_at");--> statement-breakpoint
-- The assistant proposes attaching, detaching and changing a study's goal.
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_kind_check";--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study', 'open_project', 'open_study', 'propose_interview_guide', 'report_guide_progress', 'report_project_progress', 'load_skill', 'check_guide_questions', 'attach_study', 'detach_study', 'update_study_goal'));
