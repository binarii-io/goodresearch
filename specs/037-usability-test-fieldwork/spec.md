# Feature Specification: Usability test fieldwork — the test sessions found in the study folder

**Feature Branch**: `037-usability-test-fieldwork`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Usability test studies, part 2: Fieldwork (« Passation »). On a usability test study, the Fieldwork phase lists the test sessions found in the study's Drive folder, as interview studies do for their interviews (specs 008 and 009), adapted to usability tests: a session is anchored on its video recording, which is required, with an optional transcript and optional other recordings. Each video file gives one proposed session; the app groups a transcript and other files with it by the same rules as interviews, and the person validates or excludes each session. The participant and the facilitator(s) are proposed by the app's rules first, then by the AI only for what is missing, from the transcript's beginning when there is one; names go to the AI only under the folder consent and never for a study set to anonymise names. Accepted names rename the session's files in Drive with the convention of spec 009. The phase shows per session its video duration, whether a transcript exists, and the protocol version it was run against. Readiness: a session needs a video, a validated participant and a protocol version. The assistant can count and list sessions and propose validating or excluding them. Out of scope: transcribing videos, the AI video analysis, scheduling, storing videos."

## Clarifications

### Session 2026-11-07

Decided by default, following specs 008, 009 and 025; each can be revisited at `/speckit-clarify`:

- Q: What is a test session? → A: A **Session** of the context map, as for interviews, on a usability test study: one test occurrence, anchored on **one video file**, with at most one transcript and other recordings (audio). In French the UI says « séance », not « entretien ».
- Q: What gives a session? → A: **Each video file** of the folder, where an interview study starts from each transcript. A transcript or audio file that no video claims gives no session: it is listed under the folder's other files, with a warning that a session needs its video.
- Q: Is there a schedule to link? → A: No: usability tests have no planned sessions in the app (spec 036). The planned-interview link, its suggestion and "Add to the schedule" of specs 008–009 do not apply.
- Q: Which protocol version does a session use? → A: The app keeps every saved version of the test protocol; a session is proposed the **latest version saved before its date**, and a person can choose another. A protocol saved after all sessions does not move them.
- Q: Where do names come from without a transcript? → A: From the app's rules only (file names, meeting titles, team members). The AI reads only a transcript's beginning, never the video or the audio, in this spec.

Clarified with the requester (`/speckit-clarify`):

- Q: Without a transcript, should the AI listen to the beginning of the video's audio to propose the participant and facilitator? → A: **Not in this spec**: the app's rules only, else typed by the person. **The next spec MUST bring it**: once a session is transcribed from its video, the people the rules did not find are proposed from that transcript. (Updated 2026-11-08: the video analysis spec transcribes the sessions and carries this promise, Lexicon and Enrichment being dropped for now.)
- Q: Can a session exist without a video (an in-person test with notes, a lost recording)? → A: **No**: every session has its video; a transcript or notes alone are listed with "a session needs its video". A test without video belongs in an interview study.
- Q: Do usability test studies keep the Lexicon and Enrichment phases of spec 036? → A: **Not for now** (requester's decision, 2026-11-08): the tabs are Preparation, Fieldwork, Analysis. The video analysis transcribes the sessions itself; a lexicon may come back if domain terms are often wrong.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the test sessions found in the folder (Priority: P1)

On the Fieldwork tab of a usability test study whose folder is attached, the person sees one row per test session found: each video file gives one, with the transcript and other recordings grouped with it. A row shows the video file, its duration, whether a transcript was found, the group (first-level sub-folder), the date, the participant and facilitator(s) when known, the protocol version, and the state: to decide, validated or excluded. A summary counts sessions per state, with video hours in total.

**Why this priority**: The team must know which sessions were run and where their videos are before anything else (transcripts, analysis) can use them.

**Independent Test**: Attach a folder with three videos, two transcripts and an audio file; see three proposed sessions, each with its video, duration, the transcripts matched to two of them, and the audio where it belongs.

**Acceptance Scenarios**:

1. **Given** a usability test study with a folder holding videos, **When** the inventory runs, **Then** each video gives one proposed session, with its duration read from the source, its group and its date.
2. **Given** a transcript and a video with the same meeting title or close timestamps in a group, **When** sessions are proposed, **Then** the transcript is matched to that session by the matching policy of interviews (spec 008 FR-003).
3. **Given** a transcript no video claims, **When** the tab is shown, **Then** it is listed with "No video: a session needs its recording" and gives no session.
4. **Given** a refresh after new videos arrived, **When** the inventory ends, **Then** new videos give new proposed sessions and the person's earlier decisions are kept.
5. **Given** a validated session whose video is no longer in the folder, **When** the tab is shown, **Then** it is kept and marked "video missing in Drive".

---

### User Story 2 - Decide the people, the name and the protocol version of a session (Priority: P1)

The person opens a session: the app proposes who took part and who facilitated, the date, the language and the normalised name, from its rules first (file names, meeting titles, a participants list written by the call tool, team members as facilitators), then the AI only for what is missing, from the beginning of the transcript when there is one. Each AI proposal carries a quote checked in the transcript. The person accepts, edits or rejects each proposal. Accepting the name renames the session's files in Drive (`YYYY-MM-DD – Participant – Facilitator(s) – Video`, `… – Transcript`, `… – Audio`). The session also shows the protocol version proposed for its date, which the person can change.

**Why this priority**: The later analysis needs to know who the participant was (or their pseudonym) and which tasks to judge each session against.

**Independent Test**: Analyse a session with a call-tool transcript; see the participant proposed with a quote, the facilitator matched to a team member, accept the name, see the files renamed; change its protocol version.

**Acceptance Scenarios**:

1. **Given** a session whose video and transcript come from a call tool, **When** it is analysed, **Then** the date and participants written by the tool are proposed by the app's rules, with no AI.
2. **Given** a session with a transcript and a participant the rules did not find, **When** it is analysed with the folder consent given, **Then** the AI reads the transcript's beginning and proposes a participant with a quote found in it; a proposal without a valid quote is dropped.
3. **Given** a session without transcript, **When** it is analysed, **Then** no AI is called, only the rules propose, and the session says the participant must be entered when the rules found nobody.
4. **Given** a study set to anonymise names, **When** a session is analysed, **Then** no name reaches the AI, and the proposed name uses the participant's pseudonym (`P01`…).
5. **Given** an accepted name, **When** it is saved, **Then** the session's files are renamed in Drive at once with the person's own access, and the row says "Files named in Drive" or which files could not be renamed.
6. **Given** two protocol versions saved before and after the session's date, **When** the session is shown, **Then** the earlier one is proposed; the person can choose another version, and the choice is kept.

---

### User Story 3 - Validate or exclude sessions, and know which are ready (Priority: P1)

The person validates a session or excludes it with an optional reason, and can reopen a decided one. A session is **ready for analysis** when it is validated, has its video in the folder, a participant accepted (or a pseudonym on an anonymised study) and a protocol version. The tab shows how many are ready and why the others are not.

**Why this priority**: Only sessions a person vouched for go to the costly video analysis of the next phase.

**Independent Test**: Validate two sessions, exclude one with a reason, leave one without participant; see "2 ready", and the reason the third is not.

**Acceptance Scenarios**:

1. **Given** a proposed session, **When** the person validates it, **Then** it records who and when, against the version seen ("changed meanwhile" otherwise).
2. **Given** a session excluded with a reason, **When** the person reopens it, **Then** it goes back to "to decide" with its proposals kept.
3. **Given** a validated session without accepted participant, **When** the tab is shown, **Then** it is not ready, with the reason "participant to confirm".
4. **Given** a study whose protocol was never saved, **When** the tab is shown, **Then** no session is ready, with the reason "no test protocol" and a link to Preparation.

---

### User Story 4 - Work on sessions with the assistant (Priority: P2)

On a usability test study, the assistant counts the sessions by state and readiness, lists them by filters (to decide, without transcript, not analysed, not ready, by name), proposes analysing them (with the most it can cost), accepting suggestions, validating or excluding sessions through the cards of spec 025, and says the next step: validate the sessions, then the next phase.

**Why this priority**: Same journey as for interviews; the screen already allows each action.

**Independent Test**: Ask "where are the sessions?", get counts; ask to validate the ready ones, apply the card.

**Acceptance Scenarios**:

1. **Given** a usability test study, **When** the assistant counts sessions, **Then** it gets counts by state, readiness and video hours, with no name.
2. **Given** the folder consent for this study and provider, **When** it lists sessions, **Then** names and undecided suggestions are given, never transcript text; without consent, or on an anonymised study, only counts.
3. **Given** a validation card, **When** the person applies it, **Then** the same rules as on the screen hold, line by line.

---

### Edge Cases

- Two videos of the same session (a screen recording and a camera recording): they give two proposed sessions; the person merges them by moving one session's main video into the other, as for media files of interviews (spec 008 FR-008): the emptied session is removed and its other files follow; the target keeps its main video and the moved one becomes a recording. Only undecided sessions can be merged.
- A video without readable duration (still processing at the source): the duration shows "unknown" and the session is not ready until the next inventory reads it.
- A very long video (over 45 minutes): accepted; the next phase cuts it, nothing changes here.
- A file renamed in Drive by hand after the name was accepted: the row shows "Rename in Drive (N)" as for interviews.
- The protocol is changed after sessions were run: sessions keep their version; a new session gets the new one if its date is later.
- The folder replaced or detached: sessions are discarded with the inventory, after a confirmation that says how many.
- A Google document transcript: only its transcript tab is read (spec 008 FR-002b); meeting notes without a transcript tab are other files.
- A summary, not a transcript (spec 009 FR-023): treated as an other file of the session, never read by the AI.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After each inventory of a usability test study, the app MUST add one session per video file that no session holds yet, and remove sessions no person decided whose video is no longer in the inventory; a person's decisions MUST be kept.
- **FR-002**: Transcripts and other recordings MUST be matched to at most one session, within the same group, by the matching policy of interviews (spec 008 FR-003); a file MUST belong to at most one session; files of a decided session MUST NOT be used by another.
- **FR-003**: A transcript or audio file that no video claims MUST give no session and MUST be listed with a warning that a session needs its video; no session can be created without a video, by the app or by a person.
- **FR-004**: Each session MUST show its video's duration as read from the source's metadata, or, when the source gives none, from the video file's own header (an MP4's movie header, read by a few small ranges; unknown when neither says), whether it has a transcript, its group, date, people, protocol version and state; the tab MUST sum sessions per state and video hours.
- **FR-005**: The person MUST be able to validate, exclude with an optional reason (at most 500 characters), and reopen a session; each decision records who and when and checks the version seen.
- **FR-006**: The person MUST be able to move videos, transcripts and other recordings between undecided sessions, set the title (at most 120 characters) and the people (participants 1–10, facilitators 0–10, each facilitator linked to a team member when exactly one matches), as for interviews.
- **FR-007**: Analysing a session MUST apply the rules of spec 009 first (date and time in file names or headers, participants written by the call tool, team members), then call the AI only for what is missing and only when the session has a transcript, reading its beginning as spec 009 FR-002 does. The AI MUST never receive the video or the audio in this spec.
- **FR-008**: Names MUST reach the AI only under the folder consent of spec 022 for this study and provider, and never for a study set to anonymise names; with anonymisation, proposed names and titles MUST use pseudonyms. Each AI proposal MUST carry a quote verified in the transcript, or be dropped.
- **FR-009**: The normalised name MUST follow spec 009 FR-007 with the participant in place of the interviewee and the facilitators in place of the interviewers (`YYYY-MM-DD – Participant – Facilitator(s) – Kind`, kinds `Video`, `Transcript`, `Audio` and their French forms). Accepting it MUST rename the session's files in Drive at once with the person's own access, as spec 009 FR-027, and the row MUST say whether the files carry it (FR-028).
- **FR-010**: The app MUST keep every saved version of a study's test protocol (content and date), never changed afterwards, so that a session can refer to the tasks it was run against.
- **FR-011**: Each session MUST have a protocol version: the latest saved before the session's date, proposed by the app; a person MUST be able to choose any saved version, and that choice MUST be kept when the protocol changes.
- **FR-012**: A session MUST be **ready for analysis** when it is validated, its video is in the folder with a known duration, a participant is accepted (or a pseudonym on an anonymised study), and it has a protocol version. The tab MUST show the count of ready sessions and, for each other session, the first missing condition.
- **FR-013**: Each AI call MUST be in the usage ledger with the session it was for, and the cost MUST be shown per session, in its dialog and in total for the study, as spec 009 FR-010; "Analyse sessions" MUST run in the background with stop and per-session state, one run per study.
- **FR-014**: The assistant's interview tools (spec 025) MUST work on a usability test study with session wording: counts by state, readiness and video hours (no name); lists by filters (to decide, without transcript, not analysed, not ready, by name) under the folder consent; cards to analyse, accept suggestions, validate and exclude. The next step MUST be computed by the app: protocol, folder, publication, checks (spec 036), then sessions to decide, then sessions to make ready, then the next phase.
- **FR-015**: Interview studies and survey studies MUST behave as before; a usability test study MUST show no schedule, no planned-interview link and no "Add to the schedule".
- **FR-016**: Sessions MUST follow the study's access rules (spec 026): reserved to the owning team and admins, with the person's own folder access. Nothing is deleted in Drive; videos are never copied or stored by the app in this spec.
- **FR-017**: All texts MUST exist in English and French, with « séance » for a test session and « animateur » for a facilitator; the tab, its dialogs and controls MUST meet WCAG 2.2 AA.

### Key Entities

- **Session** (Ingestion, extended): on a usability test study, anchored on its main video; transcript optional; other recordings; video duration; protocol version; state, people, title, decisions as for interviews.
- **Protocol version** (Research): an immutable copy of a saved test protocol, with its number and date; the tasks a session is judged against.
- **Session readiness** (computed, never stored): ready, or the first missing condition (not validated, video missing, duration unknown, participant to confirm, no protocol).
- **Session analysis** (Ingestion, as spec 009): proposals of people, date, language, name and attachments, with their origin, quote and status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a folder of 10 videos with their transcripts, 100 % of sessions are proposed with their video and the right transcript after one inventory (checked on a fixture with call-tool file names).
- **SC-002**: No name reaches the AI for an anonymised study or without the folder consent (tested), and no video or audio content reaches it in this spec.
- **SC-003**: A session analysed and accepted gets its files renamed in Drive in one action, and the row tells which, if any, could not be.
- **SC-004**: Every session shows whether it is ready for analysis, and why not, without opening it.
- **SC-005**: A session keeps the protocol version it was given when the protocol is saved again (tested).
- **SC-006**: Interview and survey studies behave exactly as before: their existing tests pass unchanged.
- **SC-007**: The tab, the session dialog and the assistant cards have no axe violation in light and dark themes.

## Assumptions

- The inventory, matching, sessions, analysis, renaming, consent and assistant cards of specs 008, 009, 022, 024 and 025 are reused, not doubled; this spec changes what anchors a session and adds the protocol version and readiness.
- The source gives a video's duration in its metadata for most files (checked on the trial's six recordings); when it does not, the duration is unknown until a later inventory.
- The trial's sessions (six recordings of a data-model test) informed the shapes; no recording, name or result from them enters the code, tests or docs.
- The video analysis spec that follows commits to proposing the participant and facilitators of sessions without a transcript, from the transcript it makes of their video (requester's decision, 2026-11-07).
- Out of scope: transcribing videos (the video analysis spec), a lexicon, the AI video analysis, its screenshots and clips (Analysis), scheduling or recruiting participants, storing or copying videos.
