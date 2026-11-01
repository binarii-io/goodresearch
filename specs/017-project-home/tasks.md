# Tasks: Project home

**Input**: Design documents from `specs/017-project-home/`

**Tests**: domain rules test-first (constitution V); a use-case test with fakes and an e2e test for the flow.

## Phase 1: Setup

No setup: no dependency and no migration.

## Phase 2: Foundational

- [x] T001 Write failing tests for `stepsOf` and `nextStep` (rules of data-model.md, spec clarification on Interviews) in apps/api/src/modules/synthesis/tests/journey.test.ts
- [x] T002 Implement `stepsOf` and `nextStep` in apps/api/src/modules/synthesis/domain/journey.ts
- [x] T003 [P] Add the study read (session states, participants once per person, analysis cost; no backfill, no Drive) in apps/api/src/modules/ingestion/application/queries/session-queries.ts and expose it in apps/api/src/modules/ingestion/infrastructure/module.ts
- [x] T004 [P] Add the study read (lexicon and cleaning costs) in apps/api/src/modules/transcripts/application/queries/ and expose it in apps/api/src/modules/transcripts/infrastructure/module.ts
- [x] T005 [P] Add the study read (fact statuses, facts and translation costs) in apps/api/src/modules/evidence/application/queries/synthesis-reads.ts
- [x] T006 [P] Add the study read (review cost) in apps/api/src/modules/interview-quality/application/queries/quality-queries.ts and expose it in apps/api/src/modules/interview-quality/infrastructure/module.ts
- [x] T007 Add the `studyOverview` source to apps/api/src/modules/synthesis/application/ports.ts and wire it in apps/api/src/compose.ts
- [x] T008 Write failing use-case tests with fakes (counts, next step, costs with unknown, hidden studies, not found) in apps/api/src/modules/synthesis/tests/overview-queries.test.ts
- [x] T009 Implement the query in apps/api/src/modules/synthesis/application/queries/overview-queries.ts and add it to apps/api/src/modules/synthesis/infrastructure/module.ts
- [x] T010 Add the Zod schemas and `GET /api/projects/:projectId/overview` in apps/api/src/modules/synthesis/infrastructure/overview.routes.ts, export from apps/api/src/modules/synthesis/index.ts, register in apps/api/src/compose.ts
- [x] T011 Run `pnpm generate` to update packages/api-client/

## Phase 3: User Story 1 - See where the research stands (P1)

**Goal**: five chained steps and the next step. **Independent test**: US1's in spec.md.

- [x] T012 [P] [US1] Add `JourneySteps` and `JourneyStep` with a story in packages/ui/src/components/journey.tsx and journey.stories.tsx
- [x] T013 [US1] Add the journey, its links and its actions in apps/web/src/features/research/project-journey.tsx
- [x] T014 [US1] Show it under the goal with loading and error states in apps/web/src/routes/_authenticated/projects/$projectId.tsx

## Phase 4: User Story 2 - Compare the studies and their costs (P1)

**Goal**: study chips, costs, breakdowns. **Independent test**: US2's in spec.md.

- [x] T015 [P] [US2] Add the focusable breakdown in apps/web/src/features/research/cost-breakdown.tsx
- [x] T016 [US2] Show chips, cost, the project's total and hidden studies in apps/web/src/features/research/study-list.tsx, reading the overview

## Phase 5: User Story 3 - Read the outcome first (P2)

- [x] T017 [US3] Add the band in apps/web/src/features/synthesis/takeaways-band.tsx and show it in apps/web/src/routes/_authenticated/projects/$projectId.tsx

## Phase 6: User Story 4 - Start a new project (P2)

- [x] T018 [US4] Check and complete the empty state in apps/web/src/features/research/project-journey.tsx and apps/web/src/features/research/study-list.tsx

## Phase 7: Polish

- [x] T019 Invalidate the overview after decisions where its counts change, or refetch on mount, in apps/web/src/features/research/project-journey.tsx
- [x] T020 Run `pnpm --filter @goodresearch/web i18n:extract` and fill French in apps/web/src/locales/fr/
- [x] T021 Add the flow with axe in apps/web/e2e/us-project-home.spec.ts
- [x] T022 Update docs/domain/context-map.md (Project overview, next step, glossary)
- [x] T023 Run `pnpm check` and `pnpm test`; run quickstart.md on the local stack

- [x] T024 Move the read to apps/api/src/modules/reporting and split costs and freshness into their own endpoints (research R-split; earlier tasks name the first location in Synthesis)

## Dependencies

Phase 2 blocks the rest. US1 and US2 are independent of each other; US3 and US4 follow US1.

**Parallel**: T003–T006; T012 with T015.

**MVP**: Phases 2 to 4.
