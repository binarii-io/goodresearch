CREATE TABLE "ai_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"code_verifier" text NOT NULL,
	"return_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_pending_google_grants" (
	"account_id" text PRIMARY KEY NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"google_account" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_connections" (
	"account_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"encrypted_credential" text NOT NULL,
	"credential_hint" text,
	"google_account" text,
	"gcp_project" text,
	"gcp_region" text,
	"status" text NOT NULL,
	"last_failure" text,
	"last_checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_usage_entries_account_idx" ON "ai_usage_entries" USING btree ("account_id","created_at");