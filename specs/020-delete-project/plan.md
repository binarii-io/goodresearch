# Implementation Plan: Delete a research project

**Branch**: `020-delete-project` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-delete-project/spec.md`; target behaviour in [docs/agent-journeys/03-delete-project.md](../../docs/agent-journeys/03-delete-project.md)

## Summary

A Research command deletes a project after checking its team, who is asking, live runs and the typed name; the existing foreign keys remove what belongs to it and leave the studies. A read gives the volumes for the confirmation. The assistant gets a `delete_project` tool whose card can only be applied through its own route, which takes the name from the person: the generic Apply refuses this kind, and the name is never stored.

## Technical Context

**Language/Version**: TypeScript strict, Node (monorepo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Router and Query, Lingui, `packages/ui`

**Storage**: PostgreSQL. No schema change; one migration allows the new proposal kind. Existing cascades do the deletion, already checked by integration tests of specs 013, 014 and 015

**Testing**: Vitest (domain test-first, use cases with fakes, integration on PostgreSQL), Playwright, manual scenarios with a real model

**Target Platform**: self-hosted web app

**Project Type**: modular monolith + web app

**Performance Goals**: SC-003; the volumes are SQL counts

**Constraints**: the model can never supply the name; no AI call in the deletion or its preview; nothing in Drive touched

**Scale/Scope**: one command, one read, two routes, one tool, one dialog, one card variant

## Constitution Check

| Principle | How this plan meets it | |
|---|---|---|
| I. Spec-driven | Spec 020, this plan, tasks | ✅ |
| II. DDD pragmatic | The Project aggregate holds the rules; Synthesis's data goes through the existing cascades, as its integration tests already state | ✅ |
| III. Provider-agnostic | Nothing vendor-specific | ✅ |
| IV. AI proposes | A card only, with a route the model cannot reach and a value it never holds | ✅ |
| V. Test-first | `canBeDeletedBy` and `confirms` test-first; use cases with fakes | ✅ |
| VI. Contracts | Zod → OpenAPI → client | ✅ |
| VII. Privacy | Nothing outside the person's access; the model gets volumes only | ✅ |
| VIII. Accessible, international | Lingui EN/FR, `packages/ui`, axe | ✅ |
| IX. Simplicity | No bin, no audit log, no new table | ✅ |

## Project Structure

```text
specs/020-delete-project/         spec, plan, research, data-model, contracts/, quickstart, tasks
docs/agent-journeys/03-delete-project.md, README.md
docs/domain/context-map.md

apps/api/drizzle/0045_*.sql       proposal kind
apps/api/src/compose.ts           volumes from Synthesis, assistant action
apps/api/src/modules/research/
├── domain/project.ts, project.repository.ts
├── application/commands/delete-project.ts
├── application/queries/project-queries.ts   canDelete
├── infrastructure/project.drizzle-repository.ts, http.routes.ts
apps/api/src/modules/reporting/   deletion preview
apps/api/src/modules/synthesis/application/queries/overview-reads.ts   published deck
apps/api/src/modules/assistant/   tool, card, confirm route, instruction
apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts

packages/contracts/, packages/api-client/ (generated)
apps/web/src/features/research/delete-project-dialog.tsx
apps/web/src/features/assistant/proposal-card.tsx
apps/web/src/routes/_authenticated/projects/$projectId.tsx
apps/web/src/locales/
apps/web/e2e/delete-project.spec.ts
```

**Structure Decision**: Research owns the deletion; Reporting reads the volumes across modules, as it does for the Overview.

## Complexity Tracking

None.
