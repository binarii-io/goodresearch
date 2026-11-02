# Implementation Plan: Interviews with the assistant

**Branch**: `025-agent-interviews` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/025-agent-interviews/spec.md`

## Summary

A pure module in ingestion turns a study's interviews into states, counts and filtered pages. Tools read them through ports; cards reuse the Fieldwork commands. Delivered in two pull requests: reading and analysis (US1, US2), then accepting, validating and excluding (US3, US4).

## Technical Context

**Language/Version**: TypeScript strict, Node 26

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Query, Lingui, AI Gateway

**Storage**: PostgreSQL; one migration per pull request widening the proposal kinds

**Testing**: Vitest (domain, use cases with fakes), Playwright with the simulated Drive and the test provider

**Target Platform**: self-hosted web application

**Project Type**: modular monolith with a web client

**Performance Goals**: a study holds at most 500 interviews; counts reuse the Fieldwork read

**Constraints**: no name without consent; never on an anonymised study; a person's decision never overwritten

**Scale/Scope**: six tools, three cards, no new screen

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | Spec 025, in these pull requests. Pass |
| II Modules | The assistant reads ingestion through ports wired in `compose.ts`. Pass |
| III Provider-agnostic | Tools speak of interviews. Pass |
| IV Humans decide; computed by the app | No tool accepts, validates or excludes; states and counts are computed. Pass |
| V Test-first | The filter module and refusals written first. Pass |
| VI Contracts | Tool inputs validated with Zod. Pass |
| VII Privacy | Counts hold no name; lists need the consent of spec 024. Pass |

Re-checked after design: no violation.

## Project Structure

### Documentation (this feature)

```text
specs/025-agent-interviews/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code

```text
apps/api/drizzle/0053_interview_tools.sql
apps/api/src/compose.ts
apps/api/src/modules/ingestion/domain/interview-filters.ts
apps/api/src/modules/ingestion/application/queries/session-queries.ts
apps/api/src/modules/assistant/domain/{proposal,next-step}.ts
apps/api/src/modules/assistant/application/{tools,context,ports}.ts
apps/api/src/modules/assistant/application/commands/{send-message,proposal-commands}.ts
apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts
packages/contracts/src/assistant.ts
apps/web/src/features/assistant/{proposal-card,panel}.tsx
```

**Structure Decision**: existing modules only.

## Complexity Tracking

None.
