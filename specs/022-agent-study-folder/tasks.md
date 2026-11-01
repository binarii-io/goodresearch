# Tasks: Attach a study's Drive folder with the assistant

**Input**: Design documents from `specs/022-agent-study-folder/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; e2e with the simulated Drive and the test provider; manual scenarios with a real model and a real Drive.

## Phase 1: Setup

- [x] T001 Add the kinds `attach_folder` and `connect_source` in apps/api/src/modules/assistant/domain/proposal.ts and packages/contracts/src/assistant.ts, `folderName` and `folderOwner` in the preview, with migration apps/api/drizzle/0047_folder_cards.sql
- [x] T002 Add the error `FOLDER_ALREADY_ATTACHED` (409) in packages/contracts/src/errors.ts with its message in apps/web/src/features/workspace/errors.ts

## Phase 2: Foundational

- [x] T003 Write failing tests in apps/api/src/modules/ingestion/tests/ for `checkFolder` (each refusal, nothing attached, nothing started) and `attachFolder` with `onlyIfNone`
- [x] T004 Implement them in apps/api/src/modules/ingestion/application/commands/source-commands.ts, sharing the read of the folder with `attachFolder`
- [x] T005 Add `folderState` (name, status, counts by kind) in apps/api/src/modules/ingestion/application/queries/source-queries.ts, tested: no file name or group, nothing without access
- [x] T006 Add the ports `checkFolder`, `folderState`, `sourceConnected` and the action `attachFolder` in apps/api/src/modules/assistant/application/ports.ts, wired in apps/api/src/compose.ts and in tests/fakes/assistant-world.ts

## Phase 3: User Story 1 - Attach from the conversation (P1)

**Goal**: a folder attached from a link. **Independent test**: US1's in spec.md.

- [x] T007 [US1] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-study-folder.test.ts: each refusal with its reason during the answer and no card; card with name and owner; replaced card; Apply with `onlyIfNone`; dismissal told to the model; continuation with counts
- [x] T008 [US1] Implement `prepareFolder` and the tool `attach_folder` in application/tools.ts, run during the answer in commands/send-message.ts; run it in commands/proposal-commands.ts; accept it in `openContinue`
- [x] T009 [US1] Show the card in apps/web/src/features/assistant/proposal-card.tsx; on Apply open Fieldwork, wait for the inventory one minute at most, then continue

## Phase 4: User Story 2 - Connect Drive first (P1)

**Goal**: no dead end without a connection. **Independent test**: US2's in spec.md.

- [x] T010 [US2] Write failing use-case tests in tests/assistant-study-folder.test.ts: connection card with no attach; Apply refused; continuation refused while not connected, accepted once connected and once only; card applied; the history shows the `attach_folder` call with its link
- [x] T011 [US2] Implement the card and the continuation in commands/send-message.ts and commands/proposal-commands.ts
- [x] T012 [US2] Show the card, reusing the explanation exported from apps/web/src/features/ingestion/source-panel.tsx; on `drive=connected` in apps/web/src/routes/_authenticated/studies/$studyId.tsx, ask the panel to continue

## Phase 5: User Story 3 - The right time (P2)

**Goal**: the next steps are offered. **Independent test**: US3's in spec.md.

- [x] T013 [US3] Write failing tests, then update application/context.ts: the study's continuation offers the folder and the guide; the study page holds the folder's state, only for people with access; instruction on replacing

## Phase 6: User Story 4 - Select among choices, and Preparation first (P1)

**Goal**: one click on what comes next; never Fieldwork too early. **Independent test**: US4's in spec.md.

- [x] T019 [US4] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-choices.test.ts: valid list shown and recorded; invalid list not shown with its reason; offered during a continuation; the model told the next message answers it
- [x] T020 [US4] Add the kind `offer_choices` in domain/proposal.ts and packages/contracts/src/assistant.ts, in a new migration apps/api/drizzle/0048_choices.sql (0047 is already applied locally), the tool in application/tools.ts, recording in commands/send-message.ts, and the instruction and continuations in application/context.ts
- [x] T021 [US4] Write failing tests for `opensOn` in tests/assistant-study-folder.test.ts (no guide, no planned interview, both), then compute it in `prepareFolder` in application/tools.ts
- [x] T022 [US4] Add apps/web/src/features/assistant/choices.tsx and show it from proposal-card.tsx, usable only on the last answer, sending through the panel's `submit` in panel.tsx
- [x] T023 [US4] Open Preparation after a study card, and `opensOn` after a folder card, in proposal-card.tsx, sending the tab with the continuation in panel.tsx and state.tsx

## Phase 7: Polish

- [x] T014 Add `attach_folder` to the script in apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts and write apps/web/e2e/assistant-study-folder.spec.ts: not connected then connected, Apply, counts, the cost after each, axe in light and dark; the list of choices, single and multiple, and the tab that opens
- [x] T015 Run `pnpm generate`, then `pnpm --filter @goodresearch/web i18n:extract` and translate in apps/web/src/locales/fr/messages.po
- [x] T016 [P] Update docs/agent-journeys/05-study-folder.md, README.md, 04-create-study.md and docs/domain/context-map.md
- [x] T017 Run `pnpm check`, `pnpm test`, `pnpm e2e` (quickstart.md)
- [x] T018 Back up the local database, restart the local stack; the maintainer tests with a real model and a real Drive, before any push

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → Polish. US2's continuation builds on US1's tool.

## Parallel

T016. Other tasks touch the same files and run in order.

## Implementation strategy

Ingestion's check first, then the card when connected, then the connection card. All in one pull request.
