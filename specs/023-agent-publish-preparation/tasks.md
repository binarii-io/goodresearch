# Tasks: Publish the preparation with the assistant

**Input**: Design documents from `specs/023-agent-publish-preparation/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; e2e with the simulated Drive and the test provider; manual scenarios with a real model and a real Drive.

## Phase 1: Setup

- [x] T001 Add the kind `publish_preparation` in apps/api/src/modules/assistant/domain/proposal.ts and packages/contracts/src/assistant.ts, `documents` and `access` in the preview, with migration apps/api/drizzle/0049_publication_card.sql

## Phase 2: Foundational

- [x] T002 Write failing tests in apps/api/src/modules/assistant/tests/next-step.test.ts for the five states, then implement apps/api/src/modules/assistant/domain/next-step.ts
- [x] T003 Write failing tests in apps/api/src/modules/publishing/tests/publication-commands.test.ts for `checkPublication` (kinds left, nothing written, no guide, no folder, write required), then implement it in application/commands/publication-commands.ts
- [x] T004 Add the ports `checkPublication`, `publishedKinds` and the action `publishPreparation` in apps/api/src/modules/assistant/application/ports.ts, wired in apps/api/src/compose.ts and tests/fakes/assistant-world.ts

## Phase 3: User Story 1 - Publish after the guide (P1)

**Goal**: documents in Drive from the conversation. **Independent test**: US1's in spec.md.

- [x] T005 [US1] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-publish.test.ts: each refusal, card with what is left, Apply through the command, dismissal, continuation after a guide and after a publication
- [x] T006 [US1] Implement `preparePublication` and the tool in application/tools.ts, run during the answer in commands/send-message.ts, run in commands/proposal-commands.ts; accept both continuations
- [x] T007 [US1] Show the card and its links in apps/web/src/features/assistant/proposal-card.tsx; continue after a guide and after a publication

## Phase 4: User Story 2 - Missing folder or permission (P1)

**Goal**: no dead end. **Independent test**: US2's in spec.md.

- [x] T008 [US2] Write failing tests in tests/assistant-publish.test.ts: connection card with write access, its history as `publish_preparation`, continuation offering the tool, no folder gives a reason
- [x] T009 [US2] Extend `connect_source` in application/commands/send-message.ts and the connection link in apps/web/src/features/ingestion/source-panel.tsx and proposal-card.tsx

## Phase 5: User Story 3 - What comes next (P1)

**Goal**: an answer from the real state. **Independent test**: US3's in spec.md.

- [x] T010 [US3] Write failing tests, then add the next step's line and the instruction in apps/api/src/modules/assistant/application/context.ts; nothing about the folder without access

## Phase 6: Polish

- [x] T011 Add the tool to the script in apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts and write apps/web/e2e/assistant-publish.spec.ts: guide applied, offer, card, Apply, links, cost, axe
- [x] T012 Run `pnpm generate`, then `pnpm --filter @goodresearch/web i18n:extract` and translate in apps/web/src/locales/fr/messages.po
- [x] T013 [P] Update docs/agent-journeys/06-publish-preparation.md, README.md and docs/domain/context-map.md
- [x] T014 Run `pnpm check`, `pnpm test`, `pnpm e2e` (quickstart.md)
- [x] T015 Back up the local database, restart the local stack; the maintainer tests with a real model and a real Drive, before any push

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → Polish. Builds on the branch of spec 022, which merges first.

## Parallel

T013. Other tasks touch the same files and run in order.

## Implementation strategy

The next step and the check first, then the card, then the connection card. All in one pull request.
