# Implementation Plan: Fieldwork — the interviews found in the study folder

**Branch**: `008-fieldwork-sessions` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-fieldwork-sessions/spec.md`

## Summary

The ingestion module gets the **Session** aggregate of the context map (labelled "Interview" in the UI). It holds a transcript file, its media files, a state `proposed | validated | excluded`, a title, a roster and an optional link to a planned interview.

- **Proposals**: when an inventory completes, a pure `reconcileSessions` runs in the same transaction:
  - it proposes one session per transcript that no session holds yet;
  - it removes proposed sessions whose transcript is gone;
  - it matches media files with the context map's matching policy;
  - it never touches decided sessions.
- **Link suggestions**: computed at read time by a pure function over the study's planned interviews (read through a port implemented by research). They are never stored and never sent to an AI provider.
- **Decisions**: validate, exclude, reopen, link and edit are commands with a version check.
- **Web**: the Fieldwork tab (FR « Passation ») holds the source panel moved from Analysis and the new interviews list. The schedule shows which planned interviews have a transcript. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new

**Storage**: PostgreSQL. New table `ingestion_sessions` (roster and media as `jsonb`). Foreign key to `research_studies` with `on delete cascade`, in the migration SQL only (docs/standards.md §6). Partial unique index on `(study_id, planned_interview_id)` and unique index on `(study_id, transcript_file_id)`.

**Testing**: Vitest.
- Test-first pure domain tests: reconcile, media matching, rare words, link suggestion (name, date, ambiguity), state transitions.
- Use-case tests with the in-memory store.
- Integration tests on PostgreSQL: reconcile inside `completeInventory`, the uniqueness of the link, cascade on study delete, discard on folder replace.
- Playwright with the dev Drive: sessions proposed, link confirmed, validate, mark the planned interview done; plus axe.

**Target Platform / Project Type**: unchanged (web app + API + worker)

**Performance Goals**: reconcile 500 transcripts + 2 000 media in < 1 s in the worker; the Fieldwork list in one query plus one schedule read.

**Constraints**:
- No Drive writes and no file content read.
- Decided sessions are frozen.
- Schedule and roster names never go to an AI provider.
- Same access gate as the inventory (spec 002 FR-010a).

**Scale/Scope**: 1 aggregate, ~5 endpoints, 1 tab moved, 1 list, 1 session dialog, 1 migration.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 008, plan, tasks | ✅ |
| II. DDD pragmatic | `Session` aggregate in ingestion, as on the context map. It reads planned interviews through a port (no research tables). Marking the planned interview done goes through research's existing endpoint. | ✅ |
| III. Provider-agnostic | Sessions reference files by the source's file id; no Google term in the domain | ✅ |
| IV. AI proposes, humans decide | No AI. App rules propose (sessions, media, links) and only people decide. A refresh never overwrites a decision. | ✅ |
| V. Test-first | Matching, suggestion and reconcile rules are written test-first | ✅ |
| VI. Contracts | Zod bodies; OpenAPI and client regenerated | ✅ |
| VII. Privacy | Names stay in the app; read-only metadata; nothing deleted in Drive | ✅ |
| VIII. a11y & i18n | Table with headers, dialog with labelled fields, states as text, EN/FR (« Passation ») | ✅ |
| IX. Simplicity | Suggestions recomputed at read time (no stored proposals to keep in sync); roster as `jsonb` | ✅ |

## Project Structure

```text
specs/008-fieldwork-sessions/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
apps/api/src/modules/ingestion/
├── domain/         session.ts (aggregate, transitions, limits), file-words.ts (tokens, rare words),
│                   media-matching.ts, reconcile-sessions.ts, link-suggestion.ts
├── application/    ports.ts (+ SessionStore, Schedule port), commands/session-commands.ts,
│                   queries/session-queries.ts
├── infrastructure/ schema.ts (+ ingestion_sessions), drizzle store (reconcile in completeInventory,
│                   discard in attachSource/deleteSource), http.routes.ts (+ session routes), module.ts
└── tests/          domain + use-case tests, in-memory session store
apps/api/src/compose.ts          schedule port → research preparationQueries.listPlannedInterviews
apps/api/drizzle/0019_*.sql
packages/contracts/src/sessions.ts (+ error codes)
apps/web/src/features/fieldwork/ fieldwork-tab.tsx (summary, filters, list, planned without transcript),
                                  session-dialog.tsx (link, media, people, title, decisions)
apps/web/src/routes/_authenticated/studies/$studyId.tsx  SourcePanel → Fieldwork; default phase
apps/web/src/features/preparation/schedule.tsx            "Transcript found" column
docs/domain/context-map.md (Passation, Session states), apps/api README (ingestion), e2e
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: contracts and error codes; migration and schema; `Session` aggregate with its transitions (test-first); store port and in-memory and Drizzle stores; `Schedule` port wired in `compose.ts`; the dev Drive demo folder grows to two groups with several transcripts and recordings, one transcript named after an interviewee (`Interview Sam Example.txt`).
2. **US1 proposals** (P1):
   - file words and rare words, media matching, reconcile (test-first);
   - reconcile inside `completeInventory`; discard on attach and detach;
   - list query; the Fieldwork tab with the source panel moved, the summary and the list.
3. **US2 links** (P1): link suggestion (test-first) in the list query; link command with "move"; planned interviews without a session; the column in the schedule.
4. **US3 decisions** (P1): validate, exclude, reopen; edit media, title and roster with prefill from the link; "file missing in Drive"; the offer to mark the planned interview done.
5. **Polish**: FR « Passation » and catalogs; docs (context map, ingestion README, spec 002 note on the moved panel); e2e + axe; update the existing e2e that expects the Analysis tab.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| Reconcile inside the inventory transaction | Files and sessions must agree: a session never points to a file of an older inventory | Reconcile on read (decided state would depend on timing) |
