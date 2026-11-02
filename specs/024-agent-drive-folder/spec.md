# Feature Specification: The assistant works in the study's folder

**Feature Branch**: `024-agent-drive-folder`

**Created**: 2026-11-01

**Status**: Implemented

**Input**: User description: "The assistant must be able to access the study's Drive folder and handle its elements like a person, with the person's validation: browse it, read its files, rename, move and create sub-folders. Deleting stays impossible."

## Clarifications

### Session 2026-11-01

- Q: May the AI provider receive file names, which often hold people's names? → A: Yes, with the person's consent, per study.
- Q: May the assistant delete files? → A: No, as the constitution says. What is not useful goes into a "To sort" sub-folder, and the person deletes in Drive themselves.
- Q: May it read the content of files? → A: Yes, by extracts, under the same consent, so it can help with what follows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the folder (Priority: P1)

A person asks what the study's folder holds. The first time, the assistant asks for consent to send file names and content to the AI provider. Once given, it browses the folder and its sub-folders, and describes what it finds.

**Why this priority**: Everything else depends on the assistant seeing the folder.

**Independent Test**: With the simulated Drive, ask what the folder holds: a consent card appears and nothing is sent; after consent, the answer names the files.

**Acceptance Scenarios**:

1. **Given** no consent for this study, **When** the assistant tries to browse, **Then** no file name reaches it, and a card explains what would be sent and to which provider.
2. **Given** the card, **When** the person agrees, **Then** the conversation goes on by itself and the assistant browses the folder.
3. **Given** the card, **When** the person dismisses it, **Then** nothing is sent, and the assistant says it can only give counts.
4. **Given** consent, **When** the assistant browses, **Then** it gets names, kinds, dates and sizes, within the study's folder only.
5. **Given** a person without access to the folder, **When** the assistant browses, **Then** it is refused, even with a consent given earlier.
6. **Given** a study set to anonymise names, **When** the assistant tries to browse or read, **Then** it is refused with the reason, and keeps counts only.

---

### User Story 2 - Read a file (Priority: P1)

The assistant opens a file of the folder to understand what it is, such as a note or a transcript, and uses what it read in the conversation.

**Why this priority**: Names alone do not always tell what a file is, and what follows builds on the content.

**Independent Test**: With consent, ask what a transcript is about: the answer draws on its content; only an extract was sent.

**Acceptance Scenarios**:

1. **Given** consent, **When** the assistant reads a file of the folder, **Then** it gets at most one extract of limited length, and is told when the file goes on.
2. **Given** a longer file, **When** the assistant needs more, **Then** it asks for the next extract, up to a limit per answer.
3. **Given** a file outside the study's folder, **When** the assistant asks for it, **Then** it is refused.
4. **Given** a format the app cannot read, such as a video, **When** the assistant asks for it, **Then** it is told so.
5. **Given** a reading, **When** it is done, **Then** the panel shows which file was read.

---

### User Story 3 - Tidy the folder with one card (Priority: P1)

The assistant proposes a batch of changes: new names, moves and new sub-folders. One card shows each line before and after. The person unticks what they do not want, then applies. Each line then says whether it worked.

**Why this priority**: This is the cleaning the person wants, and it stays their decision.

**Independent Test**: With the simulated Drive, get a card of renames, moves and a new sub-folder, untick one line and apply: only the ticked lines change, and the study's list follows.

**Acceptance Scenarios**:

1. **Given** a proposal, **When** the card is shown, **Then** nothing has changed in the folder.
2. **Given** a card, **When** the person unticks lines and applies, **Then** only the ticked lines run.
3. **Given** a line about a file outside the study's folder, or a destination outside it, **When** the assistant proposes it, **Then** the whole proposal is refused with the reason.
4. **Given** a line asking to delete or trash, **When** the assistant proposes it, **Then** there is no way to express it; it is told to use a "To sort" sub-folder.
5. **Given** a line that fails on Apply, **When** the others can run, **Then** they run, and the card and the assistant say which failed and why.
6. **Given** no right to edit, **When** the assistant proposes changes, **Then** the connection card leads to Google, and the conversation goes on at the return.
7. **Given** changes applied, **When** they end, **Then** the study's list of files is refreshed, interviews follow their files, and the assistant says where things stand.
8. **Given** an interview whose file moved inside the folder, **When** the list is refreshed, **Then** it stays the same interview, with its decisions.

### Edge Cases

- A file changed or disappeared between the card and Apply: that line fails with its reason, and the others run.
- A provider changed between the consent card and Apply: the card fails, and nothing is recorded.
- Two lines giving the same name in the same place: refused when proposing, as a person could not tell them apart.
- A new sub-folder used by a later line of the card: created first; unticking it also unticks the lines that depend on it.
- More files than the limit: the assistant is told the list is cut and can open one sub-folder at a time.
- Another AI provider since the consent: the consent is asked again.
- A file moved out of the folder by someone else: it no longer exists for the assistant.
- An inventory running: the card waits for it to end, or the proposal is refused with the reason.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST be able to browse the study's folder and sub-folders, getting names, kinds, dates and sizes.
- **FR-001a**: The assistant MUST be able to find items anywhere in the folder by a part of their name, ignoring accents and capitals, or by kind.
- **FR-002**: The assistant MUST be able to read extracts of a file of the folder, of limited length, with a limit per answer.
- **FR-003**: File names and content MUST reach the AI provider only after the person's consent for this study and this provider; the consent is asked once, on a card stating what is sent.
- **FR-004**: Without consent, or on a study set to anonymise names, the assistant MUST keep counts only.
- **FR-005**: Browsing and reading MUST use the person's own access, and only reach what is inside the study's folder.
- **FR-006**: The assistant MUST be able to propose, on one card, a batch of renames, moves and new sub-folders, inside the study's folder; nothing changes before Apply.
- **FR-007**: The system MUST refuse a batch naming anything outside the folder, or two identical names in one place, with the reason given to the assistant during the same answer.
- **FR-008**: The person MUST be able to untick any line; a line depending on an unticked new sub-folder MUST be unticked with it.
- **FR-009**: Apply MUST report each line's outcome, to the person and to the assistant.
- **FR-010**: Nothing MUST be deletable or sent to the trash through the assistant, and no sharing changed.
- **FR-011**: After Apply, the study's list of files MUST be refreshed, and interviews MUST keep their decisions when their file moved inside the folder.
- **FR-012**: Without the right to edit, the connection card of spec 022 MUST lead to the consent, and the conversation MUST go on after it.
- **FR-013**: Each AI call MUST be recorded in the usage ledger and counted in the conversation's cost.
- **FR-014**: The journey MUST be documented in `docs/agent-journeys/07-study-folder-work.md`, and the context map MUST state what the AI provider may now receive.

### Key Entities

- **Folder consent**: a person, a study, a provider; what allows names and content to be sent.
- **Batch of changes**: lines of kind rename, move or new sub-folder; each with its before, after, ticked state and outcome.

## Success Criteria *(mandatory)*

- **SC-001**: Without consent, 0 file names or extracts reach the AI provider.
- **SC-002**: 100% of lines reaching outside the study's folder are refused.
- **SC-003**: No file is ever deleted or trashed through the assistant.
- **SC-004**: Only ticked lines change anything, and each gives its outcome.
- **SC-005**: An interview whose file moved inside the folder keeps all its decisions.
- **SC-006**: A person can tidy a folder of 50 files in one card and under a minute of their own time, once proposed.

## Assumptions

- An extract is at most 8,000 characters, with at most 5 per answer; a card holds at most 200 lines; a listing at most 500 files.
- The consent is separate from the one for analysing interviews, since it covers file names and any file of the folder; after a dismissal the model is told, and the card comes back only if the person asks again.
- Decisions on interviews stay out of scope (next journey).
- The planning stays suggested but stops blocking: the study can open Passation without planned interviews, and the next step moves on.
- The person's own Drive right to edit decides what can change.
