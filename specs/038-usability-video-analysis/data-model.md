# Data model: Usability test analysis

## Usability analysis (module `usability`)

### `usability_analyses` — one per session, replaced by a new analysis

| Column | Meaning |
|---|---|
| `id`, `study_id`, `session_id` (unique while current) | |
| `protocol_version` int | frozen at start (FR-008) |
| `video_file_id`, `video_modified_at`, `video_size` | what was read; differences mark it out of date |
| `state` | `waiting | analysing | done | failed | stopped` |
| `stage` | `preparing | transcript | screen-log | task-map | tasks | checks` |
| `failure` | `VIDEO_UNREADABLE | AI_PROVIDER_REQUIRED | MEDIA_NOT_SUPPORTED | AI_FAILED | STAGING_FAILED | STOPPED` |
| `run_id`, `started_by`, `started_at`, `finished_at`, `version` | |

### `usability_transcripts`

`analysis_id`, `language`, `segments` jsonb `[{ speaker, startMs, endMs, text }]`. Quotes are checked against it.

### `usability_task_results`

`analysis_id`, `task_id` (protocol task id), `outcome` `success | partial | failure | not-attempted`, `start_ms`, `end_ms`, `time_on_task_ms`, `path` text (≤ 500), `ease` int null (1–7), `status` `proposed | accepted | edited`, `decided_by`, `decided_at`, `version`.

### `usability_observations`

| Column | Meaning |
|---|---|
| `id`, `analysis_id`, `task_id` null | |
| `kind` | `difficulty | error | positive | verbatim | assisted | sus-answer` |
| `moment_ms` | within its task's part |
| `text` (≤ 400), `quote` null (verified), `seen` null | evidence |
| `sus_item` int null, `sus_value` int null (1–5) | for `sus-answer` |
| `screenshot_key` null | in the app's storage |
| `judge` | `kept | not-confirmed | rejected`, `judge_reason` |
| `arbiter` null | `kept | rejected`, `arbiter_reason` |
| `origin` | `ai | person` |
| `status` | `proposed | accepted | edited | rejected`, `decided_by`, `decided_at`, `version` |

Rules: an AI observation without a found quote or outside its task is never stored; `rejected` by the checks requires a reason; a new analysis keeps decided observations (their screenshots kept) and drops undecided ones; a rejected one is not proposed again (same kind, task and text within 10 s).

### `usability_analysis_runs`

As `ingestion_analysis_runs`: `id`, `study_id`, `started_by`, `session_ids`, `state`, `stop_requested`, `started_at`, `heartbeat_at`, `finished_at`; one `running` per study.

## Evidence (extended)

- `evidence_facts.source` adds `usability`; `session_id` set; theme = the task (`theme_id` = task id, `theme_title` = its instruction).
- `evidence_usability_supports`: `fact_id` PK, `observation_id` unique, `quote`, `moment_ms`, `screenshot_key`, `participant` (pseudonym code).

## Computed

- **Task results of the study**: per task id, outcome counts, median time, difficulties by session count, ease answers.
- **SUS**: per session, `((Σ odd − 5) + (25 − Σ even)) × 2.5` from ten accepted answers; mean over sessions with a score.

## Migration `0062_usability_analysis.sql`

Creates the tables above with checks on enums and limits, the Evidence table and source value, and the queue `usability.analysis` (created by `migrate`).
