-- Spec 038: an analysis fails with AI_RECONNECT_REQUIRED when the AI provider refused the person's access.
ALTER TABLE "usability_analyses" DROP CONSTRAINT "usability_analyses_failure_check";
--> statement-breakpoint
ALTER TABLE "usability_analyses" ADD CONSTRAINT "usability_analyses_failure_check" CHECK ("failure" IS NULL OR "failure" IN ('VIDEO_UNREADABLE', 'AI_PROVIDER_REQUIRED', 'AI_RECONNECT_REQUIRED', 'MEDIA_NOT_SUPPORTED', 'AI_FAILED', 'STAGING_FAILED', 'STOPPED'));
