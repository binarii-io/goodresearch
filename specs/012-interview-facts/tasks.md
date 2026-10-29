---
description: "Task list for 012-interview-facts"
---

# Tasks: Interview verbatims and facts

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [quickstart.md](quickstart.md)

Paths under `apps/api/src/modules/` are written `evidence/…`, `transcripts/…`, `research/…`, `ingestion/…`.

Domain rules are written test-first (constitution V): the test task comes before its code and must fail first.

Deferred (analysis G3): a public `acceptedFacts(studyId)` for Synthesis comes with the insights spec.

## Phase 1: Setup

- [X] T001 Migration `apps/api/drizzle/00NN_interview_facts.sql` (next free number) and `evidence/infrastructure/schema.ts`, per [data-model.md](data-model.md):
  - `evidence_runs` (partial unique `(study_id) where finished_at is null`), `evidence_readings` (PK `session_id`), `evidence_verbatims` (index `(session_id, segment_id)`, `text` 3–120 words checked in the domain, `reason ≤ 200`), `evidence_facts` (`statement_en`/`statement_fr ≤ 200`, checks on `polarity`, `status`, `origin`, `translation`), `evidence_fact_verbatims` (PK both, cascade both), `evidence_speakers` (PK `(session_id, speaker)`), `evidence_consents` (PK `(account_id, study_id)`);
  - every `session_id` → `ingestion_sessions(id)` and every `study_id` → `research_studies(id)`, `on delete cascade`;
  - `research_studies.text_analysed text not null default 'with-corrections'` with check `in ('with-corrections', 'clean-only')` (in `research/infrastructure/schema.ts`).
- [X] T002 [P] Contracts in `packages/contracts/src/facts.ts` (exported in `index.ts`), per [contracts/http-api.md](contracts/http-api.md): `TextAnalysed`, `Analysis`, `AnalysisInterview`, `AnalysisEstimate`, `StartAnalysisRun`, `AnalysisRun`, `InterviewFacts`, `Verbatim`, `AddVerbatim`, `AttributeSpeaker`, `Fact`, `FactsQuery`, `FactsPage`, `CreateFact`, `DecideFact`, `AcceptFacts` (≤ 500); study settings gain `textAnalysed` in `research.ts`. Error codes in `errors.ts`: `FACTS_RUNNING`, `FACTS_CONSENT_REQUIRED`, `NOTHING_TO_ANALYSE`, `VERBATIM_NOT_FOUND`, `INTERVIEWER_TURN`, `VERBATIM_LENGTH`, `NAME_IN_STATEMENT`, `SPEAKER_TO_ATTRIBUTE`, `FACT_NEEDS_VERBATIM`, `FACT_NOT_FOUND`; reuse `ENRICHMENT_RUNNING`, `VERSION_CONFLICT`, `AI_PROVIDER_REQUIRED`.
- [X] T003 [P] Queues `evidence.facts` (exclusive by study, no retry, 120 min expiry) and `evidence.translate` (retry 1) in `apps/api/src/platform/jobs.ts`.
- [X] T004 [P] Move `makeChunks` and its tests from `transcripts/domain/chunks.ts` to `packages/shared/src/chunks.ts`; transcripts imports it from shared (R4).

## Phase 2: Foundational (blocks every story)

- [X] T005 Transcripts public API (returned by `createTranscriptsModule`), with use-case tests:
  - `analysedText(studyId, sessionId, mode)` → `{ turns, rawImportedAt, fingerprint } | null`: `with-corrections` applies the effective corrections with status `accepted`, `edited` or `proposed` (never `rejected`) through `loadCorrections` + `applyCorrections`; `clean-only` returns the latest validated clean version, else null (R2);
  - `importMissing(accountId, studyId, sessionIds)`: imports the raw versions missing or changed in Drive, as the cleaning run does (spec 011 FR-002, `importTranscript`), and returns the interviews that failed with their reason;
  - `enrichmentLive(studyId)`; `TranscriptsDeps.otherRunLive` also returns true while an analysis run is live (`FACTS_RUNNING` from cleaning and lexicon starts).
- [X] T006 Research: the study setting `textAnalysed` (domain, command with version check, `PATCH …/settings`, query), with tests; a `guideThemes(accountId, studyId)` read for Evidence: sections of kind `theme` → `{ id, title }[]` (R12); the project's research goal.
- [X] T007 Ports in `evidence/application/ports.ts`: `AnalysisSources` (sessions, people via `cleaningNames`, known names, analysed text, settings, themes, goal, study access, enrichment live), `FactsAi` (`verbatims`, `facts`, `translate`, `estimate`, `providerOf`, `costs`), `EvidenceStore`. Fakes in `evidence/tests/fakes/`. Module skeleton `evidence/infrastructure/module.ts`, `evidence/index.ts`, wiring in `apps/api/src/compose.ts`, job handlers in the worker; dependency-cruiser allows `evidence` only through `index.ts`.
- [X] T008 Drizzle store `evidence/infrastructure/evidence.drizzle-store.ts` and the in-memory store: runs (heartbeat, stop, save while unfinished), readings, verbatims, facts with version check and their links, `replaceReading(sessionId, keep, verbatims, facts)` in one transaction (R7), speakers, consents.
- [X] T009 [P] Web: the Analysis tab in `apps/web/src/routes/_authenticated/studies/$studyId.tsx` renders `apps/web/src/features/analysis/analysis-tab.tsx` with inner tabs "Interviews" and "Facts (X to decide)"; the interview view opens in place (as Cleaning's review), with a back button; assistant page context entries.

## Phase 3: User Story 1 — Find facts (P1) 🎯 MVP

**Goal**: verbatims and facts proposed for each validated interview, with costs.
**Independent test**: quickstart scenario 1.

- [X] T010 [P] [US1] Test-first `evidence/tests/verbatims.test.ts` then `evidence/domain/verbatims.ts`: `checkVerbatims(chunk, answer, roles)` — new part only, interviewee or attributed turn, `quoteFound`, the turn's own span, 3–120 words, not across a placeholder, inside-merge, once across overlaps; counts left out (R6).
- [X] T011 [P] [US1] Test-first `evidence/tests/speakers.test.ts` then `evidence/domain/speakers.ts`: `speakerRole(label, people, attributions, anonymised)` — name or code match by `nameKey`, interviewer, the single-interviewee rule, unknown (R8).
- [X] T012 [P] [US1] Test-first `evidence/tests/facts.test.ts` then `evidence/domain/facts.ts`: `checkFacts(answer, verbatimIds, themes, names)` — known ids, theme sent, both statements 1–200 chars, no placeholder, no known name, polarity; a fact without verbatim dropped (R6).
- [X] T013 [P] [US1] Test-first `evidence/domain/analysis-run.ts` (live, stale, interrupted, per-interview states `waiting | verbatims | facts | done | failed`) and refs `factsRef(runId, sessionId)`, `translationRef(sessionId)`.
- [X] T014 [US1] Prompts `evidence/infrastructure/prompts/facts.ts`: tasks `fact-verbatims`, `facts`, `fact-translation` with Zod output schemas (≤ 60 verbatims per chunk, ≤ 80 facts per batch), placeholders via `withPlaceholders`, `createFactsAi`; the ai-gateway fake runner answers the three tasks as [quickstart.md](quickstart.md) says.
- [X] T015 [US1] `evidence/application/commands/analysis-commands.ts`: `estimate` (chunks + fact pass ≈ 15% of the text), `giveConsent`, `start` (consent, provider, `FACTS_RUNNING`, `ENRICHMENT_RUNNING`, `NOTHING_TO_ANALYSE`; `all`, `sessionIds`), `stop`. Use-case tests with fakes.
- [X] T016 [US1] The job `runAnalysisJob`: `importMissing` for the interviews of the run → per interview (3 at once) → analysed text (null → `NOT_CLEAN` / `NO_TRANSCRIPT`) → roles → chunks (2 at once, one retry) → checked verbatims → fact pass (batches of 150) → checked facts → `replaceReading` with R7 rules; heartbeat, stop between chunks, a provider lost fails the remaining interviews with `AI_PROVIDER_REQUIRED`, a redelivered job takes back interviews left in progress. Use-case tests, including "no known name in any request".
- [X] T017 [US1] Query `evidence/application/queries/analysis-queries.ts` `analysisList` (states, counts, cost per interview, last and total cost, run) and routes in `evidence/infrastructure/http.routes.ts` (list, estimate, consent, runs, stop).
- [X] T018 [US1] Web `features/analysis/interviews-table.tsx` (clickable rows, truncated titles, state with text label, counts, cost, "Find facts" / "Find facts again" per row) and `analysis-run-dialog.tsx` (estimate, consent text, progress per interview, stop), `labels.ts`.

## Phase 4: User Story 2 — Decide the facts (P1)

**Goal**: a person accepts, edits, rejects and creates facts; adds and sets aside verbatims.
**Independent test**: quickstart scenarios 2, 3, 6.

- [X] T019 [P] [US2] Test-first `Fact` invariants in `evidence/domain/facts.ts`: create (≥ 1 verbatim of the interview, no name, accepted), decide (accept, reject, edit → `edited`), version, attributed speakers required (`SPEAKER_TO_ATTRIBUTE`).
- [X] T020 [P] [US2] Test-first `isReproposal(fact, rejected)` (verbatims ⊆ a rejected fact's, or ≥ 60% shared words in either language) and `mergeVerbatims(existing, found, setAside)` (R7).
- [X] T021 [US2] `evidence/application/commands/fact-commands.ts`: `decide`, `create`, `acceptMany` (loads once, each with its version), `addVerbatim` (place checked in the analysed text, interviewee turn, 3–120 words; attach to a fact or not), `setAside` (removes it from facts still to decide), `attributeSpeaker`. Use-case tests.
- [X] T022 [US2] Translation: a person's statement in one language → the other `translating`, job `evidence.translate` with the person's connection (ref `facts-translation:<sessionId>`), `done` or `not-translated`; skip when the fact changed meanwhile; retry route. Use-case tests.
- [X] T023 [US2] Queries (participant shown as their pseudonym when the study is anonymised, else their name — FR-015, tested) `interviewFacts` (turns with roles, verbatims re-anchored, facts, speakers, themes, cost) and `factsPage` (filters, 50 per page); routes for facts, verbatims, speakers.
- [X] T024 [US2] Web `features/analysis/interview-facts.tsx`: transcript with verbatims marked (`<mark>` + sr-only label), facts beside it (statement in the viewer's language, "translating…", polarity and status as text), filters (status, theme, polarity, participant), selecting a fact highlights its verbatims and the reverse, text selection in an interviewee turn → "Add verbatim" (and a keyboard path from the turn's menu), set aside, attribute speaker dialog, fixed footer "Accept all shown", "Find facts again".
- [X] T025 [US2] Web `features/analysis/fact-dialog.tsx` (create and edit: statement EN/FR, polarity, theme, verbatims) and `facts-table.tsx` (the study's Facts view: filters incl. interview, decisions, link to the verbatim in its interview).

## Phase 5: User Story 3 — Text analysed (P2)

**Goal**: choose the corrected text or the validated clean version only.
**Independent test**: quickstart scenario 4.

- [X] T026 [US3] The setting in the study settings UI (`features/research/…`), EN/FR, with an explanation of each choice.
- [X] T027 [US3] `clean-only` without clean version → `not-clean` and not read; a reading stores `text_analysed` and `anonymised`; a change of either → `to-analyse-again`. Tests.

## Phase 6: User Story 4 — Follow (P3)

**Goal**: states that follow the text without needless re-readings.
**Independent test**: quickstart scenario 5.

- [X] T028 [P] [US4] Test-first `evidence/domain/verbatims.ts` `reanchor(verbatim, turns)` (same turn near the offset, then the speaker's other turns, else lost) and `evidence/domain/analysis-state.ts` `analysisState(...)` (a fingerprint change alone does not mark; lost verbatim, raw re-imported, setting or anonymisation changed do).
- [X] T029 [US4] Use them in the queries (no write) and save new places in commands; "Find facts again" for one interview keeps decided facts and replaces proposed ones. Tests.

## Phase 7: Polish

- [X] T030 [P] i18n: `pnpm --filter @goodresearch/web i18n:extract`, French in `apps/web/src/locales/fr/messages.po` (0 missing), glossary terms (Verbatim / Verbatim, Fact / Fait, Set aside / Écarter, Text analysed / Texte analysé).
- [X] T031 [P] Postgres component tests `apps/api/tests/facts.component.test.ts`: cascade with the session, run with stop and stale, exclusive runs both ways, no known name in any AI request, costs = ledger sums, translation job, re-reading keeps decisions, every new route refused (404) to a person without access to the study (FR-019).
- [X] T032 [P] e2e `apps/web/e2e/analysis-facts.spec.ts`: quickstart scenarios 1, 2, 6 with axe in light and dark themes.
- [X] T033 Docs: context map (Evidence: Verbatim, Fact, AnalysisRun, text analysed, glossary EN/FR), `evidence/infrastructure/README.md` (or module README), transcripts README (`analysedText`), `apps/api` README (module, queues, migration), research README (setting).
- [X] T034 `pnpm generate`, `pnpm check`, `pnpm test`; quickstart run on the local stack.

## Dependencies

- Setup → Foundational → US1 → US2 (decisions need facts) → US3, US4 (either order) → Polish.
- T004 before T005 and T016; T005, T006 before T016; T010–T013 before T016; T019–T020 before T021.

## Parallel examples

- Setup: T002, T003, T004 together.
- US1: T010, T011, T012, T013 together (separate files).
- US2: T019 and T020 together; T024 and T025 once T023 is done.

## Implementation strategy

MVP = US1 + US2 (facts found and decided). Then US3 and US4. Each phase ends green (`pnpm check`, tests) and is committed locally.
