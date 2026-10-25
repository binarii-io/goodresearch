# Implementation Plan: Publish the study preparation to Drive and bring Drive edits back

**Branch**: `007-drive-publishing` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-drive-publishing/spec.md`

## Summary

A new **publishing** module (context map "PublishedDocument") renders the guide, the best practices and the schedule into **neutral document models** (blocks with anchors; a table with row ids), asks the ingestion module (which owns each person's Drive connection) to create, read and rewrite the files with the acting person's own access, and keeps, per published file, the **base**: the content as read back right after the last write. A pure **three-way diff** (base, app, Drive) gives each item's state; Drive-side differences are stored as **changes** that people accept or reject (once, shared by the team); accepted changes go through the research commands (guide origin `drive`, schedule rows). "Update in Drive" rewrites the same file only when no unreviewed Drive change is left, with a revision precondition. The Drive consent is upgraded on demand from `drive.readonly` to `drive` (edit any file the person can edit; same Google "restricted" class). Decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new (Google Drive, Docs and Sheets REST APIs through `fetch`, like the existing Drive adapter)

**Storage**: PostgreSQL: `publishing_documents`, `publishing_changes`; `ingestion_source_connections.access` (`read | write`); research guide origin gets `drive`

**Testing**: Vitest — pure domain tests first for rendering, read-back parsing and the three-way diff (guide items, schedule rows, order, conflicts); use cases with an in-memory fake Drive document store that simulates people's edits; adapter tests on recorded Google responses; API component tests (gate, write consent, decisions once, update refused with unreviewed changes or stale revision); Playwright with the fake Drive of the dev stack (publish, simulated Drive edit, review, update) + axe

**Target Platform / Project Type**: unchanged

**Performance Goals**: publish 60 questions + 300 rows in < 30 s (a handful of batched API calls); a check is one metadata call per file when nothing changed (Drive `version` unchanged), a read and parse otherwise

**Constraints**: never delete or trash; write only the published files; acting person's access only; schedule never sent to an AI provider; idempotent decisions; no live Drive notifications (self-hosting)

**Scale/Scope**: 1 module, 3 file kinds, ~8 endpoints, 1 review screen, 1 consent upgrade

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 007 with clarifications, plan, tasks | ✅ |
| II. DDD pragmatic | `PublishedDocument` aggregate (base, state, changes with decisions) in its own module; Drive calls stay in ingestion (owner of the connection) behind a port; research data changed only through research commands | ✅ |
| III. Provider-agnostic | The publishing domain knows neutral document and table models; Google Docs/Sheets requests only in the ingestion adapter; another connector can implement the same port | ✅ |
| IV. AI proposes, humans decide | Drive edits are proposals (changes) decided by people; nothing applied or overwritten without a decision; US5 assistant merges are proposal cards | ✅ |
| V. Test-first | Render, parse, three-way diff and decision rules written test-first with fakes | ✅ |
| VI. Contracts | Zod for HTTP bodies and for everything read from Drive (parsed content validated with spec 006 rules) | ✅ |
| VII. Privacy & least privilege | Write scope asked only when publishing; "read-only unless writing is the feature": writing is the feature; never delete; schedule only written to the study folder, never to the AI | ✅ (see Complexity Tracking) |
| VIII. a11y & i18n | Review list with headings and per-item controls, states as text, EN/FR | ✅ |
| IX. Simplicity | On-demand checks instead of push notifications; whole-file rewrite on update instead of minimal patches | ✅ |

## Project Structure

```text
specs/007-drive-publishing/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
apps/api/src/modules/publishing/                 # new module (context "Publishing")
├── domain/        document-model.ts (blocks, anchors, table), render-guide.ts, render-schedule.ts,
│                  render-practices.ts, read-guide.ts, read-schedule.ts, three-way.ts, published-document.ts
├── application/   ports.ts (PublishedFiles, PreparationReads, PreparationActions), commands (publish,
│                  check, decide, update, forget), queries (publications, changes)
├── infrastructure/ schema.ts, drizzle store, http.routes.ts, module.ts
└── tests/         fakes (in-memory Drive files with simulated edits)
apps/api/src/modules/ingestion/
├── domain/        drive-documents.ts (port: create, read, rewrite, metadata; neutral models)
├── infrastructure/ google-documents.ts (Docs, Sheets, Drive REST; named ranges, hidden id column),
│                   google-oauth.ts (write scope), fake documents for the dev stack
└── index.ts       publishedFiles(accountId) for the publishing module; write consent
apps/api/src/modules/research/                   # origin `drive`; applyDriveChanges helpers via existing commands
apps/web/src/features/preparation/  publications.tsx (states, publish, update), drive-review.tsx (changes, decisions)
apps/api/drizzle/0015_*.sql, 0016_*.sql
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: contracts; neutral document model; ingestion write consent (`access`, incremental scope, `DRIVE_WRITE_REQUIRED`); `DriveDocuments` port + fake + Google adapter skeleton; publishing schema and module wiring.
2. **US1 publish** (P1): render guide / practices / schedule; create files; read back as base; tab states and links.
3. **US2 states** (P1): metadata check (version, trashed, parents, rename, canEdit, owner), parse when changed, three-way diff, states.
4. **US3 review** (P1): changes stored per check, review screen, decisions once, apply through research commands, base update.
5. **US1b team** (P1): shared publications, per-person access on update (canEdit, owner name), decisions shared.
6. **US4 update** (P2): rewrite in place with revision precondition; refusal with unreviewed changes; conflicts.
7. **US5 assistant merge** (P3): optional; a proposal tool for a merged wording in a conflict.
8. **Polish**: i18n FR, docs (README Drive scope and re-consent, ADR-0005 update, context map Publishing context), e2e + axe.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| Drive scope `drive` (edit any file the person can edit) instead of `drive.file` | Requester: teammates must update files others published, and later features organise existing files (spec 007 Clarifications); `drive.file` only covers files the app created or the person picked, per person | `drive.file` + a file picker for every teammate and every file |
| New module `publishing` | Publishing owns its own aggregate (base, states, decisions) and depends on both research and ingestion; putting it in either would make that module depend on the other | Publishing inside research (would read Drive tokens) or inside ingestion (would write research data) |
