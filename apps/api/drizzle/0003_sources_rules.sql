-- Cross-module integrity (docs/standards.md §6) and value constraints for spec 002.
ALTER TABLE "ingestion_study_sources" ADD CONSTRAINT "ingestion_study_sources_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ingestion_inventory_files" ADD CONSTRAINT "ingestion_inventory_files_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ingestion_folder_access" ADD CONSTRAINT "ingestion_folder_access_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ingestion_folder_access" ADD CONSTRAINT "ingestion_folder_access_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ingestion_source_connections" ADD CONSTRAINT "ingestion_source_connections_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ingestion_oauth_states" ADD CONSTRAINT "ingestion_oauth_states_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "research_studies" ADD CONSTRAINT "research_studies_type_check" CHECK ("type" IN ('interviews'));
--> statement-breakpoint
ALTER TABLE "ingestion_source_connections" ADD CONSTRAINT "ingestion_source_connections_status_check" CHECK ("status" IN ('connected', 'lost'));
--> statement-breakpoint
ALTER TABLE "ingestion_study_sources" ADD CONSTRAINT "ingestion_study_sources_status_check" CHECK ("inventory_status" IN ('never', 'running', 'done', 'failed'));
--> statement-breakpoint
ALTER TABLE "ingestion_inventory_files" ADD CONSTRAINT "ingestion_inventory_files_kind_check" CHECK ("kind" IN ('transcript', 'media', 'other'));
--> statement-breakpoint
ALTER TABLE "ingestion_folder_access" ADD CONSTRAINT "ingestion_folder_access_result_check" CHECK ("result" IN ('granted', 'denied'));
