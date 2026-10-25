# Data model: Fieldwork sessions

## Session (aggregate, ingestion)

| Field | Type | Rules |
|---|---|---|
| id | text (uuid) | |
| studyId | text | FK `research_studies.id` on delete cascade (SQL only) |
| transcriptFileId | text null | unique per study; null for a recording without its transcript (migration 0020) |
| media | jsonb `{ fileId, confidence: high \| medium \| low \| null, reason }[]` | each file id in at most one session of the study; at least one when there is no transcript |
| mediaEdited | boolean | true once the person changed the media by hand |
| state | `proposed \| validated \| excluded` | |
| excludedReason | text null | ≤ 500 characters, only when excluded |
| title | text null | ≤ 120 characters, trimmed; null = default (linked interviewee, else file name) |
| plannedInterviewId | text null | unique per study when not null (partial index); no FK (other module) |
| linkedBy | `suggestion \| person` null | how the link was made |
| roster | jsonb `{ id, name, role: interviewer \| interviewee, memberId? }[]` | ≤ 10 entries; name 1–120 characters |
| decidedBy / decidedAt | text / timestamptz null | the person who validated or excluded; `decidedBy` null with `validated` = validated by the app; cleared on reopen |
| createdAt / updatedAt | timestamptz | |
| version | integer | +1 on every change |

### Transitions

- A session with its transcript is created `validated` by the app (`decidedBy` null); one without transcript is created `proposed`.
- `proposed | validated by the app → validated by a person` (validate), `→ excluded` (exclude); `validated | excluded → proposed` (reopen).
- Edits (title, media, roster) and link changes until a person decides (proposed or validated by the app).
- Reconcile (R2) creates, changes and deletes only sessions no person decided.

### Derived at read time (never stored)

- `fileMissing`: a session whose transcript is not in the current inventory (or, without transcript, none of its recordings).
- `suggestion`: `{ plannedInterviewId, rule: name | date }` for a proposed session without a link (research R4).
- `link`: ignored if the planned interview is no longer in the schedule (research R6).

## Changes to existing tables

- `ingestion_study_sources`: none. Attaching another folder or detaching it deletes the study's sessions in the same transaction as the files.
- `ingestion_inventory_files`: none.

## Migrations

- `0020_sessions_without_transcript.sql`: `transcript_file_id` nullable.
- `0021_sessions_validated_by_app.sql`: sessions proposed so far with a transcript and no decision become validated by the app. A session a person had reopened cannot be told apart and is validated again (accepted: the feature was not released).

## Migration `0019_fieldwork_sessions.sql`

- Table `ingestion_sessions`.
- Indexes: unique `(study_id, transcript_file_id)`; unique `(study_id, planned_interview_id) where planned_interview_id is not null`; `(study_id, state)`.
- FK `study_id → research_studies(id) on delete cascade`.
