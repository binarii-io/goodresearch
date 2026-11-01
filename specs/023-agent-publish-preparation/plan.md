# Implementation Plan: Publish the preparation with the assistant

**Branch**: `023-agent-publish-preparation` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-agent-publish-preparation/spec.md`

## Summary

A pure function computes a study's next step, given to the model in the page context. A tool `publish_preparation`, run during the answer, shows a card, the connection card of spec 022 asking for editing, or a reason. Applying a guide card or a publication card continues the conversation.

## Technical Context

**Language/Version**: TypeScript strict, Node 26

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Router and Query, Lingui, AI Gateway

**Storage**: PostgreSQL; one migration widening the proposal kinds

**Testing**: Vitest (domain, use cases with fakes), Playwright with the simulated Drive and the test provider

**Target Platform**: self-hosted web application

**Project Type**: modular monolith with a web client

**Performance Goals**: the context of a study page adds one read of the publications

**Constraints**: nothing written without Apply; a person's permission only serves their own requests

**Scale/Scope**: one tool, one card, one pure function, no new screen

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | Spec 023, in this pull request. Pass |
| II Modules | The assistant reads publishing through a port wired in `compose.ts`. Pass |
| III Provider-agnostic | The tool speaks of a study's documents and folder; the source's name stays in UI strings, as today. Pass |
| IV Humans decide; computed by the app | A card, then Apply; the next step is computed, not left to the model. Pass |
| V Test-first | `nextStep` and the refusals written first. Pass |
| VI Contracts | Tool input validated with Zod; client regenerated. Pass |

Re-checked after design: no violation.

## Project Structure

### Documentation (this feature)

```text
specs/023-agent-publish-preparation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code

```text
apps/api/drizzle/0049_publication_card.sql
apps/api/src/compose.ts
apps/api/src/modules/publishing/application/commands/publication-commands.ts   # checkPublication
apps/api/src/modules/assistant/domain/{next-step,proposal}.ts
apps/api/src/modules/assistant/application/{tools,context,ports}.ts
apps/api/src/modules/assistant/application/commands/{send-message,proposal-commands}.ts
apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts
packages/contracts/src/assistant.ts
apps/web/src/features/assistant/proposal-card.tsx
apps/web/src/features/ingestion/source-panel.tsx                               # write access in the link
```

**Structure Decision**: existing modules only.

## Complexity Tracking

None.
