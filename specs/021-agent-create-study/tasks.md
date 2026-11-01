# Tasks: Create a study with the assistant

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; e2e with the test provider; manual scenarios with a real model.

## Phase 1: Setup

- [x] T001 Add `report_study_progress` in apps/api/src/modules/assistant/domain/proposal.ts and packages/contracts/src/assistant.ts, with migration apps/api/drizzle/0046_study_framing.sql

## Phase 2: Foundational

- [x] T002 Write failing tests in apps/api/src/modules/assistant/tests/study-framing.test.ts, then implement apps/api/src/modules/assistant/domain/study-framing.ts
- [x] T003 Allow `projectId: null` in apps/api/src/modules/research/domain/study.ts, tested in research/tests/study.test.ts

## Phase 3: US1 - Frame and create (P1)

- [x] T004 [US1] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-create-study.test.ts: refusals with reasons, card, replaced card, Apply with the goal, old card, continuing answer and its tools
- [x] T005 [US1] Implement `prepareStudy`, `report_study_progress` and the new `create_study` input in application/tools.ts, application/commands/send-message.ts and proposal-commands.ts
- [x] T006 [US1] Add the skill `study-framing` in application/skills.ts and the continuations in application/context.ts
- [x] T007 [US1] Show the card, progress bar, skill label and opening of the study in apps/web/src/features/assistant/

## Phase 4: US2 - Reuse (P1)

- [x] T008 [US2] List reusable studies on any page in application/context.ts, with a port accepting no project, wired in apps/api/src/compose.ts

## Phase 5: US3 - No project (P2)

- [x] T009 [US3] Add `createTeamStudy` in research/application/commands/study-commands.ts with tests, `POST /api/teams/:teamId/studies`, the contract; run `pnpm generate`
- [x] T010 [US3] Add apps/web/src/features/research/create-team-study-dialog.tsx on the team's Studies page

## Phase 6: Polish

- [x] T011 Update the script in fake.model-runner.ts and e2e: apps/web/e2e/assistant-create-study.spec.ts, assistant.spec.ts, assistant-create-project.spec.ts
- [x] T012 Extract and translate catalogs
- [x] T013 [P] Update docs/agent-journeys (01, 04, README) and docs/domain/context-map.md
- [x] T014 Run `pnpm check`, `pnpm test`, `pnpm e2e`
- [x] T015 Back up the local database, restart the local stack; the maintainer tests before any push

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → Polish; the card in no project needs T009's command, wired in T005 through a port.
