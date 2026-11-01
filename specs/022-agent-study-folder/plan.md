# Implementation Plan: Attach a study's Drive folder with the assistant

**Branch**: `022-agent-study-folder` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-agent-study-folder/spec.md`

## Summary

A tool `attach_folder`, run during the answer, checks the link with the person's own Drive access and shows a card, or gives the reason of a refusal. Without a Drive connection it shows a connection card leading to Google; at the return the conversation continues by itself, checked on the server. After Apply, the form's command runs; the study opens on Preparation while it is not done, the panel waits for the inventory, one minute at most, and the assistant continues with counts by kind and a list of choices. A general tool `offer_choices` shows the list: selecting sends a person's message through the panel's usual path.

## Technical Context

**Language/Version**: TypeScript strict, Node 26

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Router and Query, Lingui, Vercel AI SDK through the AI Gateway

**Storage**: PostgreSQL; one migration widening the proposal kinds, no new table

**Testing**: Vitest (domain, use cases with fakes, integration), Playwright with the simulated Drive and the test provider

**Target Platform**: self-hosted web application

**Project Type**: modular monolith with a web client

**Performance Goals**: the context of a study page adds one read of the inventory's counts; the check when proposing makes one Drive call

**Constraints**: no file name reaches the model; a person's Drive permission only serves their own requests; nothing written in Drive

**Scale/Scope**: two tools, three cards, one continuation, no new screen

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | Spec 022, in this pull request. Pass |
| II Modules | The assistant reads ingestion through a port wired in `compose.ts`; ingestion's check is a query, its attach a command. Pass |
| III Provider-agnostic | No Drive name in the assistant's domain; the tool takes a link, the port hides the source. Vendor wording stays in ingestion and in UI strings, as today. Pass |
| IV Humans decide | A card, then Apply; the consent stays at Google. Every AI call goes through the Gateway. Pass |
| V Test-first | Refusals and continuation rules written first, with fakes. Pass |
| VI Contracts | Tool input and new routes' values validated with Zod; client regenerated. Pass |
| Privacy | Counts by kind only, for people with access. Pass |

Re-checked after design: no violation.

## Project Structure

### Documentation (this feature)

```text
specs/022-agent-study-folder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code

```text
apps/api/drizzle/0047_folder_cards.sql
apps/api/src/compose.ts
apps/api/src/modules/ingestion/application/commands/source-commands.ts   # shared read, no replacing
apps/api/src/modules/ingestion/application/queries/source-queries.ts     # checkFolder, folderState
apps/api/src/modules/assistant/domain/proposal.ts
apps/api/src/modules/assistant/application/{tools,context,ports}.ts
apps/api/src/modules/assistant/application/commands/{send-message,proposal-commands}.ts
apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts
packages/contracts/src/{assistant,errors}.ts
apps/web/src/features/assistant/{proposal-card,panel,choices}.tsx
apps/web/src/features/ingestion/source-panel.tsx                         # exports the explanation
apps/web/src/routes/_authenticated/studies/$studyId.tsx                  # return from the consent
```

**Structure Decision**: existing modules only.

## Complexity Tracking

None.
