---
description: "Task list for 008-fieldwork-sessions"
---

# Tasks: Fieldwork — the interviews found in the study folder

## Phase 1: Foundational

- [X] T001 Contracts in `packages/contracts/src/sessions.ts`, plus error codes:
  - schemas: `Fieldwork`, `Session`, `RosterEntry`, `LinkSession`, `EditSession`, `DecideSession` bodies;
  - error codes: `PLANNED_INTERVIEW_LINKED`, `PLANNED_INTERVIEW_NOT_FOUND`, `SESSION_DECIDED`, `INVALID_TRANSITION`, `MEDIA_UNAVAILABLE`, `MEMBER_NOT_FOUND`, `SESSION_NOT_FOUND`;
  - limits: title ≤ 120, reason ≤ 500, roster ≤ 10, name 1–120.
- [X] T002 [P] Test-first `Session` aggregate in `apps/api/src/modules/ingestion/domain/session.ts`:
  - transitions proposed → validated | excluded and decided → proposed;
  - edits and links only while proposed;
  - limits; roster ids kept.
- [X] T003 Schema `ingestion_sessions` and migration `apps/api/drizzle/0019_fieldwork_sessions.sql`:
  - unique `(study_id, transcript_file_id)`;
  - partial unique `(study_id, planned_interview_id)`;
  - FK to studies, on delete cascade.
- [X] T004 Ports in `application/ports.ts`: `SessionStore`, `Schedule` (planned interviews of a study for an account), `Members` (exist); in-memory store for use-case tests; Drizzle store; wiring in `compose.ts`.
- [X] T005 [P] Dev Drive demo folder in `ingestion/infrastructure/dev-drive.ts`: two groups, several transcripts and recordings (same-time and shared-word pairs), `Interview Sam Example.txt`.

## Phase 2: US1 — interviews found (P1)

- [X] T006 [P] [US1] Test-first file words and rare words (`domain/file-words.ts`), and media matching (`domain/media-matching.ts`): high, medium, low, never; ties unmatched; same group only.
- [X] T007 [US1] Test-first `reconcileSessions` (`domain/reconcile-sessions.ts`):
  - keep decided sessions;
  - drop proposed sessions without their transcript;
  - add new transcripts;
  - match media, keeping hand-edited media;
  - limit of 500, newest first, with a skipped count.
- [X] T008 [US1] Ingestion store, in one transaction each:
  - reconcile inside `completeInventory`;
  - delete the sessions in `attachSource` and `deleteSource`.

  Integration tests on PostgreSQL.
- [X] T009 [US1] Query `listSessions` (`application/queries/session-queries.ts`): sessions with their files, `fileMissing`, unmatched media, totals, skipped. Route `GET /api/studies/:studyId/sessions` with the inventory gate. `pnpm generate`.
- [X] T010 [US1] Web, in `routes/_authenticated/studies/$studyId.tsx` and `features/fieldwork/fieldwork-tab.tsx`:
  - the SourcePanel moves to Fieldwork, which becomes the default phase; Analysis shows "coming later";
  - Fieldwork shows the summary per state, filters (state, group) and the list (file link, group, date, media with confidence, state);
  - the empty states;
  - the replace and detach confirmations name the number of sessions.

## Phase 3: US2 — links (P1)

- [X] T011 [P] [US2] Test-first `suggestLink` (`domain/link-suggestion.ts`):
  - name rule (full name or a name word of 3+ letters, unique match);
  - date rule (only one planned interview within 24 h);
  - ambiguity gives no suggestion;
  - planned interviews already linked are skipped.
- [X] T012 [US2] Suggestions, links and planned interviews without a session in `listSessions`; dangling links read as none.
- [X] T013 [US2] Command `link`, route `POST /api/sessions/:id/link`, use-case tests:
  - version check;
  - `move` in one transaction;
  - roster prefilled when empty.
- [X] T014 [US2] Web: suggestion with its reason and Confirm or Change (pick from the schedule) in the list and in the dialog; the "No transcript yet" list; a "Transcript found" column in `features/preparation/schedule.tsx`.

## Phase 4: US3 — decisions (P1)

- [X] T015 [US3] Commands `decide` (validate, exclude with reason, reopen) and `edit` (title, media from the free files, roster with members checked), routes, use-case and component tests (two people: "changed meanwhile").
- [X] T016 [US3] Web `features/fieldwork/session-dialog.tsx`:
  - title, media, people (interviewer or interviewee, member picker);
  - Validate, Exclude (reason), Back to review;
  - after validating, offer "Mark the planned interview done", which calls the schedule's update with its version;
  - "File missing in Drive" badge.

## Phase 5: Polish

- [X] T017 i18n: EN/FR catalogs; French phase label « Passation » (`2 · Passation`); `i18n:extract`.
- [X] T018 Docs:
  - context map: Passation in the glossary, Session states and the link to PlannedInterview, the matching and suggestion rules;
  - ingestion README / API README;
  - spec 002 note: the source panel moved to Fieldwork.
- [X] T019 E2E `apps/web/e2e/fieldwork.spec.ts` + axe: proposals, suggestion confirmed, validate, mark done, exclude, reopen. Update the existing e2e that expects the Analysis tab by default.
- [X] T020 `pnpm check`, `pnpm test`, `pnpm generate` (no diff), `pnpm e2e`.

## Dependencies

- Phase 1 comes before everything else.
- Within US1: T006 → T007 → T008 → T009 → T010.
- US2 needs US1's list (T009).
- US3 needs T013's link for the prefill and the mark-done offer.
- Polish comes last.
- T002, T005, T006 and T011 are pure and can run in parallel.

## Implementation strategy

The MVP is US1: interviews listed in Fieldwork. US2 and US3 complete the P1 scope of the spec and ship in the same PR.
