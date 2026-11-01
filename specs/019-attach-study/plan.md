# Implementation Plan: Link a study to several projects

**Branch**: `019-attach-study` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/019-attach-study/spec.md`; target behaviour in [docs/agent-journeys/02-attach-study.md](../../docs/agent-journeys/02-attach-study.md)

## Summary

A study moves from "one `project_id`" to "owned by a team, with its own goal, linked to zero or more projects" through a link table. Access to a study follows its team. `listStudies` and `getStudy` absorb the change, so Reporting, Synthesis and the costs read linked studies without changing. New: attach and detach commands, a team Studies page, sharing shown on screen, three assistant tools, and "outside the project" on insight citations.

## Technical Context

**Language/Version**: TypeScript strict, Node (monorepo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Router and Query, Lingui, `packages/ui`

**Storage**: PostgreSQL. `research_studies` gains `team_id` and `goal`, loses `project_id`; new `research_study_projects`. Migration with backfill

**Testing**: Vitest (domain test-first, use cases with fakes, integration on PostgreSQL for the migration and cascades), Playwright, manual scenarios with a real model

**Target Platform**: self-hosted web app

**Project Type**: modular monolith + web app

**Performance Goals**: SC-001, SC-007; the team page reads only what it shows, in one query plus counts

**Constraints**: no AI call on attach or detach (FR-004); existing screens unchanged for a study in one project (SC-004); modules keep reaching Research through its ports

**Scale/Scope**: one migration, three commands, two queries, one page, three assistant tools, sharing labels

## Constitution Check

| Principle | How this plan meets it | |
|---|---|---|
| I. Spec-driven | Spec 019, this plan, tasks | ✅ |
| II. DDD pragmatic | Links belong to the Study aggregate; other modules go through ports; see Complexity Tracking for moving a project | ⚠️ justified |
| III. Provider-agnostic | Nothing vendor-specific; Drive untouched | ✅ |
| IV. AI proposes | Three tools are cards applied by the person; no human decision is touched by a link | ✅ |
| V. Test-first | Study link rules test-first; use cases with fakes; migration tested on PostgreSQL | ✅ |
| VI. Contracts | Zod → OpenAPI → client | ✅ |
| VII. Privacy | Team barrier, folder barrier unchanged; assistant gets names and projects only | ✅ |
| VIII. Accessible, international | Lingui EN/FR, `packages/ui`, axe | ✅ |
| IX. Simplicity | Derived values rather than a "main project"; no copy of facts | ✅ |

## Project Structure

```text
specs/019-attach-study/           spec, plan, research, data-model, contracts/, quickstart, tasks
docs/agent-journeys/02-attach-study.md, README.md
docs/domain/context-map.md        Study, study link, study goal, team Studies page
docs/adr/                         new ADR: studies owned by teams, linked to projects

apps/api/drizzle/0043_study_links.sql   team and goal backfill, links, drop project_id, proposal kinds
apps/api/src/compose.ts           study goal for AI steps, run gate, interview counts
apps/api/src/modules/research/
├── domain/study.ts               teamId, goal, attach, detach
├── application/commands/study-commands.ts, move-project-to-team.ts
├── application/queries/study-queries.ts, preparation-queries.ts
├── infrastructure/schema.ts, http.routes.ts, study repository
apps/api/src/modules/workspace/   delete-team: also refused with studies
apps/api/src/modules/synthesis/   insight citations "outside the project"
apps/api/src/modules/assistant/   tools, context, proposals, skill
apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts

packages/contracts/, packages/api-client/ (generated)
apps/web/src/routes/_authenticated/team-studies/$teamId.tsx, studies/$studyId.tsx
apps/web/src/features/research/   study-list, attach dialog, detach dialog, study goal
apps/web/src/features/assistant/, features/synthesis/insight-panel.tsx, locales/
apps/web/e2e/attach-study.spec.ts
```

**Structure Decision**: Research owns links, team and goal.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Moving a project changes the Project and its Study rows in one transaction | A study's team must stay equal to its projects', and access now reads the study's team | Moving studies later would leave them reachable by the old team and hidden from the new one |
