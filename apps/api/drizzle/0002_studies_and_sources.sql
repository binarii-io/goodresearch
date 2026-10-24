CREATE TABLE "research_studies" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_folder_access" (
	"study_id" text NOT NULL,
	"account_id" text NOT NULL,
	"result" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ingestion_folder_access_study_id_account_id_pk" PRIMARY KEY("study_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_inventory_files" (
	"study_id" text NOT NULL,
	"file_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"group_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint,
	"modified_at" timestamp with time zone,
	"web_view_link" text NOT NULL,
	CONSTRAINT "ingestion_inventory_files_study_id_file_id_pk" PRIMARY KEY("study_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"connector" text NOT NULL,
	"code_verifier" text NOT NULL,
	"return_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_source_connections" (
	"account_id" text NOT NULL,
	"connector" text NOT NULL,
	"external_account" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"status" text NOT NULL,
	"connected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ingestion_source_connections_account_id_connector_pk" PRIMARY KEY("account_id","connector")
);
--> statement-breakpoint
CREATE TABLE "ingestion_study_sources" (
	"study_id" text PRIMARY KEY NOT NULL,
	"connector" text NOT NULL,
	"folder_id" text NOT NULL,
	"folder_name" text NOT NULL,
	"owner_name" text,
	"web_view_link" text NOT NULL,
	"attached_by" text,
	"attached_at" timestamp with time zone NOT NULL,
	"inventory_status" text NOT NULL,
	"inventory_started_at" timestamp with time zone,
	"inventory_finished_at" timestamp with time zone,
	"inventory_run_by" text,
	"inventory_progress" jsonb,
	"inventory_failure" text,
	"last_success_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_studies" ADD CONSTRAINT "research_studies_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_studies" ADD CONSTRAINT "research_studies_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_studies_project_updated_idx" ON "research_studies" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "ingestion_inventory_files_kind_idx" ON "ingestion_inventory_files" USING btree ("study_id","kind");