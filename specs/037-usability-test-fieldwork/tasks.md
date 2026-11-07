---
description: "Tasks for spec 037, usability test fieldwork"
---

# Tasks: Usability test fieldwork

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Required by the constitution (domain test-first, fakes over mocks). Test tasks come before the code they cover.

Paths: `api/` = `apps/api/src/modules/`, `web/` = `apps/web/src/`.

## Phase 1: Setup

- [X] T001 Confirm the four type guards to open (`session-commands.ts:52`, `analysis-commands.ts:107`, `session-queries.ts:276`, `run-inventory.ts:86`) and that `enrichment-sources.ts:42` stays closed; note any difference from R1–R11 in research.md

## Phase 2: Foundational (blocks every story)

- [X] T002 [P] Write failing tests for `versionAt(versions, date)` in `apps/api/src/modules/ingestion/tests/protocol-version.test.ts`: latest version saved on or before the date; none before → the first; no version → null (R8)
- [X] T003 [P] Write failing tests for `readinessOf(session, ctx)` in `apps/api/src/modules/ingestion/tests/session-readiness.test.ts`: order `not-validated`, `video-missing`, `duration-unknown`, `participant-to-confirm` (no accepted interviewee; on an anonymised study no pseudonym), `no-protocol`, else `ready` (FR-012, R9)
- [X] T004 [P] Implement `versionAt` in `api/ingestion/domain/protocol-version.ts` (pure, no import outside the domain)
- [X] T005 [P] Implement `readinessOf` and the `SessionReadiness` type in `api/ingestion/domain/session-readiness.ts`
- [X] T006 Write migration `apps/api/drizzle/0061_usability_sessions.sql` and its Drizzle journal entry: `ingestion_inventory_files.duration_ms` integer null; `ingestion_sessions.video_file_id` text null, `protocol_version` integer null, `protocol_version_by` text null check in (`app`,`person`); unique index (study_id, video_file_id) where video_file_id is not null; table `research_test_protocol_versions` (study_id FK cascade, version integer, content jsonb, saved_at, saved_by FK set null, PK study_id + version), filled with the current version of each existing protocol
- [X] T007 [P] Add the columns and table to `api/ingestion/infrastructure/schema.ts` and `api/research/infrastructure/schema.ts`
- [X] T008 Add `videoFileId`, `protocolVersion` and `protocolVersionBy` to the Session aggregate in `api/ingestion/domain/session.ts` (rehydrate, snapshot, mutate only through methods); add `setProtocolVersion(version, by)` which refuses an app change when `by` is already `person`; extend `apps/api/src/modules/ingestion/tests/sessions-domain.test.ts` first
- [X] T009 Persist the new Session fields in `api/ingestion/infrastructure/ingestion.drizzle-store.ts` and the in-memory fake `apps/api/src/modules/ingestion/tests/fakes/in-memory-ingestion.ts`
- [X] T010 [P] Extend the Zod contracts in `packages/contracts/src/sessions.ts` per contracts/api.md: `video { fileId, name, durationMs | null } | null`, `protocolVersion { version, by } | null`, `readiness` enum, `summary.ready`, `summary.videoMinutes`, `unclaimedTranscripts[]`, `protocolVersions[]`, body of `PUT /api/sessions/:id/protocol-version` `{ version: int ≥ 1, sessionVersion }`

**Checkpoint**: domain rules green, schema migrated, contracts compile.

## Phase 3: User Story 1 — See the test sessions found in the folder (P1) 🎯 MVP

**Goal**: one proposed session per video, with duration, matched transcript and audio, unclaimed transcripts listed.

**Independent test**: quickstart step 1.

- [X] T011 [P] [US1] Write failing tests for `reconcileVideoSessions` in `apps/api/src/modules/ingestion/tests/video-sessions.test.ts`: one session per free video; transcript matched by meeting title and by close timestamps in the same group; a tie stays unmatched; audio attached by `matchMedia`; kept sessions keep their files; files of decided sessions never reused; an undecided session whose video left the inventory is removed, a decided one kept (FR-001–FR-003); a transcript nobody claims returned in `unclaimedTranscripts`
- [X] T012 [P] [US1] Add `durationMs: number | null` to `DriveItem` in `api/ingestion/domain/drive-gateway.ts` and to `InventoryFile` in `api/ingestion/domain/inventory-walk.ts`; add `isVideo(mimeType)` (`video/*`) to `api/ingestion/domain/classify.ts` with a case in `apps/api/src/modules/ingestion/tests/classify.test.ts`
- [X] T013 [US1] Request `videoMediaMetadata(durationMillis)` in `ITEM_FIELDS` of `api/ingestion/infrastructure/drive.fetch-gateway.ts`, map it in `RawItem`/`toItem` (number or null, never content); give durations to videos in `api/ingestion/infrastructure/dev-drive.ts` and in the test Drive fakes; store `duration_ms` with the inventory files in the Drizzle store
- [X] T014 [US1] Implement `reconcileVideoSessions` beside `reconcileSessions` in `api/ingestion/domain/reconcile-sessions.ts`, reusing `confidenceOf` and `matchMedia` from `api/ingestion/domain/media-matching.ts`
- [X] T015 [US1] In `api/ingestion/application/commands/run-inventory.ts` replace `sessions: study?.type === 'interviews'` by a mode `'transcripts' | 'videos' | false` by study type, and run `reconcileVideoSessions` for `usability-test`; use-case test with fakes in `apps/api/src/modules/ingestion/tests/inventory-lifecycle.test.ts`
- [X] T016 [US1] Open the session view to usability tests in `api/ingestion/application/queries/session-queries.ts` (type gate): add `video`, `kind: 'sessions'`, `summary.videoMinutes`, `unclaimedTranscripts`; no `planned` data on this type (R6); counts in SQL, only the rows shown loaded
- [X] T017 [US1] Component test `apps/api/tests/usability-sessions.component.test.ts` (Testcontainers): inventory of a usability study gives sessions with durations, matched transcript, unclaimed transcript; an interview study unchanged; "Analyse sessions" on a usability study runs in the background, can be stopped and refuses a second run (FR-013)
- [X] T018 [US1] Web: replace the usability fieldwork placeholder in `web/routes/_authenticated/studies/$studyId.tsx` with `FieldworkTab` given the study type; in `web/features/fieldwork/fieldwork-tab.tsx` on usability tests show video and duration ("unknown" when null), transcript presence, video hours, the unclaimed transcripts with "No video: a session needs its recording", and hide the schedule column, stat and actions; labels in `web/features/fieldwork/labels.ts` with « séance »
- [X] T019 [US1] Run `pnpm generate` and `pnpm --filter @goodresearch/web i18n:extract`; translate the new French strings in the web catalog (glossary terms « séance », « animateur »)

**Checkpoint**: US1 works alone; interview tests unchanged.

## Phase 4: User Story 2 — People, name and protocol version (P1)

**Goal**: rules then AI on the transcript only; name renames files; protocol version proposed and chosen.

**Independent test**: quickstart steps 2 and 3.

- [X] T020 [P] [US2] Write failing tests in `apps/api/src/modules/research/tests/test-protocol-commands.test.ts` (use case with fakes) and extend `apps/api/tests/test-protocol.component.test.ts`: each save writes a new immutable version; versions listed without content; content read by version (FR-010, SC-005)
- [X] T021 [US2] Write a version in the same transaction as each protocol insert or update in `api/research/infrastructure/test-protocol.drizzle-repository.ts`; add `protocolVersions(studyId)` and `protocolVersion(studyId, version)` to `api/research/application/queries/test-protocol-queries.ts`, exported from `api/research/index.ts`
- [X] T022 [US2] Add a `protocolVersions` port to `api/ingestion/application/ports.ts`, wired to Research's query in `apps/api/src/compose.ts` (Ingestion never reads Research tables)
- [X] T023 [P] [US2] Write failing tests in `apps/api/src/modules/ingestion/tests/session-commands.test.ts`: usability sessions accepted by validate, exclude, reopen, move files, set title and people; moving the main video of an undecided session into another merges them (the emptied session is removed, its other files follow as recordings of the target, which keeps its own main video); moving a video out of a decided session is refused; no session can be created without a video (FR-003); `setProtocolVersion` refuses an unknown version and a stale `sessionVersion`; the app's proposal follows `versionAt` and never overrides `by = person` (FR-011)
- [X] T024 [US2] Open `api/ingestion/application/commands/session-commands.ts` to `usability-test` (guard at its type check), skip the planned link, its suggestion and the planned sync on this type (R6), add `setProtocolVersion`, and apply the app's proposed version after each inventory and date change
- [X] T025 [US2] Route `PUT /api/sessions/:id/protocol-version` in `api/ingestion/infrastructure/http.routes.ts` with the contract body and refusals `SESSION_NOT_FOUND`, `VALIDATION`, `VERSION_CONFLICT`, `FOLDER_ACCESS_REQUIRED`; add it to the read-access and change-guard tests
- [X] T026 [P] [US2] Write failing tests in `apps/api/src/modules/ingestion/tests/analysis-commands.test.ts`: usability session with a call-tool transcript → rules only; with a transcript and missing participant under consent → AI on the beginning, quote verified, unverified dropped; without transcript → no AI call; anonymised study → no name to the AI and pseudonym in the name (FR-007, FR-008, SC-002)
- [X] T027 [US2] Open `api/ingestion/application/commands/analysis-commands.ts` to `usability-test`, skip the schedule on this type, and pass the study kind to the prompt; in `api/ingestion/infrastructure/prompts/analysis.ts` name the roles participant and facilitator for usability tests; usage ledger and per-session cost unchanged (FR-013)
- [X] T028 [US2] Normalised name kinds for usability sessions (`Video`, `Transcript`, `Audio` and French forms) in `api/ingestion/domain/normalised-name.ts`, the main video renamed with the others by `api/ingestion/application/commands/rename-commands.ts`; unit tests first in `apps/api/src/modules/ingestion/tests/analysis-domain.test.ts` (FR-009)
- [X] T029 [US2] View: add `protocolVersion` and `protocolVersions` in `session-queries.ts`; web: protocol version select and participant/facilitator wording in `web/features/fieldwork/session-dialog.tsx` and `web/features/fieldwork/analysis.tsx`, "Add to the schedule" hidden on this type; regenerate client and catalogs

**Checkpoint**: US2 works on top of US1.

## Phase 5: User Story 3 — Validate, exclude, know which are ready (P1)

**Independent test**: quickstart step 4.

- [X] T030 [US3] Compute `readiness` per row and `summary.ready` in `session-queries.ts` with `readinessOf`, from data already read (no extra Drive call); `no-protocol` when the study has no version
- [X] T031 [US3] Web: readiness column with the first missing reason, "N ready" stat, and on `no-protocol` a link to the Preparation phase, in `fieldwork-tab.tsx` and `labels.ts`
- [X] T032 [US3] Extend `apps/api/tests/usability-sessions.component.test.ts`: two validated and ready, one excluded, one without participant → `ready: 2` and the reason

## Phase 6: User Story 4 — The assistant (P2)

**Independent test**: quickstart step 5.

- [X] T033 [P] [US4] Write failing tests in `apps/api/src/modules/ingestion/tests/interview-filters.test.ts` and `apps/api/src/modules/assistant/tests/next-step.test.ts`: counts add `ready` and `videoMinutes` on usability studies, filter `not-ready`; next step after checks → `decide-sessions` → `make-ready` → `next-phase` (FR-014)
- [X] T034 [US4] Add `not-ready` and the usability counts to `api/ingestion/domain/interview-filters.ts`; open the assistant reads in `apps/api/src/compose.ts` to usability tests
- [X] T035 [US4] Extend `usabilityNextStep` in `api/assistant/domain/next-step.ts`; session wording (sessions, participant, facilitator) in `api/assistant/application/context.ts` and the tool descriptions of `api/assistant/application/tools.ts`; consent rules unchanged (names only under folder consent, never on anonymised studies)
- [X] T036 [US4] Assistant use-case test in `apps/api/src/modules/assistant/tests/assistant-interviews.test.ts` (extended): counts without names, list under consent, validation card applied line by line with screen rules

## Phase 7: Polish & cross-cutting

- [X] T037 [P] E2E `apps/web/e2e/usability-fieldwork.spec.ts` with axe in light and dark: sessions listed with durations, unclaimed transcript, validate, readiness, protocol version select (SC-007)
- [X] T038 [P] Docs: `docs/domain/context-map.md` (Session video anchor, Protocol version, Session readiness, glossary « Séance », « Animateur »), new `docs/agent-journeys/13-usability-sessions.md` and its README row, `docs/agent-journeys/12-usability-preparation.md` next step
- [X] T039 Run `pnpm check`, `pnpm test`, `pnpm e2e`; confirm `fieldwork.spec.ts`, `fieldwork-analysis.spec.ts` and `questionnaire.spec.ts` pass unchanged (SC-006)
- [X] T040 Rebuild the local stack and run quickstart steps 1–6
- [ ] T041 Real Drive check by the user (quickstart step 7): durations read, a processing video shows "unknown", renaming with the person's access

## Dependencies

- Phase 2 blocks all stories. US1 → US2 (protocol version needs sessions) → US3 (readiness needs versions and people). US4 needs US1–US3.
- Same-file tasks run in order: `session-queries.ts` (T016 → T029 → T030), `fieldwork-tab.tsx` (T018 → T031), `compose.ts` (T022 → T034).

## Parallel examples

- Phase 2: T002, T003, T007, T010 together; then T004, T005.
- US1: T011 and T012 together; US2: T020, T023, T026 together.
- Polish: T037 and T038 together.

## Implementation strategy

MVP is US1 (sessions found from videos). Then US2 and US3 together make sessions ready for the Analysis spec; US4 last. One PR for the spec, as for 036.

## Notes on the build

- Domain tests T002, T003, T011 and the naming test of T028 are in `apps/api/src/modules/ingestion/tests/video-sessions.test.ts`; the use cases of T015, T023, T026, T032 and T036 in `usability-sessions.test.ts` (the assistant's counts go through the same session queries; its cards apply through the same session commands).
- T008/T024: the app's protocol version is computed at read time; only a person's choice is stored (`protocol_version`, no `protocol_version_by`), see research R8.
- T020: the versions are checked on Postgres in `apps/api/tests/test-protocol.component.test.ts`, which also covers T017 and the route of T025.
