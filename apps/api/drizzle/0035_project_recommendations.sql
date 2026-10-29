CREATE TABLE "synthesis_recommendation_insights" (
	"recommendation_id" text NOT NULL,
	"insight_id" text NOT NULL,
	"state" text NOT NULL,
	"origin" text NOT NULL,
	"insight_statement_en" text NOT NULL,
	"insight_theme_key" text NOT NULL,
	"insight_level" text NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "synthesis_recommendation_insights_recommendation_id_insight_id_pk" PRIMARY KEY("recommendation_id","insight_id")
);
--> statement-breakpoint
CREATE TABLE "synthesis_recommendation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"team_id" text NOT NULL,
	"started_by" text NOT NULL,
	"with_proposed" boolean DEFAULT false NOT NULL,
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
CREATE TABLE "synthesis_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"action_en" text NOT NULL,
	"action_fr" text NOT NULL,
	"rationale_en" text NOT NULL,
	"rationale_fr" text NOT NULL,
	"measure_en" text NOT NULL,
	"measure_fr" text NOT NULL,
	"kind" text NOT NULL,
	"impact" text NOT NULL,
	"effort" text NOT NULL,
	"owner" text,
	"translation" text DEFAULT 'done' NOT NULL,
	"pending_translation" jsonb,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"run_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthesis_takeaways" (
	"project_id" text PRIMARY KEY NOT NULL,
	"text_en" text DEFAULT '' NOT NULL,
	"text_fr" text DEFAULT '' NOT NULL,
	"translation" text DEFAULT 'done' NOT NULL,
	"pending_translation" jsonb,
	"saved_by" text,
	"saved_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"saved_over" jsonb,
	"draft_en" text,
	"draft_fr" text,
	"draft_state" text DEFAULT 'none' NOT NULL,
	"draft_by" text,
	"draft_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "synthesis_recommendation_insights" ADD CONSTRAINT "synthesis_recommendation_insights_recommendation_id_synthesis_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."synthesis_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "synthesis_recommendation_insights_insight_idx" ON "synthesis_recommendation_insights" USING btree ("insight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_recommendation_runs_open_idx" ON "synthesis_recommendation_runs" USING btree ("project_id") WHERE "synthesis_recommendation_runs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "synthesis_recommendation_runs_project_idx" ON "synthesis_recommendation_runs" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE INDEX "synthesis_recommendations_project_idx" ON "synthesis_recommendations" USING btree ("project_id","status");--> statement-breakpoint
ALTER TABLE "synthesis_recommendation_runs" ADD CONSTRAINT "synthesis_recommendation_runs_project_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synthesis_recommendations" ADD CONSTRAINT "synthesis_recommendations_project_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synthesis_takeaways" ADD CONSTRAINT "synthesis_takeaways_project_fk" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synthesis_recommendations" ADD CONSTRAINT "synthesis_recommendations_kind_check" CHECK ("kind" IN ('build', 'test', 'investigate'));--> statement-breakpoint
ALTER TABLE "synthesis_recommendations" ADD CONSTRAINT "synthesis_recommendations_ratings_check" CHECK ("impact" IN ('high', 'medium', 'low') AND "effort" IN ('high', 'medium', 'low'));--> statement-breakpoint
ALTER TABLE "synthesis_recommendations" ADD CONSTRAINT "synthesis_recommendations_status_check" CHECK ("status" IN ('proposed', 'validated', 'edited', 'rejected'));--> statement-breakpoint
ALTER TABLE "synthesis_recommendations" ADD CONSTRAINT "synthesis_recommendations_lengths_check" CHECK (char_length("action_en") <= 200 AND char_length("action_fr") <= 200 AND char_length("rationale_en") <= 1000 AND char_length("rationale_fr") <= 1000 AND char_length("measure_en") <= 300 AND char_length("measure_fr") <= 300 AND (owner IS NULL OR char_length("owner") <= 100));--> statement-breakpoint
ALTER TABLE "synthesis_recommendation_insights" ADD CONSTRAINT "synthesis_recommendation_insights_state_check" CHECK ("state" IN ('counted', 'suggested', 'unlinked'));--> statement-breakpoint
ALTER TABLE "synthesis_takeaways" ADD CONSTRAINT "synthesis_takeaways_draft_check" CHECK ("draft_state" IN ('none', 'drafting', 'ready', 'failed'));
