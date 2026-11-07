# Data model: Usability test fieldwork

## Inventory file (Ingestion, extended)

`ingestion_inventory_files.duration_ms` integer, null when the source gives none or the file is not a video.

## Session (Ingestion, extended)

`ingestion_sessions` new columns:

| Column | Meaning |
|---|---|
| `video_file_id` text null | the main video of a usability test session; unique per study where not null |
| `protocol_version` integer null | the protocol version a person chose; null while the app proposes one from the date (computed at read time, never stored) |

Rules:

- On a `usability-test` study every session has a `video_file_id`; `transcript_file_id` is optional; `media` holds other videos and audio.
- A file belongs to at most one session; files of decided sessions are not reused.
- The app never writes `protocol_version`: its proposal is computed when the session is read, so a person's choice is never overwritten.
- Taking the main video of another undecided session merges it: its recordings and attachments follow, its transcript when the target has none, and it is removed.

## Protocol version (Research)

`research_test_protocol_versions`: `study_id` (FK cascade), `version` integer (from 1: the protocol's stored version plus one), `content` jsonb, `saved_at`, `saved_by` (FK set null); PK (study_id, version). Written in the same transaction as every save of the protocol, never updated.

## Session readiness (computed)

`ready | not-validated | video-missing | duration-unknown | participant-to-confirm | no-protocol`, the first that applies in that order.

## Migration `0061_usability_sessions.sql`

Adds the columns and the index above, creates `research_test_protocol_versions`, and fills it with the current version of each existing protocol.
