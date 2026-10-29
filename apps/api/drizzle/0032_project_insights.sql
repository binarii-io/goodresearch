CREATE TABLE "synthesis_consents" (
	"account_id" text NOT NULL,
	"project_id" text NOT NULL,
	"provider" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	CONSTRAINT "synthesis_consents_account_id_project_id_pk" PRIMARY KEY("account_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "synthesis_insight_facts" (
	"insight_id" text NOT NULL,
	"fact_id" text NOT NULL,
	"role" text NOT NULL,
	"state" text NOT NULL,
	"origin" text NOT NULL,
	"fact_version" integer NOT NULL,
	"fact_polarity" text NOT NULL,
	"fact_theme_id" text,
	"fact_statement_en" text NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "synthesis_insight_facts_insight_id_fact_id_pk" PRIMARY KEY("insight_id","fact_id")
);
--> statement-breakpoint
CREATE TABLE "synthesis_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"theme_key" text NOT NULL,
	"theme_title" text,
	"statement_en" text NOT NULL,
	"statement_fr" text NOT NULL,
	"description_en" text NOT NULL,
	"description_fr" text NOT NULL,
	"counter_en" text NOT NULL,
	"counter_fr" text NOT NULL,
	"minority_en" text NOT NULL,
	"minority_fr" text NOT NULL,
	"translation" text DEFAULT 'done' NOT NULL,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"run_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthesis_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"team_id" text NOT NULL,
	"started_by" text NOT NULL,
	"study_ids" jsonb NOT NULL,
	"scope" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"calls_done" integer DEFAULT 0 NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"left_out" integer DEFAULT 0 NOT NULL,
	"failure" text,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "synthesis_insight_facts" ADD CONSTRAINT "synthesis_insight_facts_insight_id_synthesis_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."synthesis_insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "synthesis_insight_facts_fact_idx" ON "synthesis_insight_facts" USING btree ("fact_id");--> statement-breakpoint
CREATE INDEX "synthesis_insights_project_idx" ON "synthesis_insights" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_runs_open_idx" ON "synthesis_runs" USING btree ("project_id") WHERE "synthesis_runs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "synthesis_runs_project_idx" ON "synthesis_runs" USING btree ("project_id","started_at");--> statement-breakpoint
ALTER TABLE "synthesis_runs" ADD CONSTRAINT "synthesis_runs_project_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synthesis_insights" ADD CONSTRAINT "synthesis_insights_project_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synthesis_consents" ADD CONSTRAINT "synthesis_consents_project_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synthesis_runs" ADD CONSTRAINT "synthesis_runs_scope_check" CHECK ("scope" IN ('all', 'unlinked'));--> statement-breakpoint
ALTER TABLE "synthesis_insights" ADD CONSTRAINT "synthesis_insights_status_check" CHECK ("status" IN ('proposed', 'validated', 'edited', 'rejected'));--> statement-breakpoint
ALTER TABLE "synthesis_insights" ADD CONSTRAINT "synthesis_insights_origin_check" CHECK ("origin" IN ('ai', 'person'));--> statement-breakpoint
ALTER TABLE "synthesis_insights" ADD CONSTRAINT "synthesis_insights_translation_check" CHECK ("translation" IN ('done', 'translating', 'not-translated'));--> statement-breakpoint
ALTER TABLE "synthesis_insights" ADD CONSTRAINT "synthesis_insights_lengths_check" CHECK (char_length("statement_en") <= 200 AND char_length("statement_fr") <= 200 AND char_length("description_en") <= 1000 AND char_length("description_fr") <= 1000 AND char_length("counter_en") <= 500 AND char_length("counter_fr") <= 500 AND char_length("minority_en") <= 500 AND char_length("minority_fr") <= 500);--> statement-breakpoint
ALTER TABLE "synthesis_insight_facts" ADD CONSTRAINT "synthesis_insight_facts_role_check" CHECK ("role" IN ('support', 'counter'));--> statement-breakpoint
ALTER TABLE "synthesis_insight_facts" ADD CONSTRAINT "synthesis_insight_facts_state_check" CHECK ("state" IN ('counted', 'suggested', 'unlinked'));--> statement-breakpoint
ALTER TABLE "synthesis_insight_facts" ADD CONSTRAINT "synthesis_insight_facts_origin_check" CHECK ("origin" IN ('ai', 'person'));
