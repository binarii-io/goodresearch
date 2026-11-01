ALTER TABLE "research_studies" DROP CONSTRAINT "research_studies_project_id_research_projects_id_fk";
--> statement-breakpoint
DROP INDEX "research_studies_project_updated_idx";--> statement-breakpoint
ALTER TABLE "research_studies" DROP COLUMN "project_id";