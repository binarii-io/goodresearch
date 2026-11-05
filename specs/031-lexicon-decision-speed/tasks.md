# Tasks: Fast decisions on lexicon terms in large studies

**Input**: Design documents from `specs/031-lexicon-decision-speed/`

**Tests**: test-first (constitution V): each test task comes before its code and must fail first.

**Format**: `[ID] [P?] [Story] Description`. `[P]`: different files, no incomplete dependency.

## Phase 1: Setup

- [X] T001 Measure each step of an edit at the reported volume on made-up data (counting every term, replacing every occurrence, reading transcripts) and record it in specs/031-lexicon-decision-speed/research.md

## Phase 2: Foundational

- [X] T002 Add an optional `termIds` to `replaceOccurrences(studyId, rows, termIds?)` in apps/api/src/modules/transcripts/application/ports.ts: with it, only those terms' rows of the study are deleted and inserted; implement in apps/api/src/modules/transcripts/infrastructure/transcripts.drizzle-store.ts (`delete … where study_id = ? and term_id in (…)`) and in apps/api/src/modules/transcripts/tests/fakes/in-memory-transcripts.ts

## Phase 3: US1 - Edit or merge a term without waiting (P1) 🎯 MVP

**Independent test**: edit and merge on a study; only the terms concerned change, and their rows equal those of a full recount.

- [X] T003 [US1] Write failing tests in apps/api/src/modules/transcripts/tests/lexicon-commands.test.ts: an edit keeps another term's rows (a sentinel row survives) and gives the edited term the rows a full `recount` gives; a merge keeps another term's rows and leaves no row for the merged term
- [X] T004 [US1] In apps/api/src/modules/transcripts/application/commands/lexicon-commands.ts: `recount(studyId, teamId, accountId, termIds?)` counts only those terms and passes `termIds` to the store; `decide` with `edit` recounts `[term.id]`; `merge` recounts `[from.id, into.id]`

## Phase 4: US2 - Others are not held up meanwhile (P2)

**Independent test**: counting one term at the reported volume stays well under a second.

- [X] T005 [US2] Write apps/api/src/modules/transcripts/tests/occurrences-volume.test.ts: seeded made-up volume (57 interviews × 251 turns of 40 words, 438 terms with a two-word variant, accented words and acronyms); one term counted alone equals its rows in a full count (four terms); one term counted in under 1.5 s

## Phase 5: US3 - A full reading recounts faster (P3)

**Independent test**: the full count at the reported volume takes at most half its former time, same rows.

- [X] T006 [US3] In apps/api/src/modules/transcripts/domain/occurrences.ts, fold each spelling's words once per spelling (first-word key and per-word keys, `null` for acronyms compared as written) instead of once per turn; the existing occurrence and lexicon tests stay green

- [X] T008 [US1] Review of PR #43: a decision that changes the counted spellings (variants rejected with an accept) recounts the term (test first in apps/api/src/modules/transcripts/tests/lexicon-commands.test.ts); the merge test checks the target against a full recount; rows are written with `on conflict do update` in apps/api/src/modules/transcripts/infrastructure/transcripts.drizzle-store.ts so two recounts of one term at once do not fail

## Phase 6: Polish

- [X] T007 Run `pnpm check`, the api:unit project and apps/api/tests/lexicon.component.test.ts; no doc change needed (behaviour and language unchanged)

## Dependencies

T001 → T002 → T003 → T004; T005 and T006 after T002, independent of each other.

## Parallel opportunities

T005 ∥ T006 (different files).

## Implementation strategy

MVP = T001–T004 (the reported wait). T005 guards it; T006 speeds the background reading.
