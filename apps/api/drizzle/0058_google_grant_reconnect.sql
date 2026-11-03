ALTER TABLE "ingestion_oauth_states" ADD COLUMN "mode" text DEFAULT 'setup' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_oauth_states" ADD COLUMN "popup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_source_connections" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "ai_oauth_states" ADD COLUMN "mode" text DEFAULT 'setup' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_oauth_states" ADD COLUMN "popup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD COLUMN "grant_problem" text;--> statement-breakpoint
ALTER TABLE "ingestion_oauth_states" ADD CONSTRAINT "ingestion_oauth_states_mode_check" CHECK ("ingestion_oauth_states"."mode" in ('setup', 'reconnect'));--> statement-breakpoint
ALTER TABLE "ingestion_source_connections" ADD CONSTRAINT "ingestion_source_connections_lost_reason_check" CHECK ("ingestion_source_connections"."lost_reason" in ('refused', 'reauth-required', 'unreadable'));--> statement-breakpoint
ALTER TABLE "ai_oauth_states" ADD CONSTRAINT "ai_oauth_states_mode_check" CHECK ("ai_oauth_states"."mode" in ('setup', 'reconnect'));--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_grant_problem_check" CHECK ("ai_provider_connections"."grant_problem" in ('refused', 'reauth-required', 'unreadable'));--> statement-breakpoint
-- Spec 030: Vertex AI grants Google refused before this migration are reconnected like new ones.
UPDATE "ai_provider_connections" SET "grant_problem" = 'refused' WHERE "provider" = 'vertex' AND "status" = 'needs-attention' AND "last_failure" = 'INVALID_CREDENTIAL';--> statement-breakpoint
UPDATE "ingestion_source_connections" SET "lost_reason" = 'refused' WHERE "status" = 'lost';
