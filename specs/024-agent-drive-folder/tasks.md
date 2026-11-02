# Tasks: The assistant works in the study's folder

**Input**: Design documents from `specs/024-agent-drive-folder/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; e2e with the simulated Drive and the test provider; manual scenarios with a real model and a copy of a real folder.

## Phase 1: Setup

- [x] T001 Add the kinds in apps/api/src/modules/assistant/domain/proposal.ts and packages/contracts/src/assistant.ts, the error `FOLDER_CHANGES_REQUIRED` (409) in packages/contracts/src/errors.ts and apps/web/src/features/workspace/errors.ts, and migration apps/api/drizzle/0050_folder_work.sql with `assistant_folder_consents`

## Phase 2: Foundational

- [x] T002 Write failing tests in apps/api/src/modules/ingestion/tests/folder-changes.test.ts, then implement apps/api/src/modules/ingestion/domain/folder-changes.ts: limits, keys, names, identical names, dependent lines
- [x] T003 Add `moveFile` in apps/api/src/modules/ingestion/domain/drive-documents.ts, infrastructure/google-documents.ts, infrastructure/in-memory.drive-documents.ts and dev-drive.ts, with its adapter test
- [x] T004 Write failing tests in apps/api/src/modules/ingestion/tests/folder-work.test.ts, then implement application/commands/folder-work.ts: `browse`, `read`, `check`, `apply`, each id checked inside the folder, anonymised refused, an inventory running refused, per-line outcomes, inventory started; an interview keeps its decisions after a move
- [x] T005 Add the ports in apps/api/src/modules/assistant/application/ports.ts, consent in the store, wired in apps/api/src/compose.ts and tests/fakes/assistant-world.ts

## Phase 3: User Story 1 - See the folder (P1)

**Goal**: names, after consent. **Independent test**: US1's in spec.md.

- [x] T006 [US1] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-folder-work.test.ts: consent card and nothing sent; agreed then going on; dismissed; refusals; nothing stored; history tells to call again
- [x] T007 [US1] Implement `browse_folder` and `folder_consent` in application/tools.ts, commands/send-message.ts and commands/proposal-commands.ts; show the consent card in apps/web/src/features/assistant/proposal-card.tsx

## Phase 4: User Story 2 - Read a file (P1)

**Goal**: extracts. **Independent test**: US2's in spec.md.

- [x] T008 [US2] Write failing tests, then implement `read_file` with its limit per answer, and the panel line naming the file

## Phase 5: User Story 3 - Tidy with one card (P1)

**Goal**: changes the person validates. **Independent test**: US3's in spec.md.

- [x] T009 [US3] Write failing tests: refusals, card, generic Apply refused, excluded and dependent lines, outcomes told to the model, connection card and continuation, nothing to delete
- [x] T010 [US3] Implement `propose_folder_changes`, `applyFolderChanges` and `POST /api/assistant/proposals/:id/apply-folder-changes` in infrastructure/http.routes.ts
- [x] T011 [US3] Add apps/web/src/features/assistant/folder-changes-card.tsx: lines with before and after, unticking with dependents, outcomes; wait for the inventory, then continue
- [x] T012 [US3] Add the instructions in application/context.ts: use the folder tools, "To sort" instead of deleting

## Phase 6: Polish

- [x] T013 Stop the planning blocking, in apps/api/src/modules/assistant/domain/next-step.ts and `prepareFolder`, with tests
- [x] T014 Add the tools to the script in apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts and write apps/web/e2e/assistant-folder-work.spec.ts: consent, reading, card, untick, outcomes, axe in light and dark
- [x] T015 Run `pnpm generate`, then `pnpm --filter @goodresearch/web i18n:extract` and translate in apps/web/src/locales/fr/messages.po
- [x] T016 [P] Update docs/agent-journeys/07-study-folder-work.md, 05-study-folder.md, 06-publish-preparation.md, README.md, docs/domain/context-map.md and the spec 022 guarantee on file names
- [x] T017 Run `pnpm check`, `pnpm test`, `pnpm e2e` (quickstart.md)
- [x] T018 Back up the local database, restart the local stack; the maintainer tests with a real model and a copy of a real folder, before any push

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → Polish.

## Parallel

T016. Other tasks touch the same files and run in order.

## Implementation strategy

The pure batch rules and ingestion's operations first, then reading, then the card. All in one pull request.
