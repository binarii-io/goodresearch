# HTTP API: Transcript cleaning

All routes need a session (sign-in) and follow the study's access rules, including folder access (spec 002 FR-010a).

- Bodies are Zod schemas in `packages/contracts/src/cleaning.ts`.
- Errors use the shared error envelope.
- Money is in USD and counts every account.

## New

### `GET /api/studies/:studyId/cleaning` → `Cleaning`

```
{
  interviews: {
    sessionId, title, interviewDate | null,
    state: 'no-transcript' | 'not-cleaned' | 'to-redo' | 'to-decide' | 'lexicon-changed'
         | 'clean' | 'published' | 'out-of-date',
    toDecide: number, accepted: number,
    cleanedAt | null, cost: number | null, failure | null,
    published: { webLink, versionNumber } | null
  }[],
  counts: { clean, toDecide },
  run: { id, mode, total, done, failed, chunks, chunksDone, leftOut, failure, startedBy: {id, name}, finished } | null,
  lastRunCost: number | null, cost: number | null,
  consentNeeded: boolean, anonymised: boolean,
  folder: { name } | null
}
```

### `GET /api/studies/:studyId/cleaning-runs/estimate?mode=ai|lexicon&all=bool&sessionId=` → `CleaningEstimate`

`sessionId`: that interview alone, cleaned again in full.

```
{ interviews: number, chunks: number, cost: number | null, consentNeeded: boolean }
```

`mode=lexicon` always returns `chunks: 0` and `cost: 0`.

### `POST /api/studies/:studyId/cleaning-runs` → `202 { runId }`

Body: `{ mode: 'lexicon' | 'ai', all: boolean, consent: boolean, sessionIds?: string[] (≤ 500) }` — with `sessionIds`, only those interviews, cleaned again in full whatever their state.

| Error | When |
|---|---|
| `CLEANING_CONSENT_REQUIRED` | the consent was not given |
| `AI_PROVIDER_REQUIRED` | the person has no usable AI connection |
| `ENRICHMENT_RUNNING` | a lexicon reading or a cleaning is live for the study |
| `NOTHING_TO_CLEAN` | no interview needs cleaning |

### `POST /api/studies/:studyId/cleaning-runs/:runId/stop` → `204`

### `GET /api/studies/:studyId/cleaning/:sessionId` → `InterviewCleaning`

Query: `status?` (`to-decide | accepted | rejected | all`), `source?`, `kind?`, `confidence?`, `onlyCorrected?` (default true).

```
{
  sessionId, title, state, anonymised,
  fingerprint,                       // of the effective corrections, sent back to validate
  cost: number | null,               // this interview's cleanings
  speakers: string[],
  turns: {
    id, speaker, start | null, text,           // raw
    corrections: Correction[]                  // matching the filters, in order
  }[],
  counts: { toDecide, accepted, rejected, leftOut },
  versions: { number, createdAt, createdBy: {id, name} }[],
  published: { webLink, versionNumber } | null   // a Drive edit is found when publishing (DRIVE_CHANGED)
}
Correction = {
  key, segmentId, target, offset, length, original, replacement,
  kind, source, reason | null, confidence | null, status,
  term: { id, form } | null,
  decidedBy: {id, name} | null, decidedAt | null, version | null,
  overridden: boolean                // hidden by a higher-priority correction
}
```

### `PUT /api/studies/:studyId/cleaning/:sessionId/corrections/:key` → `Correction`

Body: `{ decision: 'accept' | 'reject' | 'edit' | 'reopen', replacement?: string, version?: number }`

- `lex:` keys write the verdict of the occurrence (accept → yes, reject → no, reopen → none). `edit` is refused (`EDIT_NOT_ALLOWED`: edit the term in the lexicon).
- `name:` keys write a correction decision.
- Stored ones check `version`.

| Error | When |
|---|---|
| `CORRECTION_NOT_FOUND` | the key matches no correction |
| `VERSION_CONFLICT` | the version or the state moved since it was read |
| `REPLACEMENT_TOO_LONG` | the replacement is over 200 characters |

### `POST /api/studies/:studyId/cleaning/:sessionId/corrections` → `201 Correction`

A person's own correction. Body: `{ segmentId, target, offset, length, original, replacement }`.

| Error | When |
|---|---|
| `ORIGINAL_NOT_FOUND` | the original is not the raw text at that place |
| `REPLACEMENT_TOO_LONG` | the replacement is over 200 characters |

### `POST /api/studies/:studyId/cleaning/:sessionId/decisions` → `{ decided: number }`

"Accept all shown". Body: `{ keys: string[] (≤ 500), decision: 'accept' | 'reject' }`.

### `POST /api/studies/:studyId/cleaning/:sessionId/versions` → `201 { number }`

Validates the clean version. Body: `{ fingerprint }`.

| Error | When |
|---|---|
| `CORRECTIONS_TO_DECIDE` | corrections are still to decide |
| `VERSION_CONFLICT` | the fingerprint differs from the current one |

### `POST /api/studies/:studyId/cleaning/:sessionId/publish` → `{ webLink, versionNumber }`

Body: `{ overwrite: boolean, language: 'en' | 'fr' }` (the person's language names the folder the first time).

| Error | When |
|---|---|
| `NOT_CLEAN` | the interview has no clean version |
| `DRIVE_CHANGED` | the document changed in Drive since the last publish, and `overwrite` is false |
| `DRIVE_WRITE_REQUIRED`, `DRIVE_NOT_CONNECTED`, `DRIVE_CANNOT_EDIT`, `FOLDER_ACCESS_REQUIRED` | as spec 007 |

## Changed

- `POST /api/studies/:studyId/lexicon-runs`: returns `ENRICHMENT_RUNNING` while a cleaning is live.
- `PUT …/lexicon/terms/:termId/verdicts` (spec 010): unchanged; the cleaning view reads its effect.

## AI request (task `cleaning`, ref `cleaning:<runId>:<sessionId>` (per interview, as an analysis))

What the provider receives per chunk:

- The system rules: correct only, never reword; at most 8 words; copy the original exactly; placeholders are not words.
- The terms that matter to the chunk.
- The occurrences to decide.
- The speakers.
- The turns `t<n> [Speaker]: text`, with known names replaced by placeholders and the context turns marked.

The answer shape is in research R4.
