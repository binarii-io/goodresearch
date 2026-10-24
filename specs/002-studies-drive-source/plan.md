# Implementation Plan: Studies in projects, with Google Drive as the source of interview studies

**Branch**: `002-studies-drive-source` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-studies-drive-source/spec.md`

## Summary

Adds **studies** to projects (research module) and the first **source connector**, Google Drive (new ingestion module): a per-person read-only Drive connection separate from sign-in, folders attached by pasted link, a background inventory of the folder tree (kinds and groups), and per-person folder access as a second access barrier. Drive is reached through a `DriveGateway` port with a `fetch` adapter; the inventory is the first pg-boss job. Decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: unchanged; no new runtime dependency (Drive and OAuth via `fetch`, encryption via `node:crypto`, jobs via pg-boss already installed)

**Storage**: PostgreSQL: `research_studies`, `ingestion_source_connections`, `ingestion_study_sources`, `ingestion_inventory_files`, `ingestion_folder_access`

**Testing**: Vitest (domain, use cases with an in-memory Drive, adapter with a fake `fetch`, API component tests with Testcontainers), Playwright for study screens

**Target Platform**: unchanged (one image; the inventory runs in `worker`)

**Project Type**: web application (unchanged)

**Performance Goals**: inventory of 500 files < 1 min, 10,000 files without error, progress at least every 5 s

**Constraints**: Drive read-only; only the attached folder tree; metadata only in this feature; one person's Drive permission never used for another person; tokens encrypted at rest

**Scale/Scope**: typically 20–200 files per study, up to 10,000; ~5 new screens/states

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec, plan, tasks in `specs/002-…` | ✅ |
| II. DDD pragmatic | Study aggregate (research); SourceConnection and StudySource aggregates (ingestion); pure functions for link parsing, classification, access decision; modules talk through ports wired in `compose.ts` | ✅ |
| III. Provider-agnostic | Drive behind `DriveGateway` and a `SourceConnection` model keyed by connector; connector optional by configuration | ✅ |
| IV. AI proposes | No AI | N/A |
| V. Test-first | Domain functions and aggregates test-first; Drive faked at the port; adapter tested against a fake `fetch` | ✅ |
| VI. Contracts | Zod for HTTP, job payloads and Drive responses; OpenAPI and client regenerated | ✅ |
| VII. Privacy | Read-only scope, folder-tree and metadata limits enforced in code, encrypted tokens, file names hidden without folder access, nothing logged from Drive responses | ✅ |
| VIII. a11y & i18n | New screens in EN/FR, axe in e2e | ✅ |
| IX. Simplicity | No `googleapis`, no Picker, no new service; one job type | ✅ |

**Post-design re-check**: passed. One aggregate per transaction (study vs. study source are separate; deletion relies on a database cascade, integrity only). Restricted Google scope is a deployer constraint recorded in ADR-0005, not a constitution issue.

## Project Structure

### Documentation (this feature)

```text
specs/002-studies-drive-source/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/http-api.md · contracts/configuration.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
apps/api/src/modules/
├── research/                       # + Study aggregate, study commands/queries/routes
└── ingestion/                      # new module
    ├── index.ts
    ├── domain/                     # drive-link.ts, classify.ts, inventory-walk.ts, folder-access.ts,
    │                               # source-connection.ts, study-source.ts, *.repository.ts, drive-gateway.ts (port)
    ├── application/
    │   ├── commands/               # connect-drive, disconnect-drive, attach-folder, detach-folder,
    │   │                           # refresh-inventory, run-inventory (job)
    │   └── queries/                # get-study-source, list-inventory-files, list-my-sources, study-access
    ├── infrastructure/             # schema.ts, drizzle repositories, drive.fetch-gateway.ts, google-oauth.ts,
    │                               # token-cipher.ts, http.routes.ts, jobs.ts
    └── tests/                      # incl. fakes/in-memory-drive.ts
apps/api/src/worker.ts              # registers ingestion jobs
apps/web/src/
├── routes/_authenticated/studies/$studyId.tsx
├── routes/_authenticated/sources.tsx              # "Connected sources"
└── features/research/{create-study-dialog,study-list}.tsx, features/ingestion/{attach-folder,inventory}.tsx
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: ingestion module skeleton, schema + migration (cross-module FKs in SQL), token cipher, configuration (`GOOGLE_DRIVE_*`), error codes, job registration in `worker` and `boss.send` from the server, compose wiring of ports between research and ingestion.
2. **US1 studies**: Study aggregate (test-first), commands/queries/routes, project overview list, study page with phases, e2e.
3. **US2 Drive connection and folder**: link parsing (test-first), OAuth connect/callback/disconnect, `DriveGateway` + fetch adapter + in-memory fake, attach/detach, folder access decision and checks, "Connected sources" screen, no-access state.
4. **US3 inventory**: classification and walk (test-first), job with progress and backoff, refresh, files list with filters, outdated state.
5. **Polish**: README (Drive setup for deployers, Internal vs External), context map, i18n FR, axe, quickstart.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected because |
|---|---|---|
| Restricted Google scope (`drive.readonly`) | Folder contents cannot be listed otherwise (research R1) | `drive.file` + Picker gives no access to folder contents |
| Two modules call each other through ports | Study access (research) and folder access (ingestion) both decide what a person can do | Merging them would mix the Research and Ingestion contexts of the context map |
