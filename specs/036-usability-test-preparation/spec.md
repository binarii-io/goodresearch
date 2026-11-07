# Feature Specification: Usability test preparation — test protocol with the assistant, best practices, publication

**Feature Branch**: `036-usability-test-preparation`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Usability test studies, part 1: Preparation. Add the study type usability-test so a team can create a usability test study, from the form or through the assistant, with the phases Preparation → Fieldwork → Enrichment → Analysis. Preparation builds the test protocol: the tested interface (link and kind), the scenario, ordered tasks (instruction, success criterion, optional start link, optional expected duration), an optional System Usability Scale questionnaire, and the facilitator's script. The assistant drafts it through a card; it is published to the study's Drive folder; its tasks are kept as structured data for the later video analysis. The protocol must include a consent statement saying recordings are analysed by AI and names and faces cannot be kept out of that analysis. Out of scope: fieldwork, transcripts, video analysis, scheduling, recruiting, unmoderated testing tools."

## Clarifications

### Session 2026-11-07

Decided with the requester before this spec:

- Q: How is the work cut? → A: **One spec per phase**, one pull request each, as for surveys (027–029): 036 Preparation (this spec), then Fieldwork (sessions found in the study's folder, a video required), Enrichment (lexicon and cleaning of the session transcripts) and Analysis (AI reading of each session's video, task by task, checked by a second model and arbitrated on disagreement).
- Q: Which phases does a usability test study have? → A: The interview phases that work on transcripts, because the requester wants the team lexicon on test sessions too: **Preparation, Fieldwork, Lexicon, Enrichment, Analysis**.
- Q: What does the protocol point at? → A: **The tested interface as a link**, since a test runs on a prototype or directly on the live application; each task may have its own start link.

Learned from a trial on six real recorded sessions (31 to 87 minutes) before this spec, and shaping it:

- The video analysis judges each session **task by task**: it worked best when the tasks were known, and it had to guess them otherwise. Tasks must therefore be structured, with stable identifiers, not free text.
- Recordings of video calls show participants' **names and faces** on screen and in the audio; an AI reading of the video cannot mask them, unlike interview transcripts (spec 006 FR-013, spec 011). The consent read to participants must say so, and the study's anonymisation setting cannot promise more than masking names in what the app writes.
- The sessions were run by people who are not research experts: instructions that named the screen's labels, several tasks in one, and no stated success criterion made the reading harder. These become the protocol's writing rules.
- Several sessions ended with the System Usability Scale read aloud, item by item; the analysis found each answer. Keeping its ten fixed items in the protocol lets the later analysis compute the score itself.

Decided by default for this spec; each can be revisited at review:

- Q: What is the structure? → A: One **Test protocol** per usability test study: a **framing** (objective, hypotheses, tested interface, participants, format and session length, language, consent), the facilitator's **script** (introduction, think-aloud instructions, warm-up questions, debrief questions, closing), a **scenario**, ordered **Test tasks**, and an optional **standard questionnaire** (the System Usability Scale). Same role as the interview guide and the questionnaire; its own rules, sharing nothing with them in code.
- Q: Is a schedule needed? → A: Not in this spec. Planning sessions is out of scope; Fieldwork finds the sessions in the folder, as for interviews.
- Q: Is the Quality phase (how interviews were conducted, spec 016) offered? → A: No, not yet: its criteria judge an interviewer, not a test facilitator. It may come with its own criteria later.
- Q: What is published? → A: The protocol as one document in the study's folder, and the usability test best practices as another, with the three-way sync of spec 007, plus the participant sheet (see below). The app stays the source of truth.

Clarified with the requester (`/speckit-clarify`, and during implementation):

- Q: Besides the System Usability Scale at the end, should the protocol offer a per-task ease question (Single Ease Question, 1 = very difficult to 7 = very easy) after each task? → A: **Yes, as an option for the whole protocol**: the same fixed question after every task, on 7 points, in the protocol's language; off by default.
- Q: What happens to the study setting "anonymise names" on a usability test, since a video sent to the AI always shows names and faces? → A: **Kept, with a warning on screen**: it masks names in everything the app writes (observations, quotes, facts, deck), not in the video read by the AI, and the screen says so wherever the setting is shown for a usability test study.
- Q: Besides the facilitator's protocol, should a separate participant sheet be published, holding only the scenario and the task instructions? → A: **Yes**: a participant sheet published with the protocol, built from the same data, one way only (a change made in Drive is never taken back into the app), rewritten at each update.
- Q (during implementation): The System Usability Scale is a standard: how is it shown? → A: **As the standard asks**: on the participant sheet, which the participant fills in, as a grid of ten statements with five boxes and its standard instructions; the facilitator's note on when and how to give it stays on the protocol only; the best practices give how it is scored and read (Brooke 1996, Bangor, Kortum & Miller 2008).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a usability test study (Priority: P1)

A person creates a study of type Usability test, with the same form and the same assistant card as the other types. Its page shows the phases Preparation, Fieldwork, Lexicon, Enrichment and Analysis. Preparation is usable; the other phases say they come later.

**Why this priority**: Nothing else exists without it; the type has been shown as "coming later" since spec 002.

**Independent Test**: Create a usability test study from the Studies page and through the assistant, open it, read the phases.

**Acceptance Scenarios**:

1. **Given** a person in a team, **When** they create a study with the type Usability test, **Then** it is created and its Preparation tab offers the test protocol, not the interview guide, the schedule or the questionnaire.
2. **Given** a usability test study, **When** its page is shown, **Then** only Preparation, Fieldwork, Lexicon, Enrichment and Analysis are offered, even from an old link to another phase; all but Preparation say they come later and hold no interview screen.
3. **Given** a usability test study, **When** a command reserved to another type is requested (guide, schedule, sessions, questionnaire), **Then** it is refused with the existing outcome for the wrong type.
4. **Given** a project with an interview study, a survey study and a usability test study, **When** its overview is shown, **Then** the usability test study neither blocks nor distorts the other counts and next steps.
5. **Given** the assistant on a page where it can create a study, **When** the person asks for a usability test, **Then** the creation card offers the type Usability test.

---

### User Story 2 - Design the test protocol with the assistant (Priority: P1)

On the Preparation tab, the person activates "Design with the assistant". The panel opens on a new conversation; the assistant loads the test protocol design skill and leads a short dialogue in steps: the objective and hypotheses from the study's research goal, the tested interface and its link, the participants, the format and session length, the scenario, the tasks one by one with their success criteria, the questionnaire and debrief, then a review of biases. It keeps the test realistic and simple, because the person running it is often not a researcher: one goal per task, worded as a user's goal, never naming the screen's buttons or steps. A progress bar shows the points covered. When they are covered and the person agrees, it checks the tasks with the app's rules and proposes the whole protocol as a card; applying it saves it.

**Why this priority**: This is the job of the Preparation phase, and the tasks it produces are what the later video analysis will judge each session against.

**Independent Test**: Start the design, answer a few questions, see the progress move, ask for the protocol, apply the card, read it on the Preparation tab.

**Acceptance Scenarios**:

1. **Given** a usability test study the person can change, **When** they activate "Design with the assistant", **Then** the request is sent as their first message, the line "Using the skill: Test protocol design" is shown, and the assistant answers with what it already knows (the study's research goal) and its first question.
2. **Given** a design conversation, **When** the assistant reports progress, **Then** the panel shows the percentage computed by the app from the nine points: objective and hypotheses 15, tested interface 10, participants 10, format, length and consent 10, scenario 10, tasks 25, success criteria 10, questionnaire and debrief 5, bias review 5.
3. **Given** the person agreed, **When** the assistant proposes the protocol, **Then** the tasks were checked first (line "Checked N tasks"), and the card shows the tested interface, the number of tasks, the planned length against the session length, what the rules still flag, whether the questionnaire is included, and the expandable full text; nothing is saved before Apply.
4. **Given** a saved protocol, **When** the person asks for a change, **Then** the assistant proposes the whole updated protocol; if someone changed it meanwhile, Apply fails with "changed meanwhile" and nothing changes.
5. **Given** the Preparation tab, **When** a design conversation has cost something, **Then** the tab shows that cost for the study, whoever ran it.

---

### User Story 3 - Read, edit and download the protocol (Priority: P1)

The tab shows the framing with the tested interface as a link that opens in a new tab, the script, the scenario, then the tasks in order, each with its instruction, success criterion, start link and expected duration, the questionnaire if included, and the debrief. The person can edit everything by hand, and "Write it myself" starts from an empty protocol holding the default consent, think-aloud instructions and closing. They can download it as Markdown.

**Why this priority**: The assistant must not be the only way in, and the facilitator needs the protocol in hand during sessions.

**Independent Test**: Write a protocol by hand with several tasks, the questionnaire on, save, reload, download.

**Acceptance Scenarios**:

1. **Given** a usability test study without a protocol, **When** the tab is shown, **Then** it explains what the protocol is for and offers "Design with the assistant" and "Write it myself".
2. **Given** a protocol, **When** the person reorders, edits or adds a task and saves, **Then** the version increases, the origin says "edited by hand", and a task whose instruction is unchanged keeps its identifier wherever it moves.
3. **Given** two people editing, **When** the second saves, **Then** they get "changed meanwhile" and their edit is not applied.
4. **Given** an invalid protocol (no task, a task without instruction, a tested interface link that is not a web address, no consent text, over the limits), **When** saving, **Then** the problem is shown next to the field and nothing is saved.
5. **Given** a protocol with the questionnaire on, **When** it is shown, **Then** the ten System Usability Scale items appear in the protocol's language, in their fixed order, with their five-point scale, and cannot be edited.
6. **Given** a protocol with the per-task ease question on, **When** it is shown, **Then** the same fixed question with its seven-point scale follows every task, and cannot be edited.
7. **Given** a protocol, **When** the person downloads it, **Then** a Markdown file named after the study holds the same content.
8. **Given** a person outside the owning team, **When** they open the tab, **Then** they read the protocol with the "Read only" badge and no change control (spec 026).

---

### User Story 4 - Get warned about what weakens the test (Priority: P2)

The app checks the protocol with fixed rules and shows what to review next to each task and for the whole: an instruction that gives the way (names a button, a menu or steps), several tasks in one, an instruction with no goal or context, a too long instruction, a planned length beyond the session, too many tasks for the session, no think-aloud instructions, and a consent that does not mention the AI reading of recordings.

**Why this priority**: These are the mistakes seen in the trial, and a person writing by hand needs the rules as much as the assistant.

**Independent Test**: Write tasks breaking each rule and see each flagged; save anyway.

**Acceptance Scenarios**:

1. **Given** a task "Click on Settings, then on Export", **When** it is checked, **Then** it is flagged as giving the way, with the reason in the interface language; it can still be saved.
2. **Given** a task "Find a product and add it to your basket and pay", **When** it is checked, **Then** it is flagged as several tasks in one.
3. **Given** tasks whose expected durations add up beyond the session length minus the introduction and debrief, **When** checked, **Then** the protocol is flagged as too long for the session, with both numbers.
4. **Given** a consent text edited so that it no longer mentions recording or AI analysis, **When** checked, **Then** it is flagged.
5. **Given** any protocol, **When** shown, **Then** the planned length is computed by the app from the tasks' expected durations and fixed times for the script and questionnaire, and labelled as an estimate.

---

### User Story 5 - Publish the protocol to the study's folder (Priority: P1)

The person publishes the protocol: a document is created in the study's source folder, with the person's own source access and editing consent, holding the framing, the script, the scenario, the tasks and the questionnaire, laid out to be read during a session. The best practices can be published the same way. The tab gives their links, and compares the app and the documents as for the interview guide.

**Why this priority**: The facilitator and observers work from the team's Drive; the app keeps the structure the later analysis needs.

**Independent Test**: Publish, open the document, check each task against the app, change a task in the app and update, change one in the document and review it.

**Acceptance Scenarios**:

1. **Given** a protocol and a source folder, **When** the person publishes, **Then** one document is created in the folder, with each task numbered, its instruction set apart to be read aloud, and its success criterion marked as for the facilitator only.
2. **Given** a study without a source folder, or a person without editing consent or edit access, **When** they publish, **Then** the screen says what is missing, as for the other published files.
3. **Given** a task changed in the app, **When** the file is checked, **Then** it is "out of date"; "Update in Drive" rewrites it, keeping the file.
4. **Given** a task changed in the document, **When** the file is checked, **Then** it is a Drive change a person accepts or rejects, validated by the same rules; changed on both sides, it is a conflict; what the app cannot read back is "not understood".
5. **Given** the document was deleted, trashed or moved out of the folder, **When** checked, **Then** it is "unavailable", and nothing is deleted at the source by the app.
6. **Given** a protocol, **When** the person publishes it, **Then** a participant sheet is created next to it, holding the scenario, the numbered task instructions and, when on, the System Usability Scale to fill in with its standard instructions, without success criteria, script, durations or any note for the facilitator; it is in the protocol's language.
7. **Given** a published participant sheet, **When** the protocol changes, **Then** the sheet is "out of date" and the same "Update in Drive" rewrites it; **When** it is changed in Drive, **Then** the tab says so and the next update overwrites it, nothing being taken back into the app.

---

### User Story 6 - Check readiness before the first session (Priority: P2)

Before Fieldwork, the tab shows the last checks: a pilot session run with someone outside the project, the tested interface opened on the device and account participants will use, the protocol reviewed by another person, consent present, every task with a success criterion, the protocol published and in sync. The person marks the human ones as done. They advise and block nothing.

**Why this priority**: A broken link or a test account that does not work ruins a session; only people can check them.

**Independent Test**: Mark the pilot and the interface check, see who did and when, reload, change a task and see the checks marked as changed since.

**Acceptance Scenarios**:

1. **Given** a protocol, **When** the tab is shown, **Then** each check says done or to do; those the app can compute are computed, the others are marked by a person with their name and date.
2. **Given** the protocol changes after a check was marked, **When** the tab is shown, **Then** the check is marked "protocol changed since".
3. **Given** the assistant on the study, **When** it is told the next step, **Then** the step is computed by the app: protocol, folder, publication, checks, then Fieldwork when it exists.

---

### User Story 7 - Read the usability test best practices (Priority: P2)

The tab offers the usability test best practices, in the interface language, readable in a dialog, downloadable and publishable: writing realistic tasks, not leading, think-aloud, staying neutral during the session, when to help and how to note it, the questionnaire, consent and recordings, and how the sessions will be read afterwards. The assistant applies the same rules.

**Why this priority**: Same role as the interview and survey best practices; it matters more here because the people running tests are often not researchers.

**Independent Test**: Open, download and publish them in French and in English.

**Acceptance Scenarios**:

1. **Given** the tab, **When** the person activates "Read the best practices", **Then** the document opens in a dialog that returns focus when closed.
2. **Given** the document, **Then** it names no company or tool vendor, and cites its sources.

---

### User Story 8 - Publish through the assistant (Priority: P3)

The assistant can propose publishing the protocol and the best practices with a card, as for the interview preparation (spec 023), and says what comes next.

**Why this priority**: Consistency with the other journeys; the screen already allows the action.

**Independent Test**: Ask the assistant to publish, apply the card, read the result.

**Acceptance Scenarios**:

1. **Given** a protocol, **When** the assistant proposes publishing and the person applies, **Then** the same rules and refusals as on the screen hold.
2. **Given** a person who can only read, **Then** the assistant reads and proposes nothing, as in spec 026.

---

### Edge Cases

- A study's type cannot change: a usability test study never becomes an interview or survey study.
- The tested interface link needs a sign-in or is internal to an organisation: the app never opens it, checks only that it is a web address, and the readiness check asks a person to open it.
- A task with no start link starts from where the previous task ended, or from the tested interface link for the first; the published document says so.
- The questionnaire is turned off after publication: the protocol and the participant sheet are out of date; its items disappear from both at the next update.
- The System Usability Scale is a standard: the app never lets a person or a model reword, shorten or reorder it; a change made to it in a published document is reported as not understood.
- The protocol's language differs from the interface language: the protocol's own text and the questionnaire stay in the protocol's language; headings follow the interface.
- A task is deleted: its identifier is never reused; sessions analysed later against an older version keep pointing at it.
- Assistant proposal for another study, or breaking the limits: refused, the assistant is told why.
- A proposal applied twice: applied once.
- Deleting the study deletes the protocol; the documents stay at the source.
- Folder replaced or detached: published documents become "unavailable" for the app; the protocol stays.
- The study is set to anonymise names: the setting is kept and masks names in what the app writes; the screen warns that it does not apply to the video read by the AI, and the consent's default text still says that names and faces in recordings reach the AI provider.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A study of type `usability-test` MUST be creatable by the form and by the assistant card, with the same rules as the other types (team, projects, goal), and its type MUST NOT change afterwards. The type MUST no longer be shown as "coming later".
- **FR-002**: A usability test study MUST have at most one **test protocol**: a framing (objective, up to 15 hypotheses, tested interface with a web address and a kind `prototype | live-application | other` and an optional description, participants' profile, format `moderated-remote | moderated-in-person`, session length in minutes, language `en | fr`, consent text), a script (introduction, think-aloud instructions, up to 10 warm-up questions, up to 10 debrief questions, closing), a scenario, 1 to 15 ordered **test tasks**, a questionnaire setting (`none | sus`), and a per-task ease question setting (on or off, off by default).
- **FR-003**: A test task MUST have an app identifier, an instruction read to the participant, and a success criterion; it MAY have a start link (a web address) and an expected duration in minutes (1 to 60). Texts are trimmed and non-empty, at most 600 characters for an instruction or a criterion, 4,000 for a framing or script text.
- **FR-004**: A task identifier MUST be kept when a new version has the same id or the same instruction (ignoring case and spaces), wherever the task moves; a deleted task's identifier MUST NOT be reused. Saving MUST check the version seen; a stale version is refused with "changed meanwhile". Each save records version, who, when and origin (`assistant | person | drive`).
- **FR-005**: The default consent text MUST be offered in the protocol's language and hold: the purpose of the test, that the interface is tested and not the participant, that the session is recorded (screen, voice and image), that **the recordings will be read by an AI service and that names and faces they contain cannot be hidden from it**, who will see the recordings, the free choice to take part and to stop at any time. The default think-aloud instructions MUST be offered too.
- **FR-006**: The `sus` questionnaire MUST be the ten items of the System Usability Scale in their fixed order, with a five-point agreement scale, in the protocol's language (English original and a published French translation), not editable, with its standard instructions to the participant (an immediate reaction, every item, the middle box when unsure) and a note for the facilitator only (right after the last task and before the debrief, answered alone, never reworded or reordered). It MUST be shown as a grid: one statement per row, five boxes, the end labels. The app MUST keep which items and scale were used, so that the later analysis computes the score itself.
- **FR-006a**: With the per-task ease question on, the Single Ease Question MUST follow every task, with its fixed text and a seven-point scale from 1 (very difficult) to 7 (very easy), in the protocol's language, not editable; the app MUST keep which question and scale were used, so that the later analysis reads each answer per task and computes averages itself.
- **FR-007**: The app MUST check with fixed rules, in English and French: instruction giving the way (names an interface element or a sequence of steps), several tasks in one, instruction without a goal, instruction too long (over 40 words), planned length beyond the session length, more than 8 tasks for a session of 60 minutes or less, no think-aloud instructions, consent not mentioning recording or AI reading. Rules flag and never block; a missing success criterion or a link that is not a web address is refused at save instead (FR-002, FR-003), whatever its origin. The same rules serve the screen and the assistant's tool.
- **FR-008**: The planned length MUST be computed by the app from the tasks' expected durations (a default for tasks without one) plus fixed times for the script, the questionnaire and the per-task ease question when on, and never by a model.
- **FR-009**: On the page of a usability test study the person can change, the assistant MUST receive the protocol or its absence with its version, the study's research goal, the list of skills, and tools to load a skill, check tasks, report progress and propose the whole protocol. Proposals follow the rules of spec 006 FR-006: same validation, this study only, a card, saved once on Apply.
- **FR-010**: The app MUST compute the design percentage from the nine fixed weights of US2; unknown points count as missing.
- **FR-011**: Every AI call MUST be in the usage ledger, and the Preparation tab MUST show the design's cost for the study.
- **FR-012**: The protocol and the best practices MUST be downloadable as Markdown, headings in the interface language and the protocol's own text in its language.
- **FR-013**: Publishing MUST create one document per published item (protocol, best practices) in the study's source folder with the person's own access and editing consent, and MUST follow the three-way sync of spec 007: in sync, out of date, changed in Drive, conflict, unavailable, not understood; nothing from a document changes the app without a person's decision, and a change accepted from the document is validated by the same rules and keeps task identifiers when instructions match.
- **FR-013a**: Publishing the protocol MUST also publish a **participant sheet** in the same folder: the scenario and the numbered task instructions, each task's start link when it has one, and, when on, the System Usability Scale to fill in (its standard instructions, then one statement per line with its five boxes), in the protocol's language, and nothing reserved to the facilitator (success criteria, script, durations, notes). It is published one way only: states in sync, out of date, changed in Drive, unavailable; a change made in Drive is reported and overwritten at the next update, never taken into the app.
- **FR-014**: In the published protocol, each task's instruction MUST be set apart to be read aloud, its success criterion MUST be marked as for the facilitator only, and, when on, the ease question MUST follow it.
- **FR-015**: Readiness checks MUST be shown: computed (consent present, every task with a success criterion, published and in sync), and marked by a person (pilot session, tested interface opened on the participants' device and account, review by another person, with name and date). They block nothing, and show "protocol changed since" when the version moved.
- **FR-016**: The study's next step given to the assistant MUST be computed by the app: protocol, folder, publication, checks, then Fieldwork when it exists.
- **FR-017**: Best practices MUST exist in English and French, name no company or tool vendor, cite their sources, and cover task writing, neutrality, think-aloud, helping and noting it, the questionnaire, consent and recordings, and how sessions are read afterwards. The assistant's skill MUST apply the same rules.
- **FR-018**: Reading and changing MUST follow spec 026: the protocol reads like the interview guide; changes need the owning team; folder access applies as for any study with a source folder. A read-only person gets no proposal.
- **FR-019**: Only usability test studies have a test protocol (`NOT_A_USABILITY_TEST_STUDY` otherwise); interview and survey commands keep refusing them with their existing outcomes. A usability test study MUST offer no Quality phase; its Fieldwork, Lexicon, Enrichment and Analysis MUST show no interview screen and MUST NOT run an inventory of sessions until their own specs. Project overview and next steps MUST leave usability test studies out of interview and survey counts.
- **FR-020**: Deleting a study MUST delete its protocol and readiness checks and never the documents at the source.
- **FR-021**: All interface texts MUST exist in English and French, using the glossary, with the new terms added in the same change; screens MUST meet WCAG 2.2 AA.
- **FR-022**: The tested interface link MUST never be opened, fetched or sent to the AI provider by the app; only its text and kind reach the assistant.
- **FR-022a**: Wherever the "anonymise names" setting is shown for a usability test study (creation form, study settings, assistant card), the screen MUST state that it masks names in what the app writes and not in the recordings read by the AI service.

### Key Entities

- **Test protocol** (Research): one per usability test study; framing, script, scenario, tasks, questionnaire setting; version, last saved by and when, origin.
- **Test task** (Research): one goal given to the participant; identifier kept across versions, instruction, success criterion, optional start link and expected duration. The unit the later video analysis judges.
- **Tested interface** (Research, part of the framing): web address, kind, optional description.
- **Standard questionnaire** (Research, fixed content): the System Usability Scale items and scale per language, and the Single Ease Question and its scale per language.
- **Readiness check** (Research, extended): a human check marked on a protocol version; who, when.
- **Protocol design progress** (Assistant): latest report of a conversation for the nine points.
- **Task check** (Assistant, shared with the screen): what the app's rules flag.
- **Usability test best practices**: fixed content per language.
- **PublishedDocument** (Publishing, extended): the protocol and its best practices as documents, and the participant sheet, published one way only.
- **Participant sheet** (Research, read model of the protocol): what the participant may see; never stored apart from the protocol.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the Preparation tab, a person gets the assistant's first question in one action, and a saved protocol in one Apply once the design is done.
- **SC-002**: 100 % of saved protocols respect the limits of FR-002 and FR-003, whether written by the assistant, by hand or accepted from the document.
- **SC-003**: Every task of a protocol is found in the published document, numbered, with the same instruction and criterion, and in the participant sheet with the same instruction and no criterion (checked on a protocol of 15 tasks with the questionnaire on).
- **SC-004**: A task keeps its identifier through reordering, editing of other fields and a round trip through the document (tested).
- **SC-005**: Each writing rule of FR-007 is triggered by at least one example and stays silent on a well-written counter-example, in both languages (tested).
- **SC-006**: No concurrent change is lost silently: each is refused with "changed meanwhile" (tested).
- **SC-007**: Interview and survey studies behave exactly as before: their existing tests pass unchanged.
- **SC-008**: The tab, the editor, the dialogs and the card have no axe violation in light and dark themes.

## Assumptions

- The assistant panel, skills, proposals, progress bar, publishing and sync of specs 005, 006, 007, 023 and 027 are reused, not doubled.
- The System Usability Scale (Brooke, 1996) is free to use with attribution; the French text uses a published validated translation, named in the best practices.
- The trial's findings (six sessions of a data-model test, run on 2026-11-07 outside the repository, no data kept in it) inform the rules and the structure; no recording, transcript or result from it enters the code, tests or docs.
- Readiness checks extend the survey's readiness checks (spec 027) to a second kind of instrument rather than creating another concept.
- Out of scope: Fieldwork (sessions, videos, transcripts), Lexicon, Enrichment and Analysis of usability tests (later specs); planning and recruiting participants; unmoderated testing tools; other standard questions than the System Usability Scale and the Single Ease Question; several languages in one protocol; importing an existing protocol; a Quality phase for test facilitation.
