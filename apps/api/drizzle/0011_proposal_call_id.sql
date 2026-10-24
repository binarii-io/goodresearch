-- Proposals get their own ids; the model's tool call id is kept apart (PR #5 review).
ALTER TABLE "assistant_proposals" ADD COLUMN "call_id" text;
--> statement-breakpoint
UPDATE "assistant_proposals" SET "call_id" = "id";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ALTER COLUMN "call_id" SET NOT NULL;
--> statement-breakpoint
-- `applying`: claimed by one Apply while the action runs (at most once).
ALTER TABLE "assistant_proposals" DROP CONSTRAINT "assistant_proposals_state_check";
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_state_check" CHECK ("state" IN ('proposed', 'applying', 'applied', 'dismissed', 'failed', 'invalid'));
