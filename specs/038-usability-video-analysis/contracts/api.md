# API contract: Usability test analysis

All routes: team and folder access as the Fieldwork (spec 026); refusals `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED`, `NOT_A_USABILITY_TEST_STUDY`.

## Study

- `GET /api/studies/:id/usability/analysis` → `{ sessions: [{ sessionId, title, participant, videoMinutes, readiness, estimate: number | null, analysis: { state, stage, failure, outOfDate, cost, toReview } | null }], run, estimate: { count, minutes, cost | null }, consentNeeded, provider: { kind, video: boolean }, cost }`
- `POST /api/studies/:id/usability/analysis/runs` `{ sessionIds?, again?, consent? }` → `{ runId }` (one session's own button sends its id alone); refusals `NOTHING_TO_ANALYZE`, `ANALYSIS_RUNNING`, `CONSENT_REQUIRED`, `USABILITY_NEEDS_VERTEX`.
- `POST /api/studies/:id/usability/analysis/runs/:runId/stop` → 204.
- `GET /api/studies/:id/usability/results` → `{ tasks: [{ taskId, instruction, sessions, outcomes: { success, partial, failure, notAttempted }, medianMs, difficulties: [{ text, sessions }], ease: number[] }], sus: { mean | null, sessions, perSession: [{ sessionId, score | null }] }, toReview }`

## Session

- `GET /api/usability/sessions/:id` → `{ session, protocolVersion, tasks: [{ taskId, instruction, criterion, result, observations[] }], rejected: Observation[], transcript: { language, segments[] } | null, cost, outOfDate }`
- `GET /api/usability/sessions/:id/video` (Range) → bytes from Drive, the person's own access.
- `GET /api/usability/observations/:id/screenshot` → `image/jpeg`.
- `POST /api/usability/observations/:id/decision` `{ action: accept | edit | reject | reopen, value?, version }` → Observation; `VERSION_CONFLICT`.
- `POST /api/usability/sessions/:id/observations` `{ kind, taskId, momentMs, text }` → Observation (origin person).
- `PUT /api/usability/task-results/:id` `{ outcome, timeOnTaskMs?, version }` → TaskResult.

## Workspace

- `GET /api/me`: `aiProvider.kind: 'vertex' | 'anthropic' | 'openai' | 'fake' | null`.
- `POST /api/projects/:id/studies` and team studies: `type: 'usability-test'` refused with `USABILITY_NEEDS_VERTEX` unless the provider in use is Vertex AI.

## Assistant

- `usability_analysis_state` (no names): sessions by analysis state, observations to review, cost so far.
- `propose_usability_analysis` card: sessions, minutes, estimate; applying starts the run.
