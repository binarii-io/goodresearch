# Implementation Plan: Fast study pages on large studies

**Branch**: `032-study-pages-speed` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/032-study-pages-speed/spec.md`

## Summary

Read the analysed texts of a study's interviews in one pass (access, transcripts, terms, verdicts, pseudonyms and per-interview corrections read once per study) and use it in Analysis, Quality and Cleaning; read Quality's speaker attributions per study; the lexicon list returns counts without quotes, the term dialog loads its quotes on opening. Measured before: 1 138 / 1 050 / 207 queries for Quality / Analysis / Cleaning, 2.6–3 MB for the lexicon list ([research.md](research.md)).

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: none new.

**Storage**: PostgreSQL, no migration: per-study reads use existing columns (`study_id`, or `session_id in (…)` with the existing session indexes).

**Testing**: Vitest test-first on `analysedTexts` with fakes (same result as `analysedText` per interview, store calls not growing with interviews); the volume integration test bounds the queries of each page and compares batch and per-interview texts on PostgreSQL; web: the term dialog loads quotes; existing tests of the four modules stay green.

**Target Platform**: the self-hosted API and web app.

**Project Type**: web service + web app in a modular monolith (Transcripts, Evidence, Interview Quality, Web).

**Performance Goals**: each page within 3 s at 57 interviews / 14 000 turns / 438 terms on the deployed instance; queries per page constant in the number of interviews.

**Constraints**: same page content (FR-001); no real data in the repository.

**Scale/Scope**: four modules, one new route, one web change.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | Spec 032 in the PR. |
| II. DDD, modules | Evidence and Quality ask Transcripts through their `sources` port (a new batch method), never read its tables; Transcripts' store gets per-study reads; one module per change. |
| III/VII. Privacy | Same data, same masking; made-up data only in tests. |
| V. Test-first | `analysedTexts` equivalence and call counts written first. |
| VI. Contracts | New route in Zod contracts, client regenerated; the list keeps its shape (quotes empty). |
| VIII. UI | The dialog shows a loading state from `packages/ui`; no new strings beyond a loading label (EN/FR). |
| IX. Simplicity | No stored analysed texts or cache (research R1). |

Gate: pass, before and after design. No Complexity Tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/032-study-pages-speed/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/src/modules/transcripts/
├── application/analysed-text.ts            # analysedTexts (per study)
├── application/cleaning-corrections.ts     # loadCorrections: per-interview preloaded data
├── application/ports.ts                    # CleaningStore: suggestionsOfSessions, correctionsOfSessions, decisionsOfSessions, latestVersionsWithText
├── application/queries/cleaning-queries.ts # per-study preloaded data
├── application/queries/enrichment-queries.ts # list without quotes; termQuotes
├── infrastructure/cleaning.drizzle-store.ts, http.routes.ts
└── tests/
apps/api/src/modules/evidence/application/{ports.ts,interviews.ts}
apps/api/src/modules/interview-quality/application/{ports.ts,interviews.ts}
apps/api/src/modules/evidence/infrastructure/ (speakersOfStudy)
apps/api/src/compose.ts                     # wiring of analysedTexts, speakersOfStudy
packages/contracts/src/lexicon.ts           # term quotes response
apps/web/src/features/enrichment/term-dialogs.tsx  # loads quotes on opening
apps/api/tests/study-pages-volume.component.test.ts
```

**Structure Decision**: existing modules only.

## Documentation

- Context map: no change of language. ADR: none (no structuring decision; research R1 records why nothing is stored).

## Complexity Tracking

None.
