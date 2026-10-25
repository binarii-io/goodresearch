---
description: "Task list for 007-drive-publishing"
---

# Tasks: Publish the study preparation to Drive and bring Drive edits back

## Phase 1: Foundational

- [X] T001 Contracts `packages/contracts/src/publishing.ts` (Publication, DriveChange, Publish, Decide, Update bodies) + error codes `DRIVE_WRITE_REQUIRED`, `ALREADY_PUBLISHED`, `NO_SOURCE_FOLDER`, `DRIVE_CHANGES_PENDING`, `DRIVE_CHANGED_MEANWHILE`, `DRIVE_CANNOT_EDIT`, `PUBLICATION_NOT_FOUND`; guide origin `drive`
- [X] T002 Ingestion: connection `access` (`read | write`), write consent (`drive` scope, incremental), `startDriveConnection({ access })`, migration
- [X] T003 Ingestion: neutral models and `DriveDocuments` port (`apps/api/src/modules/ingestion/domain/drive-documents.ts`), in-memory fake with simulated edits, Google adapter (Docs named ranges, Sheets hidden id column, validations, revision precondition, metadata with canEdit/owner/lastEditor)
- [X] T004 Ingestion public API `publishedFiles` (acting person's token, gate, folder, errors) in `index.ts`
- [X] T005 Dev stack fake Drive (`DRIVE_FAKE=true`: consent, a demo folder, documents, dev edit endpoint), refused with an https `APP_URL`

## Phase 2: US1 — publish (P1)

- [X] T006 [P] [US1] Test-first render of the guide, best practices and schedule into neutral models, and read-back parsers (`publishing/domain/render-*.ts`, `read-*.ts`)
- [X] T007 [US1] Publishing schema (`publishing_documents`, `publishing_changes`) + migrations; store; module; `publish` command (create, read back as base); routes; compose wiring (research reads/actions, ingestion files)

## Phase 3: US2 — states (P1)

- [X] T008 [P] [US2] Test-first three-way diff (`publishing/domain/three-way.ts`): changed, added, removed, reordered, conflict, not understood, invalid; file state precedence
- [X] T009 [US2] `check` (metadata, version shortcut, parse, diff, unavailable reasons, rename), automatic check on list (5 min), routes

## Phase 4: US3 + US1b — review and team (P1)

- [X] T010 [US3] Changes stored per check; `decide` (once, conditional), apply through research commands (guide origin `drive`, schedule rows), base update; component tests
- [X] T011 [US1b] Shared publications and decisions; `canEdit`/owner on update; tests with two accounts

## Phase 5: US4 — update (P2)

- [X] T012 [US4] `update` in place (refuse with pending changes unless replace, revision precondition, read back), conflicts settled with a final text; tests

## Phase 6: Web

- [X] T013 Preparation tab: Drive panel (publish, states, links, check now, update, forget, write consent), review dialog (changes per item, accept/reject, conflict final text), i18n EN/FR

## Phase 7: Polish

- [X] T014 Docs: README (Drive scope `drive`, Docs and Sheets APIs, re-consent), ADR-0005 update, context map (Publishing context, glossary), `.env.example` (`DRIVE_FAKE`)
- [X] T015 E2E `apps/web/e2e/publishing.spec.ts` with the fake Drive (publish, edit in Drive, review, update) + axe; `pnpm check`, all tests
- [ ] T016 [US5] (optional, P3, not done) assistant merge proposal for a conflict
