# Tasks: Fast study pages on large studies

**Input**: Design documents from `specs/032-study-pages-speed/`

**Tests**: test-first (constitution V): each test task comes before its code and must fail first.

**Format**: `[ID] [P?] [Story] Description`. `[P]`: different files, no incomplete dependency.

## Phase 1: Setup

- [X] T001 Write the volume integration test apps/api/tests/study-pages-volume.component.test.ts: made-up anonymised study (57 validated interviews of 251 turns of English-looking made-up words, 438 terms with UUID ids, a quarter `suspect`, occurrences counted), a query meter on the pool's clients (3 ms per query), and the measurement of `/quality`, `/facts-analysis`, `/cleaning`, `/lexicon?status=to-decide&kind=suspect`, `/lexicon?status=all`; record the numbers in specs/032-study-pages-speed/research.md

## Phase 2: Foundational

- [X] T002 Add per-study reads to `CleaningStore` in apps/api/src/modules/transcripts/application/ports.ts and apps/api/src/modules/transcripts/infrastructure/cleaning.drizzle-store.ts, one query each: `suggestionsOfSessions(ids)`, `correctionsOfSessions(ids)`, `decisionsOfSessions(ids)` (maps by session id, same rows and order as the per-session reads), `latestVersionsWithText(studyId)` (latest clean version per session with its segments); same in apps/api/src/modules/transcripts/tests/fakes/in-memory-cleaning.ts
- [X] T003 Extend `loadCorrections` in apps/api/src/modules/transcripts/application/cleaning-corrections.ts: `preloaded` may also carry the interview's `suggestions`, `stored` and `decisions`; without them it reads them as today

## Phase 3: US1 - Open Analysis and Quality without waiting (P1) 🎯 MVP

**Independent test**: Quality and Analysis of the volume study use a number of queries that does not grow with the interviews, and show the same analysed texts.

- [X] T004 [US1] Write failing tests in apps/api/src/modules/transcripts/tests/analysed-texts.test.ts with fakes: `analysedTexts(accountId, studyId, ids, mode)` equals `analysedText` for every interview (with corrections, anonymised with pseudonyms, clean-only, no transcript, not clean); the store and names calls are the same for 3 and for 30 interviews
- [X] T005 [US1] Implement `analysedTexts` in apps/api/src/modules/transcripts/application/analysed-text.ts: study access once, transcripts of the study once, terms, verdicts, `cleaningNames` once (anonymised), T002 reads once, then `loadCorrections` with `preloaded` per interview; `clean-only` from `latestVersionsWithText`
- [X] T006 [US1] Add `analysedTexts` to the `sources` ports of apps/api/src/modules/evidence/application/ports.ts and apps/api/src/modules/interview-quality/application/ports.ts and wire it in apps/api/src/compose.ts; `interviewsNow` in apps/api/src/modules/evidence/application/interviews.ts and apps/api/src/modules/interview-quality/application/interviews.ts call it once; update the sources fakes of both modules' tests
- [X] T007 [US1] Read Quality's speaker attributions per study: `speakersOfStudy(studyId)` in apps/api/src/modules/evidence/application/ports.ts and apps/api/src/modules/evidence/infrastructure/evidence.drizzle-store.ts (one query, map by session), exposed in apps/api/src/modules/evidence/infrastructure/module.ts, used by `interviewsNow` in apps/api/src/modules/interview-quality/application/interviews.ts through a `speakerAttributionsOf(studyId)` source wired in apps/api/src/compose.ts
- [X] T008 [US1] In the volume test: bound the queries of `/quality` and `/facts-analysis` (a constant well under the 57 interviews) and check, for every interview, that the analysed text read per study equals the one read per interview on PostgreSQL

## Phase 4: US2 - Cleaning stays quick when others work too (P2)

**Independent test**: the Cleaning tab's queries do not grow with the interviews.

- [X] T009 [US2] In apps/api/src/modules/transcripts/application/queries/cleaning-queries.ts, read the T002 per-study data once and pass it in `preloaded`; existing cleaning tests stay green; bound `/cleaning`'s queries in the volume test

## Phase 5: US3 - The lexicon list shows what is on the screen (P2)

**Independent test**: the list's size no longer grows with quotes; the term dialog shows the same quotes as before.

- [X] T010 [US3] Write failing tests in apps/api/src/modules/transcripts/tests/enrichment-queries.test.ts: the list carries counts and verdict counts but `quotes: []`; `termQuotes(accountId, studyId, termId)` returns the term's per-interview occurrences with up to 3 quotes each, equal to what the list carried before
- [X] T011 [US3] In apps/api/src/modules/transcripts/application/queries/enrichment-queries.ts: the list no longer reads the study's transcripts and returns `quotes: []`; add `termQuotes` (stored occurrences of one term, transcripts of the interviews it occurs in only)
- [X] T012 [US3] Route `GET /api/studies/:studyId/lexicon/terms/:termId/quotes` in apps/api/src/modules/transcripts/infrastructure/http.routes.ts with its schema in packages/contracts/src/lexicon.ts (`{ occurrences: TermOccurrence[] }`); run `pnpm generate`
- [X] T013 [US3] In apps/web/src/features/enrichment/term-dialogs.tsx, the term dialog loads its quotes with the generated `useListTermQuotes` when it opens (a skeleton from `packages/ui` meanwhile), "every occurrence" unchanged; run i18n extract and translate in apps/web/src/locales/fr
- [X] T014 [US3] Bound the lexicon list's size in the volume test (under 500 KB at this volume: 3 MB before, the counts per interview remain)

- [X] T016 Review of PR #44: the term dialog reads its quotes again at each opening (`staleTime: 0`) and shows an error with Retry; `analysedTexts` reads transcripts and access together and, in `clean-only`, only which interviews have a transcript (`transcriptIdsOf`); `termQuotes` reads only that term's verdicts (`verdictsOfTerm`); READMEs of transcripts, evidence and interview-quality updated

## Phase 6: Polish

- [X] T015 Measure again with the volume test and record before/after in specs/032-study-pages-speed/research.md; run `pnpm check`, api:unit, the four modules' integration tests and the volume test

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T008; T007 after T006; T009 after T003; T010 → T011 → T012 → T013 → T014; T015 last.

## Parallel opportunities

T007 ∥ T009 ∥ T010–T012 once T006 is done (different files).

## Implementation strategy

MVP = T001–T008 (the slowest pages). Then Cleaning (T009) and the lexicon list (T010–T014), all in the same PR with spec 031.
