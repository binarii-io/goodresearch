# Implementation Plan: Project home

**Branch**: `017-project-home` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

## Summary

Three read-only queries serve the Overview tab: `GET /api/projects/{projectId}/overview` (the five journey steps, the next step, the key takeaways and the studies' counts) and `/overview/costs` (project and study costs) in the new Reporting module, and `/takeaways/freshness` ("may be out of date", asked only once takeaways exist) in Synthesis. Reporting reads the other modules through `compose.ts`, as `docs/standards.md` asks of cross-module views. Each other module exposes the small read of its own part of a study. The next-step rule is a pure domain function written test-first. No table, migration or AI call.

## Technical Context

**Language/Version**: unchanged (TypeScript strict, Node, React)

**Primary Dependencies**: unchanged; no new dependency

**Storage**: PostgreSQL, read only; no migration

**Testing**: Vitest (`api:unit` with fakes, `api:int`), Storybook/axe for `packages/ui`, Playwright + axe

**Target Platform / Project Type**: unchanged (web app + API + worker)

**Performance Goals**: SC-004, under one second with 40 interviews and 1,500 facts

**Constraints**: no AI call, no Drive connection, no write (FR-010)

**Scale/Scope**: three endpoints, one domain rule, three UI components, one Overview section

## Constitution Check

| Principle | How this plan meets it | |
|---|---|---|
| I. Spec-driven | Spec 017, this plan, tasks | ✅ |
| II. DDD pragmatic | Query only, reading into a DTO; no aggregate touched; other modules through ports wired in `compose.ts` | ✅ |
| III. Provider-agnostic | Nothing vendor-specific; the page opens no source | ✅ |
| IV. AI proposes | Only counts what people decided; figures computed by the app | ✅ |
| V. Test-first | `nextStep` written test-first; use-case test with fakes; contract and e2e tests | ✅ |
| VI. Contracts | Zod schema → OpenAPI → generated client | ✅ |
| VII. Privacy | Participant count only; no name leaves Ingestion | ✅ |
| VIII. Accessible, international | Lingui EN/FR; UI from `packages/ui`; axe | ✅ |
| IX. Simplicity | No read table, no cache, no event; a study's reads run in parallel | ✅ |

## Project Structure

```text
specs/017-project-home/          spec, plan, research, data-model, contracts/, quickstart, tasks

apps/api/src/
├── compose.ts                   wires the sources of Reporting
└── modules/
    ├── reporting/
    │   ├── domain/journey.ts            stepsOf, nextStep (pure)
    │   ├── application/queries/overview-queries.ts
    │   ├── application/ports.ts         ReportingSources
    │   ├── infrastructure/overview.routes.ts
    │   └── index.ts
    ├── synthesis/    reads: insight and recommendation counts, takeaways, costs; takeaways freshness
    ├── ingestion/    reads: interview counts, participants, analysis cost
    ├── transcripts/  reads: lexicon and cleaning costs
    ├── evidence/     reads: fact counts and cost
    └── interview-quality/  reads: review cost

packages/ui/src/components/journey.tsx   JourneySteps, JourneyStep + story
packages/ui/src/components/breakdown.tsx, outcome-band.tsx   + stories
packages/api-client/                     generated
apps/web/src/
├── features/research/project-journey.tsx, cost-breakdown.tsx
├── features/research/study-list.tsx     chips and cost
├── features/synthesis/takeaways-band.tsx
├── routes/_authenticated/projects/$projectId.tsx
└── locales/                     EN and FR
apps/web/e2e/us-project-home.spec.ts

docs/domain/context-map.md       Project overview, next step
```

**Structure Decision**: Reporting owns the read (ADR-0003 update); the debrief deck stays in Synthesis, as its publication writes.

## Complexity Tracking

None.
