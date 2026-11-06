# Implementation Plan: Lexicon decisions reflect what is kept

**Branch**: `033-lexicon-kept-spellings` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/033-lexicon-kept-spellings/spec.md`

## Summary

The term's occurrences say which spelling each place and each count comes from, so the Change dialog filters its excerpts and counts by the spellings switched on, without a new read. A decision refused with `VERSION_CONFLICT` (list, Change dialog, Merge dialog) reads the lexicon list again and keeps today's message ("Someone changed this in the meantime…").

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: none new; `fold` from `@goodresearch/shared` on both sides.

**Storage**: PostgreSQL, no migration: occurrence rows are already stored per spelling.

**Testing**: Vitest test-first on `perInterview` output (spellings per place and counts per spelling) through `termQuotes` and `occurrences`; the dialog filter is a pure function in `@goodresearch/shared`, tested in the `shared` project; the refresh after a 409 is checked by hand (the web app has no unit test project).

**Target Platform**: the self-hosted API and web app.

**Project Type**: web service + web app in a modular monolith (Transcripts, Web).

**Performance Goals**: no new read; filtering is local to the dialog.

**Constraints**: same content as today when every spelling is on; no real data in the repository.

**Scale/Scope**: one query module, one contract, one shared function, two web files.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | Spec 033 in the PR. |
| II. DDD, modules | Transcripts only (query side); Web uses the generated client. |
| III/VII. Privacy | No new data shown; made-up data in tests. |
| V. Test-first | Query output and the dialog filter tested first. |
| VI. Contracts | `TermQuote.spellings` and `TermOccurrence.spellings` added in Zod contracts, client regenerated. |
| VIII. UI | No new string: the existing conflict message is kept. |
| IX. Simplicity | Local filter, no new route. |

Gate: pass, before and after design.

## Project Structure

### Documentation (this feature)

```text
specs/033-lexicon-kept-spellings/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/src/lexicon.ts                                   # spellings on quotes and occurrences
apps/api/src/modules/transcripts/application/queries/enrichment-queries.ts  # perInterview fills them
apps/api/src/modules/transcripts/tests/enrichment-queries.test.ts
packages/shared/src/kept-occurrences.ts (+ test)                    # pure filter by kept spellings
apps/web/src/features/enrichment/term-dialogs.tsx                   # dialog uses it; refresh on conflict
apps/web/src/features/enrichment/lexicon-table.tsx                  # refresh on conflict
```

**Structure Decision**: existing modules only.

## Documentation

- Transcripts README: the occurrences carry their spellings. Context map: no change of language. ADR: none.

## Complexity Tracking

None.
