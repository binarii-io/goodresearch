ALTER TABLE "ai_usage_entries" ADD COLUMN "ref" text;--> statement-breakpoint
CREATE INDEX "ai_usage_entries_ref_idx" ON "ai_usage_entries" USING btree ("account_id","ref");