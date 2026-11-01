# Tasks: Link a study to several projects

**Input**: Design documents from `specs/019-attach-study/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; integration tests on PostgreSQL for the migration; e2e with the test provider; manual scenarios with a real model.

## Phase 1: Setup

- [x] T001 Add the errors `DIFFERENT_TEAM`, `ALREADY_LINKED`, `NOT_LINKED`, `SYNTHESIS_RUNNING`, `STUDY_SHARED`, `TEAM_HAS_STUDIES` in packages/contracts/src/errors.ts and their messages in apps/web/src/features/workspace/errors.ts

## Phase 2: Foundational (data and access)

- [x] T002 Write failing tests for the Study aggregate in apps/api/src/modules/research/tests/study-links.test.ts: attach refused with `DIFFERENT_TEAM` and `ALREADY_LINKED`, detach refused with `NOT_LINKED` and allowed down to zero links, goal "at most 10,000 characters" and may be empty, version bumped
- [x] T003 Implement `teamId`, `goal`, links, `attach`, `detach`, `changeGoal` in apps/api/src/modules/research/domain/study.ts and its repositories (fake and Drizzle)
- [x] T004 Update apps/api/src/modules/research/infrastructure/schema.ts and write apps/api/drizzle/0043_study_links.sql: `team_id` and `goal` backfilled from the project, `research_study_projects` backfilled with `linked_at` = the study's `created_at`, `project_id` dropped, `team_id` required with `restrict`, the three new proposal kinds allowed
- [x] T005 Write an integration test in apps/api/tests/study-links.int.test.ts: backfill keeps team, goal and link; deleting a project leaves its studies; deleting a study removes its links
- [x] T006 Read a study's team in apps/api/src/modules/research/application/queries/study-queries.ts, preparation-queries.ts and commands/study-commands.ts, preparation-commands.ts; `listStudies` joins the links and returns `alsoIn`; `getStudy` returns `projects`, `team`, `goal`; `createStudy` copies the project's team and goal
- [x] T007 Change `StudyDetail` and `StudySummary` in packages/contracts/src/research.ts; replace `study.project` by `projects` in apps/api/src/compose.ts and apps/api/src/modules/assistant/application/tools.ts, context.ts, ports.ts; run `pnpm generate`
- [x] T008 Adapt apps/web/src/routes/_authenticated/studies/$studyId.tsx to `projects` with the breadcrumb of research R10, and keep the existing tests green
- [x] T009 Run the full unit and integration tests: a study in one project behaves as before (SC-004)

## Phase 3: User Story 1 - Reuse an existing study (P1)

**Goal**: attach from a project. **Independent test**: US1's in spec.md.

- [x] T010 [US1] Write failing use-case tests for `attachStudy` in apps/api/src/modules/research/tests/study-links.test.ts: team, folder access, already linked (also when two requests race), no AI call
- [x] T011 [US1] Implement `attachStudy` in apps/api/src/modules/research/application/commands/study-commands.ts and `POST /api/projects/:projectId/studies/:studyId/link` in infrastructure/http.routes.ts
- [x] T012 [US1] Implement `listTeamStudies` (`q`, `notInProject`, at most 100, `hasMore`) with `canAttach` for each row, in application/queries/study-queries.ts, `GET /api/teams/:teamId/studies`
- [x] T013 [US1] Add the attach dialog with search in apps/web/src/features/research/attach-study-dialog.tsx and its button in study-list.tsx; empty state offers a new study

## Phase 4: User Story 2 - Detach a study (P1)

**Goal**: reversible links. **Independent test**: US2's in spec.md.

- [x] T014 [US2] Write failing use-case tests for `detachStudy`: not linked, run in progress, last project allowed, nothing deleted
- [x] T015 [US2] Add the `ProjectRunGate` port in apps/api/src/modules/research/application/ports.ts, wire it to Synthesis in apps/api/src/compose.ts; implement `detachStudy` and `DELETE .../link`
- [x] T016 [US2] Return `outside` for citations of facts from studies not in the project in apps/api/src/modules/synthesis/application/queries/insight-queries.ts, with its test; show it in apps/web/src/features/synthesis/insight-panel.tsx
- [x] T017 [US2] Add the confirmation dialog saying where the study stays in apps/web/src/features/research/detach-study-dialog.tsx
- [x] T018 [US2] Check that key takeaways say they may be out of date after a change of links (spec edge case) in apps/api/src/modules/synthesis/application/commands/takeaways-commands.ts; adjust if they do not

## Phase 5: User Story 3 - Know that a study is shared (P1)

**Goal**: nobody changes another project's evidence unknowingly. **Independent test**: US3's in spec.md.

- [x] T019 [US3] Show "Also in …" on study cards in apps/web/src/features/research/study-list.tsx, with `?from=` on their links
- [x] T020 [US3] List the projects on the study page, and add the shared-decisions note to the Analysis tab, in apps/web/src/routes/_authenticated/studies/$studyId.tsx
- [x] T021 [US3] Mark shared studies' costs and say the project total includes them in apps/web/src/features/research/cost-breakdown.tsx and study-list.tsx

## Phase 6: User Story 4 - The study's own goal (P1)

**Goal**: one stable goal per study. **Independent test**: US4's in spec.md.

- [x] T022 [US4] Write failing tests: `context` for facts and interview review reads the study's goal; insights read the project's
- [x] T023 [US4] Read the study's goal in both `context` functions in apps/api/src/compose.ts; add `updateStudyGoal` and `PATCH /api/studies/:studyId/goal`
- [x] T024 [US4] Show the study's goal, editable in place, in apps/web/src/routes/_authenticated/studies/$studyId.tsx; say on the project's goal that studies keep their own

## Phase 7: User Story 5 - The team's studies (P1)

**Goal**: a home for every study. **Independent test**: US5's in spec.md.

- [x] T025 [US5] Add the page in apps/web/src/routes/_authenticated/team-studies/$teamId.tsx: list, search, "No project", attach to a project; link it from apps/web/src/routes/_authenticated/teams.tsx
- [x] T026 [US5] Make every phase of a study page work without a project, and lead its breadcrumb to the team's page, in apps/web/src/routes/_authenticated/studies/$studyId.tsx
- [x] T027 [US5] `moveProjectToTeam`: refuse with `STUDY_SHARED`, otherwise move the studies in one transaction, in apps/api/src/modules/research/application/commands/move-project-to-team.ts, with tests
- [x] T028 [US5] Refuse with `TEAM_HAS_STUDIES` in apps/api/src/modules/workspace/application/commands/delete-team.ts, with a test (FR-019)

## Phase 8: User Story 6 - With the assistant (P2)

**Goal**: the same actions through cards. **Independent test**: US6's in spec.md.

- [x] T029 [US6] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-attach-study.test.ts: each tool's card and every refusal with its reason during the answer; a study of another team is unknown; Apply runs the command once
- [x] T030 [US6] Add `attach_study`, `detach_study`, `update_study_goal` in apps/api/src/modules/assistant/domain/proposal.ts, application/tools.ts, commands/send-message.ts, commands/proposal-commands.ts, and the actions in compose.ts
- [x] T031 [US6] Give the team's other studies on a project page (at most 30) and both goals on a study page in apps/api/src/modules/assistant/application/context.ts; start the guide design from the study's goal
- [x] T032 [US6] Let the continuing answer mention a related study in apps/api/src/modules/assistant/application/context.ts, and offer `attach_study` in it in send-message.ts
- [x] T033 [US6] Show the new cards and `otherProjects` in apps/web/src/features/assistant/proposal-card.tsx; add scripts to apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts

## Phase 9: Polish

- [x] T034 Run `pnpm --filter @goodresearch/web i18n:extract` and translate in apps/web/src/locales/fr/messages.po using the glossary
- [x] T035 Write the e2e journey in apps/web/e2e/attach-study.spec.ts: attach, sharing shown, detach down to "No project", team page, attach again, assistant card, axe in light and dark
- [x] T036 [P] Add the ADR in docs/adr/ and update docs/domain/context-map.md; update apps/api/src/modules/research README if any
- [x] T037 [P] Update docs/agent-journeys/02-attach-study.md and README.md to match what is delivered
- [x] T038 Run `pnpm check`, `pnpm test`, `pnpm e2e` (quickstart.md)
- [x] T039 Restart the local stack; the maintainer tests before any push (the assistant scenarios are not confirmed as covered)

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → US5 → US6 → Polish. Phase 2 changes the model that everything reads, so nothing starts before it passes (T009).

## Parallel

T036 and T037. Other tasks share `study-commands.ts`, `$studyId.tsx` or `study-list.tsx`.

## Implementation strategy

Phase 2 first, with nothing visible changing. Then US1 to US5 by the app's own buttons, then the assistant. All in one pull request.
