-- Domain constraints the ORM schema cannot express.
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_role_check" CHECK ("role" IN ('admin', 'member'));
--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_status_check" CHECK ("status" IN ('active', 'deactivated', 'deleted'));
--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_language_check" CHECK ("language" IN ('en', 'fr'));
--> statement-breakpoint
ALTER TABLE "workspace_access_events" ADD CONSTRAINT "workspace_access_events_type_check" CHECK ("type" IN ('account_created', 'role_changed', 'membership_granted', 'membership_removed', 'deactivated', 'reactivated', 'deleted'));
--> statement-breakpoint
-- Access history is append-only (FR-014a).
CREATE FUNCTION "workspace_access_events_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'workspace_access_events is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "workspace_access_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "workspace_access_events"
  FOR EACH ROW EXECUTE FUNCTION "workspace_access_events_immutable"();
--> statement-breakpoint
-- Cross-module integrity: a team with projects cannot be deleted (FR-022).
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "workspace_teams"("id") ON DELETE RESTRICT;
