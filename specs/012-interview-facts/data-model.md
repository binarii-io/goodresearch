# Data model: Interview verbatims and facts

Migration `0028_interview_facts.sql`. Tables in the `evidence` module unless said.

## Study setting (research module)

`research_studies.text_analysed text not null default 'with-corrections'`, check `in ('with-corrections', 'clean-only')`. Changed with the study's version (optimistic), like `anonymised`.

## evidence_runs (AnalysisRun, per study)

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| study_id | uuid | FK `research_studies`, cascade |
| team_id, started_by | uuid | |
| sessions | jsonb | `[{ sessionId, state: waiting\|verbatims\|facts\|done\|failed, chunks, chunksDone, failure? }]` |
| stop_requested | boolean | |
| stopped_sessions | jsonb | interviews taken out by a person (migration `0031_facts_reading_stops`); written only by the stop, never by the worker's saves |
| left_out | jsonb | `{ verbatims, facts }` |
| failure | text null | run-level failure |
| started_at, heartbeat_at, finished_at | timestamptz | live = not finished and heartbeat < 10 min |

Failures per interview: `NO_TRANSCRIPT`, `NOT_CLEAN`, `INTERRUPTED`, `STOPPED`, `AI_PROVIDER_REQUIRED`, `AI_FAILED`, `INVALID_ANSWER`, `DRIVE_UNAVAILABLE`.

## evidence_readings (one per interview, the last reading)

`session_id` pk (FK `ingestion_sessions`, cascade), `study_id`, `run_id`, `read_at`, `raw_imported_at`, `text_analysed`, `anonymised`, `fingerprint`. Drives the derived state (R3).

## evidence_verbatims

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| session_id | uuid | FK sessions, cascade |
| study_id | uuid | |
| segment_id | text | turn id (same across versions) |
| offset, length | int | place in the analysed text, last saved |
| text | text | the turn's own span, 3–120 words |
| speaker | text | the turn's speaker label |
| participant | text null | pseudonym code (`P01`); null = to attribute |
| reason | text null | ≤ 200 chars (AI) |
| origin | text | `ai \| person` |
| run_id | uuid null | |
| set_aside | boolean | never proposed again |
| created_by, created_at | | |

Index `(session_id, segment_id)`.

## evidence_facts

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| session_id, study_id | uuid | |
| statement_en, statement_fr | text | ≤ 200 chars each |
| translation | text | `done \| translating \| not-translated` |
| polarity | text | `positive \| negative \| neutral` |
| theme_id | uuid null | guide section id; null = Other |
| theme_title | text null | the section title at reading time |
| origin | text | `ai \| person` |
| status | text | `proposed \| accepted \| edited \| rejected` |
| run_id | uuid null | |
| decided_by, decided_at | | |
| version | int | optimistic check |

`evidence_fact_verbatims (fact_id, verbatim_id)` pk both, cascade both; a fact has ≥ 1 (checked in the command).

Invariants (domain `Fact`): at least one verbatim, all of its interview; statements 1–200 chars without known name or placeholder; a person's create or edit → `accepted` / `edited`; a rejected fact is never changed by a reading.

## evidence_speakers

`(session_id, speaker)` pk, `participant` (code), `decided_by`, `decided_at`. A person's attribution of an unknown speaker label (R8).

## evidence_consents

`(account_id, study_id)` pk, `provider`, `given_at`. Asked again when the provider changes.

## Derived (never stored)

- **Verbatim place now**: R3 re-anchoring → `{ segmentId, offset, length } | lost`.
- **Interview state**: `no-transcript` · `not-clean` (setting `clean-only`, no clean version) · `not-analysed` · `to-analyse-again` (a verbatim lost, raw imported after `read_at`, setting or anonymisation differs) · `to-decide` (facts `proposed` > 0) · `done`.
- **Costs**: ledger sums over `facts:<runId>:<sessionId>` and `facts-translation:<sessionId>`.

## Domain functions (test-first)

`checkVerbatims(chunk, answer, people)`, `mergeVerbatims(existing, found, setAside)`, `checkFacts(answer, verbatims, themes, names)`, `isReproposal(fact, rejected)`, `reanchor(verbatim, turns)`, `speakerRole(label, people, attributions)`, `analysisState(...)`, `factOf(...)` invariants.
