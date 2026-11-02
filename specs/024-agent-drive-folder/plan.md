# Implementation Plan: The assistant works in the study's folder

**Branch**: `024-agent-drive-folder` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/024-agent-drive-folder/spec.md`

## Summary

Three tools, run during the answer: `browse_folder` gives the whole folder live, `read_file` returns one extract, `propose_folder_changes` shows a card of lines. Ingestion owns every Drive operation and checks each id against the study's folder. A consent per person, study and provider gates names and content. A dedicated route applies the ticked lines.

## Technical Context

**Language/Version**: TypeScript strict, Node 26

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Router and Query, Lingui, AI Gateway

**Storage**: PostgreSQL; one migration: proposal kinds and a consent table. No listing or extract is stored

**Testing**: Vitest (domain, use cases with fakes), Playwright with the simulated Drive and the test provider

**Target Platform**: self-hosted web application

**Project Type**: modular monolith with a web client

**Performance Goals**: one Drive listing per level of folders; one parent walk per id checked, at most 20 levels

**Constraints**: nothing outside the folder; no delete or trash operation exists; a person's permission serves only their own requests

**Scale/Scope**: three tools, two cards, one route, one Drive operation added (move)

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | Spec 024, in this pull request. Pass |
| II Modules | The assistant reaches ingestion through ports wired in `compose.ts`. Pass |
| III Provider-agnostic | Tools speak of a folder and files; Drive stays in ingestion's adapters. Pass |
| IV Humans decide | Reading changes nothing; every change goes through a card. Pass |
| V Test-first | Batch rules are a pure domain module, written first. Pass |
| VI Contracts | Tool inputs and the route validated with Zod. Pass |
| VII Privacy | Names and content reach the provider only after consent, never for an anonymised study; nothing deleted. This widens what the assistant may send: stated in the context map. Pass |

Re-checked after design: no violation.

## Project Structure

### Documentation (this feature)

```text
specs/024-agent-drive-folder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code

```text
apps/api/drizzle/0050_folder_work.sql
apps/api/src/compose.ts
apps/api/src/modules/ingestion/domain/folder-changes.ts                 # batch rules
apps/api/src/modules/ingestion/domain/drive-documents.ts                # moveFile
apps/api/src/modules/ingestion/infrastructure/{google-documents,in-memory.drive-documents,dev-drive}.ts
apps/api/src/modules/ingestion/application/commands/folder-work.ts      # browse, read, check, apply
apps/api/src/modules/assistant/domain/{proposal,next-step}.ts
apps/api/src/modules/assistant/application/{tools,context,ports,skills}.ts
apps/api/src/modules/assistant/application/commands/{send-message,proposal-commands}.ts
apps/api/src/modules/assistant/infrastructure/http.routes.ts
packages/contracts/src/assistant.ts
apps/web/src/features/assistant/{proposal-card,folder-changes-card}.tsx
```

**Structure Decision**: existing modules only.

## Complexity Tracking

None.
