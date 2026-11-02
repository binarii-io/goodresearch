# Tasks: Interviews with the assistant

**Input**: Design documents from `specs/025-agent-interviews/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; e2e with the simulated Drive and the test provider; manual scenarios with a real model.

## Phase 1: Setup

- [x] T001 Add the kinds `count_interviews`, `list_interviews`, `propose_analysis` in apps/api/src/modules/assistant/domain/proposal.ts and packages/contracts/src/assistant.ts, with migration apps/api/drizzle/0053_interview_tools.sql

## Phase 2: Foundational

- [x] T002 Write failing tests in apps/api/src/modules/ingestion/tests/interview-filters.test.ts, then implement apps/api/src/modules/ingestion/domain/interview-filters.ts: states, counts, combined filters, name without accents, pages
- [x] T003 Add the ports in apps/api/src/modules/assistant/application/ports.ts, wired in apps/api/src/compose.ts and tests/fakes/assistant-world.ts

## Phase 3: User Story 1 - See where interviews stand (P1, first pull request)

**Goal**: counts and lists. **Independent test**: US1's in spec.md.

- [x] T004 [US1] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-interviews.test.ts: counts with no name and no consent; list needing consent; refused when anonymised; no filter gives all; pages; nothing stored
- [x] T005 [US1] Implement the tools in application/tools.ts and commands/send-message.ts, and the panel lines in apps/web/src/features/assistant/proposal-card.tsx
- [x] T006 [US1] Extend `nextStep` in domain/next-step.ts with analyse and decide, with tests, read in application/context.ts only once the step reaches Fieldwork

## Phase 4: User Story 2 - Start the analysis (P1, first pull request)

**Goal**: an analysis from a card. **Independent test**: US2's in spec.md.

- [x] T007 [US2] Write failing tests in tests/assistant-interviews.test.ts: card with number and cost, refusals, Apply with consent, continuation
- [x] T008 [US2] Implement `propose_analysis` and its Apply in commands/proposal-commands.ts; show the card, wait for the run one minute at most, then continue

## Phase 5: Polish of the first pull request

- [x] T009 Add the tools to the script in apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts and write apps/web/e2e/assistant-interviews.spec.ts
- [x] T010 Run `pnpm generate`, extract and translate the catalogs
- [x] T011 [P] Update docs/agent-journeys/08-interviews.md, README.md and docs/domain/context-map.md
- [x] T012 Run `pnpm check`, `pnpm test`, `pnpm e2e`; back up the local database, restart the local stack; the maintainer tests before any push

## Phase 6: User Story 3 - Accept suggestions (P1, second pull request)

- [x] T013 [US3] Write failing tests, then implement `propose_accepting_suggestions`, its route and card, lines to untick, a differing date unticked, per-line outcomes, refused while an analysis runs on those interviews

## Phase 7: User Story 4 - Validate or exclude (P1, second pull request)

- [x] T014 [US4] Write failing tests, then implement `propose_validating_interviews` and `propose_excluding_interviews`, their route and cards, reasons, per-line outcomes
- [x] T015 [US4] Extend `nextStep` with validate and the next phase

## Phase 8: Polish of the second pull request

- [x] T016 Script, e2e, catalogs, docs, full checks; the maintainer tests before any push

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → first pull request → US3 → US4 → second pull request.

## Parallel

T011. Other tasks touch the same files and run in order.
