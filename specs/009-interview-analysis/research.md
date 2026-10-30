# Research: Analyze the interviews

## R1 — Where the analysis lives

- **Decision**: In the ingestion module, as part of the **Session** aggregate: a session holds its last analysis (state, files read, proposals with their status). Accepting a proposal changes one aggregate (roster, title, date, language and the proposal status together).
- **Rationale**: Constitution II (one transaction, one aggregate). Proposals belong to one session and live and die with it (a reopened or reconciled session drops what it no longer matches).
- **Alternatives**: a separate `SessionAnalysis` aggregate (accepting would change two aggregates in one transaction); a new Transcripts module now (the Transcript aggregate with versions and segments comes with Cleaning, spec 011; reading the first part does not need it).

## R2 — Reading the beginning of a transcript

- **Decision**: A new read-only gateway method `readTextStart(token, file, maxChars)` returns plain text, at most `maxChars`:
  - **Google document**: the Docs API with tab content; only the tab whose title matches the transcript rule (spec 008 FR-002b), else the first tab. Text runs are joined by paragraph.
  - **`.txt`, `.vtt`, `.srt`**: Drive download with a `Range` header (4 bytes per character, then cut on a character boundary); subtitles lose their cue numbers and timings, `<v Name>` voices become `Name:`.
  - **`.docx`**: download (at most 20 MB), unzip `word/document.xml`, keep the text of `w:t` by paragraph. New dependency **fflate** (small, no dependencies, maintained), justified in Complexity Tracking.
  - **`.doc`** (old binary Word): not read; the analysis fails with `UNREADABLE_FORMAT` and the app's rules on file names still apply.
- **Rationale**: `drive.readonly` (spec 002) already allows reading content; no new consent. Only the first part is read, never stored (FR-002).
- **Alternatives**: convert files to Google documents (writes to Drive); a full Office parser (heavy dependency for one paragraph list).

## R3 — The app's rules before the AI (FR-003, SC-005)

Pure domain functions over the text read, the file names and the linked planned interview:

1. **Date**: the header first (ISO `2026-10-21`, `21/10/2026`, `21 October 2026`, `21 octobre 2026`, with an optional time), then the meeting time in a file name (`meetingOf`, spec 008), then the linked planned interview's date, else the file's date (origin `file-date`).
2. **People**:
   - a participants line (`Participants:`, `Attendees:`, `Invités :`, `Participants :`…) gives the names;
   - else the speaker labels (`Name: text` lines at the start of a line, at most 60 characters before the colon, or `<v Name>`).
   - For a Google document, the other tabs (meeting notes) are read too, up to 3,000 characters, for the invited people: a first name found in the transcript (by the rules or the AI) takes the full name of the one invited person who has it. The invited list stays in the app.
   - Labels keep the person only: what comes before " -", "(", "|" or "[" (company, site, version) is the name; the AI is asked for first and last name only, and its names go through the same rule.
   - Names matching **one** team member (all name words, ignoring case and accents) are interviewers; the others are interviewees.
   - When a planned interview is linked, the one person found whose name shares a word with its interviewee is the interviewee, the others are interviewers.
   - Otherwise, without a team member among the people found, the roles are not known, even with a single speaker: interviewers often speak alone first (introduction, consent). The app reads up to 8,000 characters, then asks the AI.
   - The linked planned interview's interviewee and interviewers fill what is still missing (origin `planned`).
3. **Language**: counts of common English and French words in the text read; the larger wins when it is at least twice the other, else `other` (English kinds in names).
4. **The AI** is called only when interviewees or the date are still missing, or when the speakers found cannot be told apart (no member among them and more than one speaker). No call for a session without transcript.

## R4 — What goes to the AI (FR-004, SC-003)

- **Decision**: The AI gets the instructions and the text read only. Names of the schedule and of team members are never added to the request. The app matches the names returned against them.
- **Anonymisation on**: before sending, every name already known to the app (planned interviews of the study, the session's roster, team members) is replaced in the text by a placeholder (`[Person 1]`…), whole words, ignoring case and accents. The answer is mapped back by the app; a quote is checked against the text sent.
- **Output**: schema-constrained (`generateObject`): `interviewees[] {name, quote}`, `interviewers[] {name, quote}`, `date {value YYYY-MM-DD, quote} | null`. Validated by Zod; a quote is kept only when found in the text sent (`normaliseQuote`: lower case, spaces collapsed, straight apostrophes); names limited to 120 characters, 10 people per role.
- **Alternatives**: send member names so the AI tells roles apart (spec 008 FR-013 forbids names of the app to the AI); no AI at all under anonymisation (loses the main value).

## R5 — Costs (FR-010, SC-004)

- **Decision**:
  - Each call carries `ref = session-analysis:<sessionId>`. `gateway.generateObject` gets a `ref` option, like `stream` already has.
  - **Per row**: the sum of the ledger entries of that ref, for **every** account. The study's team sees the cost of its interviews whoever ran them. A new store read `usageByRefsAll(refs)` serves it, through a new `studyCosts(refs)` exported by the AI gateway.
  - **Total**: the sum over the study's sessions.
  - **Estimate**: `estimateCost(accountId, inputChars, outputTokens)` from the person's model price, at about 4 characters per token. The number of sessions needing the AI is not known before reading, so the confirmation shows a maximum: every session with a transcript.
- **Rationale**: ledger stays single and append-only; costs at read time from the dated catalog (spec 005).

## R6 — Running all analyses (FR-012)

- **Decision**: a pg-boss queue `ingestion.analysis`, policy `exclusive` with the study id as key: one run per study. The run row (`ingestion_analysis_runs`) keeps who started it, the sessions it covers, and `stopRequested`.
  - The worker analyzes 3 sessions at a time, checks `stopRequested` between sessions, and writes each session's analysis state: waiting, analyzing, done, failed with a reason.
  - A stale run (no progress for 10 minutes) can be replaced.
  - **One row** ("Analyze" on a row) runs in the HTTP request: the app's rules plus at most one AI call, under a time limit of 2 minutes (update 2026-10-30: long transcripts hit the default limit of 15 seconds, reported as `UNREACHABLE`; the person waits on the row for that long at most). It is refused while a run covers that session.
- **Rationale**: same pattern as the inventory (spec 002); a request per row keeps the single-row action immediate.

## R7 — Writing the analysis without losing a person's change (FR-008, edge cases)

- **Decision**: the worker writes only the analysis part of the session, with a version check; on `stale` it re-reads and writes again (3 attempts). The analysis never writes roster, title, date or language. Accepting writes those and the proposal status, with the version the person saw.
- A proposal equal to the current value is stored as `already-set`. Proposals of a session whose files changed (file version or files list differ from those read) are shown "files changed since".

## R8 — Normalised name (FR-007)

- **Decision**: a pure function `normalisedName({date, interviewees, interviewers, language, anonymised, pseudonyms}, file)`:
  - the parts are `YYYY-MM-DD – A & B – C & D – Kind.ext`;
  - the kind comes from the file: transcript → `Transcript`/`Transcription`, video → `Video`/`Vidéo`, audio → `Audio`, attachment → its own name without the date and the people;
  - two files of one kind get numbers;
  - `/ \ : * ? " < > |` become `-`;
  - names are shortened (the last words dropped, then cut with `…`) so that the part before the kind is at most 120 characters.
- The title of the session becomes the name without its kind.

## R9 — Renaming in Drive (FR-009)

- **Decision**: `DriveDocuments.rename(token, fileId, name)` (Drive `files.update` with `name`, `supportsAllDrives`). It needs the write access of spec 007; without it the dialog offers the same consent flow. The rename plan reads each file's metadata first (current name, `canEdit`). Results are returned file by file (`renamed`, `cannot-edit`, `not-found`, `failed`). No retry queue: the dialog keeps the failed ones for "Retry".
- The inventory row of a renamed file is updated in the same request, so the list shows the new name before the next refresh; the file id never changes.

## R10 — Anonymisation and pseudonyms (FR-013)

- **Decision**:
  - **The setting**: `research_studies.anonymised boolean default false`, set by a research command with a version check. Ingestion reads it through `StudyDirectory.getStudyAccess`, which also returns the team id.
  - **Pseudonyms**: kept in ingestion, in `ingestion_pseudonyms (study_id, name_key, code)`, unique by `(study_id, name_key)` and by `(study_id, code)`. `name_key` is the interviewee's name, normalised (lower case, no accents, single spaces). Codes are assigned when names are built, in the order of interview dates, from the largest code + 1, and never reused.
- **Alternatives**: workspace participants (Evidence context, later); pseudonyms on roster entries (lost when a roster entry is retyped).

## R11 — Attachments (FR-014, US5)

- **Decision**: "other" files of the same group whose meeting title (`meetingOf`) equals the session's, or that share a rare word with its files, are proposed. A session keeps the attachments a person added (`attachments: {fileId}[]`). A file belongs to at most one session, as media do; the store's `media-taken` check covers attachments.

## R12 — Team members for interviewers

- **Decision**: a `Members.ofTeam(teamId)` port (workspace `team-directory`), giving `{id, name}` of active members of the study's team, used only by the app's rules (never sent to the AI). It replaces "This is me" as the only member pick in the analysis.

## R13 — Consent before sending (FR-011)

- **Decision**: `ingestion_analysis_consents (account_id, study_id, provider, given_at)`. Analyze calls carry `consent: true` once the person confirmed; the server answers `ANALYSIS_CONSENT_REQUIRED` while no consent matches the person's current provider (`gateway.providerOf(accountId)`).
