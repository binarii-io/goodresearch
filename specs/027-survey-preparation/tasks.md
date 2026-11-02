# Tasks: Survey preparation

**Input**: Design documents from `specs/027-survey-preparation/`

**Tests**: Domain rules are test-first (constitution V): each test task comes before its code and must fail first.

**Format**: `[ID] [P?] [Story] Description`. `[P]`: different files, no incomplete dependency.

## Phase 1: Setup

- [X] T001 Add the terms to the ubiquitous language and the bilingual glossary (Questionnaire/Questionnaire, Item/Item, Likert scale/Échelle de Likert, Profiling item/Item de profilage, Contact item/Item de contact, Readiness check/Vérification avant envoi, Pre-test/Pré-test, Naive participant/Participant naïf, Form/Formulaire, Results spreadsheet/Feuille de résultats) and the Research and Publishing definitions in docs/domain/context-map.md
- [X] T002 [P] Write docs/adr/0010-forms-as-survey-collection.md: responses read from the form service, spreadsheet optional, what can and cannot be randomised (research R1 to R4, R9)

## Phase 2: Foundational

- [X] T003 Write failing tests for the aggregate in apps/api/src/modules/research/tests/questionnaire.test.ts: "at most 12 sections, 80 items, 15 hypotheses", "600 characters per item or option, 4,000 per framing text, 120 per title", consent and thanks non-empty, one `theme` section with an item, Likert "5 | 7" points, choices "2..20" options, `subTheme` only in a `theme` section, at most one `contact` item (`open`, not required, in `closing`), identities kept by id then normalised text
- [X] T004 Implement apps/api/src/modules/research/domain/questionnaire.ts (data-model.md), with `identify` written locally as in interview-guide.ts
- [X] T005 [P] Add Zod schemas in packages/contracts/src/questionnaire.ts, export them from packages/contracts/src/index.ts, and add `NOT_A_SURVEY_STUDY` in packages/contracts/src/errors.ts and apps/web/src/features/workspace/errors.ts
- [X] T006 Write apps/api/drizzle/0055_questionnaires.sql and its journal entry through `db:generate`, plus the tables in apps/api/src/modules/research/infrastructure/schema.ts: `research_questionnaires`, `research_questionnaire_checks`, `origin` check `assistant | person | drive`, `kind` check `review | pre-test`, FK cascade on the study; widen `publishing_documents_kind_check` and `assistant_proposals_kind_check` by hand, add `item_map`, `linked_sheet_id`, `accepting_responses`, `collects_identity` in apps/api/src/modules/publishing/infrastructure/schema.ts
- [X] T007 Write apps/api/src/modules/research/domain/questionnaire.repository.ts, apps/api/src/modules/research/infrastructure/questionnaire.drizzle-repository.ts and its fake in apps/api/src/modules/research/tests/fakes/in-memory-research.ts, exercised against the real database by apps/api/tests/questionnaire.component.test.ts

**Checkpoint**: the aggregate saves and loads.

## Phase 3: US1 - Create a survey study (P1)

**Goal**: a survey study exists, with honest phases. **Independent test**: quickstart 1.

- [X] T008 [US1] Change apps/api/src/modules/research/tests/study.test.ts: `survey` created, `usability-test` still refused; then add `survey` to `CREATABLE` in apps/api/src/modules/research/domain/study.ts
- [X] T009 [P] [US1] Add a `type` to the `create_study` input in apps/api/src/modules/assistant/application/tools.ts and to its framing in apps/api/src/modules/assistant/domain/study-framing.ts, with a test in apps/api/src/modules/assistant/tests/
- [X] T010 [P] [US1] Make Survey available in apps/web/src/features/research/study-list.tsx, and send the chosen type instead of the fixed `interviews`
- [X] T011 [US1] Verify every read counting interviews in apps/api/src/modules/reporting/ and apps/api/src/modules/synthesis/ leaves survey studies out without error, with a test in apps/api/src/modules/reporting/tests/ (US1 scenario 4, FR-021)
- [X] T012 [US1] Add component tests in apps/api/tests/studies.component.test.ts: creating a survey study; attaching a folder creates no session; guide, schedule and sessions refuse with `NOT_AN_INTERVIEW_STUDY`

## Phase 4: US3 - Read, edit, download (P1)

Done before US2, since the assistant's card and the tab show the same view. **Independent test**: quickstart 3.

- [X] T013 [US3] Write failing use-case tests, then apps/api/src/modules/research/application/commands/questionnaire-commands.ts: save with version check, `NOT_A_SURVEY_STUDY`, `READ_ONLY` per spec 026; deleting the study deletes the questionnaire
- [X] T014 [US3] Write apps/api/src/modules/research/application/queries/questionnaire-queries.ts and the routes of contracts/api.md in apps/api/src/modules/research/infrastructure/http.routes.ts; run `pnpm generate`
- [X] T015 [P] [US3] Write the default consent and thanks in the interface language in `useEmptyQuestionnaire`, apps/web/src/features/preparation/questionnaire-editor.tsx: objective, format and length, anonymity and data use, "no right or wrong answer", free choice, place for sensitive themes (FR-006), and the contact item's text (FR-024)
- [X] T016 [US3] Write the view in apps/web/src/features/preparation/questionnaire-view.tsx, with what analysis each kind allows (FR-009), and the tab in apps/web/src/features/preparation/questionnaire-tab.tsx; choose the tab by type in apps/web/src/routes/_authenticated/studies/$studyId.tsx, reader included
- [X] T017 [US3] Write the editor in apps/web/src/features/preparation/questionnaire-editor.tsx: all kinds, add, change, remove, move; errors next to the field; "changed meanwhile"; with Storybook stories for any new piece in packages/ui
- [X] T018 [P] [US3] Write the Markdown download in apps/web/src/features/preparation/questionnaire-markdown.ts, with a test

## Phase 5: US2 - Design with the assistant (P1)

**Independent test**: quickstart 2.

- [X] T019 [US2] Write failing tests, then apps/api/src/modules/research/domain/questionnaire-checks.ts: the rules of FR-007, one test per rule in English and French; the estimate of research R10; export through apps/api/src/modules/research/index.ts. (Needed by US4's screen too.)
- [X] T020 [P] [US2] Write failing tests, then apps/api/src/modules/assistant/domain/questionnaire-progress.ts: weights 20, 5, 15, 10, 10, 25, 10, 5; unknown points missing
- [X] T021 [US2] Add the `questionnaire-design` skill in apps/api/src/modules/assistant/application/skills.ts, in the method's order, without vendor
- [X] T022 [US2] Add `check_questionnaire_items`, `report_questionnaire_progress`, `propose_questionnaire` in apps/api/src/modules/assistant/application/tools.ts and apps/api/src/modules/assistant/domain/proposal.ts, and their handling in apps/api/src/modules/assistant/application/commands/send-message.ts; offered only on a survey study a person can change; this study only, validated, applied once with the version seen (FR-010)
- [X] T023 [US2] Give the questionnaire, its version and skills in apps/api/src/modules/assistant/application/context.ts, plus the wording of the continuing answer; no interview wording for a survey study
- [X] T024 [US2] Show the card in apps/web/src/features/assistant/proposal-card.tsx (sections, counts per kind, estimate, flags, expandable text), and the progress bar for the eight points
- [X] T025 [US2] Add the design cost (research R11): an assistant query summing through `studyCosts`, wired in apps/api/src/compose.ts, shown on the tab, with a test: summed across people, the total only
- [X] T026 [US2] Write apps/api/src/modules/assistant/tests/assistant-questionnaire.test.ts: design, progress, card, Apply, "changed meanwhile", a proposal for another study refused, a read-only person gets no tool

## Phase 6: US5 - Publish as a form (P1)

**Independent test**: quickstart 5.

- [X] T027 [US5] Write failing tests, then apps/api/src/modules/publishing/domain/form.ts: `renderForm` per research R2 and R3 (grid only for 2+ consecutive Likert items sharing a legend with shuffle on; ordered options not shuffled; consent first, refusal submits), read-back items per R8, a kind unknown gives `unread`
- [X] T028 [US5] Write failing tests, then `planFormUpdate` in apps/api/src/modules/publishing/domain/form.ts (research R7): only what differs, masks leave ids out, grid rows keep ids
- [X] T029 [US5] Extend the port in apps/api/src/modules/publishing/application/ports.ts and apps/api/src/modules/ingestion/domain/drive-documents.ts, apps/api/src/modules/ingestion/application/study-files.ts, the fake in apps/api/src/modules/ingestion/infrastructure/in-memory.drive-documents.ts (the development Drive and the e2e use it through dev-drive.ts), wiring in apps/api/src/compose.ts
- [X] T030 [US5] Write the adapter apps/api/src/modules/ingestion/infrastructure/google-forms.ts with Zod on replies and a test in the style of drive.fetch-gateway.test.ts: create, move, set `DO_NOT_COLLECT`, ensure closed, read, update with `requiredRevisionId`; a disabled service maps to its own message
- [X] T031 [US5] Add the kind `questionnaire` in apps/api/src/modules/publishing/application/commands/publication-commands.ts: publish, check, update, decide, `applyChanges` through `saveQuestionnaire` origin `drive`, storing the map, spreadsheet, acceptance and identity collection; tests in apps/api/src/modules/publishing/tests/publication-commands.test.ts, including republishing after the form was removed (new form, former identities not reused) and a detached folder (unavailable, questionnaire kept); forms never deleted
- [X] T032 [US5] Add the same in apps/api/src/modules/publishing/infrastructure/publishing.drizzle-store.ts and the view fields in apps/api/src/modules/publishing/infrastructure/http.routes.ts; run `pnpm generate`
- [X] T033 [US5] Show in apps/web/src/features/preparation/drive-publishing.tsx and drive-review.tsx: the form's link, what is randomised before and after publishing (FR-015), whether it accepts responses, the warning when it collects identities (FR-014), the spreadsheet guide or link (FR-017), the reminder on the contact item (FR-024)

## Phase 7: US4 - Warnings (P2)

- [X] T034 [US4] Return checks and estimate in the query of apps/api/src/modules/research/application/queries/questionnaire-queries.ts; show them in apps/web/src/features/preparation/questionnaire-view.tsx and questionnaire-tab.tsx, next to each item and for the whole, with codes translated

## Phase 8: US6 - Readiness (P2)

- [X] T035 [US6] Write failing tests, then mark and unmark in apps/api/src/modules/research/application/commands/questionnaire-commands.ts; compute the checks and "changed since" in questionnaire-queries.ts
- [X] T036 [US6] Write failing tests, then `surveyNextStep` in apps/api/src/modules/assistant/domain/next-step.ts, and use it in apps/api/src/modules/assistant/application/context.ts
- [X] T037 [US6] Write apps/web/src/features/preparation/questionnaire-tab.tsx

## Phase 9: US7 - Best practices (P2)

- [X] T038 [P] [US7] Write one typed module per language in packages/shared, next to `BEST_PRACTICES` (ADR-0006): four steps, biases, ethics, analysis ahead, sources; no company or vendor; add a test as for the interview document
- [X] T039 [US7] Write the dialog and download in apps/web/src/features/preparation/best-practices.tsx, reusing `practicesToMarkdown`

## Phase 10: US8 - Publish through the assistant (P3)

- [X] T040 [US8] Accept `questionnaire` in `publish_preparation` in apps/api/src/modules/assistant/application/tools.ts, in the card apps/web/src/features/assistant/proposal-card.tsx and the wording after publishing in context.ts, with a test

## Phase 11: Polish

- [X] T041 Run `pnpm --filter @goodresearch/web i18n:extract` and translate apps/web/src/locales/fr/messages.po per the glossary
- [X] T042 [P] Write docs/agent-journeys/09-questionnaire.md (sections of its README) and add it to docs/agent-journeys/README.md
- [X] T043 [P] Document enabling the Forms API in README.md's Drive section, and update apps/api/README.md if it lists adapters
- [X] T044 Add apps/web/e2e/questionnaire.spec.ts with axe: create, write by hand, read-only view, the best practices dialog, the assistant's card, light and dark
- [X] T045 Run `pnpm check`, `pnpm test`, `pnpm build`, `pnpm e2e`; existing interview tests pass unchanged (SC-007)
- [ ] T046 Run quickstart.md scenario 5 with a real account, by hand, and report each line; a failure on consent, grid or scope goes back to the spec

## Dependencies

- Phase 2 blocks all. US1 first, then US3, then US2 and US5 (either order; US2 needs T019). US4 needs T019. US6 and US8 need US5's kind. US7 is independent.
- MVP: US1, US3, US5: a questionnaire written by hand and published as a form. US2 completes the P1 scope.

## Parallel

T003 then T005/T006; in US5, T027 and T028 share a file so run in order; T038, T042, T043 at any time.
