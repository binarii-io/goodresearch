CREATE TABLE "synthesis_published_decks" (
	"project_id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"folder_id" text NOT NULL,
	"study_id" text NOT NULL,
	"link" text NOT NULL,
	"language" text NOT NULL,
	"with_proposed" boolean NOT NULL,
	"fingerprint" text NOT NULL,
	"study_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" text,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "synthesis_published_decks" ADD CONSTRAINT "synthesis_published_decks_project_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synthesis_published_decks" ADD CONSTRAINT "synthesis_published_decks_language_check" CHECK ("language" IN ('en', 'fr'));
