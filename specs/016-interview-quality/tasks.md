---
description: "Task list for 016-interview-quality"
---

# Tasks: Interview quality

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [quickstart.md](quickstart.md)

Paths under `apps/api/src/modules/` are written `quality/…` for `interview-quality/…`, and `evidence/…`, `transcripts/…`.

Domain rules are written test-first (constitution V): the test task comes before its code and must fail first. Follow the patterns of `evidence/` (spec 012) for runs, consent, costs, placeholders and fakes.

## Phase 1: Setup

- [X] T001 Migration `apps/api/drizzle/00NN_interview_quality.sql` (next free number) and `quality/infrastructure/schema.ts`, per [data-model.md](data-model.md):
  - `quality_runs` (partial unique `(study_id)` while not finished), `quality_evaluations` (PK `session_id`), `quality_speaker_counts` (PK `(session_id, speaker_label)`), `quality_reformulations`, `quality_remarks` (index `(session_id, segment_id)`; checks: `kind in ('leading-question','reformulation-with-opinion','opinion')`, `origin in ('ai','person')`, `stance in ('agree','disagree') or null`), `quality_consents`;
  - every `session_id` → `ingestion_sessions(id)` and `study_id` → `research_studies(id)`, `on delete cascade`.
- [X] T002 [P] Contracts in `packages/contracts/src/quality.ts` (exported in `index.ts`), per [contracts/http-api.md](contracts/http-api.md): `QualityOverview`, `Figures`, `PersonRow`, `InterviewRow`, `Remark`, `RemarksQuery`, `SetStance`, `SimpleReformulation`, `Requalify`, `QualityEstimate`, `StartQualityRun`, `QualityRunView`. Error codes in `errors.ts`: `QUALITY_RUNNING`, `QUALITY_CONSENT_REQUIRED`, `NOTHING_TO_REVIEW`, `PERSON_REMARK_STANCE`, `AI_REMARK`, `ALREADY_REQUALIFIED`; reuse `ENRICHMENT_RUNNING`, `FACTS_RUNNING`, `VERSION_CONFLICT`, `AI_PROVIDER_REQUIRED`, `NOT_FOUND`.
- [X] T003 [P] Queue `quality.review` (exclusive by study, no retry, 120 min expiry) in `apps/api/src/platform/jobs.ts`.
- [X] T004 [P] Move `speakerRole`, `Person`, `isGenericLabel` and their tests from `evidence/domain/speakers.ts` and `evidence/tests/speakers.test.ts` to `packages/shared/src/speakers.ts`; Evidence imports them from shared, with no behaviour change (research R5).

## Phase 2: Foundational (blocks every story)

- [X] T005 Test first, then extend `speakerRole` in `packages/shared/src/speakers.ts` to return the code of the interviewer a label matches (`interviewer: string | null`); one interviewer on the roster takes generic labels; several leave it null (research R5). Evidence's results unchanged.
- [X] T006 Module skeleton: `quality/index.ts`, `quality/application/ports.ts` (`QualitySources`: `studyAccess`, `sessions`, `people`, `knownNames`, `analysedText`, `importTranscripts`, `context` with goal and main guide questions, `speakerAttributions`, `enrichmentLive`, `factsLive`; `QualityAi`: `review`, `providerOf`, `estimate`, `costs`; `QualityStore`), `quality/infrastructure/module.ts`, `quality/infrastructure/quality.drizzle-store.ts`, an in-memory store in `quality/tests/fakes/`, `quality/README.md`.
- [X] T007 Wire in `apps/api/src/compose.ts`: sources from transcripts, ingestion, research; `evidence.speakerAttributions(studyId)` exposed in `evidence/index.ts` (with a test in `evidence/tests/`); both worker and API registration.
- [X] T008 Exclusive runs both ways: `quality/application/commands/review-commands.ts` refuses while lexicon, cleaning or facts run; `transcripts/infrastructure/module.ts` `otherRunLive` and Evidence's `enrichmentLive` also ask `qualityLive`. Tests in each module.
- [X] T009 Consent in `quality/application/commands/review-commands.ts` (`giveConsent`, asked again when the provider changes), with test, per spec FR-014.
- [X] T010 Web tab: phase `quality` in `apps/web/src/routes/_authenticated/studies/$studyId.tsx`, labels "5 · Quality" and "6 · Analysis", empty `apps/web/src/features/quality/quality-tab.tsx` with the "no validated interview" state (link to Fieldwork); the non-interview study message; update e2e labels mentioning "5 · Analysis".

**Checkpoint**: module, tab and guards exist; `pnpm check` passes.

## Phase 3: US1 - See how the interviews were conducted (P1) 🎯 MVP

**Goal**: speaking times without AI; a review that yields counts, with its cost. **Independent test**: US1 in the spec (25% of words, "3 leading out of 20 questions", no score).

- [X] T011 [P] [US1] Test first, then `quality/domain/sentences.ts` (`cutSentences`): cuts at `.`, `?`, `!`, `…`; keeps abbreviations and decimals whole; ids `t3.2`; fragments of at most 2 words neither sent nor counted; a turn without punctuation is one sentence (research R2).
- [X] T012 [P] [US1] Test first, then `quality/domain/speaking-times.ts`: words by role (interviewers, interviewees, unknown); minutes from gaps between turn starts, only when every turn has a start, last turn left out; summed over groups, never averaged; above 95% of interviewer words is not measurable (research R6, FR-002).
- [X] T013 [P] [US1] Test first, then `quality/domain/figures.ts`: sums, per group, of speaker counts and remarks into `Figures`, each kind as `{ agreed, noOpinion, disagreed }`; disagreed never counts; a leading question is also a question (research R8).
- [X] T014 [P] [US1] Test first, then `quality/domain/evaluation-state.ts`: `no-transcript`, `not-measurable`, `not-reviewed`, `reviewing`, `to-review-again`, `reviewed` (a correction alone does not mark it).
- [X] T015 [P] [US1] Test first, then `quality/domain/review-run.ts`: states `running | stopping | finished | stopped`, per-interview progress, stale closure, as `evidence/domain/analysis-run.ts`.
- [X] T016 [P] [US1] Test first, then `quality/domain/remarks.ts` `checkFlag`: exact text in that interviewer's turn; `excerpt` verified inside the sentence; `reformulation-with-opinion` without `addedElement`, or with its content words (folded, 4 letters or more) all found in the interviewees' earlier words across the whole interview, becomes `simple-reformulation` and counts as left out; other failures dropped and counted (research R4, FR-004).
- [X] T017 [US1] `quality/infrastructure/prompts/review.ts`: task `interview-review`, marker for the test provider, answer schema (research R3: only sentences not `other`; `kind`; `flag` with `kind`, `reason.en`, `reason.fr`, `recommendation`, `addedElement`, `excerpt`); prompt test in `quality/tests/prompts.test.ts`, with no names and no copyable examples. Test provider answers it in `ai-gateway`.
- [X] T018 [US1] `quality/application/commands/review-commands.ts`: `estimate`, `start`, `stop`, `runJob` (imports missing transcripts, chunks through `makeChunks` with `withPlaceholders`, reads back with `fromPlaceholders`, 2 chunks of an interview and 3 interviews at once, one retry per part, one failure does not stop the others, applies `checkFlag`, stores counts by speaker label, simple reformulations, remarks and evaluation; skips turns of an unidentified speaker and counts them, skips not-measurable interviews unless asked, ledger ref `quality:<runId>:<sessionId>`). Use-case tests with fakes, including "no known name is sent" (SC-005) and "cost equals the ledger's sum" (SC-006).
- [X] T019 [US1] `quality/application/queries/quality-queries.ts` (`overview`: figures at read, no writes, costs from refs) and `quality/infrastructure/http.routes.ts` (overview, estimate, start, consent, stop), every route checking study access (FR-016) with a test that a person outside the study gets nothing, the By person data included. `pnpm generate`.

**Checkpoint**: US1 works alone: figures and costs, no remark list yet.

## Phase 4: US3 - Simple reformulation or reformulation with opinion (P1)

**Goal**: the prototype's error does not come back. **Independent test**: reference set, none of the simple ones flagged. Depends on T016 to T018.

- [X] T020 [US1] Web: `features/quality/figures.tsx` (counts as text, breakdown, no colour verdict), tooltips from `packages/ui` reachable by keyboard with the reference values and how sentences are counted; `review-dialog.tsx` (interviews, estimate, consent); progress, stop and costs in `quality-tab.tsx`.
- [X] T021 [US3] Prompt rules of FR-005 in `prompts/review.ts`, with a test on their presence; a job test shows a reformulation with opinion failing `checkFlag` counted as simple.
- [X] T022 [P] [US3] `quality/tests/reference/`: synthetic excerpts with no real person's data, at least 30 simple reformulations and 20 with opinion, English and French, tricky cases (question mark, other words, something said much earlier). A CI test runs the guards on them with a fake answer.
- [X] T023 [US3] Reference runner `apps/api/scripts/quality-reference.ts` and script `quality:reference` in `apps/api/package.json`: uses a connection from the environment, prints both rates, per-interview cost; not in CI. Run once now; set the estimate's answer-size constant from it (research R10).

## Phase 5: US2 - Read the flagged sentences and give an opinion (P1)

**Goal**: remarks with agree or disagree, and requalification. **Independent test**: US2 in the spec (the count drops, transcript unchanged).

- [X] T024 [P] [US2] Test first, then `Remark` in `quality/domain/remarks.ts`: `setStance` (`null ⇄ agree ⇄ disagree`, `disagree → null`; who, when, version); a person's remark "created with `stance = agree`", cannot be disagreed, only withdrawn; `requalify` needs a reason.
- [X] T025 [US2] `quality/application/commands/remark-commands.ts`: `setStance`, `requalify`, `withdraw`, each one aggregate per transaction, version check, no AI call. Test that an opinion changes the counts and nothing else (SC-007).
- [X] T026 [US2] Access checks as T019 on these routes. Queries `remarks` and `reformulations` (context before and after, reason in the viewer's language, a person's reason as written, filters `person`, `sessionId`, `kind`, `stance`) and routes per the contract. `pnpm generate`.
- [X] T027 [P] [US2] Web: `features/quality/remark-card.tsx` (kind as text, sentence, words before and after, reason, wording, "Agree" and "Disagree" with the choice highlighted and changeable; never "accept" or "reject"; link to `phase=analysis&interview=&turn=`, checked with a test on an interview without facts and on one not clean yet under `clean-only`; if that view refuses them, open the transcript from the Quality tab).
- [X] T028 [US2] Web: `remarks-list.tsx` (filters, count of matches, "changed meanwhile"), "Simple reformulations" filter and `requalify-dialog.tsx`.

## Phase 6: US4 - Overall, by person, by interview (P2)

**Goal**: three views adding up. **Independent test**: US4 in the spec.

- [X] T029 [P] [US4] Test first, then grouping in `quality/domain/figures.ts`: labels mapped to people at read time, shared interview split by person with interviewee share unchanged, "Interviewer not identified" row, rows add up to overall (SC-004), name and date order.
- [X] T030 [US4] `overview` returns `people` and `interviews`; codes and labels under anonymisation, an unavailable account's roster name; an interview reopened or excluded in Fieldwork is no longer listed nor counted, its remarks kept (test).
- [X] T031 [US4] Web: `features/quality/view-switch.tsx`, rows that limit figures and remarks to the selection, in the URL search params.

- [X] T031a [US4] The interview to read: `GET quality/interviews/:sessionId`, with study access checked and tested, opening an interview imports its transcript (research R15); `features/quality/interview-view.tsx` at `phase=quality&interview=&turn=`: back link, figures, whole transcript, flagged sentences marked with a text marker, remark cards beside it with scrolling both ways, simple reformulations listed and requalifiable; before a review, the transcript only; "Not clean yet" under `clean-only`. An interview's title is a real link in its row; a remark's "see in the transcript" goes here. Settles analysis finding U2.
- [X] T031b [US4] No figure before a review: `figures` and `overall` null until reviewed, a dash for figures and cost, "3 of 12 interviews reviewed"; Overall and By person cover only the interviews reviewed. New state `speakers-not-identified` with its reason and "say who speaks" (test-first in the domain), `conductRoles` and `uncoded` for the false 0% (research R14). Tests with fakes and on PostgreSQL.

## Phase 7: US5 - Follow and repeat the review (P3)

**Goal**: incremental reviews that keep opinions. **Independent test**: US5 in the spec.

- [X] T032 [P] [US5] Test first, then in `quality/domain/remarks.ts`: `mergeReview` (keeps opinions and person remarks; replaces the others; drops a flag equal to a disagreed remark's text in that turn; one remark per sentence) and `reanchor` (found again or flagged "text changed", never deleted).
- [X] T033 [US5] Apply both in `runJob` and at read in the queries, without writing; review one interview from its row; "Review anyway" on a not-measurable row.
- [X] T034 [US5] Web: state on each row, and on every row that can be reviewed its own button, on that interview alone (`sessionIds: [id]`), through the review dialog with its estimate and consent: "Review", "Review again", "Review anyway"; none without a transcript or while it is read; "text changed" on a card. The rule is `reviewActionOf`, tested in the domain.

## Phase 8: Polish

- [X] T035 [P] `pnpm --filter @goodresearch/web i18n:extract`, French translations using the glossary (Remarque, Reformulation simple, Reformulation avec opinion, D'accord, Pas d'accord, Sans avis, Part de parole for the shares, Temps de parole for the minutes, Intervieweur non identifié).
- [X] T036 [P] Docs in the same change: `docs/domain/context-map.md` (Interview Quality rewritten: Evaluation, Remark, Opinion, sentence kinds, reference values replacing verdicts; assessments and opinions, per constitution 1.2.0; glossary; `EvaluationCompleted`, if still unused, removed), `docs/domain/prototype-reference.md` note, `quality/README.md`, `apps/api` README (module, queue, migration).
- [X] T037 Postgres component tests in `quality/tests/`: store, routes, migration, cascade on session deletion.
- [X] T038 `apps/web/e2e/quality-review.spec.ts`: quickstart scenarios 1, 2, 4, 6, with axe in light and dark (SC-010); Storybook only if a new `packages/ui` piece was needed.
- [X] T039 Measure the overview on 30 interviews (research R6); cache by fingerprint only if slow.
- [ ] T040 Final reference run on a real provider; rates and cost in the PR description (SC-001, SC-002), and the duration for 30 one-hour interviews, measured or extrapolated from it and said so (SC-009). Below target: tune the prompt before release. Run `pnpm check`, `pnpm test`, `pnpm build`, and walk through [quickstart.md](quickstart.md).

## Dependencies

- Phase 1 → Phase 2 → stories. US1 first; US3 needs US1's job; US2 needs US1's store and US3's checks; US4 needs US1's figures and US2's remarks; US5 needs US2. Polish last.
- Inside a story: tests before code, domain → commands → routes → web.

## Parallel examples

- Setup: T002, T003, T004.
- US1 domain: T011, T012, T013, T014, T015.
- Polish: T035, T036.

## Implementation strategy

- **MVP**: phases 1 to 5 (US1, US3, US2), since figures without trustworthy reformulations and without opinions repeat the prototype. Stop at T023 and read the rates before building the remarks UI.
- **Then** US4 (the three views you asked for), then US5.
- While you test: restart the local stack, no push until you validate.
