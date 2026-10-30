# Feature Specification: Fieldwork — the interviews found in the study folder

**Feature Branch**: `008-fieldwork-sessions`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "The second phase, Fieldwork (renamed « Passation » in French), lists each interview found with a transcript in the study's Drive folder. The app suggests the planned interview each one belongs to and the person confirms. Cleaning the transcripts becomes a later phase between Fieldwork and Analysis, in its own spec."

## Clarifications

### Session 2026-10-25

- Q: What does this feature cover? → A: Only the Fieldwork phase. Cleaning the transcripts (corrections proposed by the assistant, optional pseudonymisation) is a later spec that adds a phase between Fieldwork and Analysis.
- Q: How is the phase named? → A: « Passation » in French. English keeps "Fieldwork".
- Q: What is an interview here? → A: A **Session** of the context map: one interview occurrence, with at most one transcript file and its recordings (media files). In this feature, each transcript file of the folder gives one proposed interview.
- Q: How are interviews linked to the planned interviews of the schedule (spec 006)? → A: The app suggests the link and the person confirms or changes it. Transcripts without a link stay listed, and planned interviews without a transcript are shown too.
- Q: Who suggests the link? → A: The app, with fixed rules (no AI). The schedule holds names of real people and never goes to an AI provider (spec 006 FR-013).
- Q: Where does the source folder go? → A: To the Fieldwork phase, where the files arrive. Attaching, refreshing and the inventory (spec 002) move from Analysis to Fieldwork unchanged. Analysis says what is coming later.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the interviews found in the folder (Priority: P1)

On the Fieldwork phase of an interview study whose folder is attached, the person sees one row per interview found. Each transcript file of the folder gives one interview, proposed by the app. A row shows:

- the transcript file and its group (first-level sub-folder);
- its date (the file's last modification);
- the recordings matched to it;
- its state: proposed, validated or excluded.

A summary counts the interviews per state. After each inventory (attach or refresh), new transcripts appear as new proposed interviews. The person's earlier decisions are kept.

**Why this priority**: The team needs to know which interviews were run and which files hold them before anything else can use them (cleaning, analysis).

**Independent Test**: Attach a folder with three transcripts and two recordings, see three proposed interviews, each with its file, group and date, and the recordings matched to them.

The phase opens on an overview: interviews found (validated, to review, excluded), interviews with a transcript, interviews with a recording (videos and audio), planned interviews with and without a transcript. Each row shows who was interviewed and who interviewed (from the people of the interview, else from the linked planned interview) and its files as icons (text, video, audio).

**Acceptance Scenarios**:

1. **Given** an interview study with an attached folder holding transcripts, **When** the person opens Fieldwork, **Then** they see one proposed interview per transcript, with its file name (a link opening it in Drive), group and date, newest found first; a row does not move when its files change (update 2026-10-30).
2. **Given** a folder with recordings, **When** interviews are proposed, **Then** each recording is matched to at most one interview with the matching rules of the context map: same group only; same date and time gives high confidence; the same day within 15 minutes, or a shared rare word in the file names, gives medium; a shared rare word without dates gives low. The confidence and its reason are shown.
3. **Given** a refresh of the inventory, **When** new transcripts are found, **Then** they become proposed interviews. Validated or excluded interviews and their files are not changed. Proposed interviews whose transcript is gone are removed.
4. **Given** a folder without any transcript, **When** Fieldwork is shown, **Then** it explains that transcripts dropped in the folder appear here after a refresh, and shows the recordings found.
5. **Given** a study without a folder, **When** Fieldwork is shown, **Then** it offers to attach the folder (spec 002 flow, moved from Analysis).

---

### User Story 2 - Link each interview to a planned interview (Priority: P1)

For each proposed interview, the app suggests the planned interview of the schedule it belongs to. It compares the person interviewed (name or first name found in the file name) and the planned date and time with the file's date. The person confirms the suggestion, picks another planned interview, or leaves it unlinked. The schedule shows, for each planned interview, whether a transcript was found.

**Why this priority**: The schedule says who was interviewed when. Linking it to the files tells the team which interviews are done and which are still missing, without counting by hand.

**Independent Test**: With planned interviews "Sam Example" on Monday and "Lee Example" on Tuesday, and files "Interview Sam.docx" and "Lee 2026-10-21.txt", the app suggests the right links. The person confirms one and changes the other.

**Acceptance Scenarios**:

1. **Given** a planned interview whose interviewee name (or first name) appears in a transcript file name, **When** interviews are proposed, **Then** that planned interview is suggested, with the reason ("name in the file name").
2. **Given** no name match, **When** a planned interview has a date within 24 hours of the transcript's date and no other planned interview is that close, **Then** it is suggested with the reason ("same date"). With several candidates, nothing is suggested and the person picks.
3. **Given** a suggestion, **When** the person confirms it or picks another planned interview, **Then** the link is saved. A planned interview is linked to at most one interview; picking one already linked asks to move the link.
4. **Given** a linked planned interview whose status is not "done", **When** the person validates the interview, **Then** the planned interview is marked "done", with no question (update 2026-10-30).
5. **Given** the schedule on the Preparation tab, **When** a planned interview is linked, **Then** its row shows that its transcript was found, with a link to the Fieldwork phase.
6. **Given** planned interviews without any linked interview, **When** Fieldwork is shown, **Then** they are listed as "no transcript yet", with their status and date.

---

### User Story 3 - Validate or exclude an interview (Priority: P1)

The person reviews each proposed interview. They can:

- change the recordings matched to it (add one from the unmatched recordings, remove one);
- give it a title (by default, the linked interviewee or the file name);
- set its people: interviewers and interviewees, prefilled from the linked planned interview;
- validate it;
- exclude it (a test, a duplicate, not an interview).

Validated and excluded interviews are frozen: a refresh never changes them, and their files cannot be used by another interview. "Back to review" reopens one.

**Why this priority**: Only validated interviews go on to the next phases. The decision must stay with the person (AI proposes, humans decide, here the app's rules propose).

**Independent Test**: Validate one interview with a recording, exclude another, refresh: both stay as decided. Reopen the excluded one, which is proposed again.

**Acceptance Scenarios**:

1. **Given** a proposed interview, **When** the person validates it, **Then** its state becomes validated, its files are frozen, and who validated it and when are recorded.
2. **Given** a proposed interview, **When** the person excludes it with an optional reason, **Then** it is shown as excluded (filterable). Its transcript is never proposed again until reopened.
3. **Given** a decided interview, **When** the person activates "Back to review", **Then** it becomes proposed again with its files and people kept.
4. **Given** two people decide the same interview at the same time, **When** the second saves, **Then** they get "changed meanwhile" and nothing is overwritten.
5. **Given** the people of an interview, **When** the person edits them, **Then** each person has a name (1–120 characters) and a role, interviewer or interviewee. An interview has at most 10 people. An interviewer can be marked as the person's own account ("This is me"); picking other members needs a member list open to everyone and comes later.
6. **Given** a recording already used by a validated interview, **When** the person tries to add it to another interview, **Then** it is not offered.

---

### Edge Cases

- A study of another type than interviews: Fieldwork keeps the "coming later" text.
- A person without access to the folder (spec 002 FR-010a): they see neither the interviews nor the file names, as for the inventory today.
- A transcript renamed in Drive: still the same file (Drive id); its interview keeps its decision and shows the new name after the next refresh.
- A transcript deleted or moved out of the folder in Drive: a proposed interview is removed at the next refresh. A validated one is kept and marked "file missing in Drive"; it can be reopened or excluded, never deleted automatically.
- The same name in several planned interviews: no name suggestion (ambiguous); the date rule may still apply.
- A planned interview deleted from the schedule: the link is removed, and the interview stays with its people.
- The folder is replaced or detached (spec 002): all interviews of the study are discarded with the inventory, after the same confirmation, which now names how many interviews will be lost.
- Short names (two letters or less) and common words are never used for the name rule.
- Large folders: up to 500 transcripts per study; beyond that, the first 500 by date are proposed and a message says so.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001a**: Once the folder has an inventory, it MUST be shown in the page bar as a folder icon: its name and "Click to change" on hover, and a dialog (refresh, replace, detach) on click; the Fieldwork phase then shows the interviews only. A "Refresh" button sits in the tab bar of the interviews.
- **FR-001**: The study phases MUST be Preparation, Fieldwork, Analysis. In French, Fieldwork MUST read « Passation ». The source folder, its attachment, its refresh and its inventory (spec 002) MUST move from Analysis to Fieldwork without any change of behaviour. Analysis MUST say that analysis comes in a later version.
- **FR-002**: After each successful inventory of an interview study, the app MUST add one interview (Session) per transcript file that no interview holds yet (validated by the app, FR-002c), and remove interviews no person decided whose transcript is no longer in the inventory. It MUST never change an interview a person validated or excluded. At most 500 interviews per study.
- **FR-003**: Each media file MUST be matched to at most one interview, only within the same group, with the matching policy of the context map: timestamps within 1 minute → high; within 15 minutes, or a shared rare word (appearing in at most 3 files of the group) on the same day → medium; shared rare word without dates → low; different days (UTC) → never. The best match wins; ties are left unmatched. The confidence and its reason MUST be shown.
- **FR-002c**: An interview found with its transcript MUST be validated by the app when it is proposed; one without transcript stays to review. A "Validated" switch on each row lets a person validate or undo it at once. A validation by the app keeps the interview open to changes (links, recordings, a later inventory) until a person decides; a person's decision (switch, validate, exclude) freezes it.
- **FR-002a**: A recording that no transcript claims MUST get an interview of its own, without transcript, shown with a warning ("No transcript"). The app remakes such rows at each inventory while nobody worked on them (a recording that finds its transcript joins it); once a person changed one (title, link, people, recordings) it is kept like any other. Its recordings stay offered to other interviews until a person validates or excludes it; adding one elsewhere takes it from the row, which goes once empty.
- **FR-002b**: A Google document is an interview file only when one of its tabs holds the transcript (a tab title containing "Transcript" or "Transcription"); meeting notes without such a tab are listed in the inventory as other files and give no interview. Only tab titles are read; a document whose tabs cannot be read stays a transcript.
- **FR-004**: A file MUST belong to at most one interview. A file of a validated or excluded interview MUST NOT be used by another one.
- **FR-005**: For each proposed interview without a link, the app MUST suggest at most one planned interview of the study's schedule:
  Only planned interviews not linked to another interview are considered.
  1. **By name**: the planned interview whose interviewee shares the most name words (at least 3 letters) with the transcript file name (ignoring case and accents), if no other shares as many.
  2. **By date**: otherwise (no name match, or a tie), the only planned interview within 24 hours of the transcript's date.

  Rule 1 wins over rule 2. The reason MUST be shown. Suggestions MUST be computed by the app, never by an AI provider.
- **FR-006**: The person MUST be able to confirm the suggestion, link another planned interview of the same study, or remove the link. A planned interview MUST be linked to at most one interview; linking one already linked MUST ask to move the link.
- **FR-007**: The person MUST be able to validate a proposed interview, exclude it with an optional reason (at most 500 characters), and reopen a decided one ("Back to review"). Each decision MUST record who and when, and check the version seen ("changed meanwhile").
- **FR-008**: The person MUST be able to change the media files of a proposed interview (from the files no other interview uses: a recording is first removed from the interview that holds it), set its title (at most 120 characters), and set its people: 0 to 10 entries, each with a name (1–120 characters), a role (interviewer or interviewee) and, for interviewers, an optional workspace member (in the UI, the person's own account). When a planned interview is linked, its interviewee and interviewers prefill the people. Decided interviews MUST be reopened before these changes.
- **FR-009**: When an interview linked to a planned interview not marked "done" is validated, the app MUST mark the planned interview "done" with no question (update 2026-10-30), changing its status through the schedule's rules (spec 006).
- **FR-010**: Fieldwork MUST list the interviews (filterable by state and group, sorted by the date the interview was found, newest first, so that a row does not move when its files change; update 2026-10-30), a summary per state, and the planned interviews without a linked interview. The schedule on the Preparation tab MUST show for each planned interview whether an interview is linked.
- **FR-011**: A validated interview whose transcript is no longer in the inventory MUST be kept and marked "file missing in Drive".
- **FR-012**: Replacing or detaching the folder MUST discard the study's interviews with its inventory; the confirmation MUST say how many interviews will be discarded. Deleting a study MUST delete its interviews. Deleting a planned interview MUST remove its link only.
- **FR-013**: Interviews MUST follow the study's access rules (spec 002 FR-010a): project team, then the person's own access to the folder. Names of the people of an interview MUST never be sent to an AI provider in this feature.
- **FR-014**: The app MUST NOT write, move or delete anything in Drive in this feature; it reads only the inventory's metadata and the tab titles of Google documents (no file content).
- **FR-015**: All texts MUST exist in English and French; the Fieldwork phase, its dialogs and its controls MUST meet WCAG 2.2 AA.

### Key Entities

- **Session** (Ingestion), labelled "Interview / Entretien": one interview occurrence of a study. It holds:
  - at most one transcript file and 0–n ordered media files (by Drive file id);
  - a state `proposed | validated | excluded` (with an exclusion reason);
  - the match confidence and reason of each media file;
  - an optional title;
  - an optional link to a planned interview (with how it was made: suggested and confirmed, or picked);
  - who decided and when, and a version.
- **Roster** (Ingestion, owned by the Session): the people of the interview. Each entry has a name and a role (interviewer or interviewee); an interviewer can be linked to a workspace member.
- **Link suggestion**: the planned interview the app suggests for a session, with its rule (name or date). It is recomputed after each inventory and never stored as a decision.
- **PlannedInterview** (Research, spec 006): unchanged, except that its status can be set to "done" when its session is validated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After attaching a folder, every transcript of the folder appears as an interview in Fieldwork without any action other than the inventory.
- **SC-002**: On the reference test folder, every transcript whose file name holds the interviewee's name gets the right planned interview suggested, and no wrong suggestion is made when two planned interviews are equally close.
- **SC-003**: No decision is lost: a refresh never changes a validated or excluded interview, and every concurrent change is refused with "changed meanwhile" (tested).
- **SC-004**: A person can validate an interview with its suggested link in two actions (confirm the link, validate).
- **SC-005**: No name of a planned interview or of a session's people appears in any request to an AI provider (tested).
- **SC-006**: Fieldwork and its dialogs have no axe violation in light and dark themes.

## Assumptions

- The matching rules of recordings are the initial heuristic of the context map. They can be tuned after use without changing the decisions already made.
- Dates come from Drive's last modification date. Files rarely carry the real interview time, so date rules are a hint only.
- The roster prepares the later phases (speaker mapping, participants); in this feature it is only entered and shown.
- Reading transcript content, cleaning it (the next phase, in its own spec), transcribing recordings, speaker diarisation and the analysis are out of scope.
- **Next spec (step 3)**: an "Analyze the interviews" action (all, or one row) reads the content with the assistant to fill in the people and the date, find the files that belong together, propose a clear file name (renamed in Drive once the person validates it) and prepare the vocabulary for cleaning. Every AI call there records its cost, shown on that screen.
- Uploading files other than through the Drive folder is out of scope.
