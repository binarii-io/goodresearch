-- Assistant rules the ORM schema cannot express (spec 005).
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_account_fk" FOREIGN KEY ("account_id") REFERENCES "auth_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_message_fk" FOREIGN KEY ("message_id") REFERENCES "assistant_messages"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_role_check" CHECK ("role" IN ('person', 'assistant'));
--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_status_check" CHECK ("status" IN ('complete', 'streaming', 'stopped', 'failed'));
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_kind_check" CHECK ("kind" IN ('create_project', 'update_project_goal', 'rename_project', 'create_study', 'rename_study'));
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_state_check" CHECK ("state" IN ('proposed', 'applied', 'dismissed', 'failed', 'invalid'));
