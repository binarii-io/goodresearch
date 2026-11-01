# Implementation Plan: Create a research project with the assistant

**Branch**: `018-agent-create-project` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-agent-create-project/spec.md`; target behaviour in [docs/agent-journeys/01-create-project.md](../../docs/agent-journeys/01-create-project.md)

## Summary

The assistant gets a project framing skill available on every page, and reports five points with a new progress tool shown in the panel. `create_project` becomes a tool run during the answer: the app checks the framing and the values, and either records the card or returns the reason to the model. The goal is composed by the app and stored as today, so Apply and older cards do not change. After Apply, the panel opens the project and calls a new "continue" endpoint, which streams one answer without a person's message.

## Technical Context

**Language/Version**: TypeScript strict, Node (monorepo versions)

**Primary Dependencies**: Fastify, Zod, Vercel AI SDK through the AI Gateway, React, TanStack Router and Query, Lingui, `packages/ui` (`SegmentedProgress` exists)

**Storage**: PostgreSQL; `assistant_proposals` gains one allowed kind (migration). No new table

**Testing**: Vitest (domain test-first, use cases with fakes), Playwright with the test provider, manual scenarios with a real model

**Target Platform**: self-hosted web app

**Project Type**: modular monolith + web app

**Performance Goals**: SC-005, project page open under one second from Apply

**Constraints**: every AI call through the Gateway and in the ledger; AI proposes, person applies; form and interview guide design unchanged (FR-013)

**Scale/Scope**: one domain rule, one skill, two tools changed or added, one endpoint, one migration, panel changes

## Constitution Check

| Principle | How this plan meets it | |
|---|---|---|
| I. Spec-driven | Spec 018, this plan, tasks | ✅ |
| II. DDD pragmatic | Framing rule and goal composition in the pure domain of Assistant; project still created through the Research command | ✅ |
| III. Provider-agnostic | Nothing vendor-specific; the tool result works with every provider | ✅ |
| IV. AI proposes | Card still applied only by the person; the percentage and the framing check are computed by the app | ✅ |
| V. Test-first | `project-framing.ts` and `composeGoal` test-first; use cases with fakes; e2e with the test provider | ✅ |
| VI. Contracts | Zod → OpenAPI → client for the new kind, points and endpoint; tool inputs validated | ✅ |
| VII. Privacy | Refusal reasons name points and fields only; context unchanged | ✅ |
| VIII. Accessible, international | Lingui EN/FR, `SegmentedProgress` already accessible, axe in e2e | ✅ |
| IX. Simplicity | Reuses proposals, skills, progress bar; no new table or service | ✅ |

Re-checked after design: no violation, no complexity to track.

## Project Structure

```text
specs/018-agent-create-project/   spec, plan, research, data-model, contracts/, quickstart, tasks
docs/agent-journeys/01-create-project.md   Today and Target updated when delivered
docs/domain/context-map.md        project framing, continuing answer

apps/api/drizzle/0042_*.sql       allowed kinds + report_project_progress
apps/api/src/modules/assistant/
├── domain/project-framing.ts     checklist, completeness, currentFraming, composeGoal (pure)
├── domain/proposal.ts            new kind; create_project run during the answer
├── application/skills.ts         skill project-framing
├── application/context.ts        skills by page, journey instruction
├── application/tools.ts          create_project input and check, report_project_progress
├── application/commands/send-message.ts   tools on every page, reasons, continue
├── infrastructure/http.routes.ts POST .../continue
└── tests/
apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts   journey script

packages/contracts/src/assistant.ts   kind, framing points, ContinueAssistantConversation
packages/api-client/                  generated
apps/web/src/features/assistant/
├── panel.tsx, proposal-card.tsx, stream.ts, state.tsx
apps/web/src/locales/                 EN and FR
apps/web/e2e/assistant-create-project.spec.ts
```

**Structure Decision**: everything stays in the Assistant module, reaching Research through the existing `ResearchReads` and actions ports.

## Complexity Tracking

None.
