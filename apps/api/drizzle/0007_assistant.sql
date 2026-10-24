CREATE TABLE "assistant_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"status" text NOT NULL,
	"failure" text,
	"page_kind" text,
	"page_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text,
	"target_version" integer,
	"values" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"state" text NOT NULL,
	"result_kind" text,
	"result_id" text,
	"error" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "assistant_conversations_account_idx" ON "assistant_conversations" USING btree ("account_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_idx" ON "assistant_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_proposals_message_idx" ON "assistant_proposals" USING btree ("message_id");