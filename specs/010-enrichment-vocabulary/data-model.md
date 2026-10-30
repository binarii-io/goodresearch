# Data model: Enrichment phase and team lexicon

New module **transcripts**; tables prefixed `transcripts_`. Migration `0024_enrichment_lexicon.sql`. Foreign keys to other modules' tables are for integrity only (standards §6).

## Domain

### Transcript (aggregate, per session)

| Field | Type | Rules |
|---|---|---|
| sessionId | uuid | PK; FK `ingestion_sessions(id) ON DELETE CASCADE` |
| studyId | uuid | FK `research_studies(id) ON DELETE CASCADE` |
| fileId | text | the transcript file it came from |
| fileModifiedAt | timestamptz | re-imported only when the file's differs |
| language | `en \| fr \| other` | the session's accepted language, else `languageOf` of the text |
| segments | jsonb `Segment[]` | the raw version, never edited; ≤ 400,000 characters in total |
| importedAt, importedBy | | |
| readAt | timestamptz or null | a reading went through to the end on it (not stopped, no AI failure); until then the interview stays "not read" and is offered again (migration `0026`) |

**Segment**: `id` (string, stable across re-imports, R3), `speaker` (string ≤ 120 or null), `start` (seconds or null), `text`.

### LexiconTerm (aggregate, per team and language)

| Field | Type | Rules |
|---|---|---|
| id | uuid | |
| teamId | uuid | FK `workspace_teams(id) ON DELETE CASCADE` |
| language | `en \| fr \| other` | |
| form | text ≤ 80 | the correct form; unique per `(teamId, language, fold(form))` among non-merged terms |
| kind | `domain \| suspect` | `suspect`: a probable transcription error |
| correction | text ≤ 80 or null | required when `kind = suspect` and accepted |
| category | `product \| organisation \| place \| acronym \| jargon \| role \| person \| other` | |
| definition | text ≤ 200 or null | |
| scope | `global \| case-by-case` | default case by case when a counted spelling has ≤ 3 letters (FR-020) |
| scopeDecided | boolean | a person chose the scope: kept |
| status | `proposed \| accepted \| edited \| rejected \| merged` | `merged` → `mergedInto` set |
| mergedInto | uuid or null | |
| origin | `rules \| ai` | |
| quote | text ≤ 300 or null | verified in the excerpts sent (R5) |
| variants | jsonb `Variant[]` | ≤ 50; folded spellings unique within the term and across the team's active terms |
| decidedBy, decidedAt | | null while `proposed` |
| version | int | optimistic check on every decision |
| createdAt, updatedAt | | |

**Variant**: `spelling` (≤ 80), `status` (`proposed | accepted | rejected`), `origin` (`rules | ai | merge`).

**Invariants**:
- a new reading never changes `form`, `kind`, `correction`, `category`, `definition` or `status` of a decided term;
- it only adds `proposed` variants;
- a rejected term or variant (folded) is never proposed again in the team;
- a `person` term is never sent to the AI again.

**Transitions**:
- `proposed → accepted | edited | rejected | merged`;
- `accepted/edited → edited | rejected | merged`;
- `rejected → proposed` (a person reopens it).

### Occurrence (read model, recomputed per reading)

`transcripts_occurrences`: `termId`, `spelling` (the form or a variant), `sessionId` (FK `ingestion_sessions ON DELETE CASCADE`), `studyId`, `count` ≥ 1, `anchors` jsonb ≤ 50 × `{segmentId, offset, length}` (the count goes on beyond). PK `(termId, spelling, sessionId)`. Rows of a study are replaced as a whole at the end of each reading.

### Verdict (per term and occurrence)

`transcripts_verdicts` (migration `0025_lexicon_verdicts.sql`): `termId` (FK terms, cascade), `sessionId` (FK `ingestion_sessions`, cascade), `studyId`, `segmentId`, `offset`, `verdict` (`yes | no | unsure`; `unsure` added by migration `0028_lexicon_unsure_verdict.sql`), `decidedBy`, `decidedAt`. PK `(termId, segmentId, offset)`. Turn ids stay across imports, so a verdict survives readings while the turn is unchanged; a merge moves the verdicts of the merged term to the kept one (a place it already judged keeps its own).

### LexiconRun (per study)

`transcripts_lexicon_runs`:

| Field | Type | Rules |
|---|---|---|
| id | uuid | |
| studyId | uuid | |
| teamId | uuid | |
| startedBy | uuid | |
| sessions | jsonb | `{sessionId, state: waiting\|reading\|done\|failed, failure?}[]` |
| phase | `import \| candidates \| ai \| counting \| finished` | |
| stopRequested | boolean | |
| leftOut | int | candidates over the limit (R4) |
| batchesTotal, batchesDone | int | batches of words for the AI, and how many were processed, failed ones included (update 2026-10-30) |
| heartbeatAt, startedAt, finishedAt | | stale after 10 minutes without a heartbeat |

**Failure** values: `FILE_NOT_FOUND`, `DRIVE_NOT_CONNECTED`, `DRIVE_UNAVAILABLE`, `UNREADABLE_FORMAT`, `TOO_LONG`, `NO_TRANSCRIPT`, `INTERRUPTED`, `AI_PROVIDER_REQUIRED`, `AI_FAILED`, `INVALID_ANSWER`.

Ledger ref of a run: `lexicon-reading:<runId>`.

### Consent

`transcripts_consents`: `(accountId, studyId, provider)` PK, `givenAt`. Asked again when the person's provider changes.

## Derived (queries, never stored)

- **Enrichment state of a validated session**:
  - `no-transcript`;
  - `not-read`: no Transcript;
  - `changed`: the session's transcript `modifiedAt` ≠ `fileModifiedAt`;
  - `to-decide (X)`: X = proposed terms or variants with an occurrence in it;
  - `read`.
- **Terms of a study**: the team's terms with an occurrence in the study's validated sessions, plus the proposed terms of this study's runs. For each, the count in the team's other studies, as a number only.

## Shared (`@goodresearch/shared/text`)

`fold`, `normaliseQuote`, `quoteFound`, `withPlaceholders`, `fromPlaceholders`, `nameKey` (moved from ingestion), `termPattern(spelling)` and `countMatches(text, spelling)` (lexicon match rule: whole words, acronyms case-sensitive).

## Ingestion public API (new)

- `enrichmentSessions(accountId, studyId)` → `{ id, title, interviewDate, language, transcript: {fileId, name, mimeType, modifiedAt} | null }[]` for validated sessions, plus the count of sessions still to validate; `null` without access.
- `readTranscript(accountId, studyId, sessionId)` → `{ text, modifiedAt }` or a failure (`FILE_NOT_FOUND`, `DRIVE_NOT_CONNECTED`, `DRIVE_UNAVAILABLE`, `UNREADABLE_FORMAT`, `TOO_LONG`).
- `knownNames(accountId, studyId)` → the names of the study's rosters, its schedule and the team members (stays in the app; used to exclude candidates and as placeholders).
