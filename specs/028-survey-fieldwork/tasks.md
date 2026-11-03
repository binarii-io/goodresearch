# Tasks: Survey fieldwork

**Input**: Design documents from `specs/028-survey-fieldwork/`

**Tests**: Domain rules are test-first (constitution V): each test task comes before its code and must fail first.

**Format**: `[ID] [P?] [Story] Description`. `[P]`: different files, no incomplete dependency.

## Phase 1: Setup

- [X] T001 Add context 12 Surveys (SurveyResponse, reading, TargetRule, states), opening and closing a form, and the glossary (Response/Réponse, Open the form/Ouvrir le formulaire, Close the form/Fermer le formulaire, Target rule/Règle de cible, Out of target/Hors cible, Profile not answered/Profil non renseigné, Refused consent/Consentement refusé, Counted/Retenue, Refresh/Actualiser) in docs/domain/context-map.md
- [X] T002 [P] Write docs/adr/0011-survey-responses-module.md: a module of its own, full read, states computed in SQL (research R1, R4)
- [X] T003 Commit-ready check of the phases change already in the tree: apps/web/src/routes/_authenticated/studies/$studyId.tsx, apps/api/src/modules/assistant/application/context.ts, specs/027-survey-preparation/spec.md

## Phase 2: Foundational

- [X] T004 Write apps/api/drizzle/0056_survey_responses.sql through `db:generate`, its `when` after 0055, with tables `surveys_responses`, `surveys_readings`, `surveys_target_rules`, `surveys_item_wordings` per data-model.md, `consent` check `given | refused`, `status` check `done | failed | stopped`, FK cascade on the study; `publishing_documents` columns `responder_link`, `opened_by`, `opened_at`, `closed_by`, `closed_at`; widened `assistant_proposals_kind_check`
- [X] T005 [P] Write schemas in packages/contracts/src/surveys.ts, export from packages/contracts/src/index.ts, add error codes in packages/contracts/src/errors.ts and apps/web/src/features/workspace/errors.ts: `FORM_NOT_PUBLISHED`, `FORM_COLLECTS_IDENTITY`, `FORM_CONSENT_BROKEN`, `FORM_NOT_IN_SYNC`, `RESPONSES_BLOCK_UPDATE`, `REWORDING_TO_CONFIRM`, `RESPONSE_NOT_FOUND`
- [X] T006 Extend the port: `listResponses`, `setAccepting`, `responderLink` in apps/api/src/modules/ingestion/domain/form-model.ts, drive-documents.ts, application/study-files.ts; apps/api/src/modules/ingestion/infrastructure/google-forms.ts with tests in tests/google-forms.test.ts (`respondentEmail` never passed on, pages followed); the fake in in-memory.drive-documents.ts with `addResponse`, `removeResponse`, reachable through dev-drive.ts for the e2e
- [X] T007 Create the module apps/api/src/modules/surveys/ (index, schema, ports, store, module, routes), wired in apps/api/src/compose.ts; check the boundaries in .dependency-cruiser.cjs

## Phase 3: US1 - Open and close (P1)

- [X] T008 [US1] Write failing tests, then `setOpen` in apps/api/src/modules/publishing/application/commands/publication-commands.ts: refused on identities, consent, not in sync; records who and when; a form changed by hand reflected; routes in publishing/infrastructure/http.routes.ts
- [X] T009 [US1] Write apps/web/src/features/surveys/form-state.tsx: state, confirmations recalling the checks left, link to copy; link to Preparation without a form
- [X] T010 [US1] Write apps/web/src/features/surveys/survey-fieldwork-tab.tsx and use it for survey studies in apps/web/src/routes/_authenticated/studies/$studyId.tsx, keeping the source panel

## Phase 4: US2 - Read the responses (P1)

- [X] T011 [US2] Write failing tests, then apps/api/src/modules/surveys/domain/responses.ts: `toStored` (consent, grid column to number, contact dropped, unknown questions counted, values not in the options kept)
- [X] T012 [US2] Write failing use-case tests, then apps/api/src/modules/surveys/application/commands/read-responses.ts: idempotent, deletes only after a full read, stops at 20,000, failure keeps the former, at most once a minute unless forced, needs edit access
- [X] T013 [US2] Write the store and summary query in apps/api/src/modules/surveys/infrastructure/; routes per contracts/api.md; deleting the study cascades; a republished form shows no former response and says so; a detached folder keeps what was read and refuses Refresh with the reason (tests in apps/api/tests/surveys.component.test.ts)
- [X] T014 [US2] Show counts, target number, last reading, Refresh and what was left out in apps/web/src/features/surveys/survey-fieldwork-tab.tsx

## Phase 5: US3 - Target rule (P1)

- [X] T015 [US3] Write failing tests, then `stateOf` and rule validation in apps/api/src/modules/surveys/domain/responses.ts: single and multiple choice, several items, not answered, answer not in the options, item or option gone
- [X] T016 [US3] Write the rule command with version check, and the SQL states in apps/api/src/modules/surveys/application/queries/; an integration test compares SQL with `stateOf` on the same responses, and bounds counts and the first page at 2 seconds for 5,000 responses (SC-007)
- [X] T017 [US3] Write apps/web/src/features/surveys/target-rule.tsx

## Phase 6: US5 - Protect what was collected (P1)

- [X] T018 [US5] Write failing tests, then `impactOfUpdate` in apps/api/src/modules/publishing/domain/form.ts: removed, kind, scale, options, layout breaking; text rewording; addition passes
- [X] T019 [US5] Guard `update` in publication-commands.ts through a port to Surveys: `RESPONSES_BLOCK_UPDATE`, `REWORDING_TO_CONFIRM`, `confirmRewording`, former wordings recorded before writing; `decide` refuses accepting what `impactOfUpdate` calls breaking (FR-011a); tests in publishing/tests/
- [X] T020 [US5] Show the refusal and the confirmation in apps/web/src/features/preparation/drive-publishing.tsx

## Phase 7: US4 - Read a response (P2)

- [X] T021 [US4] Write the paged list and the detail with former wordings in apps/api/src/modules/surveys/application/queries/, and apps/web/src/features/surveys/responses-list.tsx with a dialog

## Phase 8: US6 - Assistant (P2)

- [X] T022 [US6] Write failing tests, then `surveyNextStep` in apps/api/src/modules/assistant/domain/next-step.ts: open, collect, close, analysis later
- [X] T023 [US6] Add `count_responses`, `propose_opening_form`, `propose_closing_form`, `propose_target_rule` in apps/api/src/modules/assistant/application/tools.ts, domain/proposal.ts, commands/send-message.ts, commands/proposal-commands.ts, compose.ts; the questionnaire skill says what comes next in application/skills.ts and context.ts
- [X] T024 [US6] Write the cards in apps/web/src/features/assistant/proposal-card.tsx; the rule's cost on the tab
- [X] T025 [US6] Write apps/api/src/modules/assistant/tests/assistant-survey-fieldwork.test.ts, including that no answer appears in anything sent to the model

## Phase 9: Polish

- [X] T026 Extract and translate apps/web/src/locales/fr/messages.po per the glossary
- [X] T027 [P] Write docs/agent-journeys/10-survey-fieldwork.md and its line in docs/agent-journeys/README.md; update docs/adr/0010-forms-as-survey-collection.md with what is now built
- [X] T028 Add to apps/web/e2e/questionnaire.spec.ts, or a new apps/web/e2e/survey-fieldwork.spec.ts: open, simulated responses, rule, update refused, with axe, light and dark; the reader sees "reserved to the team" (read-access test covers the routes)
- [X] T029 Run `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm e2e` on a fresh database
- [ ] T030 Run quickstart.md scenario 4 with the real service, by hand, with the user

## Dependencies

Phase 2 blocks all. US1, then US2, then US3 and US5 (either order), US4, US6.

MVP: US1, US2, US5: opening, reading, and nothing detached.
