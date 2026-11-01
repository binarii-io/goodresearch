# Tasks: Delete a research project

**Input**: Design documents from `specs/020-delete-project/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; integration on PostgreSQL; e2e with the test provider; manual scenarios with a real model.

## Phase 1: Setup

- [x] T001 Add the errors `NAME_MISMATCH` (422) and `NAME_REQUIRED` (409) in packages/contracts/src/errors.ts with messages in apps/web/src/features/workspace/errors.ts; add a migration in apps/api/drizzle/ allowing the proposal kind `delete_project`

## Phase 2: Foundational

- [x] T002 Write failing tests for `canBeDeletedBy` (admin, creator, other member, no creator) and `confirms` (exact, spaces at both ends, capitals and accents count) in apps/api/src/modules/research/tests/project-deletion.test.ts
- [x] T003 Implement them in apps/api/src/modules/research/domain/project.ts; add `delete` to apps/api/src/modules/research/domain/project.repository.ts, its Drizzle repository and the fake in tests/fakes/in-memory-research.ts

## Phase 3: User Story 1 - Delete from the app (P1)

**Goal**: the capability, with its confirmation. **Independent test**: US1's in spec.md.

- [x] T004 [US1] Write failing use-case tests for the command in apps/api/src/modules/research/tests/project-deletion.test.ts, in the order of data-model.md: not found, forbidden, live run, wrong name, deleted
- [x] T005 [US1] Implement apps/api/src/modules/research/application/commands/delete-project.ts and `POST /api/projects/:projectId/delete` in infrastructure/http.routes.ts; wire `runs` in infrastructure/module.ts
- [x] T006 [US1] Add `canDelete` to `ProjectDetail` in packages/contracts/src/research.ts and to `getProject` in application/queries/project-queries.ts, reading `createdBy`
- [x] T007 [US1] Add `ProjectDeletion` and `GET /api/projects/:projectId/deletion` in apps/api/src/modules/reporting/, with sources wired in apps/api/src/compose.ts and the published deck read in apps/api/src/modules/synthesis/application/queries/overview-reads.ts, with tests in reporting/tests/overview-queries.test.ts; run `pnpm generate`
- [x] T008 [US1] Add apps/web/src/features/research/delete-project-dialog.tsx: volumes, what stays, name field with its error, disabled until the name matches; show it on apps/web/src/routes/_authenticated/projects/$projectId.tsx when `canDelete`; land on `/`

## Phase 4: User Story 2 - Studies and outside files stay (P1)

**Goal**: certainty on what is not touched. **Independent test**: US2's in spec.md.

- [x] T009 [US2] Write an integration test in apps/api/tests/project-deletion.int.test.ts: insights, recommendations, takeaways, runs and links go; a study of its own stays with its facts, in no project; a shared study stays in the other project; usage entries stay

## Phase 5: User Story 3 - With the assistant (P1)

**Goal**: a card only. **Independent test**: US3's in spec.md.

- [x] T010 [US3] Write failing use-case tests in apps/api/src/modules/assistant/tests/assistant-delete-project.test.ts: card with volumes; each refusal with its reason during the answer; generic Apply refused with `NAME_REQUIRED` and the card still open; wrong name leaves it open; right name deletes once; the name never appears in the stored proposal or in the history; dismissal told to the model; the tool has no name input
- [x] T011 [US3] Add `delete_project` in apps/api/src/modules/assistant/domain/proposal.ts and application/tools.ts, run during the answer in commands/send-message.ts; add ports in application/ports.ts and wiring in apps/api/src/compose.ts
- [x] T012 [US3] Add `confirmDelete` in application/commands/proposal-commands.ts, refuse the kind in `apply`, and add `POST /api/assistant/proposals/:proposalId/confirm-delete` in infrastructure/http.routes.ts; allow applied proposals with no result
- [x] T013 [US3] Add the instruction in application/context.ts: only when asked, ask when several match, never ask for the name in the conversation
- [x] T014 [US3] Show the card with volumes and name field in apps/web/src/features/assistant/proposal-card.tsx, reusing the dialog's summary; land on `/` when the project's page is open; add `delete_project` to the script in apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts

## Phase 6: Polish

- [x] T015 Run `pnpm --filter @goodresearch/web i18n:extract` and translate in apps/web/src/locales/fr/messages.po
- [x] T016 Write the e2e journey in apps/web/e2e/delete-project.spec.ts: refused wrong name, deletion, the study on the team's page, the card, axe in light and dark
- [x] T017 [P] Update docs/domain/context-map.md
- [x] T018 [P] Update docs/agent-journeys/03-delete-project.md and README.md to match what is delivered
- [x] T019 Run `pnpm check`, `pnpm test`, `pnpm e2e` (quickstart.md)
- [x] T020 Back up the local database, restart the local stack; the maintainer tests on a project made for it, before any push

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → Polish. The assistant runs the command of US1.

## Parallel

T017 and T018. Other tasks follow their dependencies.

## Implementation strategy

The command and its tests first, then the app's button, then the assistant. All in one pull request.
