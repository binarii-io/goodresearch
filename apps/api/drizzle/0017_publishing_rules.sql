-- Publishing rules the ORM schema does not express (spec 007).
ALTER TABLE "publishing_documents" ADD CONSTRAINT "publishing_documents_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD CONSTRAINT "publishing_documents_published_by_fk" FOREIGN KEY ("published_by") REFERENCES "auth_users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD CONSTRAINT "publishing_documents_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "auth_users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "publishing_changes" ADD CONSTRAINT "publishing_changes_decided_by_fk" FOREIGN KEY ("decided_by") REFERENCES "auth_users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD CONSTRAINT "publishing_documents_kind_check" CHECK ("kind" IN ('guide', 'best-practices', 'schedule'));
--> statement-breakpoint
ALTER TABLE "publishing_documents" ADD CONSTRAINT "publishing_documents_state_check" CHECK ("state" IN ('in-sync', 'out-of-date', 'changed-in-drive', 'conflict', 'unavailable'));
--> statement-breakpoint
ALTER TABLE "publishing_changes" ADD CONSTRAINT "publishing_changes_decision_check" CHECK ("decision" IN ('pending', 'accepted', 'rejected'));
--> statement-breakpoint
ALTER TABLE "ingestion_source_connections" ADD CONSTRAINT "ingestion_source_connections_access_check" CHECK ("access" IN ('read', 'write'));
--> statement-breakpoint
-- Drive changes a person accepted (spec 007).
ALTER TABLE "research_interview_guides" DROP CONSTRAINT "research_interview_guides_origin_check";
--> statement-breakpoint
ALTER TABLE "research_interview_guides" ADD CONSTRAINT "research_interview_guides_origin_check" CHECK ("origin" IN ('assistant', 'person', 'drive'));
