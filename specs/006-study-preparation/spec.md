# Feature Specification: Study preparation — interview guide with the assistant, best practices, interview schedule

**Feature Branch**: `006-study-preparation`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Work on study preparation. The prototype had help to design the interview, the creation of the schedule, and the best-practices guide. Now that the assistant is everywhere, we rely on it: defining the interview protocol happens through this chat too."

## Clarifications

### Session 2026-10-25

Decided without the requester (overnight, "carte blanche"); each answer is the default the rest of the spec follows and can be revisited at review.

- Q: Where does the guide design conversation happen? → A: In the **assistant panel** (spec 005), not on a separate full-page chat as in the prototype. The Preparation tab starts it; the assistant follows a guide design method whenever the person is on an interview study page.
- Q: Who decides that the guide is written? → A: The assistant proposes the **whole guide** as a card once the person agrees; nothing is saved until the person applies it (constitution IV). Later changes requested in the chat come as a new proposal of the whole guide, applied against the version the assistant saw.
- Q: Where do the guide, the best practices and the schedule live? → A: **In the app**, which is the source of truth (context map, "PublishedDocument"). The guide and the best practices can be downloaded as Markdown, the schedule as CSV. Publishing them as documents or spreadsheets in a source folder needs write access to the source and is left to a later spec (the Drive grant stays read-only, constitution VII).
- Q: How is progress of the guide design shown? → A: As in the prototype: eight points with fixed weights; the assistant only says for each point whether it is missing, partial or covered; the app computes the percentage (constitution IV, metrics computed by the app).
- Q: Does the schedule go to the AI? → A: No. It holds names of real people; the assistant only receives the number of planned interviews per status.
- Q (requester, during the session): How does the assistant get the guide method? → A: As a **skill**: the context only lists the skills available on the page; the assistant loads the "interview guide design" skill when the person works on the guide, and it stays loaded for the rest of the conversation.
- Q (requester, during the session): How are the writing constraints of the questions enforced? → A: As a **tool** the assistant calls: the app checks wordings with fixed rules (closed, leading, hypothetical, about the future, asking for a solution, double, too long) and returns what to review; the assistant checks before proposing a guide, and the guide card shows the questions flagged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Design the interview guide with the assistant (Priority: P1)

On the Preparation tab of an interview study, the person activates "Design with the assistant". The assistant panel opens on a new conversation that starts with the person's request ("Help me design the interview guide for this study"). The assistant already knows the project's research goal, the study, and the current guide if there is one. It leads a dialogue, one or two short questions at a time, in steps: objectives and research themes, hypotheses, audience and recruitment, format and logistics, questions per theme, follow-ups, then a critical review of biases. It challenges leading, closed, hypothetical or future-oriented questions and proposes open, factual rewordings. At the top of the conversation a progress bar shows the eight points of a guide and the percentage covered. When every step is covered, the assistant asks whether it may write the guide; once the person agrees, it proposes the complete guide as a card. Applying it saves it as the study's interview guide.

**Why this priority**: The guide is the hub of an interview study (evaluation coverage, insight themes, debrief); designing a good one is the main job of the Preparation phase and where the prototype brought the most value.

**Independent Test**: On an interview study, start the design from the Preparation tab, answer a few questions, see the progress move, ask the assistant to write the guide, apply the card, see the guide on the Preparation tab.

**Acceptance Scenarios**:

1. **Given** an interview study the person can act on, **When** they activate "Design with the assistant" on the Preparation tab, **Then** the panel opens on a new conversation, the request is sent as the person's first message, the assistant loads the guide design skill (a line "Using the skill: Interview guide design" is shown) and answers with a summary of what it already knows and its first question.
2. **Given** a guide design conversation, **When** the assistant answers, **Then** it reports the state of each of the eight points (objectives and themes 15, hypotheses 10, audience and recruitment 15, format and logistics 10, introduction and warm-up questions 10, thematic questions 25, follow-ups 10, bias review 5), and the panel shows a segmented bar with the percentage computed by the app (missing 0, partial half, covered full weight), with each point's name and state readable on focus or hover.
3. **Given** the person agreed that the guide be written, **When** the assistant proposes it, **Then** it has first checked the questions with the app's writing rules (a line "Checked N questions" is shown), and a card shows the guide's sections with their durations and number of questions, the questions the rules still flag, can be expanded to read the whole guide, and offers Apply and Dismiss; nothing is saved before Apply.
4. **Given** the card is applied, **When** the Preparation tab is shown, **Then** it shows the guide, its version, who changed it last and when, and that it came from the assistant.
5. **Given** a study that already has a guide, **When** the person asks the assistant for a change, **Then** the assistant proposes the whole updated guide; if someone changed the guide after the proposal was made, applying fails with "changed meanwhile" and the guide is unchanged.
6. **Given** the person moves to another page during the conversation, **When** they come back to the study, **Then** the conversation and its progress are still there.

---

### User Story 2 - Read and download the interview guide (Priority: P1)

The Preparation tab shows the study's interview guide: the framing (objectives, hypotheses, audience, format), then the four phases in order (introduction, warm-up questions, one section per research theme, wrap-up), each with its duration, its main questions numbered and each question's follow-ups. The person can download it as a Markdown file in the interface language.

**Why this priority**: The guide is used during the interviews and shared with observers; it must be readable and portable as soon as it exists.

**Independent Test**: With a saved guide, read every section on the Preparation tab and download the Markdown file; its headings and questions match the page.

**Acceptance Scenarios**:

1. **Given** a study without a guide, **When** the Preparation tab is shown, **Then** it explains what the guide is for and offers "Design with the assistant" and "Write it myself".
2. **Given** a study with a guide, **When** the tab is shown, **Then** the framing, the sections in order with their durations and the total duration, the numbered main questions and their follow-ups are shown.
3. **Given** a guide, **When** the person activates "Download (Markdown)", **Then** a `.md` file named after the study is downloaded, with the same content, headings in the interface language.

---

### User Story 3 - Edit the guide by hand (Priority: P2)

The person can edit the guide without the assistant: the framing texts and hypotheses, section titles and durations, the questions and follow-ups (add, change, remove, move up or down), and add or remove theme sections. "Write it myself" starts from an empty guide with the four phases. Saving checks the version: if the guide changed meanwhile, the person is told and nothing is overwritten.

**Why this priority**: People fix a word or add a question without a conversation; the assistant must not be the only way in.

**Independent Test**: Edit a question and add a follow-up, save, reload: the change is there, the version went up, the origin says "edited by hand".

**Acceptance Scenarios**:

1. **Given** a guide, **When** the person activates "Edit", changes a question, adds a follow-up and saves, **Then** the guide shows the change, the version increases and the origin is "edited by hand".
2. **Given** two people edit the same guide, **When** the second saves, **Then** they get "changed meanwhile" and their edit is not applied (they can reload).
3. **Given** an invalid guide (a question left empty, a duration out of range, more than the limits), **When** saving, **Then** the problem is shown next to the field and nothing is saved.
4. **Given** a question kept through edits and assistant proposals, **When** its text is unchanged, **Then** it keeps the same identifier (later features count coverage per question).

---

### User Story 4 - Read the interview best practices (Priority: P2)

The Preparation tab offers the interview best practices: how to run an interview (before, the four phases, asking questions, follow-ups, posture, biases to avoid, what is measured after the interview, after the interview, thinking ahead to the analysis, checklist). The person reads them in the app in the interface language and can download them as Markdown. The assistant applies the same rules when it designs a guide.

**Why this priority**: Neutral interviews are the condition for trustworthy evidence; the prototype gave this document with every guide.

**Independent Test**: Open the best practices from the Preparation tab in French and in English; download the file.

**Acceptance Scenarios**:

1. **Given** the Preparation tab, **When** the person activates "Read the best practices", **Then** the document opens in a dialog in the interface language, with headings and a closable view that returns focus.
2. **Given** the document, **When** the person activates "Download (Markdown)", **Then** the file is downloaded in the interface language.
3. **Given** the document, **Then** it names no company, product or tool vendor, and its thresholds are the ones of the Interview Quality context (talk share ≤ 30 %, opinion ≤ 5 %, follow-up and guide ≥ 60 %).

---

### User Story 5 - Plan the interviews (Priority: P2)

The Preparation tab has an interview schedule: one row per planned interview with the person to interview, their role, the interviewer(s), the date and time (optional), a status (to contact, invited, scheduled, done, postponed, cancelled) and notes. The person adds, edits and deletes rows; rows are sorted by date (without date last); a summary counts rows per status. The schedule can be downloaded as CSV. It is shared with everyone who can act on the study.

**Why this priority**: Following who was contacted, who is scheduled and who was seen is the other half of preparation; the prototype created a spreadsheet for it.

**Independent Test**: Add three planned interviews with different statuses and dates, change one status, delete one, download the CSV.

**Acceptance Scenarios**:

1. **Given** an empty schedule, **When** the person adds an interview with a name, a role, an interviewer, a date and the status "scheduled", **Then** it appears in the table and the summary counts one scheduled interview.
2. **Given** planned interviews, **When** the table is shown, **Then** they are sorted by date and time, those without a date at the end, dates shown in the person's language and time zone.
3. **Given** a planned interview, **When** the person changes its status or deletes it (after confirmation), **Then** the table and summary update; a stale edit (someone changed it meanwhile) is refused with "changed meanwhile".
4. **Given** the schedule, **When** the person downloads it, **Then** a CSV with one row per interview and a header line in the interface language is downloaded.
5. **Given** a guide design conversation, **When** the assistant receives the study context, **Then** it gets only the number of planned interviews per status, never names, roles or notes.

---

### Edge Cases

- A study of another type than interviews: the Preparation tab keeps its "coming later" text; the assistant does not offer the guide tools.
- A person without access to the study's source folder (spec 002 FR-010a): the guide and the schedule are not shown and cannot be changed; the assistant receives neither and cannot propose a guide for that study.
- The assistant proposes a guide for a study that is not the one in the context, or one that breaks the limits: the proposal is not shown and the assistant is told it was invalid.
- The model writes a guide with a question it marks "(to confirm)": kept as written; the person edits it.
- The assistant reports progress for points that do not exist or with unknown states: ignored; unknown points count as missing.
- A proposal of a guide applied twice (double click, two tabs): applied once (spec 005 conditional claim).
- The study is deleted: its guide and schedule are deleted with it; conversations keep their text, and a later Apply fails with "not found".
- Deleting an account: the guide and schedule stay (they belong to the study); the account's name is shown as for any deleted account.
- Dates: stored as instants; a planned interview without time is not supported in this version (date and time together, or none).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An interview study MUST have at most one interview guide, made of a framing (objectives, hypotheses, audience, format), and ordered sections of kind introduction, warm-up, theme or wrap-up, each with a title, a duration in minutes and ordered main questions, each with its follow-ups.
- **FR-002**: The guide MUST be validated by the app: at least one section; at most 12 sections, 60 main questions in total, 8 follow-ups per question, 15 hypotheses; texts trimmed and non-empty, at most 600 characters for a question or follow-up, 4 000 for a framing text; durations from 1 to 180 minutes.
- **FR-003**: Each main question MUST have an identifier assigned by the app, kept when a new version of the guide contains a question with the same text (ignoring case and spaces).
- **FR-004**: Saving the guide MUST check the version the person or the assistant saw; a stale version is refused with "changed meanwhile". Each save records the version, who saved, when, and the origin (assistant or edited by hand).
- **FR-005**: On the page of an interview study the person can act on, the assistant MUST receive the current guide (or that there is none) with its version, the number of planned interviews per status, and the list of skills it can load; it MUST be offered four tools: load a skill, check questions, report the design progress, and propose the whole guide. A loaded skill's instructions MUST stay in the context for the rest of the conversation.
- **FR-005a**: Checking questions MUST apply the app's fixed writing rules (closed, leading, hypothetical, about the future, asking for a solution, two questions in one, more than 30 words), in English and French, and return what to review for each question; the rules flag, they never block. Loading a skill and checking questions run during the answer: their result goes back to the assistant, which goes on in the same answer. The progress report is recorded when called and ends the answer.
- **FR-006**: A proposed guide MUST be validated like a hand-edited one and only for the study of the page the message was sent from (an id from earlier in the conversation is refused); it MUST be shown as a card (sections, durations, number of questions, expandable full guide) and saved only on Apply, at most once, with the version seen when proposed.
- **FR-007**: Progress reports MUST be recorded at once (they change no research data); the app MUST compute the percentage from the eight fixed weights; the panel MUST show the latest progress of the conversation as a segmented bar with an accessible name and the state of each point.
- **FR-008**: The Preparation tab MUST start a guide design conversation in the assistant panel with one action, sending a fixed request as the person's first message.
- **FR-009**: The guide and the best practices MUST be downloadable as Markdown in the interface language; the schedule as CSV.
- **FR-010**: The best practices MUST be available in English and French, name no company, product or tool vendor, and use the Interview Quality thresholds.
- **FR-011**: A planned interview MUST have a person to interview (1–120 characters), and optionally a role (≤ 120), interviewers (≤ 200), a date and time, notes (≤ 2 000), and a status among to contact, invited, scheduled, done, postponed, cancelled (default to contact). A study has at most 300 planned interviews, also when people add at the same time.
- **FR-012**: Only interview studies have a guide and a schedule (`NOT_AN_INTERVIEW_STUDY` otherwise). Reading or changing them MUST require being able to act on the study (project team, then source folder access, spec 002 FR-010a); others get "not found" or "folder access required" like the other study actions.
- **FR-013**: Names, roles and notes of the schedule MUST never be sent to an AI provider.
- **FR-014**: Deleting a study MUST delete its guide and its schedule.
- **FR-015**: All texts MUST exist in English and French; the progress bar, the guide editor, the schedule and the dialogs MUST meet WCAG 2.2 AA.

### Key Entities

- **InterviewGuide** (Research): one per interview study; framing, sections, main questions with app identifiers and follow-ups; version, last saved by and when, origin (`assistant | person`).
- **PlannedInterview** (Research): one row of a study's interview schedule; interviewee, role, interviewers, scheduled time, status, notes, version.
- **Guide design progress** (Assistant): the latest progress report of a conversation for a study: a state (`missing | partial | done`) per checklist point; percentage computed by the app.
- **Skill** (Assistant): instructions for a task (here, interview guide design), listed in the context and loaded by the assistant when needed.
- **Writing check** (Assistant): what the app's rules flag in a question wording.
- **Interview best practices**: fixed content shipped with the app, per language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the Preparation tab, a person gets a first question from the assistant in one action, and an applied guide in one Apply once the design is done.
- **SC-002**: 100 % of saved guides respect the limits of FR-002, whether written by the assistant or by hand (validated by the same rules).
- **SC-003**: No guide change is lost silently: every concurrent change is refused with "changed meanwhile" (tested).
- **SC-004**: No name, role or note of the schedule appears in any request to the AI provider (tested on the context built for the model).
- **SC-005**: The Preparation tab, the editor, the schedule, the best practices dialog and the progress bar have no axe violation in light and dark themes.

## Assumptions

- The assistant panel, conversations, proposals and cost of spec 005 are reused as they are; the guide design is a mode of the same assistant, not a second assistant.
- The guide design method and the best practices are adapted from the prototype and made generic (no company, team or tool names).
- The prototype's "ready to write" flag is replaced by the proposal: the assistant asks for agreement, then proposes; the person's Apply is the decision.
- Publishing the guide, the best practices or the schedule to a source folder (documents, spreadsheets), importing an existing guide from a document, linking planned interviews to sessions, invitations and calendars are out of scope.
- Durations are indicative: the total is shown, no rule enforces a total length.
