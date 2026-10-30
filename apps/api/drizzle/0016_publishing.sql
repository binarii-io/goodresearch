CREATE TABLE "publishing_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"item_key" text NOT NULL,
	"kind" text NOT NULL,
	"base" jsonb,
	"app" jsonb,
	"drive" jsonb,
	"decision" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publishing_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"kind" text NOT NULL,
	"file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"web_link" text NOT NULL,
	"language" text NOT NULL,
	"time_zone" text,
	"base" jsonb NOT NULL,
	"base_version" integer NOT NULL,
	"base_revision" text,
	"drive" jsonb,
	"checked_version" integer,
	"checked_revision" text,
	"app_version" integer,
	"state" text NOT NULL,
	"unavailable_reason" text,
	"last_checked_at" timestamp with time zone,
	"last_editor" text,
	"published_by" text,
	"published_at" timestamp with time zone NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publishing_changes" ADD CONSTRAINT "publishing_changes_publication_id_publishing_documents_id_fk" FOREIGN KEY ("publication_id") REFERENCES "publishing_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publishing_changes_publication_idx" ON "publishing_changes" USING btree ("publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_documents_study_kind_idx" ON "publishing_documents" USING btree ("study_id","kind");