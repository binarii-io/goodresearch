---
description: "Tasks for spec 039, one fact lifecycle for every type of study"
---

# Tasks: One fact lifecycle for every type of study

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: required (constitution V). Domain rules are written test first; use cases run on fakes; the component tests run on PostgreSQL; the e2e runs with axe.

Paths:
- `E/` = `apps/api/src/modules/evidence/`
- `U/` = `apps/api/src/modules/usability/`
- `S/` = `apps/api/src/modules/synthesis/`
- `W/` = `apps/web/src/features/`
- `C/` = `packages/contracts/src/`

## Phase 1: Setup

- [X] T001 Migration `apps/api/drizzle/0064_common_fact_lifecycle.sql`, with the Drizzle schema in `E/infrastructure/schema.ts`:
  - `evidence_usability_supports.observation_id` becomes nullable;
  - add `task_id text`, `outcomes jsonb`, `sessions integer` and `figures_changed boolean not null default false`;
  - check that exactly one of `observation_id` and `task_id` is set;
  - unique index on `(task_id)` joined to the fact's study, through a `study_id` column copied on the support;
  - widen `evidence_facts`' session/source check so that a usability fact with a task support may have no session.

## Phase 2: Foundational (blocks every story)

- [X] T002 [P] Tests first, then domain, in `E/domain/facts.ts` and `E/domain/survey-facts.ts`: decision `reopen`.
  - A decided fact goes back to `proposed`; decidedBy/decidedAt are cleared; version + 1; refused on a stale version; refused when already to decide (`INVALID_TRANSITION`).
  - Tests in `E/tests/facts-domain.test.ts` and `E/tests/survey-facts.test.ts`.
- [X] T003 [P] Tests first, then domain, in `E/domain/usability-facts.ts`:
  - `observationFact` takes the status from the observation (`proposed`, `accepted`, `edited`, `rejected`);
  - `taskFact(input, current, at, newId)` builds a task fact:
    - counts of decided outcomes;
    - statement in EN and FR, written by the app;
    - polarity: negative when failures and non-attempts make up at least half, positive when successes make up at least 80 %, neutral otherwise;
    - theme = the task;
    - when a decided fact's counts change, it goes back to `proposed` with `figuresChanged = true`;
    - while it is proposed, the statement is updated;
    - a person's edit is kept until the counts change.
  - Tests in `E/tests/usability-facts.test.ts`.
- [X] T004 Contracts in `C/facts.ts`:
  - `FactRow`, `FactBoardQuery`, `FactBoardPage`, `DecideAnyFact` (accept, edit, reject, reopen), `AcceptAnyFacts`, `FactsBulkResult` (reused);
  - `reopen` in `DecideFact` and in `C/survey-analysis.ts` `DecideSurveyFact`;
  - in `C/insights.ts`, `ProjectFact` gains `version`, `canDecide`, `evidence` and the full status.
  - Export them from `C/index.ts`.

## Phase 3: User Story 2 — Usability observations give facts to decide (P1)

**Goal**: An analysed session's observations, kept or doubted by the checks, are facts to decide. Deciding the observation or its fact decides both. Each task has its task fact.

**Independent test**: Analyse a session (fake provider). Its kept observations are facts to decide. Reject one in the session: its fact is rejected. Confirm two task outcomes: the task fact appears.

- [X] T005 [US2] Evidence commands in `E/application/commands/usability-fact-commands.ts`:
  - `upsert` with the status;
  - `syncSession(sessionId, studyId, items)`: upserts the given facts and deletes the session's observation facts whose observation is not among them;
  - `syncTasks(studyId, tasks)`: upserts the task facts and deletes those of tasks with no decided outcome left;
  - `withdraw` is removed;
  - a fact to decide from an observation is translated by the existing translation job, as other facts are (FR-016).
  - Store queries go in `E/infrastructure/usability-facts.drizzle-store.ts`.
- [X] T006 [US2] Usability port `Facts` in `U/application/ports.ts`: `upsert` with the status, `syncSession`, `syncTasks`.
  - In `U/application/commands/observation-commands.ts`:
    - `syncFact` upserts with the observation's status (no more withdraw);
    - an observation rejected by the checks and still proposed gives no fact (deleted if it had one);
    - `correctTask` re-syncs the study's task facts.
  - In `U/application/commands/analysis-run.ts`: after `completeAnalysis`, `syncSession` for the session and `syncTasks` for the study.
  - Update the fake in `U/tests/fakes/world.ts`.
- [X] T007 [US2] Task results to task facts: a pure function `taskFacts(protocolTasks, decidedResults)` in `U/domain/results.ts` (counts per task over the decided results of the study's analyses), tested in `U/tests/domain.test.ts`. A store read of the study's decided task results goes in `U/infrastructure/usability.drizzle-store.ts`.
- [X] T008 [US2] Wiring in `apps/api/src/compose.ts`: the Usability `facts` port goes to the Evidence commands.
  - Update `U/tests/analysis-run.test.ts`: facts to decide after an analysis; rejected kept; reopen gives to decide; task facts after correctTask; re-analysis keeps decided facts.

## Phase 4: User Story 1 — Decide facts the same way in every study (P1) 🎯 MVP

**Goal**: The same statuses, actions and list for every study type.

**Independent test**: In one study of each type, accept, edit, reject and reopen a fact with the same component.

- [X] T009 [US1] Evidence port `UsabilityDecisions` in `E/application/ports.ts` (`decideObservation(actor, observationId, decision, version, statement?)`), wired in `compose.ts` to `usability.observations.decide`. The observation's version is read from the fact's support.
- [X] T010 [US1] `decideAny` and `acceptAny` in `E/application/commands/fact-decisions.ts`, which dispatch by source:
  - interview: the existing `decideIn` checks, plus reopen;
  - survey: `decideSurveyFact`, plus reopen; translation as today;
  - usability observation fact: through the port;
  - task fact: in Evidence, where a decision clears `figuresChanged`.
  - Rights: those of the fact's study.
  - Tests on fakes in `E/tests/fact-decisions.test.ts`.
- [X] T011 [US1] `factBoard(actor, studyId, {status, q, page})` in `E/application/queries/fact-board.ts`: SQL paged (25 per page), counts per status, `canDecide`, evidence per source, insight counts.
  - The store query goes in `E/infrastructure/fact-board.drizzle-store.ts`.
- [X] T012 [US1] Routes in `E/infrastructure/http.routes.ts`:
  - `GET /api/studies/:studyId/fact-board`, `POST /api/facts/:factId/decision`, `POST /api/facts/accept`;
  - `reopen` on the existing interview and survey decision routes.
  - Then `pnpm generate`.
- [X] T013 [US1] Shared web component in `W/facts/`:
  - `fact-board.tsx` (list with filters to decide / accepted / rejected / all, search, counts, pages);
  - `fact-status.tsx` (badge with the 4 labels);
  - `fact-actions.tsx` (accept, edit, reject, reopen, with the version seen);
  - `accept-all.tsx` (facts to decide shown);
  - `fact-evidence.tsx` (verbatims count, figure, observation with screenshot and moment, task outcomes with "figures changed");
  - labels in `W/facts/labels.ts`, in EN and FR.
- [X] T014 [US1] Use the shared component:
  - survey Analysis tab (`W/surveys/survey-facts.tsx`, keeping its figure update/keep actions in the evidence slot);
  - usability Analysis tab, as a new "Facts" section in `W/usability/analysis-tab.tsx`, where an observation fact opens its session at its moment;
  - interviews: `W/analysis/facts-list.tsx` and `W/analysis/fact-card.tsx` take the shared status, actions (with reopen) and labels, and keep their theme and participant filters and verbatims.
- [X] T015 [US1] Component tests on PostgreSQL in `apps/api/tests/fact-lifecycle.component.test.ts`:
  - the fact board of each source;
  - decide and reopen for each source;
  - acceptAny across sources;
  - a reader gets 403;
  - a usability rejection keeps the fact rejected.

## Phase 5: User Story 3 — Decide facts from the project (P2)

**Goal**: Decide from the project's Facts panel.

**Independent test**: Accept two facts of two studies from the panel and "Accept all"; a reader sees no actions.

- [X] T016 [US3] `S/application/queries/insight-queries.ts` `facts`: full status, `version`, `canDecide` and `evidence`, through Evidence's synthesis reads (`E/application/queries/synthesis-reads.ts`, which gains version and evidence).
- [X] T017 [US3] `W/synthesis/facts-panel.tsx`: the shared status, actions and "Accept all" on the shown facts to decide, through `decideAny` and `acceptAny`; no actions when `canDecide` is false.
  - Component test added to `apps/api/tests/fact-lifecycle.component.test.ts`.

## Phase 6: User Story 4 — Insights read facts to decide when that is all there is (P1)

**Goal**: No study with facts to decide is greyed out; reading them is on by default when nothing is decided.

**Independent test**: In a project with facts to decide only, the insight dialog chooses the studies, reads facts to decide (said on screen), and the run gives insights "to validate".

- [X] T018 [US4] `W/synthesis/insight-run-dialog.tsx`:
  - `usable = facts > 0 || toDecide > 0`;
  - `withProposed` is on by default when no chosen study has decided facts, and is turned on when a study with only facts to decide is chosen, with a line saying why;
  - turning it off says that no fact is left to read;
  - a study with no fact is disabled with "no fact yet".
- [X] T019 [US4] `W/synthesis/recommendation-run-dialog.tsx`: shows validated insights and insights to decide, and reads insights to decide by default when none is validated, with a line saying why.
- [X] T020 [US4] Lingui extract and French translations, following the bilingual glossary (`docs/domain/context-map.md`): « à décider », « accepté », « modifié », « rejeté », « rouvrir ».

## Phase 7: Polish

- [X] T021 E2E `apps/web/e2e/common-facts.spec.ts`, with axe in the light and dark themes:
  - a survey fact and a usability fact decided with the same actions, including reopen;
  - a usability rejection shows as a rejected fact;
  - the project panel "Accept all";
  - the insight dialog with facts to decide only.
  - Update the existing e2e that read the old survey or usability lists.
- [X] T022 Docs:
  - `docs/domain/context-map.md`: the fact lifecycle and task facts, with the glossary;
  - `E/README.md` and `U/README.md`;
  - `docs/agent-journeys/14-usability-analysis.md`;
  - ADR-0013 update on facts to decide.
- [ ] T023 `pnpm check`, `pnpm test`, `pnpm e2e` on the dev stack; push the PR and run the CI; run the quickstart by hand on the local stack.

## Dependencies

- T001 → T005, T011
- T002, T003, T004 → every story
- US2 (T005–T008) → US1's usability parts (T010 usability dispatch, T014 usability tab)
- US1 → US3 (T016, T017 use decideAny and acceptAny)
- US4 (T018–T020) is independent of US1 to US3 and can run in parallel after T004
- T021 to T023 come last

## Parallel opportunities

- T002 and T003 (different domain files).
- T018 and T019 alongside Phase 3.
- T013 alongside T010 to T012 once T004 is done.

## Implementation strategy

MVP = US2 + US1: one lifecycle and one decision path, which is what the requester asked for. Then US4 removes the block felt in the insight dialog, and US3 adds decisions from the project. Everything ships in one PR.

## Notes on the build

- T007: the task counts reuse `studyResults` (decided task results only) through `application/facts-sync.ts` (`syncTaskFacts`, shared with the results query's task order), not a new domain function.
- T011/T014: the shared web pieces are `features/facts/` (`FactStatusBadge`, `FactDecision` with reopen, `AcceptAllShown`, `FactBoard`). The usability Analysis tab uses the whole `FactBoard`; the survey and interview lists keep their own filters and evidence (figures to update or keep, verbatims, themes, participants) and are built from the same status, decisions and "Accept all shown" (the survey list gained it, through `acceptAny`). The board returns no insight count (the project panel has it).
- T016: `ProjectFact` gains the full status and `canDecide`; its evidence stays as before (participant, respondents, source link).
- T019: the recommendation dialog reads insights, not studies: it shows validated insights and insights to decide (two estimates) and reads those to decide by default when none is validated.
- Found while building: Synthesis read usability facts whatever their status; it now leaves rejected ones out, as for the other sources.
- Added for deployment: when the worker starts, `backfillFacts` gives facts to sessions analysed before this change; an unchanged observation is not written again (no new version, no translation), so it is safe to run at each start.
- Review of PR #58:
  - an observation's fact is edited in the protocol's language (an edit in the other language is refused, `VALIDATION`);
  - a task fact's translation is asked only on a one-language edit, and its cost goes under `usability-study:<studyId>`, counted in the study's analysis cost;
  - task facts are written at the version read (never over a decision taken meanwhile), and a concurrent insert for the same task is tolerated;
  - a fact whose observation is gone is removed when decided;
  - "Accept all shown" accepts interview facts by study, through their batch;
  - the session link of an observation fact says "See in the session", with its moment shown beside it.
  - Left as is: `canDecide` in the project panel follows the project's team (Evidence still checks each study); an observation is decided at its current version, behind the fact's version check.
