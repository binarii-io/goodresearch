# HTTP API: Interview quality

Zod schemas in `packages/contracts/src/quality.ts`; OpenAPI and the client are generated. Every route checks study access (spec 002 FR-010a). Errors use the shared codes.

## Overview

- `GET /api/studies/:studyId/quality` → `QualityOverview { overall: Figures | null (only the interviews reviewed; null before any review), reviewed, total, people: PersonRow[], interviews: InterviewRow[], run: QualityRunView | null, lastRunCost, cost, consentNeeded, anonymised }`
  - `Figures`: `words: { interviewers, interviewees, unknown }`, `minutes | null`, `sentences`, `questions`, `simpleReformulations`, `leading: { questions, reformulations, opinions }`, each as `{ agreed, noOpinion, disagreed }`, `leftOut`.
  - `PersonRow`: `key` (interviewer code, or `not-identified`), `name`, `interviews`, `figures`; name order.
  - `InterviewRow`: `sessionId, title, interviewDate, interviewers, state, action (review | review-again | review-anyway | null), figures | null (until reviewed), cost | null (nothing recorded, or no price), failure, reading | null`.
  - `state` also takes `not-clean` and `speakers-not-identified`.

## Interview

- `GET /api/studies/:studyId/quality/interviews/:sessionId` → `QualityInterview { sessionId, title, interviewDate, state, turns: { id, speaker, role, start, text }[] | null, figures | null, remarks: Remark[], reformulations: SimpleReformulation[], speakers: { label, role }[], participants: { code, label }[], cost }`. Opening it imports the transcript when missing (no AI). Before a review: `turns` only. Errors: `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED`, `SESSION_NOT_FOUND`.

## Remarks

- `GET /api/studies/:studyId/quality/remarks?person=&sessionId=&kind=&stance=` → `{ remarks: Remark[], total }`
  - `Remark`: `id, sessionId, interviewTitle, person, personKey, kind, segmentId, offset, length, text, before, after, reason: { en, fr }, recommendation, addedElement, origin, stance, stanceBy, stanceAt, lost, version`.
- `PUT /api/studies/:studyId/quality/remarks/:remarkId/stance` `{ stance: 'agree' | 'disagree' | null, version }` → 204. Errors: `NOT_FOUND`, `VERSION_CONFLICT`, `PERSON_REMARK_STANCE` (a person's remark can only be withdrawn).
- `DELETE /api/studies/:studyId/quality/remarks/:remarkId?version=` → 204: withdraws a person's remark. Errors: `NOT_FOUND`, `VERSION_CONFLICT`, `AI_REMARK`.

## Simple reformulations

- `GET /api/studies/:studyId/quality/reformulations?person=&sessionId=` → `{ reformulations: { id, sessionId, interviewTitle, person, personKey, segmentId, offset, length, text, before, after }[], total }`.
- `POST /api/studies/:studyId/quality/reformulations/:reformulationId/requalify` `{ reason, recommendation? }` → 201 `{ remarkId }`. Errors: `NOT_FOUND`, `ALREADY_REQUALIFIED`.

## Reviews

- `GET /api/studies/:studyId/quality-runs/estimate?sessionId=&all=` → `{ interviews, chunks, cost, consentNeeded, aiConnected }`.
- `POST /api/studies/:studyId/quality-runs` `{ all, consent, sessionIds? }` → 202 `{ runId }`. Errors: `QUALITY_RUNNING`, `ENRICHMENT_RUNNING`, `FACTS_RUNNING`, `QUALITY_CONSENT_REQUIRED`, `NOTHING_TO_REVIEW`, `AI_PROVIDER_REQUIRED`.
- `POST /api/studies/:studyId/quality-runs/consent` → 204.
- `POST /api/studies/:studyId/quality-runs/:runId/stop` → 204.

## Job and AI task

- Queue `quality.review`, `exclusive` keyed by study id; payload `{ runId, studyId, accountId }`, validated with Zod.
- AI task `interview-review`, ledger ref `quality:<runId>:<sessionId>`; the answer is validated with Zod ([research R3](../research.md)).

## Web

- Study route: `phase` gains `quality`; `view` and `person` give the tab's view; `phase=quality&interview=<id>&turn=<segmentId>` opens the interview to read, and is where a remark links.
