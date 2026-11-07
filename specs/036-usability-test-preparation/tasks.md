# Tasks: Usability test preparation

**Input**: Design documents from `specs/036-usability-test-preparation/`

**Tests**: Domain rules are test-first (constitution V): each test task comes before its code and must fail first.

**Format**: `[ID] [P?] [Story] Description`. `[P]`: different files, no incomplete dependency.

## Phase 1: Setup

- [X] T001 Add the terms to the ubiquitous language and the bilingual glossary in docs/domain/context-map.md: Usability test/Test utilisateur (study type row no longer "Later"), Test protocol/Protocole de test, Test task/Tâche, Success criterion/Critère de réussite, Tested interface/Interface testée, Scenario/Scénario, Think-aloud/Pensée à voix haute, Single Ease Question/Question de facilité, System Usability Scale/Échelle d'utilisabilité (SUS), Participant sheet/Fiche participant, Pilot session/Séance pilote; define Test protocol, Test task, Tested interface, Standard questions, Participant sheet in "### 2. Research", extend Readiness check to the protocol (`pilot | interface | review`), saying the concept covers two instruments stored apart (questionnaire and protocol), extend Study (type `usability-test`, phases Preparation, Fieldwork, Lexicon, Enrichment, Analysis, no Quality), the assistant next step (protocol, folder, publication, checks) and the PublishedDocument kinds (`protocol` three-way, `participant-sheet` one way)
- [X] T002 [P] Write the standard questions in packages/shared/src/content/standard-questions.en.ts and standard-questions.fr.ts, and the typed index packages/shared/src/content/standard-questions.ts exported from packages/shared/src/index.ts: `sus-v1` "ten items, five-point agreement scale" (English original by Brooke, 1996; French from the validated F-SUS, Gronier & Baudet, 2021), `seq-v1` "one question, seven points, 1 = very difficult, 7 = very easy", and the defaults `consent` (purpose, the interface is tested not the participant, recording of screen, voice and image, "the recordings will be read by an AI service and names and faces they contain cannot be hidden from it", who sees the recordings, free choice to take part and stop) and `thinkAloud` (FR-005)
- [X] T003 [P] Write the usability test best practices in packages/shared/src/content/usability-practices.en.ts and usability-practices.fr.ts with the `BestPractices` type, index usability-practices.ts exported from packages/shared/src/index.ts: task writing, neutrality, think-aloud, helping and noting it, SUS and SEQ, consent and recordings, how sessions are read afterwards; sources cited, no company or tool vendor in the advice (FR-017)

## Phase 2: Foundational

- [X] T004 Write failing tests in apps/api/src/modules/research/tests/test-protocol.test.ts: "1 to 15 ordered test tasks", "up to 15 hypotheses", "up to 10 warm-up questions, up to 10 debrief questions", "at most 600 characters for an instruction or a criterion, 4,000 for a framing or script text", texts trimmed and non-empty except `description` and `startUrl`, a task without success criterion refused, `consent` non-empty, `sessionMinutes` 10..240, task `minutes` 1..60 or null, `format` `moderated-remote | moderated-in-person`, interface `kind` `prototype | live-application | other`, interface `url` and `startUrl` `http(s)` only, `questionnaire` `none | sus-v1`, `easeQuestion` `none | seq-v1`; identities kept by sent id then normalised instruction, through reordering; a removed id goes to `retiredTaskIds` and is never minted again
- [X] T005 Implement apps/api/src/modules/research/domain/test-protocol.ts (data-model.md), with `identify` written locally as in questionnaire.ts
- [X] T006 [P] Add Zod schemas in packages/contracts/src/test-protocol.ts (`TEST_PROTOCOL_LIMITS`, `TestProtocolDraft` without ids for the assistant, `TestProtocolContentInput`, `TestProtocol` view, `SaveTestProtocol`, `TaskFlag`, `ProtocolFlag`, `ProtocolReadinessKind`, `ProtocolDesignCost`), export them from packages/contracts/src/index.ts; add `NOT_A_USABILITY_TEST_STUDY` (422) and `PROTOCOL_NOT_FOUND` (404) in packages/contracts/src/errors.ts and their messages in apps/web/src/features/workspace/errors.ts
- [X] T007 Write apps/api/drizzle/0060_test_protocols.sql and its journal entry: tables `research_test_protocols` (`study_id` PK FK cascade, `content` jsonb, `origin` check `assistant | person | drive`, `updated_by`, timestamps, `version`) and `research_protocol_checks` (PK `study_id` + `kind` check `pilot | interface | review`, `protocol_version`, `marked_by`, `marked_at`, FK cascade); widen by hand `research_studies_type_check` to `interviews | survey | usability-test`, `publishing_documents_kind_check` with `protocol | participant-sheet`, `assistant_proposals_kind_check` with `propose_protocol | report_protocol_progress | check_protocol_tasks`; mirror the tables in apps/api/src/modules/research/infrastructure/schema.ts
- [X] T008 Write apps/api/src/modules/research/domain/test-protocol.repository.ts, apps/api/src/modules/research/infrastructure/test-protocol.drizzle-repository.ts and its fake in apps/api/src/modules/research/tests/fakes/in-memory-research.ts; wire them in apps/api/src/modules/research/infrastructure/module.ts; exercise them against the real database in apps/api/tests/test-protocol.component.test.ts

**Checkpoint**: the aggregate saves and loads.

## Phase 3: US1 - Create a usability test study (P1)

**Goal**: a usability test study exists, with honest phases, and no count is distorted. **Independent test**: quickstart 1.

- [X] T009 [US1] Change apps/api/src/modules/research/tests/study.test.ts and apps/api/tests/studies.component.test.ts: `usability-test` created; then add it to `CREATABLE` in apps/api/src/modules/research/domain/study.ts and to `CreateTeamStudy.type` in packages/contracts/src/research.ts
- [X] T010 [US1] Add component tests in apps/api/tests/studies.component.test.ts: attaching a folder to a usability test study creates no session; guide, schedule and sessions refuse with `NOT_AN_INTERVIEW_STUDY`; questionnaire refuses with `NOT_A_SURVEY_STUDY`
- [X] T011 [P] [US1] Count by type in apps/api/src/modules/reporting/application/queries/overview-queries.ts (a usability test counts neither as interviews nor as a survey) and apps/api/src/modules/reporting/application/ports.ts, with a test in apps/api/src/modules/reporting/tests/ (US1 scenario 4, FR-019)
- [X] T012 [P] [US1] Add `usability-test` to the `create_study` input and its type passing in apps/api/src/modules/assistant/application/tools.ts and apps/api/src/modules/assistant/application/commands/proposal-commands.ts, and to the study-framing skill text in apps/api/src/modules/assistant/application/skills.ts, with a test in apps/api/src/modules/assistant/tests/assistant-create-study.test.ts
- [X] T013 [P] [US1] Make Usability test available in apps/web/src/features/research/study-list.tsx and apps/web/src/features/research/create-team-study-dialog.tsx; its badge and counts in apps/web/src/features/research/study-card.tsx and apps/web/src/features/research/project-journey.tsx; the Type row of the create-study card in apps/web/src/features/assistant/proposal-card.tsx
- [X] T014 [US1] Phases by type in apps/web/src/routes/_authenticated/studies/$studyId.tsx: for `usability-test`, Preparation, Fieldwork, Lexicon, Enrichment, Analysis only, old links to other phases land on Preparation, every phase but Preparation shows "coming later" and mounts no interview component
- [X] T015 [US1] Show apps/web/src/features/research/study-settings.tsx for usability test studies with the anonymise switch only and the notice under it: it masks names in what the app writes, not in the recordings read by the AI service (FR-022a); accept the route for this type in apps/api/src/modules/research/infrastructure/http.routes.ts
- [X] T016 [US1] Update apps/web/e2e/studies.spec.ts: the Usability test radio is enabled and creates the study

## Phase 4: US3 - Read, edit, download (P1)

Done before US2, since the assistant's card and the tab show the same view. **Independent test**: quickstart 3.

- [X] T017 [US3] Write failing use-case tests, then apps/api/src/modules/research/application/commands/test-protocol-commands.ts: save with version check (`VERSION_CONFLICT` shown as "changed meanwhile"), origin and `updated_by`, `NOT_A_USABILITY_TEST_STUDY`, `READ_ONLY` per spec 026; deleting the study deletes the protocol and its readiness marks
- [X] T018 [US3] Write apps/api/src/modules/research/application/queries/test-protocol-queries.ts (`getTestProtocol` with checks, planned minutes, standard texts of the protocol's language, readiness with names; `testProtocolForAssistant`) and the routes of contracts/api.md in apps/api/src/modules/research/infrastructure/http.routes.ts; add the read routes to apps/api/src/platform/http/change-guard.ts; run `pnpm generate`
- [X] T019 [P] [US3] Write apps/web/src/features/preparation/protocol-view.tsx: framing with the tested interface as a link opening in a new tab, script, scenario, numbered tasks with instruction, criterion, start link and expected duration, SUS items and SEQ after each task when on, debrief; read-only badge outside the owning team
- [X] T020 [US3] Write apps/web/src/features/preparation/protocol-editor.tsx: framing, script lists, scenario, tasks added, reordered and deleted keeping their ids, SUS and SEQ switches showing the fixed texts not editable, errors next to their field; "Write it myself" starts from the defaults of standard-questions with one empty task
- [X] T021 [US3] Write apps/web/src/features/preparation/protocol-tab.tsx (empty state with "Design with the assistant" and "Write it myself", view, edit, version, origin, who and when) and mount it for usability test studies in apps/web/src/routes/_authenticated/studies/$studyId.tsx
- [X] T022 [P] [US3] Write apps/web/src/features/preparation/protocol-markdown.ts and the "Download (Markdown)" action, file named after the study, headings in the interface language, protocol text in its language (FR-012)

## Phase 5: US2 - Design with the assistant (P1)

**Independent test**: quickstart 2.

- [X] T023 [US2] Write failing tests in apps/api/src/modules/assistant/tests/protocol-progress.test.ts, then apps/api/src/modules/assistant/domain/protocol-progress.ts: `PROTOCOL_CHECKLIST` "objective and hypotheses 15, tested interface 10, participants 10, format, length and consent 10, scenario 10, tasks 25, success criteria 10, questionnaire and debrief 5, bias review 5" with the shared `weighted()`; unknown points count as missing; add the keys to `GuideProgress.items.key` in packages/contracts/src/assistant.ts
- [X] T024 [US2] Add `propose_protocol`, `report_protocol_progress`, `check_protocol_tasks` to `PROPOSAL_KINDS` and their classifiers in apps/api/src/modules/assistant/domain/proposal.ts and `ProposalKind` in packages/contracts/src/assistant.ts, with the preview fields (`protocol`, `taskChecks`, `plannedMinutes`) and the store columns in apps/api/src/modules/assistant/infrastructure/assistant.drizzle-store.ts
- [X] T025 [US2] Write the `test-protocol-design` skill in apps/api/src/modules/assistant/application/skills.ts: the nine points in order, one goal per task worded as a user's goal, no interface names or steps, observable success criteria, realistic and simple for non-researchers, consent with the AI reading, SUS and SEQ offered not imposed, check tasks before proposing, propose the whole protocol only after agreement
- [X] T026 [US2] Write `PROTOCOL_TOOLS` in apps/api/src/modules/assistant/application/tools.ts and select them in apps/api/src/modules/assistant/application/commands/send-message.ts on a usability test study a person can change; `check_protocol_tasks` calls Research's exported `checkTestProtocol`; `propose_protocol` builds the card with `targetVersion`; the proposal is applied in apps/api/src/modules/assistant/application/commands/proposal-commands.ts through `saveTestProtocol` wired in apps/api/src/compose.ts with origin `assistant`
- [X] T027 [US2] Build the context in apps/api/src/modules/assistant/application/context.ts: the protocol JSON or its absence with its version, the research goal, the skill in the available list, tabs text for the type; the tested link sent as text only (FR-022)
- [X] T028 [US2] Make the fake model in apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts answer the protocol tools, and write apps/api/src/modules/assistant/tests/assistant-protocol.test.ts: skill loaded, progress recorded, card refused for another study or over limits, applied once, "changed meanwhile"
- [X] T029 [P] [US2] Show the progress with protocol points in apps/web/src/features/assistant/panel.tsx and apps/web/src/features/preparation/labels.ts (`PROTOCOL_POINTS`), the skill label and the protocol card (interface, task count, planned length against session length, flags, questionnaire included, expandable full text) in apps/web/src/features/assistant/proposal-card.tsx
- [X] T030 [US2] Add `GET /api/studies/:studyId/protocol/design-cost` in apps/api/src/modules/assistant/infrastructure/http.routes.ts with the skill name passed to apps/api/src/modules/assistant/application/queries/conversation-queries.ts, and show the cost on apps/web/src/features/preparation/protocol-tab.tsx (FR-011)

## Phase 6: US4 - Warnings (P2)

**Independent test**: quickstart 4.

- [X] T031 [US4] Write failing tests in apps/api/src/modules/research/tests/protocol-checks.test.ts, one firing example and one silent counter-example per rule in English and in French (SC-005): `gives-the-way`, `several-tasks`, `no-goal`, `too-long` "over 40 words", `too-long-for-session`, `too-many-tasks` "more than 8 tasks with a session of 60 minutes or less", `no-think-aloud`, `consent-without-ai`; planned minutes "5 per task without a duration, + 5 introduction, + 10 debrief, + 3 with SUS, + 0.5 per task with SEQ, rounded up"
- [X] T032 [US4] Implement apps/api/src/modules/research/domain/protocol-checks.ts (research R3) and export `checkTestProtocol` (draft without ids) from apps/api/src/modules/research/infrastructure/module.ts and apps/api/src/modules/research/index.ts
- [X] T033 [P] [US4] Show the flags next to each task and for the whole, translated, and the planned length labelled as an estimate, in apps/web/src/features/preparation/protocol-view.tsx, protocol-editor.tsx and labels.ts (`TASK_FLAGS`, `PROTOCOL_FLAGS`)

## Phase 7: US5 - Publish to the folder (P1)

**Independent test**: quickstart 6.

- [X] T034 [US5] Write failing tests in apps/api/src/modules/publishing/tests/protocol.test.ts: `renderProtocol` numbered tasks, instruction in a "Read aloud" block, criterion marked facilitator only, SEQ after each task when on, SUS at the end when on, anchors on framing, script, scenario and each task field; `readProtocol` round trip; `protocolItems` keys of data-model.md; SUS or SEQ text edited gives `not-understood`; turning `questionnaire` or `easeQuestion` on or off makes the document out of date (`standard:questionnaire`, `standard:ease`); `applyToProtocol` keeps task ids when instructions match
- [X] T035 [US5] Implement apps/api/src/modules/publishing/domain/protocol.ts and labels in apps/api/src/modules/publishing/domain/labels.ts
- [X] T036 [US5] Write failing tests then apps/api/src/modules/publishing/domain/participant-sheet.ts: scenario and numbered instructions with start links only, no criterion, script, duration or scale, in the protocol's language; one `unread` item
- [X] T037 [US5] Add the kinds `protocol` and `participant-sheet` to apps/api/src/modules/publishing/application/ports.ts, packages/contracts/src/publishing.ts (and the `kinds` max), `NAMES`, `appSide`, `fileSide` in apps/api/src/modules/publishing/application/commands/publication-commands.ts; publishing `protocol` also publishes `participant-sheet`, a failure on the second reported with the first kept; `decide` refuses acceptance for `participant-sheet` with `VALIDATION`; accepted protocol changes go through Research with origin `drive` in apps/api/src/compose.ts
- [X] T038 [US5] Choose the read by the study's type in apps/api/src/modules/publishing/application/queries/publication-queries.ts (schedule, questionnaire or protocol), instead of falling back by trial
- [X] T039 [US5] Write apps/api/src/modules/publishing/tests/publication-protocol.test.ts with the publishing fakes: publish both, out of date after a change, Drive change accepted and validated, conflict, participant sheet edited is reported then overwritten, unavailable, nothing deleted at source
- [X] T040 [P] [US5] Add the kinds to `KINDS` in apps/web/src/features/preparation/drive-publishing.tsx and to apps/web/src/features/preparation/drive-review.tsx (no Accept for the participant sheet), and show both publications on protocol-tab.tsx

## Phase 8: US6 - Readiness (P2)

**Independent test**: quickstart 3 (checks part).

- [X] T041 [US6] Write failing tests then the mark and unmark commands in apps/api/src/modules/research/application/commands/test-protocol-commands.ts and the readiness part of test-protocol-queries.ts: kinds "pilot | interface | review", name and date, "protocol changed since" when `protocol_version` differs, computed checks (consent present, every task with a criterion) never stored
- [X] T042 [US6] Write failing tests in apps/api/src/modules/assistant/tests/next-step.test.ts, then `usabilityNextStep` in apps/api/src/modules/assistant/domain/next-step.ts: protocol, folder, publication, checks, then Fieldwork; its texts in apps/api/src/modules/assistant/application/context.ts (FR-016)
- [X] T043 [P] [US6] Show the readiness checks on apps/web/src/features/preparation/protocol-tab.tsx with mark and unmark, the computed ones including "published and in sync" from the publications

## Phase 9: US7 - Best practices (P2)

**Independent test**: open, download and publish in both languages.

- [X] T044 [US7] Choose the content by study type in `renderPractices` of apps/api/src/modules/publishing/domain/practices.ts, with a test in apps/api/src/modules/publishing/tests/publishing-domain.test.ts
- [X] T045 [P] [US7] Offer "Read the best practices" on apps/web/src/features/preparation/protocol-tab.tsx with the dialog and download of apps/web/src/features/preparation/best-practices.tsx fed by `USABILITY_PRACTICES`, and the "Publish" action for the `best-practices` kind with its status from apps/web/src/features/preparation/drive-publishing.tsx

## Phase 10: US8 - Publish through the assistant (P3)

- [X] T046 [US8] Accept `protocol` in the `publish_preparation` documents in apps/api/src/modules/assistant/application/tools.ts and packages/contracts/src/assistant.ts, same rules and refusals as the screen, nothing proposed to a read-only person, with a test in apps/api/src/modules/assistant/tests/assistant-publish.test.ts

## Phase 11: Polish

- [X] T047 [P] Write docs/agent-journeys/12-usability-preparation.md and its row in docs/agent-journeys/README.md; update apps/api/README.md if it lists the modules' aggregates or tables
- [X] T048 [P] Update docs/adr/0006-frontend-and-design-system.md: content modules now cover interview, survey and usability test best practices and the standard questions
- [X] T049 [P] Write apps/web/e2e/usability-preparation.spec.ts with axe in light and dark themes: create, write by hand, flags, save, reload, download, readiness marks (SC-008)
- [X] T050 Run `pnpm --filter @goodresearch/web i18n:extract` and translate every new string in apps/web/src/locales/fr with the glossary terms
- [ ] T051 Run `pnpm check`, `pnpm test`, `pnpm generate` and `pnpm e2e`; existing interview and survey tests pass unchanged (SC-007)
- [ ] T052 Run quickstart.md scenario 6 by hand on the real Docs service and record the outcome in the PR

## Dependencies

- Phase 1 and 2 before all stories. US1 before the others (the type must be creatable).
- US3 before US2 (the card shows the same view) and before US4's screen part (T033).
- US4's domain (T031–T032) before US2's `check_protocol_tasks` (T026): do T031–T032 right after US3 if US2 is next.
- US5 before US6's "published and in sync" (T043) and before US8.
- US7 is independent after Phase 1.

## Parallel examples

- Phase 1: T002 and T003 together, after T001.
- US1: T011, T012, T013 together after T009.
- US3: T019 and T022 while T020 is written.
- US5: T040 while T037–T039 are written.

## Implementation strategy

MVP: Phases 1–4 (type creatable, protocol written by hand, downloadable). Then US4 domain, US2, US5, US6, US7, US8, Polish. One pull request for the whole spec, as the previous specs.
