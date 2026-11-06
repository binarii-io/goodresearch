---
description: "Task list for spec 034: Cleaning review without duplicates, with steady buttons and context"
---

# Tasks: Cleaning review without duplicates, with steady buttons and context

**Input**: Design documents from `specs/034-cleaning-review-comfort/`

**Tests**: test-first (constitution V) on the domain rule and the query; e2e for the context.

## Phase 1: Setup

None.

## Phase 2: Foundational (contract)

- [X] T001 Add `TurnContextParams`, `TurnContext` in packages/contracts/src/cleaning.ts and `TURN_NOT_FOUND` (404) in packages/contracts/src/errors.ts (review: a read of its own instead of `around`)

## Phase 3: User Story 1 - One proposal per change (P1)

**Goal**: an identical change from several sources is listed, counted and decided once.

**Independent Test**: lexicon and AI propose the same change at one place: one row; reject it: the change is not applied nor listed again.

- [X] T002 [US1] Test first in apps/api/src/modules/transcripts/tests/corrections.test.ts: `resolveCorrections` marks the lower-priority identical change `duplicate` and overridden (proposed, accepted or rejected higher one); a different change at the same place stays not duplicate; `effectiveCorrections` / `analysedCorrections` never apply a duplicate of a rejected change
- [X] T003 [US1] Implement `duplicate` in `resolveCorrections`, apps/api/src/modules/transcripts/domain/corrections.ts ("same change": segment, target, offset, length, replacement or its edit)
- [X] T004 [US1] Test first then implement: the interview cleaning read leaves duplicates out of `turns` and `counts.rejected`, apps/api/src/modules/transcripts/tests/cleaning-commands.test.ts and application/queries/cleaning-queries.ts

## Phase 4: User Story 2 - Buttons stay off until the result shows (P2)

- [X] T005 [US2] `settling` flag in `InterviewCleaningView`: set on accept / reject / reopen / accept all shown, cleared after `refresh()` or on a refusal; buttons disabled while `busy || settling`, apps/web/src/features/enrichment/interview-cleaning.tsx

## Phase 5: User Story 3 - The conversation around a turn (P2)

- [X] T006 [US3] Test first then implement `turnContext` (route `getTurnContext`): the turn and up to two before and after, corrections not rejected, other filters ignored; first / last turn; unknown turn gives `TURN_NOT_FOUND` — tests in apps/api/src/modules/transcripts/tests/cleaning-commands.test.ts, code in application/queries/cleaning-queries.ts
- [X] T007 [US3] Regenerate the API client (`pnpm generate`)
- [X] T008 [US3] "Context" button on each turn opening a panel (read on open) with the neighbouring turns via `TurnText`, the turn marked, a close button, in apps/web/src/features/enrichment/interview-cleaning.tsx; strings EN/FR (`pnpm --filter @goodresearch/web i18n:extract`, French in apps/web/src/locales/fr)
- [X] T009 [US3] E2E: open a turn's context, see a neighbour, close it, in apps/web/e2e/enrichment-cleaning.spec.ts

## Phase 6: Polish

- [X] T010 [P] Transcripts README and context map: duplicates (a person's decision stands) and the turn context, apps/api/src/modules/transcripts/README.md, docs/domain/context-map.md
- [X] T012 [US2] Review: the edit and add dialogs and the Validate buttons follow `settling`; a refused decision reads the view again
- [X] T011 Run `pnpm check`, unit tests, the cleaning integration tests; restart the local stack

## Dependencies

T001 before T006–T008. T002 before T003 before T004. US2 independent.

## Implementation Strategy

All three in one PR (small).
