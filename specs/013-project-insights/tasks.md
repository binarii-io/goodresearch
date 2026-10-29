---
description: "Task list for 013-project-insights"
---

# Tasks: Project insights

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [quickstart.md](quickstart.md)

Paths under `apps/api/src/modules/` are written `synthesis/…`, `evidence/…`, `research/…`.

Domain rules are written test-first (constitution V): each test task comes before its code and must fail first.

## Phase 1: Setup

- [X] T001 Write the migration `apps/api/drizzle/0032_project_insights.sql` (next free number) and `synthesis/infrastructure/schema.ts`, per [data-model.md](data-model.md):
  - `synthesis_runs`: partial unique index `(project_id) where finished_at is null`; check `scope in ('all','unlinked')`.
  - `synthesis_insights`: `statement_* ≤ 200`, `description_* ≤ 1000`, `counter_*` and `minority_* ≤ 500`; checks on `status`, `origin`, `translation`; index `(project_id, status)`.
  - `synthesis_insight_facts`: PK `(insight_id, fact_id)`, cascade on the insight, no FK on the fact; checks on `role` and `state`; index `fact_id`.
  - `synthesis_consents`: PK `(account_id, project_id)`.
  - Every `project_id` references `research_projects(id)` with `on delete cascade`.
- [X] T002 [P] Write the contracts in `packages/contracts/src/insights.ts` (exported in `index.ts`), per [contracts/http-api.md](contracts/http-api.md):
  - `InsightTheme`, `Confidence`, `InsightPolarity`, `InsightCard`, `InsightDetail`, `InsightLink`;
  - `CreateInsight`, `EditInsight`, `DecideInsight`, `ValidateInsights` (≤ 200), `LinkFact`;
  - `ProjectFactsQuery`, `ProjectFactsPage` (25);
  - `InsightRunEstimate`, `StartInsightRun`, `InsightRunView`.

  Add the error codes to `errors.ts`: `INSIGHT_NOT_FOUND`, `INSIGHT_NEEDS_SUPPORT`, `FACT_NOT_ACCEPTED`, `INSIGHTS_RUNNING`, `NO_FACTS`, `STUDY_ACCESS_REQUIRED`, `INSIGHTS_CONSENT_REQUIRED`. Reuse the existing codes.
- [X] T003 [P] Add the queues `synthesis.insights` (exclusive by project, no retry, 60 min expiry) and `synthesis.translate` (retry 1) in `apps/api/src/platform/jobs.ts`.
- [X] T004 [P] Move `shareOf` from `evidence/domain/facts.ts` to `packages/shared/src/text.ts` as `sharedWords(a, b)`, with tests. Evidence imports it from shared (R6).

## Phase 2: Foundational (blocks every story)

- [X] T005 Add the Evidence public reads (returned by `createEvidenceModule`, exported through `index.ts`), with use-case tests:
  - `projectFacts(studyIds)`: the accepted and edited facts, with `participants` (the codes of their verbatims, not set aside), `studyId`, `sessionId`, `version`, `decidedAt`;
  - `factsByIds(ids)`: any status, absent when deleted;
  - `knownNames(accountId, studyId)`, already wired for Evidence, also offered to Synthesis.

  Update `evidence/infrastructure/README.md` (public reads).
- [X] T006 Add the research reads for Synthesis (ports wired in `compose.ts`):
  - `projectAccess(accountId, projectId)` → `{ teamId, role } | null`;
  - `projectStudies(accountId, projectId)` → `{ id, name, access: boolean }[]`, where `access` is the person's folder access (spec 002 FR-010a);
  - the project's goal;
  - `guideThemes(accountId, studyId)`, already used by Evidence.
- [X] T007 Write the ports in `synthesis/application/ports.ts`: `SynthesisSources`, `InsightsAi` (`insights`, `translate`, `estimate`, `providerOf`, `costs`) and `SynthesisStore`. Add the fakes in `synthesis/tests/fakes/`, the module skeleton `synthesis/infrastructure/module.ts` and `synthesis/index.ts`, the wiring in `apps/api/src/compose.ts`, and the job handlers in the worker. In dependency-cruiser, allow `synthesis` only through `index.ts`.
- [X] T008 Write the Drizzle store `synthesis/infrastructure/synthesis.drizzle-store.ts` and the in-memory store:
  - runs: start (false if open), save while unfinished, stop, heartbeat;
  - insights, with a version check and their links in one transaction;
  - `applyRun(projectId, creates, updates, suggested)` in one transaction;
  - consents.
- [X] T009 [P] Web: give `apps/web/src/routes/_authenticated/projects/$projectId.tsx` the tabs "Overview" (today's content) and "Insights" (`?tab=insights`, `Tabs` of `packages/ui`), rendering `apps/web/src/features/synthesis/insights-tab.tsx`.

## Phase 3: User Story 1 — Find insights (P1) 🎯 MVP

**Goal**: insights proposed from the accepted facts, with computed confidence and polarity, and their costs.
**Independent test**: quickstart scenario 1.

- [X] T010 [P] [US1] Test-first `synthesis/tests/fact-lines.test.ts`, then `synthesis/domain/fact-lines.ts`:
  - `factLines(facts, studies, language, scope, links)`: refs `fN` in study → interview → theme order;
  - participant `P01`, or `S2-P01` with several studies;
  - theme refs `tN`;
  - batches under 40,000 characters, grouped by theme (R2, R3).
- [X] T011 [P] [US1] Test-first `synthesis/tests/insights.test.ts`, then `synthesis/domain/insights.ts`:
  - `checkInsights(answer, refs, themes, names)`:
    - known refs only;
    - at least one support;
    - lengths;
    - theme sent or `other`;
    - percentage sentences removed;
    - a statement with a name or a percentage drops the insight.
  - `isReproposal(candidate, rejected)`, `isRepeated` (60% of the words, or the same supports).
  - The cap of 25 by supporting participants (R5, R6, R8).
- [X] T012 [P] [US1] Test-first `synthesis/tests/merge.test.ts`, then `mergeInsights` in `synthesis/domain/insights.ts` (R5):
  - new → proposed;
  - an update of a proposed insight → texts and `ai` links replaced, `person` links kept;
  - an update of a decided insight → only `suggested` links;
  - a rejected insight is untouched;
  - an unlinked fact is never re-added;
  - an unknown `ref` is dropped.
- [X] T013 [P] [US1] Test-first `synthesis/tests/confidence.test.ts`, then `synthesis/domain/confidence.ts` (R4):
  - `panel`;
  - `confidence`: the thresholds high/medium/low, max(5, ceil(30%)), lowered by one level when counter ≥ ceil(support/2), `missingForHigh`;
  - `polarity`: neutral < 30% polarised, 60% of the polarised, mixed, no support → neutral;
  - only counted links to accepted facts inside the project count.
- [X] T014 [P] [US1] Test-first `synthesis/domain/insight-run.ts`: live, stale (10 min), interrupted, progress; refs `insightsRef(runId, n)` and `insightTranslationRef(projectId)`.
- [X] T015 [US1] Write the prompts in `synthesis/infrastructure/prompts/insights.ts`:
  - tasks `insights` and `insight-translation`, with Zod output schemas (≤ 40 insights per call);
  - the system prompt: no percentages, counter-evidence and minority view required, "None" allowed, cite only the given refs, avoid the listed statements;
  - `createInsightsAi`.

  Make the ai-gateway fake runner answer both tasks, as [quickstart.md](quickstart.md) says.
- [X] T016 [US1] Write `synthesis/application/commands/insight-run-commands.ts`, with use-case tests:
  - `estimate`: facts, calls, cost, consent needed;
  - `start`: access, studies the person can open, consent, provider, `INSIGHTS_RUNNING`, `NO_FACTS`;
  - `stop`;
  - `runJob`: batches 2 at a time, a retry once per call, a stop between calls, merge and `applyRun` per call, the heartbeat, failures, `leftOut`.
- [X] T017 [US1] Write `synthesis/application/queries/insight-queries.ts` `getInsights`, with tests: cards grouped by theme, with the derived confidence and polarity, filters, counts, the last run and its progress, and the costs (last run and total, translations included).
- [X] T018 [US1] Add the routes in `synthesis/infrastructure/http.routes.ts`: `getInsights`, `estimateInsightRun`, `startInsightRun`, `stopInsightRun`. Regenerate OpenAPI and the client (`pnpm generate`).
- [X] T019 [US1] Web: write `insights-tab.tsx` (header with counts and cost, "Find insights", filters, cards grouped by theme, empty state with links to the studies), `insight-card.tsx` (a confidence badge with an icon, a text label and a `Tooltip` with the calculation; a polarity tag; "for N · against M"), `insight-run-dialog.tsx` (studies with counts, scope, estimate, consent, progress, stop) and `labels.ts`.

## Phase 4: User Story 2 — Decide the insights (P1)

**Goal**: a person validates, edits, rejects, links facts, or writes insights by hand.
**Independent test**: quickstart scenario 2.

- [X] T020 [P] [US2] Test-first the `Insight` invariants in `synthesis/domain/insights.ts`:
  - validate, edit and create need one counted support link to an accepted fact (`INSIGHT_NEEDS_SUPPORT`);
  - no name in the statement;
  - a person's edit → `edited`, create → `validated` (origin `person`);
  - one role per fact;
  - link, unlink (state `unlinked`), accepting a suggested link, dismissing it (→ `unlinked`).
- [X] T021 [US2] Write `synthesis/application/commands/insight-commands.ts`, with use-case tests:
  - `create`, `edit`, `decide`, `validateMany` (each with its own version check), `link`, `unlink`;
  - the edit queues a translation; `translateJob` and `retryTranslation` follow spec 012 R9.
- [X] T022 [US2] Write the query `getInsight`: texts in both languages, links grouped by participant (code, study) with role, state and the fact's statement (null without study access), and the confidence explanation.
- [X] T023 [US2] Add the routes `getInsight`, `createInsight`, `editInsight`, `decideInsight`, `validateInsights`, `linkFact`, `unlinkFact`, `retryInsightTranslation`, and regenerate the client.
- [X] T024 [US2] Web:
  - `insight-dialog.tsx`: editable texts with the EN/FR toggle, "translating…", facts grouped by participant with role, change role, unlink, accept or dismiss suggested facts, links to the fact in its study, validate and reject;
  - `new-insight-dialog.tsx`;
  - "Validate all shown" in the tab footer.

## Phase 5: User Story 3 — Browse the facts (P2)

**Goal**: a paged facts panel beside the insights.
**Independent test**: quickstart scenario 3.

- [X] T025 [US3] Write the query `listInsightFacts`, with tests: 25 per page; search on the statement in the viewer's language (folded); filters polarity, theme, study, "not in any insight" (no counted or suggested link); the number of insights citing each fact; statements hidden for studies without access.
- [X] T026 [US3] Add the route `listInsightFacts`. Web: `facts-panel.tsx` (`Sheet`), with search, filters and paging, and "Link as support / counter" when an insight is open.

## Phase 6: User Story 4 — Evidence changed (P2)

**Goal**: insights show the facts that changed after they were decided.
**Independent test**: quickstart scenario 4.

- [X] T027 [P] [US4] Test-first `synthesis/tests/links.test.ts`, then `synthesis/domain/links.ts`: `linkState(link, fact, projectStudyIds)` → `accepted | not-accepted | deleted | outside | changed`, and `evidenceChanged(links, facts)` (R7).
- [X] T028 [US4] Make links store the fact snapshot on create, link and edit, and add the command `markReviewed` (refresh the snapshots), with tests. Cards and the detail show the state and "Evidence changed (n)". Add the route `markInsightReviewed`, and in the web, "Reviewed" in the insight dialog.

## Phase 7: Polish

- [X] T029 [P] Fill the EN/FR catalogs (`pnpm --filter @goodresearch/web i18n:extract`, `fr/messages.po`) with the glossary terms: Insight, Confidence (élevée / moyenne / faible), Counter-evidence (Contre-exemples), Minority view (Point de vue minoritaire), Evidence changed (Preuves modifiées).
- [X] T030 [P] Docs:
  - the context map (Synthesis: Insight with its links, role and state, InsightRun, the confidence without the team condition, the glossary);
  - `synthesis/infrastructure/README.md`;
  - `apps/api/README.md` (module, queues, migration);
  - this spec's research if something changed.
- [X] T031 Write the Postgres component test `apps/api/tests/synthesis.int.test.ts`: one open run per project, `applyRun` in one transaction, cascade on project deletion, links kept when a fact is deleted.
- [X] T032 Write the e2e `apps/web/e2e/insights.spec.ts` (quickstart 1, 2, 6, with axe in light and dark themes) and run `pnpm check`, `pnpm test` and the e2e.

## Dependencies

- Setup (T001–T004) → Foundational (T005–T009) → US1 → US2. US3 and US4 depend on US2's links and can run in parallel after it. Polish comes last.
- Within a story, a test task comes before its code; [P] tasks touch different files.

## Implementation strategy

The MVP is US1 + US2 (find and decide). US3 and US4 come next in the same PR. Commit locally per phase; push only on request.
