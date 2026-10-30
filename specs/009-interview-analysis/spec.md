# Feature Specification: Analyze the interviews

**Feature Branch**: `009-interview-analysis`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Analyze the interviews of the Fieldwork phase (« Passation »): read the beginning of each transcript to propose the interviewee, the interviewers, the date, the language and a normalised file name; the person validates, then the files are renamed in Drive. An optional, per-study anonymisation setting. The team vocabulary (spec 010) and the Cleaning phase (spec 011) come next."

## Clarifications

### Session 2026-10-25

- Q: How is the work split? → A: Three specs. 009: the quick analysis of each interview (people, date, language, name, rename in Drive). 010: the team vocabulary (deep analysis of unusual words across transcripts). 011: Cleaning (corrections of transcription errors, using the vocabulary).
- Q: Which naming convention? → A: `YYYY-MM-DD – Interviewee – Interviewer(s)`, followed by the kind of file: `Transcript` / `Video` / `Audio` (French: `Transcription` / `Vidéo` / `Audio`).
- Q: At which level is the vocabulary kept (spec 010)? → A: Per team, the owner of the projects. Cross-study analysis and a global lexicon come later.
- Q: Anonymisation? → A: An option per study, off by default, that a person can turn on or off.
- Q: Files are often badly named: how does an interview find its planned interview? → A: By the people the analysis found in the transcript, compared with the schedule by the app (no AI: the schedule holds real names and never leaves the app). File name and date come after.
- Q: What if no planned interview matches? → A: The person adds the interview to the schedule in one action (a planned interview, done, with its people and date), linked to it.
- Q: How does the person reach the proposals? → A: From the row: the state "To decide (X)" opens the interview's validation window. The window never opens by itself (a run analyzes many interviews).
- Q: Are the planned interview and the interview the same information? → A: Yes once linked: who and when are kept the same on both sides, both ways.
- Q: A Google document "Notes by …" without transcript? → A: A summary is not a transcript and is not accepted as an interview.
- Q: Should the app still validate interviews found with their transcript? → A: No: the "Validated" switch is off by default; a person validates each interview.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analyze one interview and review the proposals (Priority: P1)

On a row of Fieldwork, the person activates "Analyze" (an icon button). The app reads the beginning of the transcript, the file names and dates, the linked planned interview and the team members. It proposes, each with where it comes from:

- the interviewee(s);
- the interviewer(s), linked to a team member when one matches;
- the date of the interview;
- the language of the interview;
- a normalised name for the files of the interview.

The person opens the interview (pencil) and reviews each proposal: accept, edit or reject. Accepted people fill the roster, the date and language are kept on the interview, and the title follows the name.

**Why this priority**: Today the people and the date are typed by hand for each interview, or not at all. A first reading of the transcript fills most of them in seconds and keeps the person in control.

**Independent Test**: With a transcript whose first lines name "Sam Example" as the person interviewed and the person's own account as the interviewer, "Analyze" proposes both with a quote each, the date, the language and the name `2026-10-21 – Sam Example – <own name>`. The person accepts all, and the roster and the title are updated.

**Acceptance Scenarios**:

1. **Given** an interview with a transcript, **When** the person activates "Analyze", **Then** the app first uses its own rules: a date and time in the file name or the header, a participants list written by the meeting tool, the linked planned interview. It calls the AI only for what is still missing.
2. **Given** the AI is called, **When** it answers, **Then** each proposal carries a quote of the transcript. A proposal whose quote is not found in the transcript is dropped and never shown.
3. **Given** proposals, **When** the person opens the interview, **Then** each one is shown with its origin (file name, meeting tool header, planned interview, AI with its quote) and can be accepted, edited or rejected one by one, or all at once.
4. **Given** a proposed interviewer whose name matches one team member, **When** it is accepted, **Then** the roster entry is linked to that member. Without a single match, it stays a name.
5. **Given** an interview excluded by a person, **When** it is shown, **Then** "Analyze" is not offered until it is reopened. **Given** an interview validated by a person, **When** a person analyzes it again from its row, **Then** what was decided is kept; if the analysis brings something new to decide (a proposal not open before), the interview goes back to "To decide" and what later phases made from it (cleaning, facts) is kept.
6. **Given** an interview without transcript, **When** the person analyzes it, **Then** only the app's rules run (file names, dates, planned interview), without AI.
7. **Given** the person has no AI connection (spec 004), **When** they activate "Analyze", **Then** the app's rules still run and a message explains how to connect an AI provider for the rest.
8. **Given** an analysis, **When** it ends, **Then** its cost is shown on the row and in the Fieldwork total, and recorded in the usage ledger.

---

### User Story 2 - Analyze all the interviews at once (Priority: P1)

"Analyze interviews", on the right of the filters, analyzes every interview of the study that was never analyzed or whose files changed since. A confirmation shows how many interviews will be read and the expected cost. The rows show their progress, and the person can keep working meanwhile.

**Why this priority**: A study has tens of interviews; one click must handle them all.

**Independent Test**: With five interviews, two already analyzed, the button announces three, runs them, and the total cost on the page grows by the cost of the three.

**Acceptance Scenarios**:

1. **Given** interviews never analyzed, **When** the person activates "Analyze interviews", **Then** a confirmation shows the count and the estimated cost, and nothing runs before it is confirmed.
2. **Given** a run in progress, **When** the person looks at Fieldwork, **Then** each row shows waiting, analyzing, done or failed, and the run can be stopped (interviews already analyzed keep their proposals).
3. **Given** one interview fails (file unreadable, AI error), **When** the run goes on, **Then** the others are analyzed and the failed row shows the reason and a retry.
4. **Given** a run in progress for a study, **When** someone starts another one, **Then** they are told a run is already in progress.

---

### User Story 3 - Rename the files in Drive (Priority: P2)

Once the name of an interview is accepted, its files are renamed in Drive (update 2026-10-30: at once, FR-027). The transcript and its recordings get the same base name, followed by their kind (`Transcript`, `Video`, `Audio`). The result is shown file by file.

**Why this priority**: A clear folder in Drive is what the team uses outside the app; but the analysis is useful even without renaming.

**Independent Test**: An interview with "Interview 2 - transcript.txt" and "Extra recording.mp4", once renamed, shows "2026-10-21 – Sam Example – Lee Example – Transcript.txt" and "… – Video.mp4" in Drive, and the next refresh shows the same interview with the new names.

**Acceptance Scenarios**:

1. **Given** an accepted name, **When** the name is accepted, **Then** the files are renamed at once, with no confirmation; "Rename in Drive" on the name's row lists each file left with its current and new name (update 2026-10-30).
2. **Given** the person can edit the files in Drive, **When** the name is accepted, **Then** each file is renamed, its extension kept; the interview keeps its files and decisions.
3. **Given** a file the person cannot edit, or a rename that fails, **When** the renaming ends, **Then** the failed files are listed with the reason, the others stay renamed, and the person can retry the failed ones.
4. **Given** two files of the interview that would get the same name (two videos), **When** the names are built, **Then** they are numbered (`Video 1`, `Video 2`).
5. **Given** a file renamed in Drive by someone else meanwhile, **When** the person confirms, **Then** the new name is still applied and the confirmation showed the name read last.

---

### User Story 4 - Anonymisation of the study (Priority: P2)

In the study settings, "Anonymisation" is off by default. When a person turns it on, the names and titles proposed for the interviews use a pseudonym of the interviewee (`P01`, `P02`…) instead of their name. Names stay in the app only (the roster). Turning it off goes back to names for the next proposals.

**Why this priority**: Some studies must keep the folder free of names; most do not, so it is an option.

**Independent Test**: With anonymisation on, the name proposed for Sam Example's interview is `2026-10-21 – P01 – Lee Example – Transcript`; the roster still shows "Sam Example".

**Acceptance Scenarios**:

1. **Given** a new study, **When** its settings are shown, **Then** anonymisation is off.
2. **Given** anonymisation is turned on, **When** names are proposed, **Then** each interviewee gets a pseudonym assigned once for the study, in the order of the interview dates, and kept even if other interviews are added later.
3. **Given** files already renamed with names, **When** anonymisation is turned on, **Then** the app says how many interviews have a name in their file names and offers new names to rename them.
4. **Given** anonymisation on, **When** the AI is called, **Then** the names already known to the app (planned interviews, roster, team members) are replaced by placeholders in what is sent, and the answer is mapped back by the app.

---

### User Story 5 - Files that belong to an interview (Priority: P3)

The analysis points to other files of the folder that seem to belong to the interview (notes, consent forms, a slide shown during the session) by their names and dates. The person adds them to the interview or ignores them. Added files are renamed with the interview, keeping their own name as the kind.

**Why this priority**: Useful to keep everything of one interview together, but the core is the transcript and its recordings.

**Independent Test**: A file "Sam Example consent.pdf" in the same group is proposed as belonging to Sam Example's interview; once added, it is listed with the interview.

**Acceptance Scenarios**:

1. **Given** an "other" file of the same group sharing a rare word or the meeting title with the interview's files, **When** the interview is analyzed, **Then** it is proposed as an attachment with the reason.
2. **Given** an attachment proposal, **When** the person adds it, **Then** it belongs to this interview only, like a recording.

---

### Edge Cases

- A transcript shorter than the reading window: the whole text is read.
- People not named in the first part: the app reads up to twice the window; beyond that, it proposes nothing for the people.
- Several interviewees (group interview): all are proposed; the name joins them with " & ".
- Several interviewers: joined with " & " in the name, in the roster's order.
- A date found in the file name and another in the header: the meeting tool's header wins, both are shown.
- No date found anywhere: the file's date is proposed, marked as the file date.
- Characters not allowed in a file name (`/`, `\`) are replaced; the name is at most 120 characters before the kind, names shortened first.
- The analysis proposes a value equal to the current one: shown as already set, nothing to accept.
- A person edits the interview while its analysis runs: the analysis proposals are kept as proposals and never overwrite the person's changes.
- A file changes in Drive after the analysis: the proposals stay, marked "files changed since", and "Analyze" is offered again.
- The interview is reopened or its files change: proposals already accepted are kept, the others are dropped at the next analysis.
- A person without access to the folder: they see no analysis, as for the interviews themselves.
- A Google document transcript: only the tab holding the transcript is read.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Fieldwork MUST offer "Analyze" on each row of an interview not excluded by a person (a validated one goes back to "To decide" when the analysis brings something new, its later work kept — update after spec 012), and "Analyze interviews" on the right of the filters for the interviews never analyzed or whose files changed since their last analysis.
- **FR-002**: An analysis MUST read the beginning of the transcript: about the first 4,000 characters, extended once up to 8,000 when no person is found. For a Google document, only the tab holding the transcript is read. Only the analysis reads transcript content; nothing of it is stored except the verified quotes of the proposals.
- **FR-003**: An analysis MUST apply the app's rules first, with no AI: the date and time written in the file name or the header, a participants list written by the meeting tool, the linked planned interview (its interviewee, interviewers and date), the team members. The AI MUST be called only for the fields still missing, and never for an interview without transcript.
- **FR-004**: The AI MUST receive only the read part of the transcript and what it must find. Names of the schedule and of team members MUST NOT be sent to it; the app matches the names it returns against them. With anonymisation on, the names the app already knows MUST be replaced by placeholders in what is sent.
- **FR-005**: Each proposal from the AI MUST carry a quote of the transcript, checked to appear in it (ignoring case, spaces and apostrophe style). A proposal without a valid quote MUST be dropped. Answers MUST be checked against the expected shape; an invalid answer fails the analysis of that interview.
- **FR-006**: An analysis MUST produce at most one proposal per field: interviewees (1–10 names), interviewers (0–10 names, each linked to a team member when exactly one matches), date, language (English or French, else "other"), the normalised name, and attachments (US5). Each proposal records its origin: file name, transcript header, planned interview, AI (with its quote), or file date.
- **FR-007**: The normalised name MUST be `YYYY-MM-DD – Interviewees – Interviewers – Kind`, people joined with " & ", the kind in the interview's language (`Transcript`/`Video`/`Audio`, `Transcription`/`Vidéo`/`Audio`; English when unknown), the extension kept. Characters not allowed in file names are replaced; names are shortened first so the part before the kind is at most 120 characters. Two files of the same kind are numbered.
- **FR-008**: The person MUST be able to accept, edit or reject each proposal, or accept all, in the interview dialog. Accepting people fills the roster; accepting the date and language keeps them on the interview; the title of the interview becomes the accepted name without its kind. Each change checks the version seen ("changed meanwhile"). An analysis MUST never overwrite a value a person set.
- **FR-009**: "Rename in Drive", on the name's row, MUST list each file with its current and new name (update 2026-10-30: an accepted name does not go through this list, FR-027). It renames each file with the person's own Drive access, reports the result file by file, keeps the renamed ones when others fail, and offers to retry the failed ones. It MUST never move, copy or delete a file. A renamed file stays in its interview (same file id).
- **FR-010**: Each AI call MUST go through the AI Gateway with the person's own AI connection and be recorded in the usage ledger with what it was for (the interview). The cost MUST be shown per interview on its row and in its dialog, and in total for the study on Fieldwork. The confirmation of "Analyze interviews" MUST show an estimated cost before running.
- **FR-011**: Before the first analysis of a study by a person, a confirmation MUST say that the beginning of the transcripts will be sent to their AI provider; it is asked again when the provider changes.
- **FR-012**: A run of "Analyze interviews" MUST go on in the background, show the state of each interview (waiting, analyzing, done, failed with its reason), allow stopping it, and allow one run per study at a time. A failure of one interview MUST NOT stop the others.
- **FR-013**: Each study MUST have an "Anonymisation" setting, off by default, that any person with access to the study can turn on or off. When on, the proposed names and titles MUST use the interviewee's pseudonym (`P01`, `P02`…) instead of their name. Pseudonyms are assigned once per interviewee of the study, in the order of interview dates, never reused. Turning it on MUST say how many interviews have a name in their file names and offer to rename them.
- **FR-014**: The analysis MUST propose as attachments "other" files of the same group that share the meeting title or a rare word with the interview's files (rules of the context map, no AI). An added attachment belongs to one interview only and is renamed with it, its kind being its own name without the date and people.
- **FR-015**: Analyses and renames MUST follow the study's access rules (spec 002 FR-010a). Renaming needs the person's own edit access to each file.
- **FR-017**: For an interview no person decided, with no linked or suggested planned interview and a known interviewee (accepted or proposed), Fieldwork and the interview dialog MUST offer "Add to the schedule": it creates a planned interview with that interviewee, the interviewers, the interview date and the status "done", and links it to the interview. "Accept all" also does this, or accepts a planned interview suggested by name, with no question; one suggested by date alone stays to decide (update 2026-10-30).
- **FR-018**: The link suggestion (spec 008 FR-005) MUST first compare the interviewees found in the transcript (accepted, else proposed and not rejected) with the planned interviewees, by name words, a unique best match only, then the file name, then the date (the interview date when known, else the file's). This comparison is done by the app; the schedule is never sent to an AI provider.
- **FR-019**: On each row, "To decide (X)" MUST open the interview with its proposals (FR-020).
- **FR-020**: Every interview MUST wait for a person: an interview found with its transcript is proposed, not validated by the app (this replaces spec 008 FR-002c; interviews validated by the app so far go back to "to decide"). The state column MUST show three states (plus excluded): "Proposed" while the interview is not analyzed, "To decide (X)" once it is analyzed, X being the open proposals plus the planned interview to link or add (opening it MUST open the interview's validation window), and "Validated" once a person turned the switch on. The "Validated" switch is off until a person turns it on.
- **FR-021**: In the validation window, the planned interview MUST be shown as a proposal card like the others: the planned interview as the schedule shows it (person, date, interviewers, status), where the suggestion comes from, and the actions (accept the suggestion, change it, or add the interview to the schedule). Update 2026-10-30: while proposals are open, the window's main action at the bottom is "Accept all" instead of "Validate", which appears once they are decided.
- **FR-022**: An interview and its linked planned interview MUST share who was interviewed, who interviewed and the date: a person's change on one side (accepting or editing a proposal, editing the people, editing the schedule, a change accepted from Drive) MUST be written on the other through its own rules and version check. The schedule keeps its status, role and notes; the interview keeps its member links and files. An interview a person decided is not changed by the schedule. Proposals not accepted never change the schedule.
- **FR-023**: A file whose beginning (from 1,000 characters on) has no speaker turns and no timestamps is a summary, not a transcript: the analysis MUST NOT call the AI for it, and the app MUST exclude the interview with the reason "a summary, not a transcript"; a person can reopen it.
- **FR-024**: A failed AI call without counted tokens MUST cost nothing in the totals (a failure after the answer records its tokens); only a stopped answer stays of unknown cost.
- **FR-025**: For a Google document, the invited people of its meeting notes (another tab) MUST complete the first names found in its transcript into full names, when exactly one invited person matches.
- **FR-026**: "Analyze interviews" MUST offer to analyze again the interviews already analyzed (not decided by a person); the count and the most it can cost follow the choice, and decided proposals are kept.
- **FR-027**: Accepting or changing the name of an interview MUST rename its files in Drive at once, with no confirmation (update 2026-10-30). A window shows only for the editing consent the first time, after which the renaming goes on by itself; files that cannot be renamed are reported in a short message and stay on the name's row (FR-028).
- **FR-028**: Once a name is accepted, its row MUST show whether the files in Drive (as the last inventory saw them) carry it: "Files named in Drive", or "Rename in Drive (N)" with N the files whose name differs — a file renamed in Drive afterwards shows again after the next refresh.
- **FR-016**: All texts MUST exist in English and French; the new buttons, dialogs and settings MUST meet WCAG 2.2 AA.

### Key Entities

- **Interview analysis** (Ingestion, per Session): the last analysis of an interview: when, by whom, the state (waiting, analyzing, done, failed with a reason), the files it read (and their version, to know they changed), its cost reference, and its **proposals**.
- **Proposal**: one field proposed by an analysis (interviewees, interviewers, date, language, name, attachment), its value, its origin and quote, and its status (proposed, accepted, edited, rejected).
- **Analysis run**: one "Analyze interviews" over a study: who started it, the interviews it covers, stopped or finished.
- **Session** (spec 008): gains the interview date and language accepted by the person, and attachments (other files).
- **Study setting "Anonymisation"** and the **pseudonyms** of the study's interviewees.
- **Rename**: for one interview, each file with its old and new name and its result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the reference test folder, the analysis proposes the right interviewee and date for every transcript whose first part names them, and makes no proposal backed by a quote absent from the transcript (tested).
- **SC-002**: A person can fill the people, date and name of an interview in three actions: analyze, accept all, rename.
- **SC-003**: No name of the schedule or of team members is sent to an AI provider; with anonymisation on, no name already known to the app is sent (tested).
- **SC-004**: Every AI call of the analysis appears in the usage ledger, and the cost on Fieldwork equals the sum of the ledger entries of the study's analyses (tested).
- **SC-005**: Interviews whose fields are found by the app's rules alone cost nothing: on the reference folder, transcripts written by a meeting tool with a participants list and a date are analyzed without any AI call.
- **SC-006**: A rename never loses a file: after renaming, the next refresh shows the same interviews with the same files and decisions (tested).
- **SC-007**: The analysis of 50 interviews completes in under 10 minutes with a standard AI provider, and the page stays usable meanwhile.
- **SC-008**: The new buttons, dialogs and settings have no axe violation in light and dark themes.

## Assumptions

- The people are named in the first minutes of most interviews (introductions); when they are not, the person fills them in by hand.
- The interview language is English or French; other languages are shown as "other" and get English kinds.
- Pseudonyms are per study for now; workspace-wide participants with stable pseudonyms come with the Evidence context.
- Anonymisation here changes names and titles only; replacing names inside the text is done by the Cleaning phase (spec 011).
- The estimated cost uses the read size and the person's model price from the pricing catalog (spec 005); the real cost comes from the ledger.
- Days (interview date, schedule date) are compared by their UTC day: an interview planned near midnight may show the next or previous day. A study time zone would fix it (not in this spec).
- Out of scope: the team vocabulary (spec 010), corrections of the text (spec 011), transcribing recordings, speaker mapping, renaming the group folders.
