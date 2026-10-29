ALTER TABLE "transcripts_verdicts" DROP CONSTRAINT "transcripts_verdicts_verdict_check";--> statement-breakpoint
ALTER TABLE "transcripts_verdicts" ADD CONSTRAINT "transcripts_verdicts_verdict_check" CHECK ("verdict" IN ('yes', 'no', 'unsure'));
