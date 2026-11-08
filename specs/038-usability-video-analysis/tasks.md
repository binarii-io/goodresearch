---
description: "Tasks for spec 038, usability test analysis"
---

# Tasks: Usability test analysis

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: required (constitution V): domain rules test-first, use cases with fakes, a component test on Postgres, e2e with axe.

Paths: `U/` = `apps/api/src/modules/usability/`, `G/` = `apps/api/src/modules/ai-gateway/`, `I/` = `apps/api/src/modules/ingestion/`, `E/` = `apps/api/src/modules/evidence/`, `W/` = `apps/web/src/features/usability/`.

## Phase 1: Setup

- [X] T001 Create the module skeleton `U/{domain,application,infrastructure,tests}` with `U/index.ts` and `U/README.md`, and register it in `apps/api/src/compose.ts`, dependency-cruiser and knip
- [X] T002 Add `ffmpeg` to the worker stage of `docker/Dockerfile` and the dev image; document it in ADR `docs/adr/0013-video-analysis-pipeline.md`
- [X] T003 Add the queue `usability.analysis` (exclusive, no retry, heartbeat 60 s, expire 6 h) in `apps/api/src/platform/jobs.ts`

## Phase 2: Foundational (blocks every story)

- [X] T004 [P] Tests first, then pure domain in `U/domain/`: `sus.ts` (standard scoring, null with missing answers), `chunks.ts` (18-min chunks, 1-min overlap, a moment belongs to one chunk), `quotes.ts` (quote found in transcript segments, normalised), `observation.ts` (kinds, limits `text ≤ 400`, decide accept/edit/reject/reopen with version, not re-proposing a rejected one within 10 s), `verdict.ts` (judge never rejects without a reason; disagreement → arbiter), `task-result.ts` (outcome follows accepted observations unless set by a person), `estimate.ts` (minutes × calibrated tokens × prices); tests in `U/tests/domain.test.ts`
- [X] T005 [P] Gateway: `parts` (text, file URI with mime and offsets, inline JPEG) and `tier` in `G/application/ports.ts`; Vertex mapping in `G/infrastructure/ai-sdk.model-runner.ts` (high media resolution); `MEDIA_NOT_SUPPORTED` for other kinds; `AI_MODEL_<KIND>_STRONG` in `packages/config/src/env.ts` (Vertex default `gemini-4-argon`); price of `gemini-4-argon` in `G/infrastructure/default-prices.ts`; fake runner answers by task name; tests in `G/tests`
- [X] T006 [P] Gateway: expose the serving provider's Google credentials for the staging bucket (`googleAccessFor(accountId)`: project, region, access token) without leaving the module's adapters; tests with the fake
- [X] T007 [P] Platform storage: `put`, `get`, `deleteByPrefix` in `apps/api/src/platform/storage.ts`, in-memory fake for tests
- [X] T008 [P] Ingestion: `DriveGateway.downloadFile` (stream to a path, ranges, one retry) and `videoRange` in `I/domain/drive-gateway.ts`, `I/infrastructure/drive.fetch-gateway.ts`, dev Drive (a small test video) and fakes; `proposePeopleFromText(sessionId, text, actor)` in `I/application/commands/analysis-commands.ts`; usability reads (`usabilitySessions(studyId)`: ready sessions with video, participant code, protocol version) in `I/index.ts`
- [X] T009 Migration `apps/api/drizzle/0062_usability_analysis.sql` and Drizzle schemas in `U/infrastructure/schema.ts` and `E/infrastructure/schema.ts` per data-model.md (enums checked: outcome `success | partial | failure | not-attempted`; observation kind `difficulty | error | positive | verbatim | assisted | sus-answer`; status `proposed | accepted | edited | rejected`)
- [X] T010 Contracts `packages/contracts/src/usability.ts` per contracts/api.md; `aiProvider.kind` in `packages/contracts/src/workspace.ts`
- [X] T011 Vertex gate: `aiProvider.kind` in `/api/me`; Research `createStudy` refuses `usability-test` with `USABILITY_NEEDS_VERTEX` through a port wired in `compose.ts`; web create dialog and study list offer the type only for `vertex`; assistant `create_study` says why; tests (unit, component, e2e studies)

## Phase 3: User Story 1 — Analyse the ready sessions (P1) 🎯 MVP

- [X] T012 [P] [US1] Ports in `U/application/ports.ts`: `Sessions`, `Protocols`, `Videos` (download, range), `Staging` (upload, delete, ensure bucket), `MediaTools` (layout frames, keyframes, cropped frames, dense frames, audio chunks, screenshot at a moment), `Ai` (the seven stages), `Screens` (storage), `Facts`, `People`, `Clock`
- [X] T013 [US1] Infrastructure adapters: `U/infrastructure/media-tools.ts` (ffmpeg child processes, fixed arguments, temp dir), `U/infrastructure/staging.gcs.ts` (GCS JSON API: ensure bucket with 1-day lifecycle, resumable upload, delete), prompts and schemas in `U/infrastructure/prompts/*.ts` from the trial (layout, transcript, screen log, task map, task reading, judge, arbiter)
- [X] T014 [US1] Pipeline `U/application/pipeline/run-session.ts`: download → staging → layout → transcript by chunks → screen log → task map → task readings (3 in parallel) → anchor quotes, drop out-of-task moments, dedupe → judge with dense frames → arbiter on disagreements → screenshots → store; heartbeat per stage; `finally` deletes the copy and the temp dir; ledger ref `usability-analysis:<sessionId>`
- [X] T015 [US1] Run commands `U/application/commands/analysis-run.ts`: estimate, start (consent of spec 022, Vertex check, protocol version frozen), stop, job handler (sessions one after another, failed sessions do not stop the run); keep decided observations on a new analysis
- [X] T016 [US1] Store `U/infrastructure/usability.drizzle-store.ts` and in-memory fake
- [X] T017 [US1] Use-case tests `U/tests/analysis-run.test.ts` with fakes: estimate, run, stages, stop, unreadable video, copy deleted on success, failure and stop, anonymised study (no names added), protocol version frozen, decided observations kept, a judge rejection without reason refused, a judge/reading disagreement sent to the arbiter
- [X] T018 [US1] Routes `U/infrastructure/http.routes.ts`: study analysis view (with `outOfDate` when the session's protocol version or the video's Drive date or size differ from what was read), start, stop; Analysis tab `W/analysis-tab.tsx` (sessions, estimate, run state and stage, costs) in `apps/web/src/routes/_authenticated/studies/$studyId.tsx`

## Phase 4: User Story 2 — Review the observations (P1)

- [X] T019 [P] [US2] Commands `U/application/commands/observation-commands.ts`: decide, add by hand, correct a task result; tests in `U/tests/observations.test.ts`
- [X] T020 [US2] Routes: session view, video range proxy, screenshot, decisions, add, task result
- [X] T021 [US2] Web `W/session-review.tsx`, `W/task-shortcuts.tsx` (left, outcome colour with text), `W/observation-card.tsx` (moment, screenshot, evidence, verdicts), `W/video-player.tsx` (seek to moment − 3 s, keyboard), `W/transcript-tab.tsx`; amber `warning` tone in `packages/ui`
- [X] T022 [US2] People from the transcript: after the transcript stage, `People.propose` when the session has no accepted participant or facilitator

## Phase 5: User Story 3 — Results and facts (P2)

- [X] T023 [P] [US3] Results query `U/application/queries/results-queries.ts` (tasks by id across versions, outcome counts, median, difficulties by session, ease, SUS) with tests
- [X] T024 [US3] Evidence: source `usability`, `evidence_usability_supports`, `upsertObservationFact` / `withdrawObservationFact` in `E/index.ts`, translation through `evidence.translate`, `FactForSynthesis` with `source: 'usability'` and participant; Synthesis and the deck handle it; tests in `E/tests`
- [X] T025 [US3] Usability calls the fact port on accept, edit, reject and reopen; tests
- [X] T026 [US3] Web `W/results.tsx` on the Analysis tab

## Phase 6: User Story 4 — Assistant (P3)

- [ ] T027 [US4] Assistant reads `usability_analysis_state` (no names) and the card `propose_usability_analysis`; next step after `next-phase`: analyse, review, done; tests in `apps/api/src/modules/assistant/tests`

## Phase 7: Polish

- [X] T028 [P] Component test `apps/api/tests/usability-analysis.component.test.ts` (run with fakes, decisions, facts, screenshots deleted with the study)
- [ ] T029 [P] E2E `apps/web/e2e/usability-analysis.spec.ts` with axe, light and dark
- [X] T030 [P] Docs: context map (Usability analysis context, Observation, Task result, Session transcript, Fact source `usability`), journey 14 and README row, `U/README.md`, `apps/api/README.md`, Evidence README, ADR-0013
- [ ] T031 Lingui extract and French; `pnpm generate`; `pnpm check`; `pnpm test`; `pnpm e2e`
- [ ] T032 Rebuild the local stack; quickstart steps 1–7
- [ ] T033 Real Vertex and Drive by the maintainer (quickstart step 8), which also measures SC-001 (outcomes against the trial) and SC-006 (review time)

## Dependencies

Setup → Foundational → US1 → US2 → US3 → US4 → Polish. Same-file tasks in order: `run-session.ts` (T014 → T022), the store (T016 → T019), `$studyId.tsx` (T018 → T021 → T026).

## Parallel examples

T004–T008 together; T019 with T023; T028–T030 together.

## Implementation strategy

MVP is US1: a run produces task results and observations visible on the tab. US2 makes them reviewable, US3 turns them into results and facts, US4 adds the assistant. One PR.

## Notes on the build

- After the first local test: the Analysis tab shows the run in a folding panel with a bar per session (its stage of six) and the run's own bar; a row's only button is "Explore" (the row opens too), the analysis of one session an icon. Exploring a session keeps the video in sight: docked as a third column on wide screens, floating at the bottom right otherwise or on demand, or hidden; under it the line being said and the task on screen, which the task list and the transcript highlight.
- After the first local test: on Fieldwork, a usability test's reading of the files is worded "Find the people" (button, row, tile "People read"), so it is not taken for the video analysis; a video Drive gives no length for gets it from its MP4 header (spec 037 FR-004).
- FR-001 (after the first local test): each ready session has its own "Analyse" / "Analyse again" button with its own estimate, as interviews have; it starts a run of that session alone (`sessionIds`).
- T027: the assistant reads where the analysis stands (no names) and gives its next steps (analyse, running, review, done); the start card `propose_usability_analysis` is not built yet, the person starts the run from the Analysis tab.
- T004/T017: domain and use cases in `U/tests/domain.test.ts` and `U/tests/analysis-run.test.ts` on the fakes of `U/tests/fakes/world.ts`; `U/tests/media-tools.test.ts` runs ffmpeg on a generated video when ffmpeg is installed.
- T005, T006, T011 (gateway, Google access, Vertex gate) and T007, T008, T024 (storage, Drive bytes, Ingestion sources, usability facts) were built in parallel by two agents, then wired in `compose.ts`.
- The shared fake provider of the dev stack now has a key the fake runner accepts (`test-ok-shared`): it could not make calls before.
- Screenshots are recorded before they are stored, so those of a failed analysis are swept too.
