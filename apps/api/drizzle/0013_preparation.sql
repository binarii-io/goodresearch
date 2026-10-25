CREATE TABLE "research_interview_guides" (
	"study_id" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"origin" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_planned_interviews" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"interviewee" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"interviewers" text DEFAULT '' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_interview_guides" ADD CONSTRAINT "research_interview_guides_study_id_research_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_interview_guides" ADD CONSTRAINT "research_interview_guides_updated_by_auth_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_planned_interviews" ADD CONSTRAINT "research_planned_interviews_study_id_research_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_planned_interviews" ADD CONSTRAINT "research_planned_interviews_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_planned_interviews_study_idx" ON "research_planned_interviews" USING btree ("study_id","scheduled_at");