CREATE TABLE "quality_consents" (
	"account_id" text NOT NULL,
	"study_id" text NOT NULL,
	"provider" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quality_consents_account_id_study_id_pk" PRIMARY KEY("account_id","study_id")
);
--> statement-breakpoint
CREATE TABLE "quality_evaluations" (
	"session_id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"run_id" text NOT NULL,
	"raw_imported_at" timestamp with time zone NOT NULL,
	"text_analysed" text NOT NULL,
	"anonymised" boolean NOT NULL,
	"fingerprint" text NOT NULL,
	"left_out" integer NOT NULL,
	"turns_skipped" integer NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_reformulations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"study_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"offset" integer NOT NULL,
	"length" integer NOT NULL,
	"text" text NOT NULL,
	"speaker_label" text NOT NULL,
	"requalified_remark_id" text
);
--> statement-breakpoint
CREATE TABLE "quality_remarks" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"study_id" text NOT NULL,
	"run_id" text,
	"segment_id" text NOT NULL,
	"offset" integer NOT NULL,
	"length" integer NOT NULL,
	"text" text NOT NULL,
	"speaker_label" text NOT NULL,
	"kind" text NOT NULL,
	"reason_en" text,
	"reason_fr" text,
	"reason_person" text,
	"recommendation" text,
	"added_element" text,
	"origin" text NOT NULL,
	"stance" text,
	"stance_by" text,
	"stance_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quality_remarks_kind_check" CHECK ("quality_remarks"."kind" in ('leading-question', 'reformulation-with-opinion', 'opinion')),
	CONSTRAINT "quality_remarks_origin_check" CHECK ("quality_remarks"."origin" in ('ai', 'person')),
	CONSTRAINT "quality_remarks_stance_check" CHECK ("quality_remarks"."stance" in ('agree', 'disagree'))
);
--> statement-breakpoint
CREATE TABLE "quality_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"started_by" text NOT NULL,
	"sessions" jsonb NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"left_out" integer DEFAULT 0 NOT NULL,
	"failure" text,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quality_speaker_counts" (
	"session_id" text NOT NULL,
	"study_id" text NOT NULL,
	"speaker_label" text NOT NULL,
	"sentences" integer NOT NULL,
	"questions" integer NOT NULL,
	CONSTRAINT "quality_speaker_counts_session_id_speaker_label_pk" PRIMARY KEY("session_id","speaker_label")
);
--> statement-breakpoint
CREATE INDEX "quality_reformulations_session_idx" ON "quality_reformulations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "quality_reformulations_study_idx" ON "quality_reformulations" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "quality_remarks_session_idx" ON "quality_remarks" USING btree ("session_id","segment_id");--> statement-breakpoint
CREATE INDEX "quality_remarks_study_idx" ON "quality_remarks" USING btree ("study_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_runs_open_idx" ON "quality_runs" USING btree ("study_id") WHERE "quality_runs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "quality_runs_study_idx" ON "quality_runs" USING btree ("study_id","started_at");--> statement-breakpoint
CREATE INDEX "quality_speaker_counts_study_idx" ON "quality_speaker_counts" USING btree ("study_id");--> statement-breakpoint
ALTER TABLE "quality_runs" ADD CONSTRAINT "quality_runs_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_speaker_counts" ADD CONSTRAINT "quality_speaker_counts_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_speaker_counts" ADD CONSTRAINT "quality_speaker_counts_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_reformulations" ADD CONSTRAINT "quality_reformulations_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_reformulations" ADD CONSTRAINT "quality_reformulations_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_remarks" ADD CONSTRAINT "quality_remarks_session_fk" FOREIGN KEY ("session_id") REFERENCES "ingestion_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_remarks" ADD CONSTRAINT "quality_remarks_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quality_consents" ADD CONSTRAINT "quality_consents_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
