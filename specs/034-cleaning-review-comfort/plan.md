# Implementation Plan: Cleaning review without duplicates, with steady buttons and context

**Branch**: `034-cleaning-review-comfort` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/034-cleaning-review-comfort/spec.md`

## Summary

`resolveCorrections` marks a correction **duplicate** when a correction of higher priority makes the same change at the same place, whatever its status; a duplicate is overridden (never applied) and the interview view leaves it out. The decision buttons stay disabled until the view is read again. A read of its own (`getTurnContext`) gives a turn with up to two turns before and after, every correction not rejected in place, shown in a "Context" panel opened on demand.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: none new.

**Storage**: PostgreSQL, no migration (corrections are computed at read; R1).

**Testing**: Vitest test-first on `resolveCorrections` (duplicates, rejected duplicate not applied, different change still listed); query test of the view (duplicate left out and not counted, `around` gives the neighbours); e2e: the context of a turn opens and closes.

**Target Platform**: the self-hosted API and web app.

**Project Type**: web service + web app in a modular monolith (Transcripts, Web).

**Performance Goals**: the context reads one interview, as the view does; nothing read before it is opened.

**Constraints**: same texts as today except that a rejected change is no longer applied through a duplicate; no real data in the repository.

**Scale/Scope**: one domain function, one query, one contract, one web file.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | Spec 034 in the PR. |
| II. DDD, modules | Domain rule in `domain/corrections.ts`; query in Transcripts; web through the generated client. |
| III/VII. Privacy | The context shows the turns as the view does (names masked when anonymised); made-up data in tests. |
| V. Test-first | Domain and query tests first. |
| VI. Contracts | `getTurnContext` route and `TURN_NOT_FOUND` in Zod contracts, client regenerated. |
| VIII. UI | Pieces from `packages/ui`; new strings EN/FR via Lingui. |
| IX. Simplicity | One small read route; no stored state. |

Gate: pass, before and after design.

## Project Structure

### Documentation (this feature)

```text
specs/034-cleaning-review-comfort/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/src/modules/transcripts/domain/corrections.ts                 # duplicate in resolveCorrections
apps/api/src/modules/transcripts/application/queries/cleaning-queries.ts # leave duplicates out; around
apps/api/src/modules/transcripts/tests/corrections.test.ts
apps/api/src/modules/transcripts/tests/cleaning-commands.test.ts (or a query test)
packages/contracts/src/cleaning.ts, errors.ts                          # TurnContext, TURN_NOT_FOUND
apps/web/src/features/enrichment/interview-cleaning.tsx                # steady buttons; context panel
apps/web/src/locales/*                                                 # strings
apps/web/e2e/enrichment-cleaning.spec.ts
```

**Structure Decision**: existing modules only.

## Documentation

- Transcripts README: duplicates and `around`. ADR: none. Context map: no change of language.

## Complexity Tracking

None.
