# Research: Fieldwork — the interviews found in the study folder

## R1. Where sessions live

- **Decision**: in the ingestion module, as the context map places **Session** (with its roster). Ingestion owns the inventory and the folder access. The planned interviews are read through a `Schedule` port, implemented in `compose.ts` with research's `listPlannedInterviews(accountId, studyId)`, so research's own gate applies.
- **Rationale**: sessions are built from the inventory and must change in the same transaction.
- **Alternatives**: in research (it would read the inventory tables); a new module (no aggregate of its own beyond sessions).

## R2. Reconcile at the end of each inventory

- **Decision**: `completeInventory` replaces the files, then runs the pure `reconcileSessions(files, sessions, now)` in the same transaction:
  1. Decided sessions (validated, excluded) are kept as they are, files included.
  2. A proposed session whose transcript is no longer in the files is deleted.
  3. Each transcript that no session holds becomes a new proposed session.
  4. Media are matched for proposed sessions, among media that no decided session holds.

  When the person changed a proposed session's media by hand (`mediaEdited`), those files are kept while they exist. At most 500 sessions per study (newest transcripts first); the list says when transcripts were skipped.
- **Rationale**: one place and one moment where the files change (FR-002, FR-004).

## R3. Media matching policy

- **Decision**: a pure function, written test-first.
  - **File words**: lower case, accents removed, the extension dropped, split on anything that is not a letter or a digit. Words shorter than 3 characters, numbers and a fixed list of common words (interview/entretien, transcript/transcription, audio, video, recording/enregistrement, meeting/reunion, call/appel, final, copy/copie…) are dropped.
  - **Rare word**: one that appears in at most 3 files of the group.
  - **Confidence**, for each media file and each proposed session of the same group: different days (UTC) → never, checked first; `modifiedAt` within 1 minute → high; within 15 minutes, or a shared rare word the same day → medium; shared rare word without date on one side → low.
  - **Best match**: each media file goes to the session with the best confidence; a tie on the best leaves it unmatched. A session can hold several media files. The reason (`same-time`, `close-time`, `shared-word:<word>`) is stored for display.

## R4. Link suggestion

- **Decision**: a pure function at read time: `suggestLink(session, plannedInterviews, sessionsLinked)`. It only considers planned interviews not linked to another session.
  1. **Name**: count the interviewee's name words (at least 3 letters) found among the transcript's file words (same normalisation). The planned interview with the highest count is suggested (`name`) if no other has the same count.
  2. **Date**: otherwise (no match or a tie), if exactly one planned interview with a date is within 24 hours of the transcript's `modifiedAt`, suggest it (`date`).

  Nothing is stored until the person confirms. No AI: the schedule holds names of real people (spec 006 FR-013).
- **Alternatives**: storing suggestions (they would go stale when the schedule changes); fuzzy matching (wrong links on similar names).

## R5. Link uniqueness and "move"

- **Decision**: a partial unique index on `(study_id, planned_interview_id)`. Linking a planned interview held by another session answers `409 PLANNED_INTERVIEW_LINKED` (with that session's title), unless `move: true`. A move clears the other link and sets this one in one transaction, both versions checked. The other session must be proposed; a decided session must be reopened first.

## R6. Dangling references

- **Decision**: no cross-module event.
  - **Missing file**: a validated or excluded session whose transcript is not in the current inventory is shown "file missing in Drive", computed at read time.
  - **Deleted planned interview**: a link to a planned interview missing from the schedule reads as no link. The next write of that session clears it.

## R7. Decisions and versions

- **Decision**: `validate`, `exclude(reason ≤ 500)` and `reopen` are conditional updates on `(id, version)` with transitions checked by the aggregate: proposed → validated or excluded, decided → proposed. The same applies to `edit` (title, media, roster) and `link`, which are allowed on proposed sessions only. A stale version answers `409 VERSION_CONFLICT`. `decidedBy` and `decidedAt` are recorded.

## R8. Roster

- **Decision**: `jsonb` array of `{ id, name (1–120), role: interviewer | interviewee, memberId? }`, at most 10 entries; ids are kept by the app across edits so later contexts can reference them. When the person confirms a link and the roster is empty, the session is prefilled from the planned interview: the interviewee, then the interviewers split on commas. `memberId` is checked against the workspace members through a port (`members.exist(ids)`). The UI only offers the person's own account ("This is me"): the member list is for admins only today.

## R9. Marking the planned interview done

- **Decision** (update 2026-10-30): the `decide` command marks it done when an interview is validated, from any screen, through the schedule port and the schedule's own command and version check (retried once, logged if it fails). Ingestion never writes research data itself.

## R10. Moving the source panel

- **Decision**: the `SourcePanel` (attach, refresh, inventory) moves to the Fieldwork tab unchanged; Analysis shows "coming in a later version". The default phase becomes Fieldwork. The French label becomes « Passation » (phase tab, glossary); English stays "Fieldwork". The confirmations to replace or detach the folder add the number of sessions that will be discarded.
- **Consequences**: e2e tests that expect `3 · Analysis` as the default tab are updated. Spec 002 FR-005 gets a note that the panel moved.

## R11. Safety of writes (PR #8 review)

- **Study lock**: session writes and the reconcile of an inventory take a per-study transaction lock (`pg_advisory_xact_lock`). A write is refused (`MEDIA_UNAVAILABLE`) when another session already holds one of its recordings, so two people can never put the same recording in two interviews.
- **Unchanged recordings**: recordings sent back unchanged by an edit are not a person's choice: the session stays matched by the app (`mediaEdited` stays false).
- **Member links**: links of interviewers to members are kept as they are; only "This is me" changes the person's own link.
- **Unreadable schedule**: when the schedule cannot be read, it is `null`, not empty, and links are never dropped.
- **Decided holder**: moving a planned interview held by a decided interview answers `LINKED_TO_DECIDED_SESSION` (reopen that one first).
- **Other study types**: only interview studies get sessions (reconcile is skipped; the routes answer `NOT_AN_INTERVIEW_STUDY`).
- **Earlier inventories**: a study whose inventory predates spec 008 gets its sessions on the first Fieldwork read (one backfill). `skipped` counts transcripts only once the 500 limit is reached.
- **Rows without transcript**: their recordings stay offered to other interviews while no person decided the row (validated or excluded); taking one removes it from the row, which goes once it has none left. A row a person decided keeps its recordings until reopened.
