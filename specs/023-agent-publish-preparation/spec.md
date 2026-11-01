# Feature Specification: Publish the preparation with the assistant

**Feature Branch**: `023-agent-publish-preparation`

**Created**: 2026-11-01

**Status**: Implemented

**Input**: User description: "Agent journey 6: once a guide is applied through the assistant, it proposes to push the guide and the best practices to the study's Drive folder. And when the person asks what the next step is, it answers naturally from the real state of the study."

## Clarifications

### Session 2026-11-01

- Q: What does the assistant propose to publish? → A: The interview guide and the best practices. The schedule stays in the app's Preparation tab for now.
- Q: Who decides what the next step is? → A: The app computes it from the study's state, so the answer never depends on what the model remembers; the model only puts it in words.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish after the guide (Priority: P1)

A person finishes a guide with the assistant and applies it. Without a new message, the assistant says the guide is saved and offers to push it to Drive with the best practices. A card shows both documents and the folder. On Apply, the files are created and the card links to them.

**Why this priority**: The team works from these documents during interviews.

**Independent Test**: With the simulated Drive, apply a guide card on a study with a folder: the assistant offers to publish; the card creates nothing before Apply; after Apply, Preparation lists both publications.

**Acceptance Scenarios**:

1. **Given** a guide just applied on a study with a folder, **When** the assistant continues, **Then** it offers to publish the guide and the best practices, and writes nothing.
2. **Given** the person agrees, **When** the assistant proposes, **Then** a card names the documents and the folder, and says the files are created in it.
3. **Given** a card, **When** the person applies it, **Then** the same rules as the Preparation tab run and both files exist in the folder; the card links to them.
4. **Given** a card, **When** the person dismisses it, **Then** nothing is written and the assistant is told.
5. **Given** the guide is already published, **When** the assistant proposes both, **Then** only the best practices are on the card; if both are, no card appears and it is told that updates happen in Preparation.
6. **Given** no guide, **When** the assistant proposes the guide, **Then** no card appears and it is told why.

---

### User Story 2 - Missing folder or permission (Priority: P1)

Publishing needs a folder and the right to edit in Drive. Without a folder, the assistant offers to add it first. Without the right, a card leads to Google's consent, and the conversation goes on at the return.

**Why this priority**: A first publication usually meets the editing permission.

**Independent Test**: With an account that may only read, propose publishing: the card leads to the consent; at the return, the publication's card appears without a new message.

**Acceptance Scenarios**:

1. **Given** a study with no folder, **When** the assistant proposes publishing, **Then** no card appears, it is told why, and it offers to add the folder.
2. **Given** no permission to edit, **When** the assistant proposes publishing, **Then** a card explains what editing allows and leads to Google; nothing else happens.
3. **Given** the consent given, **When** the person returns, **Then** the same conversation goes on by itself, and the publication's card appears.
4. **Given** the consent refused, **When** the person returns, **Then** the app says so and the assistant waits.

---

### User Story 3 - What comes next (Priority: P1)

At any moment on a study, the person asks what the next step is. The assistant answers in natural words from the real state: guide, folder, publication, planned interviews, then Fieldwork, and offers the steps as choices.

**Why this priority**: The person must never have to guess, and the assistant must not answer from memory.

**Independent Test**: For each state of a study, the assistant's context names the same next step as the state calls for.

**Acceptance Scenarios**:

1. **Given** no guide, **When** the person asks, **Then** the next step is writing it.
2. **Given** a guide and no folder, **When** the person asks, **Then** the next step is adding the folder.
3. **Given** a guide and a folder, not published, **When** the person asks, **Then** the next step is publishing.
4. **Given** a publication done and nothing planned, **When** the person asks, **Then** the next step is planning the interviews.
5. **Given** all of it, **When** the person asks, **Then** the next step is running the interviews in Fieldwork.
6. **Given** a person without access to the study's folder, **When** they ask, **Then** the assistant learns nothing about the folder and says access is needed.

### Edge Cases

- A guide applied ends its design: the progress bar becomes one line saying it is finished, which the person can close. A later change of the guide shows the bar again.
- Someone published in the meantime, between the card and Apply: Apply fails with its reason and creates no second file.
- The guide changed after publishing: the document stays out of date in the Preparation tab, where updates happen.
- The person edited the guide by hand in the app: the next step still follows the state; no message follows by itself.
- The assistant's language differs from the person's interface: documents use the conversation's language.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a guide is applied from a card, the assistant MUST continue by itself and offer what comes next. This AI call MUST be recorded in the usage ledger and counted in the conversation's cost.
- **FR-002**: The assistant MUST be able to propose publishing the guide and the best practices of a study.
- **FR-003**: The system MUST check the proposal when made, and give any refusal to the assistant during the same answer: no folder, no guide, no access, or nothing left to publish.
- **FR-004**: The card MUST name the documents and the folder. Nothing is written without Apply, and Apply MUST run the rules of the Preparation tab.
- **FR-005**: A document already published MUST NOT be created again.
- **FR-006**: Without the right to edit, the assistant MUST show a card leading to the consent; after a successful consent, the conversation MUST go on by itself, and after a refused one it MUST NOT.
- **FR-007**: The system MUST compute a study's next step from its real state, in this order: guide, folder, publication, planned interviews, Fieldwork, and give it to the assistant on the study's page.
- **FR-008**: When asked, the assistant MUST answer from that state in natural words, and MAY offer the steps as choices.
- **FR-009**: The journey MUST be documented in `docs/agent-journeys/06-publish-preparation.md`, with its diagrams.

### Key Entities

- **Publication card**: study, documents, folder, language.
- **Next step**: derived from the study's state; never stored.

## Success Criteria *(mandatory)*

- **SC-001**: In all five states of a study, the app names the expected next step.
- **SC-002**: 100% of proposals with no folder, no guide or nothing left to publish give no card, with a reason reaching the assistant in the same answer.
- **SC-003**: A person with a guide just applied gets to published documents in two clicks when Drive allows editing.
- **SC-004**: No document is ever created twice for a study.
- **SC-005**: The conversation's cost includes the answers that follow the guide, the consent and the publication.

## Assumptions

- Publication is done when both the guide and the best practices are published; an out-of-date document still counts.
- Editing permission and files stay the person's own, as in the Preparation tab.
- The study's folder is required, as in the Preparation tab.
- Applied cards are the only trigger: a guide saved by hand brings no message.
- This builds on spec 022's connection card and lists of choices.
