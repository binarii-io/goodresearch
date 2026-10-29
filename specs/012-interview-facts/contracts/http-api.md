# HTTP API: Interview verbatims and facts

Zod schemas in `packages/contracts/src/facts.ts`; OpenAPI and the client are generated. Every route checks study access (spec 002 FR-010a). Errors use the shared codes.

## Study setting

- `PATCH /api/studies/:studyId/settings` (existing) gains `textAnalysed: 'with-corrections' | 'clean-only'`.

## Interviews

- `GET /api/studies/:studyId/facts-analysis` → `FactsOverview { interviews: FactsInterview[], run: FactsRunView | null, lastRunCost, cost, counts: { done, toDecide }, consentNeeded, anonymised, textAnalysed }`
  - `FactsInterview`: `sessionId, title, interviewDate, state, verbatims, facts: { toDecide, accepted, rejected }, lost, readAt, cost, failure, reading: { state: waiting|verbatims|facts|done|failed, chunks, chunksDone, stoppable } | null` (`reading` while a live run covers the interview).
- `GET /api/studies/:studyId/facts-runs/estimate?sessionId=&all=` → `FactsEstimate { interviews, chunks, cost, consentNeeded, aiConnected }`.
- `POST /api/studies/:studyId/facts-runs` `StartFactsRun { all, consent, sessionIds? }` → 202 `{ runId }`. Errors: `FACTS_RUNNING` (also when the queue still holds a job of the study: the run is closed at once), `ENRICHMENT_RUNNING`, `FACTS_CONSENT_REQUIRED`, `NOTHING_TO_ANALYSE`, `AI_PROVIDER_REQUIRED`. ("Analysis" names are spec 009's: the contracts use `Facts…`.)
- `POST /api/studies/:studyId/facts-runs/consent` → 204.
- `POST /api/studies/:studyId/facts-runs/:runId/stop` → 204.
- `POST /api/studies/:studyId/facts-runs/:runId/sessions/:sessionId/stop` → 204: one interview taken out (failure `STOPPED`). Errors: `NOT_FOUND`, `TOO_LATE_TO_STOP` (409, its reading already ended).

## Interview view

- `GET /api/studies/:studyId/facts-analysis/:sessionId` → `InterviewFacts` `{ title, state, turns: { id, speaker, role, text }[], verbatims: Verbatim[], facts: Fact[], speakers: { label, participant | null }[], themes: Theme[], cost }`
  - `Verbatim`: `id, segmentId, offset, length, text, participant, reason, origin, lost, facts: Id[]`.
  - `Fact`: `id, sessionId, statement: { en, fr }, translation, polarity, theme: { id, title } | null, verbatims: Id[], origin, status, decidedBy, decidedAt, version, participants`.
- `POST /api/studies/:studyId/facts-analysis/:sessionId/verbatims` `{ segmentId, offset, length, fact?: { id, version } }` → 201 `{ id }`; with `fact`, the verbatim is added to it without deciding it (a proposed fact stays to decide). Errors: `VERBATIM_NOT_FOUND` (text not at that place), `INTERVIEWER_TURN`, `VERBATIM_LENGTH`, `VERSION_CONFLICT`, `SPEAKER_TO_ATTRIBUTE` (an accepted fact, a speaker not attributed).
- `PATCH /api/studies/:studyId/facts-analysis/:sessionId/verbatims/:verbatimId` `ResizeVerbatim { segmentId?, offset, length }` → 204: a person narrows (or widens) a verbatim to the words they select; it keeps its id and facts and becomes theirs (`origin: person`). Errors as adding one.
- `POST /api/studies/:studyId/facts-analysis/:sessionId/verbatims/:verbatimId/set-aside` → 204 (removes it from its facts still to decide). Errors: `SESSION_NOT_FOUND` (not an interview of the study the person sees), `VERBATIM_NOT_FOUND`.
- `PUT /api/studies/:studyId/facts-analysis/:sessionId/speakers` `{ label, participant }` (an interviewee's code, or `interviewer`: its verbatims are set aside) → 204. Errors: `SESSION_NOT_FOUND`, `VALIDATION`.

## Facts

- `GET /api/studies/:studyId/facts?status=&theme=&polarity=&participant=&sessionId=&page=` → `{ facts: Fact[], total, page }` (50 per page).
- `POST /api/studies/:studyId/facts` `{ sessionId, statement: { en?, fr? }, polarity, themeId: Id | null, verbatims: Id[] }` → 201 `{ id }` (accepted). Errors: `NAME_IN_STATEMENT`, `VERBATIM_NOT_FOUND`, `SPEAKER_TO_ATTRIBUTE`.
- `PATCH /api/studies/:studyId/facts/:factId` `{ version, decision: 'accept' | 'reject' | 'edit', statement?, polarity?, themeId?, verbatims? }` → 204. Errors: `VERSION_CONFLICT`, `NAME_IN_STATEMENT`, `SPEAKER_TO_ATTRIBUTE`, `FACT_NEEDS_VERBATIM`.
- `POST /api/studies/:studyId/facts/accept` `{ facts: { id, version }[] }` → `FactsBulkResult { done, changed }`.
- `POST /api/studies/:studyId/facts/:factId/translate` → 204 (retry a failed translation).

## Jobs

- `evidence.facts` `{ runId, studyId, all }` — exclusive per study (the run holds who started it).
- `evidence.translate` `{ factId, version, accountId, from: 'en' | 'fr', text }` (applies while `text` is still the statement in `from`).

## AI tasks (schema-constrained, through the gateway)

- `fact-verbatims`: in → turns `t1…` with role and text (placeholders), goal, themes; out → `{ verbatims: { turn, text, reason }[] }` (≤ 60 per chunk).
- `facts`: in → verbatims `v1…` with speaker code, themes `s1…` + `other`, goal; out → `{ facts: { statement: { en, fr }, polarity, theme, verbatims }[] }` (≤ 80 per batch).
- `fact-translation`: in → statement, from, to; out → `{ statement }`.
