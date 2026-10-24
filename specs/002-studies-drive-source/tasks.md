---
description: "Task list for 002 studies with a Google Drive source"
---

# Tasks: Studies in projects, with Google Drive as the source of interview studies

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: required (constitution V). Domain and use-case tests come first and must fail before implementation.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational

- [X] T001 Add `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` (optional, both or none) to `packages/config/src/env.ts` as `config.drive: { clientId, clientSecret } | null`, with tests in `packages/config/src/env.test.ts`; document them in `.env.example`
- [X] T002 [P] Add error codes `STUDY_NOT_FOUND` (404), `FOLDER_ACCESS_REQUIRED` (403), `NOT_A_DRIVE_FOLDER_LINK` (422), `FOLDER_NOT_FOUND` (422), `DRIVE_NOT_CONNECTED` (409), `DRIVE_NOT_CONFIGURED` (409), `INVENTORY_RUNNING` (409) to `packages/contracts/src/errors.ts`
- [X] T003 [P] Write `apps/api/src/modules/ingestion/tests/token-cipher.test.ts` (round trip, tamper detection, versioned format `v1:`) then implement `apps/api/src/modules/ingestion/infrastructure/token-cipher.ts` (AES-256-GCM, HKDF-SHA256 from `AUTH_SECRET`, info `goodresearch/source-connections/v1`)
- [X] T004 Create Drizzle schemas: `research_studies` in `apps/api/src/modules/research/infrastructure/schema.ts`; `ingestion_source_connections`, `ingestion_study_sources`, `ingestion_inventory_files`, `ingestion_folder_access` in `apps/api/src/modules/ingestion/infrastructure/schema.ts`; generate the migration and add by hand in a custom migration the cross-module foreign keys (`ingestion_study_sources.study_id → research_studies(id) ON DELETE CASCADE`, `ingestion_*.account_id → auth_users(id) ON DELETE CASCADE`) and CHECK constraints (study type, inventory status, file kind); register the schemas in `apps/api/src/platform/schema.ts` and `apps/api/drizzle.config.ts`
- [X] T005 Create `apps/api/src/platform/jobs.ts` (PgBoss sender for the server: `send(queue, payload, { singletonKey })`; worker registration helper) and register ingestion workers in `apps/api/src/worker.ts`
- [X] T006 Create the ingestion module skeleton (`apps/api/src/modules/ingestion/index.ts`, `application/ports.ts` with `StudyDirectory` port: `getStudyAccess(accountId, studyId) → { projectId, role } | null`) and wire research ↔ ingestion ports in `apps/api/src/compose.ts`

**Checkpoint**: migrations apply, `pnpm check` green.

---

## Phase 2: User Story 1 — Create a study in a project (P1) 🎯 MVP

### Tests first

- [X] T007 [P] [US1] Write `apps/api/src/modules/research/tests/study.test.ts`: name "1–120 chars after trim", type only `interviews` creatable (`survey`, `usability-test` → `VALIDATION`), rename updates `updatedAt` and version
- [X] T008 [P] [US1] Write `apps/api/src/modules/research/tests/study-commands.test.ts` with fakes: create in an accessible project; inaccessible project → `PROJECT_NOT_FOUND`; rename with stale version → `VERSION_CONFLICT`; rename/delete refused with `FOLDER_ACCESS_REQUIRED` when the action gate says no; admin delete bypasses the gate (FR-010b)

### Implementation

- [X] T009 [US1] Implement `apps/api/src/modules/research/domain/{study.ts,study.repository.ts}` and `infrastructure/study.drizzle-repository.ts`
- [X] T010 [US1] Implement commands `apps/api/src/modules/research/application/commands/{create-study,rename-study,delete-study}.ts` using a `StudyActionGate` port (implemented by ingestion: `canAct(accountId, studyId)`)
- [X] T011 [US1] Implement queries `apps/api/src/modules/research/application/queries/study-queries.ts` (`listStudies(accountId, projectId)` most recently updated first with source status from an ingestion port; `getStudy`; `getStudyAccess` for the ingestion `StudyDirectory` port)
- [X] T012 [US1] Add routes (contracts/http-api.md "Studies") with schemas in `packages/contracts/src/research.ts`; `GET /api/studies/{id}` combines the study with ingestion's access state; regenerate the client
- [X] T013 [P] [US1] Create `apps/web/src/features/research/create-study-dialog.tsx` (name, type radio: Interviews selectable, Survey and Usability test disabled with "Coming later") and the studies list on `apps/web/src/routes/_authenticated/projects/$projectId.tsx`
- [X] T014 [US1] Create `apps/web/src/routes/_authenticated/studies/$studyId.tsx`: name in place, type, phases Preparation / Fieldwork / Analysis as sections with explanations; Analysis hosts the source block; delete with confirmation
- [X] T015 [US1] Write `apps/api/tests/studies.component.test.ts` (create, list order, rename conflict, outsider 404 — SC-006) and `apps/web/e2e/studies.spec.ts` (create, list, rename, delete, axe)

---

## Phase 3: User Story 2 — Connect Google Drive and attach the folder (P1)

### Tests first

- [X] T016 [P] [US2] Write `apps/api/src/modules/ingestion/tests/drive-link.test.ts`: accepts `https://drive.google.com/drive/folders/<id>`, `/drive/u/1/folders/<id>?usp=sharing`, `https://drive.google.com/open?id=<id>`, bare id; rejects document links (`docs.google.com/document/...`), file links (`/file/d/`), other hosts, malformed input → `NOT_A_DRIVE_FOLDER_LINK`
- [X] T017 [P] [US2] Write `apps/api/src/modules/ingestion/tests/folder-access.test.ts`: granted cached < 5 min reused; older → re-check; denied → no inventory/actions; admin exception only for detach and delete
- [X] T018 [P] [US2] Write `apps/api/src/modules/ingestion/tests/source-commands.test.ts` with `tests/fakes/in-memory-drive.ts` (folders, files, shortcuts, access per Google account, revoked tokens): connect stores encrypted token; attach requires connection (`DRIVE_NOT_CONNECTED`), a folder (`FOLDER_NOT_FOUND`), starts an inventory; replace discards previous files; detach by admin without access; disconnect revokes and deletes; a person's token is never used for another person's request
- [X] T019 [P] [US2] Write `apps/api/src/modules/ingestion/tests/drive.fetch-gateway.test.ts` with a fake `fetch`: exact URLs and fields of research R4/R5; token refresh; `invalid_grant` → connection lost; only `GET` to `www.googleapis.com`, `POST` only to `oauth2.googleapis.com/token` and `/revoke` (SC-005)

### Implementation

- [X] T020 [US2] Implement `apps/api/src/modules/ingestion/domain/{drive-link.ts,folder-access.ts,source-connection.ts,study-source.ts,drive-gateway.ts}` and repositories
- [X] T021 [US2] Implement `apps/api/src/modules/ingestion/infrastructure/{google-oauth.ts,drive.fetch-gateway.ts}` (authorization code + PKCE + state stored server-side for 10 min, scope check on the token response, refresh, revoke; Drive calls of research R4/R5 with backoff on 403/429)
- [X] T022 [US2] Implement commands `connect-drive` (start + callback), `disconnect-drive`, `attach-folder`, `detach-folder` and queries `list-my-sources`, `get-study-source`, `study-access` (the `StudyActionGate` for research) in `apps/api/src/modules/ingestion/application/`
- [X] T023 [US2] Add routes (contracts/http-api.md "Study source", "Connected sources") in `apps/api/src/modules/ingestion/infrastructure/http.routes.ts`; regenerate the client
- [X] T024 [P] [US2] Create `apps/web/src/features/ingestion/attach-folder.tsx`: explanation before consent (what is read, nothing modified), navigation to `/api/sources/google-drive/connect?returnTo=…`, link field, errors, "Drive not configured" state
- [X] T025 [P] [US2] Create `apps/web/src/routes/_authenticated/sources.tsx` ("Connected sources": status, Google account, disconnect with confirmation) and the account-menu entry
- [X] T026 [US2] Add the no-access state to the study page (name, type, folder owner, how to get access; no inventory, no actions; admins see detach/delete)
- [X] T027 [US2] Write `apps/api/tests/sources.component.test.ts` with the in-memory Drive injected through `composeApp` (connect callback with a fake token endpoint, attach, colleague without access gets `FOLDER_ACCESS_REQUIRED` and no file names — SC-008, disconnect — SC-007)

---

## Phase 4: User Story 3 — See and refresh the inventory (P1)

### Tests first

- [X] T028 [P] [US3] Write `apps/api/src/modules/ingestion/tests/classify.test.ts` (every format of FR-013 → expected kind; unknown → other) and `tests/inventory-walk.test.ts` (groups from the first-level sub-folder, `Root`, shortcuts resolved once, shortcut to folders not followed, cycles impossible, 10,000 files — SC-003, SC-004)
- [X] T029 [P] [US3] Write `apps/api/src/modules/ingestion/tests/run-inventory.test.ts`: one inventory at a time (`INVENTORY_RUNNING`), progress updates, success replaces files atomically, failure keeps last files and marks `outdated` with the reason, `incompleteSearch` → failure

### Implementation

- [X] T030 [US3] Implement `apps/api/src/modules/ingestion/domain/{classify.ts,inventory-walk.ts}`
- [X] T031 [US3] Implement `refresh-inventory` and the `run-inventory` job handler (pg-boss queue `ingestion.inventory`, singleton per study, runs with the requester's connection) in `apps/api/src/modules/ingestion/application/commands/` and `infrastructure/jobs.ts`
- [X] T032 [US3] Implement query `list-inventory-files` (filters kind, group) and totals in `get-study-source`
- [X] T033 [US3] Create `apps/web/src/features/ingestion/inventory.tsx`: totals per kind and group, filterable table (name links to Drive), last run (date, by whom), progress while running (polling every 2 s), outdated banner with reason, refresh button
- [X] T034 [US3] Extend `apps/api/tests/sources.component.test.ts`: inventory end to end through the worker handler with the in-memory Drive (500 files in 20 sub-folders under 1 minute — SC-002)

---

## Phase 5: Polish

- [X] T035 [P] Translate new strings to French in `apps/web/src/locales/fr/messages.po` (glossary: Study/Étude, Source folder/Dossier source, Inventory/Inventaire, Connected sources/Sources connectées)
- [X] T036 [P] README: "Google Drive" section (enable Drive API, `drive.readonly` scope, redirect URI, Internal vs External and verification, same or separate Google Cloud project and the revocation side effect)
- [X] T037 [P] Update `docs/domain/context-map.md` if names changed; `apps/api/README.md` (ingestion module, jobs in worker)
- [X] T038 Run `pnpm check`, `pnpm test`, `pnpm e2e`; run quickstart B with the maintainer's Google client — *all green (188 Vitest, 16 e2e); 2026-10-24 the maintainer connected Google Drive through the consent and the inventory listed every file of a real folder*

---

## Dependencies & execution order

- Phase 1 → US1 → US2 → US3 → Polish. US2 needs studies (US1); US3 needs an attached folder (US2).
- Within a story: tests → domain → infrastructure → commands/queries → routes + client → screens → component/e2e tests.
- Parallel: T002–T003; T007–T008; T016–T019; T024–T025; T028–T029; T035–T037.

## Implementation strategy

MVP = Phase 1 + US1 + US2 + US3 (a study without its folder has little value); each story is committed separately.
