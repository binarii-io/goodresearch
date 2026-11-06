---
description: "Task list for spec 033: lexicon decisions reflect what is kept"
---

# Tasks: Lexicon decisions reflect what is kept

**Input**: Design documents from `specs/033-lexicon-kept-spellings/`

**Tests**: test-first (constitution V) on the query output and the shared filter.

## Phase 1: Setup

None (existing modules, no dependency).

## Phase 2: Foundational (contract)

- [X] T001 Add `spellings: string[]` to `TermQuote` and `spellings: { spelling, count }[]` to `TermOccurrence` in packages/contracts/src/lexicon.ts

## Phase 3: User Story 1 - See what a spelling choice takes into account (P1)

**Goal**: the Change dialog's excerpts and counts follow the spelling switches at once.

**Independent Test**: a term with two spellings; switch one off: its excerpts go and counts drop; on again: as before.

- [X] T002 [P] [US1] Test first: `termQuotes` and `occurrences` give each place the spellings found there (overlapping phrase and word both listed) and each interview its count per spelling, in apps/api/src/modules/transcripts/tests/enrichment-queries.test.ts
- [X] T003 [P] [US1] Test first: `keptOccurrences(occurrences, form, kept)` drops places with no kept spelling, sums counts of kept spellings, drops interviews left with none, always keeps the form, compares with `fold`, in packages/shared/src/kept-occurrences.test.ts
- [X] T004 [US1] Fill `spellings` on places and interviews in `perInterview`, apps/api/src/modules/transcripts/application/queries/enrichment-queries.ts
- [X] T005 [US1] Implement `keptOccurrences` in packages/shared/src/kept-occurrences.ts and export it from packages/shared/src/index.ts
- [X] T006 [US1] Pass the kept spellings to `Occurrences` in the Change dialog and show `keptOccurrences(...)` (first excerpts and "every occurrence"), in apps/web/src/features/enrichment/term-dialogs.tsx
- [X] T007 [US1] Regenerate the API client (`pnpm generate`)

## Phase 4: User Story 2 - A refused decision does not get stuck (P1)

**Goal**: after a `VERSION_CONFLICT`, the list is read again.

**Independent Test**: change a term in one tab, accept it in another: message, row refreshed, second click accepts.

- [X] T008 [US2] In `act`, on `errorCode(failure) === 'VERSION_CONFLICT'` invalidate the lexicon list and enrichment after the message ("accept all shown" already reads the list again: conflicts come back as `changed`), in apps/web/src/features/enrichment/lexicon-table.tsx
- [X] T009 [US2] Same for the Change dialog (call `onSaved` on a conflict) and the Merge dialog (`onMerged`); both stay open and take the new version from the list, in apps/web/src/features/enrichment/term-dialogs.tsx

## Phase 5: Polish

- [X] T010 [P] Transcripts README: occurrences carry their spellings, apps/api/src/modules/transcripts/README.md; shared README: `keptOccurrences`
- [X] T012 [US2] E2E: a term changed in another tab, the accept is refused with the message and the list read again; a spelling switched off and on in the dialog, in apps/web/e2e/enrichment-lexicon.spec.ts
- [X] T011 Run `pnpm check`, `pnpm exec vitest run --project api:unit --project shared --project contracts`, the lexicon e2e if touched; restart the local stack for the user's test

## Dependencies

- T001 before T002–T007. T002/T003 before T004/T005. T005 before T006. US2 independent of US1.

## Parallel Example

T002 and T003 together; T008 alongside US1.

## Implementation Strategy

US1 and US2 are both P1 and small: one PR.
