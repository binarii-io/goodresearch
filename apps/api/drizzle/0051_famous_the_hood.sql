CREATE TABLE "assistant_folder_consents" (
	"account_id" text NOT NULL,
	"study_id" text NOT NULL,
	"provider" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	CONSTRAINT "assistant_folder_consents_account_id_study_id_provider_pk" PRIMARY KEY("account_id","study_id","provider")
);
--> statement-breakpoint
ALTER TABLE "assistant_folder_consents" ADD CONSTRAINT "assistant_folder_consents_study_fk" FOREIGN KEY ("study_id") REFERENCES "research_studies"("id") ON DELETE CASCADE;
