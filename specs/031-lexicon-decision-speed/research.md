# Research: Fast decisions on lexicon terms in large studies

Measured on made-up data of the reported volume (57 interviews × 251 turns of 40 words = 14 307 turns, 438 terms with two spellings each), on a laptop; the deployed instance (1 vCPU) is several times slower.

| Step of an edit, before | Time |
|---|---|
| Counting every term in every interview (synchronous) | 1 710 ms |
| Replacing every occurrence of the study (~3 000 rows with places) | 318 ms |
| Reading the study's transcripts | 16 ms |

## R1. Recount only the terms concerned

**Decision**: `recount(studyId, teamId, accountId, termIds?)`: with `termIds`, only those terms are counted, and the store deletes and inserts only their rows (`replaceOccurrences(studyId, rows, termIds)`). An edit passes its term; a merge passes the merged term (no counted spelling left, so its rows go) and the target.

**Rationale**: `countOccurrences` counts each term on its own (overlaps are resolved within one term's spellings), so one term's rows are identical whether it is counted alone or with all others. Measured: 122 ms for one term (the indexing of every turn's words remains), 2 ms to replace its rows.

**Alternatives considered**: moving the recount to the worker and answering at once: the screen would show stale counts until the job ran, and the full recount would still take seconds of worker time per edit. Keeping the full recount but caching the word index between requests: memory per study, invalidation on every transcript change, for a gain the targeted recount already gives.

## R2. Fold each spelling once

**Decision**: in `countOccurrences`, fold each spelling's words once per spelling instead of once per turn and per comparison.

**Rationale**: `fold` (Unicode normalisation, marks removed, lower case) ran inside the loop over every turn for every spelling: about 12 million times at this volume. Hoisted, the full recount goes from 1 710 ms to 546 ms with the same rows.

## R3. Blocking

**Decision**: no worker or thread for the edit: the remaining synchronous counting for one term is about 0.1 s on a laptop, a few tenths of a second on the deployed instance.

**Rationale**: FR-005 asks for well under one second; a worker thread would add a copy of every transcript for each edit.

## R4. Volume test

**Decision**: a unit test generates the reported volume from a seeded generator (made-up words, accented words, acronyms), checks that one term counted alone equals its rows in a full count, and bounds the time for one term (1.5 s, room for a slow CI runner).
