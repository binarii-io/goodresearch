CREATE TABLE "research_test_protocol_versions" (
	"study_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"saved_by" text,
	CONSTRAINT "research_test_protocol_versions_study_id_version_pk" PRIMARY KEY("study_id","version")
);
--> statement-breakpoint
ALTER TABLE "ingestion_inventory_files" ADD COLUMN "duration_ms" bigint;--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD COLUMN "video_file_id" text;--> statement-breakpoint
ALTER TABLE "ingestion_sessions" ADD COLUMN "protocol_version" integer;--> statement-breakpoint
ALTER TABLE "research_test_protocol_versions" ADD CONSTRAINT "research_test_protocol_versions_study_id_research_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_test_protocol_versions" ADD CONSTRAINT "research_test_protocol_versions_saved_by_auth_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_sessions_video_idx" ON "ingestion_sessions" USING btree ("study_id","video_file_id") WHERE "ingestion_sessions"."video_file_id" is not null;--> statement-breakpoint
-- Spec 037: the protocols saved before this migration start their history with their current content.
INSERT INTO "research_test_protocol_versions" ("study_id", "version", "content", "saved_at", "saved_by")
SELECT "study_id", "version" + 1, "content", "updated_at", "updated_by" FROM "research_test_protocols";
