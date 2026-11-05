# Implementation Plan: Fast decisions on lexicon terms in large studies

**Branch**: `031-lexicon-decision-speed` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/031-lexicon-decision-speed/spec.md`

## Summary

An edit or a merge recounts only the terms concerned instead of every term of the team, and the counting folds each spelling once instead of once per turn. Same occurrences, edit from 11–12 s to well under a second at the reported volume; full recounts about three times faster ([research.md](research.md)).

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: none new.

**Storage**: PostgreSQL, no migration: `transcripts_occurrences` rows are deleted and inserted per term (`term_id` is part of its key).

**Testing**: Vitest test-first on the commands with fakes (only the terms concerned change, rows equal a full recount); a unit volume test on made-up data; the existing lexicon integration test.

**Target Platform**: the self-hosted API and worker.

**Project Type**: web service in a modular monolith (Transcripts module).

**Performance Goals**: edit or merge under 1 s at 57 interviews / 14 000 turns / 438 terms; full recount at most half its former time.

**Constraints**: identical occurrences (FR-003); no real data in the repository.

**Scale/Scope**: one module, four files of code.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | Spec 031 in the PR. |
| II. DDD | Counting stays a pure domain function; the store port gains an optional term filter; one module. |
| IV. AI proposes | No AI involved. |
| V. Test-first | Command tests written first and seen failing. |
| VII. Privacy | Made-up data only in tests. |
| IX. Simplicity | No worker, cache or thread (research R1, R3). |

Gate: pass, before and after design. No Complexity Tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/031-lexicon-decision-speed/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

No `contracts/`: no API or UI change.

### Source Code (repository root)

```text
apps/api/src/modules/transcripts/
├── domain/occurrences.ts                       # spelling folded once (R2)
├── application/ports.ts                        # replaceOccurrences(studyId, rows, termIds?)
├── application/commands/lexicon-commands.ts    # recount(…, termIds?); decide edit, merge (R1)
├── infrastructure/transcripts.drizzle-store.ts # delete by study and term ids
└── tests/
    ├── lexicon-commands.test.ts                # only the terms concerned change
    ├── occurrences-volume.test.ts              # NEW volume test (R4)
    └── fakes/in-memory-transcripts.ts
```

**Structure Decision**: existing Transcripts module only.

## Documentation

No doc change: behaviour and language are unchanged (conscious choice; the code comments explain the targeted recount).

## Complexity Tracking

None.
