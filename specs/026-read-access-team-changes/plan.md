# Implementation Plan: Read access for everyone, changes for the team

**Branch**: `026-read-access-team-changes` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/026-read-access-team-changes/spec.md`

## Summary

Closed by default: every existing gate keeps meaning "the owning team or an admin", so changes, AI runs and reserved content stay as they are. A short, explicit list of read routes moves to new read gates, which return what the person may read and a `canChange` flag. A central guard answers every change from outside the team with a refusal naming the team. Facts, insights and recommendations go through one pure redaction rule. The web client hides controls from `canChange`; the assistant reads through the same gates and loses its action tools outside the team.

## Technical Context

**Language/Version**: TypeScript strict, Node 26

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Query/Router, Lingui, `packages/ui`

**Storage**: PostgreSQL; no migration, rights are computed

**Testing**: Vitest (redaction and rights first, use cases with fakes, routes on real PostgreSQL), Playwright + axe

**Target Platform**: self-hosted web application

**Project Type**: modular monolith with a web client

**Performance Goals**: lists stay paged and counted in SQL; the lists never call the file source (R5)

**Constraints**: no reserved content by any way in; the folder barrier is never bypassed; no change for team members and admins

**Scale/Scope**: about 90 change routes guarded, about 20 read routes opened, one new read path per module among research, ingestion, evidence, synthesis, reporting; three new web pieces

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | Spec 026, in this pull request. Pass |
| II Modules | Read gates exposed by research's `index.ts`, wired in `compose.ts`; the guard lives in the platform and receives its lookup from `compose.ts`. Pass |
| III Provider-agnostic | Rules speak of folders and sources. Pass |
| IV Humans decide | Validation unchanged; readers decide nothing. Pass |
| V Test-first | Rights and redaction written first; a route inventory test fails on any unclassified route. Pass |
| VI Contracts | New fields and the `READ_ONLY` error in Zod contracts; client regenerated. Pass |
| VII Privacy | Reserved by default; redaction on the server, never in the client; nothing reserved reaches a provider. Pass |
| VIII Accessible, international | Badge and messages through Lingui and `packages/ui`, axe on the read-only pages. Pass |
| IX Simplicity | No role, table or policy engine: one computed relation. Pass |

Re-checked after design: no violation.

## Project Structure

### Documentation (this feature)

```text
specs/026-read-access-team-changes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/access.md
└── tasks.md
```

### Source Code

```text
apps/api/src/
├── compose.ts                                  # wires read gates and the guard's lookup
├── platform/http/change-guard.ts               # new: refuses changes from outside the team
├── modules/research/
│   ├── domain/                                 # relation rule, tested first
│   └── application/queries/                    # read variants, canChange, teams filter
├── modules/ingestion/application/access.ts     # folder check shared by both gates
├── modules/evidence/                           # reader view of facts, redaction rule
├── modules/synthesis/application/              # reader path for insights, recommendations, debrief
├── modules/reporting/application/queries/      # overview through the read gate
├── modules/assistant/application/              # context from read gates, tools by canChange
apps/api/tests/                                 # route inventory, outsider journey
apps/web/src/
├── features/workspace/read-only.tsx            # badge and useCanChange
├── features/research/                          # team filter, folder mark
├── routes/_authenticated/studies/$studyId.tsx  # reserved tabs
└── routes/_authenticated/projects/$projectId.tsx
packages/contracts/src/                         # canChange, READ_ONLY, reader shapes
docs/adr/0009-read-for-all-change-for-the-team.md
docs/domain/context-map.md
```

**Structure Decision**: No new module. Rights are a small pure rule in research, which owns the team of projects and studies; other modules receive them through ports, as today.

## Delivery

One pull request: reading must not open before the guard and redaction exist, and the screens need both. Commit order: guard and rights, reads and redaction, assistant, web, docs.

## Complexity Tracking

No violation to justify. The central guard duplicates the use cases' gates on purpose: it gives one refusal for every route, and the use-case gates stay as the second barrier.
