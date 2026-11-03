# Data model: Survey fieldwork

## SurveyResponse (Surveys)

`surveys_responses`: `study_id`, `source_id` (PK both), `form_file_id`, `submitted_at`, `consent` (`given | refused`), `answers` jsonb `{ itemId: string[] }`, `read_at`. Index on `(study_id, form_file_id, submitted_at)`; the rule is checked per row of a study. FK cascade on the study. No respondent identity, no contact answer; refused means empty answers.

Only responses of the current form count: a republished form has another `form_file_id`.

## ResponseReading

`surveys_readings`: `study_id` (PK), `status` (`done | failed | stopped`), `read_at`, `read_by`, `unknown_questions` integer, `unknown_values` integer.

## TargetRule

`surveys_target_rules`: `study_id` (PK), `accepted` jsonb `{ itemId: string[] }`, `version`, `updated_by`, `updated_at`, `origin` (`person | assistant`).

Rules: only choice items of a profiling section; options among the item's; at least one per item. A rule on an item or option no longer there is reported and ignored for that item.

## State (computed, never stored)

In order: `refused-consent`; `profile-not-answered` (a filtered item without answer); `out-of-target` (a filtered item with no accepted answer); `counted`. An answer not among the options never passes.

## Former wording

`surveys_item_wordings`: `study_id`, `item_id`, `text`, `until`.

## PublishedDocument (extended)

`responder_link`, `opened_by`, `opened_at`, `closed_by`, `closed_at`.

## Ports

- Surveys needs: the form (`fileId`, `itemMap`, state) from Publishing; the questionnaire from Research; `listResponses` from Ingestion's files.
- Publishing needs from Surveys: `responseCount(studyId, fileId)`, `recordWordings(...)`.
- `StudyFiles` adds `listResponses(fileId)` and `setAccepting(fileId, open)`; `FormRead` adds `responderLink`.

## Assistant

Kinds: `count_responses` (during the answer, counts), `propose_opening_form`, `propose_closing_form`, `propose_target_rule` (cards). `surveyNextStep` adds `open-form`, `collect`, `close-form`, `analysis-later`.
