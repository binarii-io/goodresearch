# Tasks: Survey analysis

**Input**: Design documents from `specs/029-survey-analysis/`

**Tests**: Domain rules are test-first (constitution V): each test task comes before its code and must fail first.

**Format**: `[ID] [P?] [Story] Description`. `[P]`: different files, no incomplete dependency.

## Phase 1: Setup

- [X] T001 Add to docs/domain/context-map.md: Figure, Cross, Theme of open answers, Survey fact (source, support snapshot, Figure changed), masking; glossary (Flat sort/Tri à plat, Cross by/Croiser par, Base/Base, Small base/Petite base, Share of agreement/Part d'accord, Theme/Thème, Masked/Masqué, Figure changed/Chiffre modifié, Respondents/Répondants)
- [X] T002 [P] Write docs/adr/0012-masked-open-answers-to-ai.md: what is masked (research R7), what is sent (wording and masked answers with run-local numbers), what is never sent (contact item, identities, other answers), the known limit (unknown names), the screen showing masked text
- [X] T003 [P] Mark T030 of specs/028-survey-fieldwork/tasks.md done (verified by the user on 2026-11-03)

## Phase 2: Foundational

- [X] T004 Write apps/api/drizzle/0057_survey_analysis.sql through `db:generate`, after 0056: `surveys_themes`, `surveys_theme_answers`, `surveys_theme_runs` per data-model.md ("status `proposed | accepted | rejected`", "one live run per study (partial unique index on `state = 'running'`)", cascade on the study); `evidence_facts.source` "check `source in ('interview','survey')`", `session_id` nullable with "check `(source = 'interview') = (session_id is not null)`", FK `study_id → research_studies(id) on delete cascade`, index `(study_id, source, status)`; `evidence_survey_supports` ("`fact_id` PK, FK evidence_facts cascade", `kind` check `figure | theme`, quotes "at most 5"); widened `assistant_proposals_kind_check`
- [X] T005 [P] Write packages/contracts/src/survey-analysis.ts (Figure, Column, cross, open answers page, themes, estimate, run) and the survey fact schemas in packages/contracts/src/facts.ts; `source` and `respondents` in packages/contracts/src/insights.ts with `ProjectFact.sessionId` nullable; export from index.ts; error codes `ITEM_NOT_FOUND`, `TOO_FEW_ANSWERS`, `RUN_IN_PROGRESS`, `THEME_NOT_FOUND`, `THEME_NOT_ACCEPTED`, `NOT_SAME_ITEM`, `FIGURE_NOT_FOUND`, `FIGURE_UNCHANGED`, `ITEM_REMOVED` in packages/contracts/src/errors.ts and apps/web/src/features/workspace/errors.ts
- [X] T006 Add the queue `surveys.themes` (run options, never retried) to apps/api/src/platform/jobs.ts `QUEUES` and `QUEUE_OPTIONS`

## Phase 3: US1 - Flat sort (P1)

- [X] T007 [US1] Write failing tests, then apps/api/src/modules/surveys/domain/figures.ts: options in order plus other, percentages over respondents, multiple choice over respondents, scale points, mean one decimal, median from cumulative counts (even and odd bases), agree and disagree (two highest and lowest of 5 and 7 points), small base under 30, percentages hidden under 5
- [X] T008 [US1] Write apps/api/src/modules/surveys/application/queries/figure-queries.ts: counts per value of every item in one SQL query over counted responses (spec 028 `stateSql`), respondents per item, sections in the questionnaire's order, counted and set-aside totals, open items with answer counts, per item the number of responses that answered a former wording (`surveys_item_wordings`), and the tab's AI cost total (refs `survey-themes:*`, `facts-translation:survey:<studyId>`, `survey-themes-translation:<studyId>` through `studyCosts`); route `GET /api/studies/:id/survey-analysis`; an integration test in apps/api/tests/survey-analysis.component.test.ts compares with a count by hand on every item kind, checks a rule change moves the figures, and bounds the read at 2 s for 5,000 responses and 80 items (SC-006)
- [X] T009 [US1] Write apps/web/src/features/surveys/survey-analysis-tab.tsx (stat tiles with the AI cost total, sections, empty state linking to Fieldwork) and figure-card.tsx (bars with numbers in text, base, small-base flag, "may exceed 100 %" for multiple choice, how many answered a former wording); use it for survey studies in apps/web/src/routes/_authenticated/studies/$studyId.tsx

## Phase 4: US2 - Cross (P1)

- [X] T010 [US2] Write failing tests, then the cross in apps/api/src/modules/surveys/domain/figures.ts: one column per profiling option, multiple-choice profiling counts in each column, respondents without a profiling answer only in total, small base per column
- [X] T011 [US2] Add `crossBy` to figure-queries.ts (one SQL query grouped by both values; `VALIDATION` when not a profiling choice item) with integration tests; write apps/web/src/features/surveys/cross-select.tsx and the columns in figure-card.tsx

## Phase 5: US3 - Themes of open answers (P1)

- [X] T012 [P] [US3] Write failing tests, then `maskAnswer` in packages/shared/src/text.ts: known names via `withPlaceholders`, emails, phone numbers, web addresses, runs of 6+ digits, an answer with nothing left
- [X] T013 [US3] Write failing tests, then apps/api/src/modules/surveys/domain/themes.ts: parts of 150, run-local numbers, quote checks word for word on the masked answer (`quoteFound`), themes without a verified answer dropped, rejected labels not proposed again, merges across parts applied, answers in at most one theme
- [X] T014 [US3] Write apps/api/src/modules/surveys/infrastructure/prompts/themes.ts (gateway adapter, refs `survey-themes:<runId>:<part>`, estimate) and the themes branch of apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts
- [X] T015 [US3] Write failing use-case tests with fakes, then apps/api/src/modules/surveys/application/commands/theme-commands.ts: estimate, start (provider, one live run, at least 5 answers, consent), run job with heartbeat and failures, only new answers, decide (accept, reject, edit with background translation), merge, move; tests assert what the fake AI received holds no known name, email or phone
- [X] T016 [US3] Write the store, open answers page (masked, 50 per page) and theme routes per contracts/api.md in apps/api/src/modules/surveys/infrastructure/; cascade on study deletion tested in apps/api/tests/survey-analysis.component.test.ts
- [X] T017 [US3] Write apps/web/src/features/surveys/open-item.tsx (answers, themes, cost of its runs) and themes-dialog.tsx (estimate and confirm, progress, accept, rename, merge, reject, move an answer)

## Phase 6: US4 - Survey facts (P1)

- [X] T018 [US4] Write failing tests, then apps/api/src/modules/evidence/domain/survey-facts.ts: support snapshot, statement templates in English and French (option, agree, disagree, mean, cross prefix, small base), theme facts from the description, no known name, figure changed (value or base, one decimal) and item removed, update to today and keep
- [X] T019 [US4] Extend apps/api/src/modules/evidence/domain/facts.ts with `source` and `support` without changing interview rules (existing tests unchanged); store and schema in evidence/infrastructure/
- [X] T020 [US4] Write failing use-case tests, then apps/api/src/modules/evidence/application/commands/survey-fact-commands.ts and queries/survey-fact-queries.ts: create from figure or accepted theme through a port to Surveys (today's figure, theme), decide with version, translation ref `facts-translation:survey:<studyId>`, figure update and keep; routes in evidence/infrastructure/http.routes.ts; wiring in apps/api/src/compose.ts
- [X] T021 [US4] Synthesis: `source`, nullable `sessionId` and `respondents` in apps/api/src/modules/synthesis/application/ports.ts and domain/fact-lines.ts (survey code and `n=<base>`); failing tests first, then the confidence rule in domain/confidence.ts (base ≥ 30 raises one level, at most high; a test proves interview-only projects unchanged) and the support line "N participants · M respondents"; prompt note in infrastructure/prompts/insights.ts; `synthesis-reads.ts` gives survey facts
- [X] T022 [US4] Reporting: survey facts in `studyCounts` (apps/api/src/compose.ts and reporting tests); the Facts step counts them
- [X] T023 [US4] Write apps/web/src/features/surveys/survey-facts.tsx (make a fact from a figure or a theme, polarity neutral by default, decide, edit, Figure changed with update and keep, Item removed) and the survey source in apps/web/src/features/synthesis/facts-panel.tsx and insight-panel.tsx

## Phase 7: US5 - Assistant (P2)

- [X] T024 [US5] Write failing tests, then the survey next step after Fieldwork in apps/api/src/modules/assistant/domain/next-step.ts: read figures, theme open items, make and decide facts
- [X] T025 [US5] Add `survey_analysis_state`, `read_figures`, `propose_survey_facts`, `propose_theme_analysis` in apps/api/src/modules/assistant/application/tools.ts, domain/proposal.ts, commands/send-message.ts, commands/proposal-commands.ts, compose.ts; remove "The analysis comes in a later version" from application/skills.ts
- [X] T026 [US5] Write the cards in apps/web/src/features/assistant/proposal-card.tsx
- [X] T027 [US5] Write apps/api/src/modules/assistant/tests/assistant-survey-analysis.test.ts, including that no answer text appears in anything sent to the model by the assistant

## Phase 8: US6 - Readers and privacy (P2)

- [X] T028 [US6] Guard every new route (spec 026) and extend the read-access test's routes; a reader's Analysis tab says "reserved to the team"; facts in insights show masked quotes; deleting a study removes themes and facts and insights show "Evidence changed" (apps/api/tests/)

## Phase 9: Polish

- [X] T029 Extract and translate apps/web/src/locales/fr/messages.po per the glossary
- [X] T030 [P] Write docs/agent-journeys/11-survey-analysis.md and its line in docs/agent-journeys/README.md; update the READMEs of surveys, evidence, synthesis, reporting; note in docs/adr/0011-survey-responses-module.md that ADR-0012 settles the open answers
- [X] T031 Write apps/web/e2e/survey-analysis.spec.ts: figures, cross, themes with the fake AI, a fact from a figure and one from a theme, Figure changed, with axe in light and dark
- [X] T032 Run `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm e2e` on a fresh database
- [X] T034 [US4] "Find facts" (FR-010a): `find` and `estimateFind` in apps/api/src/modules/evidence/application/commands/survey-fact-commands.ts (unit tests first), `surveyFacts` call in evidence/infrastructure/prompts/facts.ts and its fake-provider branch, `forFinding` in surveys/application/queries/theme-queries.ts, routes, the action of every tab in apps/web/src/features/surveys/find-survey-facts.tsx ("Cross by" moves into the Figures tab), e2e step
- [X] T033 Run quickstart.md "Real provider" with the user

## Dependencies

Phase 2 blocks all. US1, then US2; US3 after US1; US4 after US1 and US3 (theme facts); US5 after US4; US6 last.

Parallel: T012 with T007–T011; T018 with T013–T017.

MVP: US1, US2, US4 with figure facts only: figures, cross and facts that reach insights.
