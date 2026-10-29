# HTTP API: Enrichment phase and team lexicon

All routes need a session (sign-in) and follow the study's access rules (spec 002 FR-010a). Bodies are Zod schemas in `packages/contracts/src/lexicon.ts`; errors use the shared error envelope. The lexicon is always reached through a study: the team is the study's.

## New

### `GET /api/studies/:studyId/enrichment` → `Enrichment`

```
{
  interviews: {
    sessionId, title, interviewDate | null,
    state: 'no-transcript' | 'not-read' | 'changed' | 'to-decide' | 'read',
    toDecide: number, readAt | null, failure | null
  }[],
  toValidate: number,             // sessions of the study not validated yet
  counts: { read, toDecide, accepted },
  run: { id, phase, total, done, failed, leftOut, startedBy: {id, name} } | null,
  lastRunCost: number | null, cost: number | null,   // USD, every account
  consentNeeded: boolean, anonymised: boolean
}
```

### `GET /api/studies/:studyId/lexicon` → `LexiconPage`

Query: `status?` (`to-decide | accepted | rejected | all`, default `to-decide`), `kind?`, `category?`, `language?`, `sessionId?`, `q?`, `cursor?` (50 per page).

```
{ terms: LexiconTerm[], next: string | null, total: number, pageSize: number }   // the cursor is a page's offset
LexiconTerm = {
  id, version, form, kind, correction | null, category, definition | null, language,
  status, origin, quote | null,
  variants: { spelling, status, origin }[],
  occurrences: { sessionId, title, count, quotes: { before, match, after }[] }[],   // this study, ≤ 3 quotes each
  otherStudies: number,                                           // a count only
  decidedBy: { id, name } | null, decidedAt | null
}
```

### `GET /api/studies/:studyId/lexicon/terms/:termId/occurrences` → `{ occurrences: TermOccurrence[] }`

Every occurrence of the term in the study's validated interviews, counted again in the imported text, up to 500 quotes per interview. A quote is `{ before, match, after }` (the term as written in `match`). Error: `TERM_NOT_FOUND`.

### `PUT /api/studies/:studyId/lexicon/terms/:termId/verdicts` → 204

Body `{ sessionId, segmentId, offset, verdict: 'yes' | 'no' | null }` (null takes it back). Errors: `TERM_NOT_FOUND`, `OCCURRENCE_NOT_FOUND` (the place does not hold one of the term's spellings in a validated interview).

### `GET /api/studies/:studyId/lexicon-runs/estimate?all=bool&sessionId=` → `{ interviews: number, estimatedCost: number | null }`

### `POST /api/studies/:studyId/lexicon-runs` → 202 `{ runId }`

Body `{ consent?: boolean, all?: boolean, sessionIds?: string[] }` (`sessionIds`: only these interviews, read again whatever their state; `sessionId` in the estimate). Errors:

- `NO_VALIDATED_INTERVIEW`
- `NOTHING_TO_READ`
- `LEXICON_CONSENT_REQUIRED` (409)
- `LEXICON_RUNNING` (409)
- `DRIVE_NOT_CONNECTED`
- `AI_PROVIDER_REQUIRED`

### `POST /api/studies/:studyId/lexicon-runs/:runId/stop` → 204

### `POST /api/studies/:studyId/lexicon-runs/:runId/sessions/:sessionId/stop` → 204

Takes one interview out of the reading while it waits or is imported; it ends `failed` with `STOPPED`. Errors: `NOT_FOUND` (not in that run), `TOO_LATE_TO_STOP` (409: done already, or the reading is past the import).

### `PATCH /api/studies/:studyId/lexicon/terms/:termId` → `LexiconTerm`

Body:

```
{
  version,
  decision: 'accept' | 'reject' | 'reopen' | 'edit',
  fields?: { form, kind, correction, category, definition },   // with 'edit'
  variants?: { spelling, status: 'accepted' | 'rejected' }[]
}
```

Errors:

- `TERM_NOT_FOUND`
- `CHANGED_MEANWHILE` (409)
- `TERM_EXISTS` (409, another term has that form)
- `CORRECTION_REQUIRED` (`suspect` without correction)

### `POST /api/studies/:studyId/lexicon/terms/:termId/merge` → `LexiconTerm` (the kept term)

Body `{ version, into: { termId, version } }`. Errors:

- `TERM_NOT_FOUND`
- `CHANGED_MEANWHILE`
- `MERGE_ITSELF`
- `LANGUAGE_DIFFERS`

### `POST /api/studies/:studyId/lexicon/decisions` → `{ done: number, changed: number }`

Body `{ decision: 'accept' | 'reject', terms: { termId, version }[] }` (≤ 200): "accept all shown".

## Changed

- Assistant page context: `phase` gains `enrichment` (`packages/contracts/src/assistant.ts`).
- The ledger task `lexicon` is added to the AI Gateway's task list (usage panel).
