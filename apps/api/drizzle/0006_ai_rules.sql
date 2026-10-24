-- AI Gateway rules the ORM schema cannot express (spec 004).
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_provider_check" CHECK ("provider" IN ('vertex', 'anthropic', 'openai', 'fake'));
--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_status_check" CHECK ("status" IN ('working', 'needs-attention'));
--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_vertex_check" CHECK ("provider" <> 'vertex' OR ("gcp_project" IS NOT NULL AND "gcp_region" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_pending_google_grants" ADD CONSTRAINT "ai_pending_google_grants_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_oauth_states" ADD CONSTRAINT "ai_oauth_states_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Usage is kept when an account is anonymised (spec 001): no cascade.
ALTER TABLE "ai_usage_entries" ADD CONSTRAINT "ai_usage_entries_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE NO ACTION;
--> statement-breakpoint
-- The usage ledger is append-only (FR-010).
CREATE FUNCTION "ai_usage_entries_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai_usage_entries is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ai_usage_entries_no_update_delete"
  BEFORE UPDATE OR DELETE ON "ai_usage_entries"
  FOR EACH ROW EXECUTE FUNCTION "ai_usage_entries_immutable"();
