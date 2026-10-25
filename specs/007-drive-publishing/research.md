# Research: Publish the study preparation to Drive

## R1. Scope and consent

- Decision: one Drive connection per person, upgraded on demand. Today's grant is `drive.readonly`; publishing or updating needs `drive` (read and write the files the person can edit). The consent URL asks `drive` alone (it includes reading; no `include_granted_scopes`, so the Drive and Vertex AI consents stay separate grants, each revocable on its own); the callback stores the new refresh token on the same connection with `access = 'write'`. Endpoints that write answer `409 DRIVE_WRITE_REQUIRED` when the connection is read-only; the web starts the consent and comes back to the Preparation tab.
- Rationale: `drive.readonly` and `drive` are both Google *restricted* scopes: no new verification class; teammates can edit files others published (Google permissions decide); later features can organise existing files.
- Alternatives: `drive.file` (per person, only app-created or picked files: teammates could not update); a service account (bypasses people's permissions, against spec 002).
- Consequences: README and ADR-0005 updated; people who publish re-consent once; revoking Drive (spec 002) removes write access too.

## R2. Where the Google calls live

- Decision: ingestion owns the connection and the tokens, so it exposes a port `DriveDocuments` with **neutral models**: `createDocument(folderId, name, doc)`, `readDocument(fileId)`, `rewriteDocument(fileId, doc, requiredRevision)`, the same three for tables, and `metadata(fileId)` (`version`, `revision`, `name`, `trashed`, `inFolder`, `canEdit`, `owner`, `lastEditor`, `modifiedTime`). The publishing module calls it through ingestion's `index.ts` with the acting account id. The Google adapter translates neutral models to Docs, Sheets and Drive REST requests.
- Rationale: tokens never leave ingestion; the publishing domain stays provider-agnostic (constitution III).

## R3. Neutral document model and item identity

- Decision: a document is a list of blocks `{ kind: heading(level) | paragraph | listItem(level), text, anchor? }`. Anchors identify items (`section:<id>`, `question:<id>`, `followUp:<questionId>:<n>`, `framing:objectives`, `hypothesis:<n>`…). In Google Docs, anchors are **named ranges** named `gr:<anchor>`: invisible, kept while people edit inside them, dropped when the whole text is deleted. A table is `{ columns: [{ key, title, type: text | status | datetime }], rows: [{ id, cells }] }`; in Sheets the row id is a **hidden, warning-protected first column**, the status column has a list validation, the date column a datetime format and validation.
- Rationale: identity survives rewording, sorting and filtering; nothing to parse by position.
- Alternatives: Markdown export and fuzzy matching (identity lost on rewording); Drive comments as markers (visible).

## R4. Base = what was read back

- Decision: after each write, the app reads the file back, parses it and stores that parse as the base, with the Drive `version` and Docs `revisionId`. Later checks compare parse with parse.
- Rationale: Google rewrites some characters (quotes, spaces, list numbering); comparing with what we sent would show false changes.

## R5. Reading the guide back

- Decision: deterministic parser over blocks: a level-2 heading starts a section (its anchor gives the section id; title and duration "Title (N min)"); top-level list items are questions (anchor gives the id; none = added question); nested list items are follow-ups; framing paragraphs are found by their anchors. Anything else (text outside the structure, a heading without a known pattern) becomes a **not understood** item with its text. Parsed values are validated with spec 006 rules (invalid = not acceptable).

## R6. Three-way diff

- Decision: pure function over items keyed by identity: for each key, compare base, app, Drive. Kinds: `changed`, `added`, `removed`, `reordered` (order of questions in a section), `conflict` (app and Drive both changed and differ), `notUnderstood`, `invalid`. Equal values on both sides are in sync. File state: unavailable > conflict > changed in Drive > out of date > in sync.
- Rationale: one rule for the guide and the schedule; testable without Drive.
- Items added in a file have no identity yet: their key is derived from their content (a hash, `-2`… for identical ones), so inserting other rows or questions does not change it and a decision on it is remembered. Questions under a heading that lost its anchor keep their own anchors (their section becomes unknown), so they are never seen as removed. Values compare as canonical JSON (sorted keys: Postgres `jsonb` reorders them).

## R7. Changes and decisions

- Decision: each check replaces the **pending** changes of a file with the new diff; decided changes are kept until the next write. Decisions are conditional updates (`pending → accepted | rejected`) scoped to the publication, one winner; ids of other publications are refused. A final text is only accepted for a guide conflict, of the same item type, within the app's rules. Accepting applies through research commands with the version the change was computed on: guide (`saveGuide`, origin `drive`, app content with the accepted Drive values; question ids kept), schedule (`add/update/deletePlannedInterview`). Accepted items become the base; rejected ones are marked "will be replaced at the next update".

## R8. Update in place

- Decision: refuse while pending changes exist unless `replaceDriveChanges: true`; then read the file again and refuse (`DRIVE_CHANGED_MEANWHILE`, a check runs) if its items differ from those of the last check; rewrite the whole content of the same file: Docs `batchUpdate` with `writeControl.requiredRevisionId` set to the revision of that fresh read (atomic; Docs revision ids are only valid for a day and per person, so a stored one is never reused), Sheets right after the fresh read (no revision control: the window is one write); read back as the new base. Sharing, link and name stay.

## R9. Checks

- Decision: `GET publications` runs a check for files not checked in the last 5 minutes (metadata call; read and parse only when `version` changed), in parallel and best effort (a Drive failure never hides the stored publications); `POST check` forces it. A file the acting person cannot open is shown unavailable to them only: the shared state changes only for facts everyone sees (trashed, moved out of the folder). No push notifications (they need a public callback).

## R10. Dev stack and tests

- Decision: an in-memory fake `DriveDocuments` (dev stack with `DRIVE_FAKE_DOCUMENTS=true`) that can simulate an edit through a dev-only endpoint (`POST /api/dev/drive-documents/:fileId/edit`), so e2e can publish, edit "in Drive", review and update.

## R11. Safety of decisions and writes (PR #7 review)

- Publishing reserves the (study, kind) slot before creating the file: concurrent or duplicate requests create one file; a failure frees the slot. A slot without a file is hidden from the lists.
- A check records what it saw only while the base it compared against is unchanged (an update or decision made meanwhile wins).
- Accepted schedule rows are applied one by one: those applied stay decided, the others go back to review (never applied twice). A row deleted in the app but edited in Drive comes back when Drive's version is taken.
- Questions are never lost when accepted: a question whose heading lost its anchor stays in its current section, and a section seen as removed while a heading lost its anchor is not understood (not acceptable).
- A renamed or deleted spreadsheet column makes every row unreadable (not acceptable) instead of reading the field as empty.
- Values sent with a decision (final texts) are checked for shape and limits, and a question stays in one of the two versions' sections.
- The reading and the documents adapters share one set of access tokens per person.
- A decision builds on the stored base and leaves it alone if an update rewrote the file meanwhile. A failed decision checks again so the review shows fresh values.
- An addition accepted from the file has no identity in it until the next update: an added item that looks like one already accepted (same person to interview; same section and mostly the same words) is shown as not understood instead of being offered again, so it is never added twice. A sheet whose hidden id column moved, or whose columns changed, makes row removals and additions not understood too.
- Every change of the base increases a counter; a check is recorded (changes and state, in one locked transaction) only on the counter it compared against.
- Sheets are rewritten by writing the rows first, then clearing only what is left below in the app's columns (columns people added are kept).
- A reservation older than 10 minutes (an interrupted publication) is freed at the next publication; a file created but not read back stays tracked and is rewritten by the next update.
- Rows whose cells were all cleared are removed rows; dates typed as text (not real dates) are unreadable.
- A file Google created but could not fill is kept and shown out of date (updating fills it); a reservation never outlives a failed publication.
- The list waits at most 3 s for the checks made when the tab opens; a file only this person cannot open is not checked again at every visit.
- Pending changes keep their id across checks while unchanged, so a review open in a browser stays valid.
- Writes of a new base (an update, a decision) are conditional on the counter they started from; a file rewritten but not read back is kept with no base and shown out of date, never taken for changes made in Drive.
- The base is read version first, then content; an update never writes a file moved out of the study folder.
- Spreadsheets are written column by column where each title is (columns people added or moved are never written), then cleared below in those columns.
- Known limit: an addition made in the file that looks like one already accepted waits for the next update (shown as not understood); it is never merged automatically.

