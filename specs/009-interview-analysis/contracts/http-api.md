# HTTP API: Analyze the interviews

All routes need a session (sign-in) and follow the study's access rules (spec 002 FR-010a). Bodies are Zod schemas in `packages/contracts/src/sessions.ts` (and `research.ts` for the setting); errors use the shared error envelope.

## Changed

### `GET /api/studies/:studyId/sessions` → `Fieldwork`

Adds:

- on each `Session`:
  - `interviewDate: string | null`, `language: 'en' | 'fr' | 'other' | null`;
  - `attachments: SessionFile[]`;
  - `analysis: { state, failure, at, by: {id, name} | null, usedAi, filesChanged, proposals: SessionProposal[] } | null`, a `SessionProposal` being `{ field, people | null, text | null, attachment (file + reason) | null, origin, quote, otherDate, status }`;
  - `cost: number | null` (USD, every account; `null` when a price is unknown).
- on `Fieldwork`:
  - `analysisCost: number | null` (sum over the study);
  - `run: { id, state, total, done, failed, startedBy: {id, name} } | null`;
  - `anonymised: boolean`;
  - `namedFiles: number` (interviews with an interviewee's name in their file names);
  - `consentNeeded: boolean` (for the current person and provider).

## New

### `POST /api/sessions/:sessionId/analysis` → `Session`

Body `{ consent?: boolean }`. Analyzes one session in the request (research R6).

Errors:

- `SESSION_NOT_FOUND`
- `SESSION_DECIDED`
- `ANALYSIS_CONSENT_REQUIRED` (409)
- `ANALYSIS_RUNNING` (409, a run covers it)
- `DRIVE_NOT_CONNECTED`

An AI failure is not an error of the request: the session comes back with `analysis.state = failed` and its reason. The app's proposals are kept.

### `GET /api/studies/:studyId/analysis-runs/estimate` → `AnalysisEstimate`

`{ count, withTranscript, estimatedCost: number | null, consentNeeded, aiConnected }`.

### `POST /api/studies/:studyId/analysis-runs` → `202 { runId }`

Body `{ consent?: boolean }`. Covers the sessions not decided by a person, never analyzed or with files changed since their analysis.

Errors:

- `ANALYSIS_RUNNING` (409)
- `ANALYSIS_CONSENT_REQUIRED` (409)
- `NOTHING_TO_ANALYZE` (409)
- `NOT_AN_INTERVIEW_STUDY`

### `POST /api/studies/:studyId/analysis-runs/:runId/stop` → `204`

Sessions already analyzed keep their proposals.

### `POST /api/sessions/:sessionId/proposals` → `Session`

Body `{ version, decisions: { field, fileId?, action: 'accept' | 'edit' | 'reject', people?, text? }[] }` (1–10 decisions). `edit` needs `people` (interviewees, interviewers) or `text` (date, language, name), validated per field (data-model). One write, version checked.

Errors:

- `SESSION_NOT_FOUND`
- `SESSION_DECIDED`
- `VERSION_CONFLICT`
- `PROPOSAL_NOT_FOUND`
- `MEDIA_UNAVAILABLE` (attachment taken)

### `GET /api/sessions/:sessionId/rename` → `RenamePlan`

`{ files: { fileId, kind: 'transcript' | 'media' | 'attachment', current, next, canEdit }[], writeAccess: boolean }`, built from the accepted name. Errors:

- `NAME_NOT_ACCEPTED` (409)
- `DRIVE_NOT_CONNECTED`

### `POST /api/sessions/:sessionId/rename` → `RenameResult`

Body `{ fileIds: Id[] }` (the files to rename, from the plan). Returns `{ results: { fileId, outcome: 'renamed' | 'cannot-edit' | 'not-found' | 'failed', name }[] }`.

Errors:

- `DRIVE_WRITE_REQUIRED` (409, offers the spec 007 consent)
- `NAME_NOT_ACCEPTED`

### `PATCH /api/studies/:studyId/settings` → `Study`

Body `{ anonymised: boolean, version }`. Research module. Errors:

- `STUDY_NOT_FOUND`
- `VERSION_CONFLICT`
