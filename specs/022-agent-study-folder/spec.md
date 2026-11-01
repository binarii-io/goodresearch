# Feature Specification: Attach a study's Drive folder with the assistant

**Feature Branch**: `022-agent-study-folder`

**Created**: 2026-11-01

**Status**: Implemented

**Input**: User description: "Agent journey 5: attach the Drive folder of a study through the assistant. Today the assistant cannot: it says it cannot connect or add a folder. Once a study exists, its content must follow. The person pastes the folder's link in the conversation or is asked for it; the app checks it; if Drive is not connected, a card leads to Google's consent and the conversation goes on at the return; a card shows the folder's name and nothing changes before Apply; then the inventory runs and the assistant says what was found. Out of scope: replacing or detaching a folder through the assistant, file names in the assistant's context, reading the files' content, publishing."

## Clarifications

### Session 2026-11-01

- Q: Is this part of creating a study? → A: Yes: a study without content is not finished, so the assistant offers it right after the study opens, next to the guide. It is delivered on its own, as the next step of the same path.
- Q: Who gives the Drive consent? → A: Only the person, at Google. The assistant shows a card leading there.
- Q: Where does a new study go after its folder is added? → A: To Preparation while the interview guide or the schedule is not done, not to Fieldwork. The assistant offers to move forward on what is missing.
- Q: How does the person answer an offer? → A: By selecting in a list of choices shown by the app, one or several; they can still write freely.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach a folder from the conversation (Priority: P1)

On a study with no folder, a person whose Drive is connected pastes the folder's link. The assistant shows a card with the folder's name and owner. The person applies it, the inventory runs, and the assistant says what was found and what is left to prepare.

**Why this priority**: This is what the assistant could not do, and interviews start from this folder.

**Independent Test**: With the simulated Drive, paste the demo folder's link: the card names the folder, nothing is attached before Apply; after Apply, a study without a guide stays on Preparation, and the assistant gives the counts and offers what is missing.

**Acceptance Scenarios**:

1. **Given** a study with no folder, **When** the person asks to add its folder without a link, **Then** the assistant asks for the link of the Drive folder and shows no card.
2. **Given** a valid link, **When** the assistant proposes it, **Then** the card shows the study, the folder's name and owner, and says nothing changes in Drive.
3. **Given** an invalid link, a file, a folder that does not exist or that the person cannot open, **When** the assistant proposes it, **Then** no card appears and the assistant explains why during the same answer.
4. **Given** a card, **When** the person dismisses it, **Then** nothing is attached and the assistant is told.
5. **Given** a card, **When** the person applies it, **Then** the app's own rules run again, the folder is attached and the inventory starts. Preparation opens while the guide or the schedule is not done; Fieldwork opens otherwise.
6. **Given** the inventory finished, **When** the assistant continues, **Then** it gives the number of transcripts, recordings and other files, without any file name, and offers what is left to prepare as choices. This AI call is recorded and counted in the conversation's cost.
7. **Given** an inventory still running after one minute, **When** the assistant continues, **Then** it says it is in progress and that the page follows it.

---

### User Story 2 - Connect Drive first (Priority: P1)

A person whose Drive is not connected pastes a link or asks to add the folder. The assistant shows a card explaining what the permission allows, with a button to Google. At the return, the same conversation goes on by itself, and the assistant uses the link already given or asks for it.

**Why this priority**: Most people meet this at their first study; a dead end here stops the journey.

**Independent Test**: With the simulated Drive and an account not connected, send a link: the card leads to the consent; at the return on the study, the assistant shows the folder's card without a new message.

**Acceptance Scenarios**:

1. **Given** Drive not connected, **When** the assistant proposes a folder, **Then** a card explains the read-only permission and offers to continue to Google; nothing else happens.
2. **Given** the consent given, **When** the person returns, **Then** they are on the study, the same conversation is open, and the assistant goes on without a new message.
3. **Given** the consent refused or failed, **When** the person returns, **Then** the app says so, and the assistant does not go on by itself.
4. **Given** Drive not configured on this instance, **When** the assistant proposes a folder, **Then** it says so; no card appears.

---

### User Story 3 - Offer it at the right time (Priority: P2)

Right after a study is created, the assistant offers both next steps: adding the folder if interviews already exist, or preparing the guide. On any study, it knows whether a folder is attached and how far its inventory is.

**Why this priority**: The person should not have to guess what comes next.

**Independent Test**: Apply a study card: the answer that follows offers both steps. On a study with a folder, ask what it holds: the assistant gives the counts.

**Acceptance Scenarios**:

1. **Given** a study just created, **When** the assistant continues, **Then** it offers the folder and the guide, and starts neither.
2. **Given** a study with a folder, **When** the person asks to attach another, **Then** the assistant refuses and points to Fieldwork, where replacing states what it discards.
3. **Given** a person without access to the study's folder, **When** they ask about it, **Then** the assistant learns no folder name or count.

---

### User Story 4 - Select among choices (Priority: P1)

When the assistant offers a few clear options, the person selects one or several instead of typing. The selection is sent as their message. They can still write something else.

**Why this priority**: Offering the next steps should take one click, and the model cannot draw this itself.

**Independent Test**: With the test provider, get an offer of several choices, tick two and send: the person's message holds both, and the list can no longer be used.

**Acceptance Scenarios**:

1. **Given** a single-choice list, **When** the person selects an option, **Then** it is sent at once as their message.
2. **Given** a multiple-choice list, **When** the person ticks options and sends, **Then** all of them are sent as one message; nothing is sent without a selection.
3. **Given** a list, **When** the person writes their own message instead, **Then** that message answers it and the list can no longer be used.
4. **Given** invalid choices (fewer than two, more than six, too long), **When** the assistant offers them, **Then** nothing is shown and it is told why.
5. **Given** a study with its folder, and no guide, **When** the assistant continues, **Then** the list holds what is missing (the interview guide, the schedule), and nothing starts before the person chooses.

### Edge Cases

- A link pasted on another page: the assistant asks which study, or uses one named in the conversation; the card names the study.
- A second link before deciding: the new card replaces the open one.
- The folder changed or a colleague attached one between the card and Apply: Apply fails with its reason and nothing is replaced.
- The person leaves the conversation before the return from Google: the page opening is enough; the assistant does not go on elsewhere.
- The Drive connection was lost: treated as not connected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST be able to propose a Drive folder for a study with no folder, from the link the person gave.
- **FR-002**: The system MUST check the link and the person's access to the folder when proposing, with the rules of the app's form, and MUST give any refusal to the assistant during the same answer.
- **FR-003**: The card MUST show the study, the folder's name and owner. Nothing is attached without Apply, and nothing ever changes in Drive.
- **FR-004**: Apply MUST run the app's own command, and MUST NOT replace a folder attached in the meantime.
- **FR-005**: When Drive is not connected, the assistant MUST show a card with the explanation of the permission and a way to Google; it can never give the consent.
- **FR-006**: After a successful consent, the conversation MUST go on by itself on the study. After a refused one, it MUST NOT.
- **FR-007**: After Apply, Preparation MUST open while the interview guide or the schedule is not done, and Fieldwork otherwise. The assistant MUST continue once the inventory ended, or after one minute, with the counts or its state. This AI call MUST be recorded in the usage ledger and counted in the conversation's cost.
- **FR-008**: The assistant's context MUST hold, for people with access, whether a folder is attached and the inventory's state and counts by kind, and never file names.
- **FR-009**: The assistant MUST NOT replace or detach a folder.
- **FR-010**: Right after a study is created through the assistant, Preparation MUST open, and the assistant MUST offer the folder and the guide as choices, and start neither.
- **FR-010a**: The assistant MUST be able to offer two to six choices, single or multiple, on any answer. Selecting MUST send the choice as the person's own message; nothing else happens. A list MUST only be usable while it belongs to the last answer.
- **FR-011**: The journey MUST be documented in `docs/agent-journeys/05-study-folder.md`, with its diagrams.

### Key Entities

- **List of choices**: a question, two to six options, single or multiple; changes nothing by itself.
- **Folder card**: study, link, folder's name and owner, read when proposing.
- **Drive connection card**: the permission explained, and the way to Google; over once connected.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of invalid links, unreachable folders and studies that already have a folder give no attach card, with a reason reaching the assistant in the same answer.
- **SC-002**: A person with no Drive connection goes from pasting a link to the folder's card without writing another message.
- **SC-003**: No file name appears in what the assistant receives.
- **SC-005**: From a list of choices, a person answers in one click, or in two or more when several are ticked.
- **SC-006**: A new study whose folder was just added and with no guide never lands on Fieldwork.
- **SC-004**: The conversation's cost includes the answers that follow the consent and the Apply.

## Assumptions

- The consent's return already leads back to the study, with the conversation remembered in the browser.
- Preparation is done when a guide exists and at least one interview is planned; the person can still open any tab by themselves.
- The form inside Fieldwork and studies opened from their lists keep their tab.
- One minute covers most inventories; the page keeps showing a longer one.
- Permissions stay the app's: team, then the person's own Drive access to the folder.
- The token stays with the person who granted it: a card only ever uses the actor's own.
