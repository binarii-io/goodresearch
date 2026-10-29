# Data model: Transcript cleaning

Migration `0027_transcript_cleaning.sql`. All tables live in the transcripts module.

Foreign keys:
- `session_id` → `transcripts_transcripts(session_id)`, `on delete cascade`: the cleaning disappears with the imported text (spec 010).
- `study_id` → `research_studies(id)`, `on delete cascade`.

## Domain types (`modules/transcripts/domain`)

### Correction (`corrections.ts`)

```ts
type Target = 'text' | 'speaker'
type CorrectionKind = 'term' | 'transcription' | 'speaker' | 'name'
type CorrectionSource = 'person' | 'lexicon' | 'name' | 'ai-lexicon' | 'ai-other'
type CorrectionStatus = 'proposed' | 'accepted' | 'edited' | 'rejected'

type Correction = {
  key: string            // 'lex:<termId>:<segmentId>:<offset>' | 'name:<segmentId>:<target>:<offset>' | stored id
  sessionId: string
  segmentId: string
  target: Target
  offset: number         // in the raw turn's text (0 for target 'speaker')
  length: number         // of the original in the raw turn
  original: string
  replacement: string    // edited replacement when status 'edited'
  kind: CorrectionKind
  source: CorrectionSource
  reason: string | null      // ≤ 200 characters
  confidence: 'high' | 'medium' | 'low' | null   // AI only
  termId: string | null      // lexicon and ai-lexicon
  status: CorrectionStatus
  decidedBy: string | null
  decidedAt: Date | null
  version: number            // stored corrections only
}
```

### Functions

Pure domain functions, written test-first.

**Building corrections**
- `lexiconCorrections(transcript, terms, verdicts, suggestions)` (research R2):
  - Spellings are matched with the shared match rule; the longest wins at a place.
  - Verdict *unsure*, in either scope → `lexicon` proposed, for a person; the AI is not asked.
  - Scope `global`: one correction per occurrence, except verdicts *no*.
  - Scope `case-by-case`:
    - verdict *yes* → accepted;
    - an AI suggestion yes without a verdict → `ai-lexicon` proposed;
    - otherwise no correction.
  - The replacement is the term's `form`, or its `correction` for a `suspect` term. A spelling already equal to the replacement gives none.
- `nameCorrections(transcript, people, personTerms, language)` (research R5), only when anonymisation is on:
  - text and speaker-label corrections to `P01` / "Interviewer 1" / "[Person]";
  - accepted by default.

**Choosing and applying**
- `effectiveCorrections(all)`: the overlap priority of research R3; the rejected ones are left out.
- `applyCorrections(segments, effective)`:
  - returns the clean segments (same ids) and an `OffsetMap` per turn;
  - is used for the clean version and for what the AI receives.
- `fingerprint(effective)`: a stable hash of the accepted keys and replacements.

**AI chunks and checks**
- `makeChunks(segments, { turns: 60, overlap: 5, maxChars: 24_000 })`: chunks with their new part and their context part.
- `checkCorrections(chunk, answer, known)`: the seven checks of research R4. It returns kept corrections in raw offsets, kept decisions, and `leftOut`.

**Reuse and state**
- `inherit(next, decided)`: a new AI correction equal (turn, original, replacement) to a decided one takes its status.
- `cleaningState(...)`: the interview state table of research R7.

### Correction run (`correction-run.ts`)

Same shape as `LexiconRun`:
- `mode: 'lexicon' | 'ai'`;
- `sessions: { sessionId, state: 'waiting' | 'cleaning' | 'done' | 'failed', chunks: number, chunksDone: number, failure? }[]`;
- `leftOut`, `failure`, `stopRequested`, `heartbeatAt`, `finishedAt`.

Helpers:
- `runRef = 'cleaning:<runId>'`;
- `isLive` and `interrupted`, as in spec 010.

## Tables

### `transcripts_corrections`: stored corrections (sources `ai-other`, `person`)

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| study_id, session_id, segment_id | text | index on (session_id) |
| target | text | `text` \| `speaker` |
| offset, length | integer | in the raw turn |
| original, replacement, edited | text | `edited` null unless edited |
| kind, source | text | |
| reason | text null | |
| confidence | text null | |
| status | text | `proposed` \| `accepted` \| `edited` \| `rejected` |
| run_id | text null | null for `person` |
| decided_by, decided_at | text / timestamptz null | |
| version | integer | optimistic check |
| created_at | timestamptz | |

Unique index on (session_id, segment_id, target, offset, original, replacement): the same correction once.

### `transcripts_ai_suggestions`: the AI's yes / no on case-by-case occurrences

| Column | Type | Notes |
|---|---|---|
| term_id | text FK → lexicon_terms, cascade | |
| session_id, segment_id | text | |
| offset | integer | PK (term_id, segment_id, offset) |
| is_term | boolean | |
| reason | text null | |
| run_id | text | |

### `transcripts_correction_decisions`: decisions on computed `name` corrections

| Column | Type | Notes |
|---|---|---|
| session_id | text | |
| key | text | PK (session_id, key) |
| status | text | `accepted` \| `rejected` \| `edited` |
| edited | text null | |
| decided_by, decided_at | | |

### `transcripts_cleanings`: one row per cleaned interview

| Column | Type | Notes |
|---|---|---|
| session_id | text PK | |
| study_id | text | |
| ai_read_segments | jsonb `string[]` | turn ids the AI has read (research R4) |
| anonymised | boolean | the study setting the last run ran with (to clean again when it changes) |
| last_run_id | text null | |
| cleaned_at | timestamptz null | the last run that went through for it |

### `transcripts_clean_versions`

| Column | Type | Notes |
|---|---|---|
| session_id | text | PK (session_id, number) |
| number | integer | 1, 2, … |
| segments | jsonb `Segment[]` | same turn ids as the raw version |
| raw_imported_at | timestamptz | the raw version it was made from |
| anonymised | boolean | |
| fingerprint | text | |
| created_by, created_at | | |

### `transcripts_clean_publications`

| Column | Type | Notes |
|---|---|---|
| session_id | text PK | |
| file_id, web_link, file_name | text | |
| version_number | integer | the clean version published |
| revision | text | the file's revision right after the write |
| published_by, published_at | | |

### `transcripts_clean_folders`

| Column | Type | Notes |
|---|---|---|
| study_id | text PK | |
| folder_id | text | |
| name | text | |

### `transcripts_correction_runs`

The same columns as `transcripts_lexicon_runs`, plus `mode`. Each `sessions` item adds `chunks` and `chunksDone`.

### `transcripts_consents` (changed)

- Adds `purpose text not null default 'lexicon'`.
- The primary key becomes (account_id, study_id, provider, purpose).

### `ingestion_pseudonyms` (unchanged schema)

Interviewer codes `I01`… are stored next to the `P..` codes (research R5).

## Validation rules

- An AI correction is kept only after `checkCorrections`: at most 8 changed words, and no placeholder or known name on either side.
- A person's correction:
  - `original` must be the raw turn's text at `offset..offset+length`;
  - the replacement is at most 200 characters;
  - it must not cross a turn.
- Validating a clean version needs no `proposed` effective correction and the `fingerprint` the client saw.
- Edits of a stored correction check `version`. Decisions on computed corrections check the clean state's fingerprint ("changed meanwhile").
