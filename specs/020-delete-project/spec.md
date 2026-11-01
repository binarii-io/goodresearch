# Feature Specification: Delete a research project

**Feature Branch**: `020-delete-project`

**Created**: 2026-11-01

**Status**: Validated

**Input**: User description: "Delete a research project, from the app and through the assistant, always with a validation. The assistant only shows a card; the person confirms by typing the project's exact name, and the server checks it. Allowed for admins and the project's creator. Studies are not deleted. Out of scope: a bin or undo, deleting the project's studies at the same time, deleting a study through the assistant."

## Clarifications

### Session 2026-11-01

- Q: How strong is the confirmation? → A: The person types the project's exact name, on the assistant's card and in the app; the server checks it. One click is too light for an action with no way back.
- Q: Who may delete? → A: Admins and the project's creator. A team member alone cannot erase the others' work.
- Q: Is there a button in the app as well? → A: Yes, with the same confirmation, so deleting does not depend on an AI provider.
- Q: What happens to the project's studies? → A: They stay. Those linked only to this project end up in no project, on the team's Studies page, and the confirmation says so.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delete a project from the app (Priority: P1)

An admin or the project's creator chooses "Delete the project" on its page. A confirmation states what is deleted for good, what stays, and asks to type the project's name. Once deleted, the person lands on the projects list.

**Why this priority**: This is the capability itself, and it works without any AI provider.

**Independent Test**: As the creator of a project with insights and a study, delete it by typing its name: it leaves the lists and its page says not found, the study stays on the team's Studies page in no project, with its facts.

**Acceptance Scenarios**:

1. **Given** the project's creator or an admin, **When** they open the project, **Then** the delete action is available.
2. **Given** another team member, **When** they open the project, **Then** the action is not offered, and a direct request is refused.
3. **Given** the confirmation, **When** it opens, **Then** it shows the number of insights and recommendations deleted, whether key takeaways are, the studies that stay, and how many of them will be in no project.
4. **Given** the confirmation, **When** the typed name is not exactly the project's, **Then** the action stays unavailable, and a direct request with a wrong name is refused and deletes nothing.
5. **Given** the right name, **When** the person confirms, **Then** the project is deleted and they land on the projects list.
6. **Given** a run of insights or recommendations in progress on the project, **When** the person confirms, **Then** the deletion is refused with the reason, and nothing changes.

---

### User Story 2 - Studies and outside files stay (Priority: P1)

Deleting a project never deletes evidence: studies keep their interviews, transcripts, facts and decisions, and files in Drive and published documents are not touched.

**Why this priority**: The action has no way back, so what it does not touch must be certain.

**Independent Test**: Delete a project with one study of its own and one shared with another project: the first is in no project, the second stays in the other project, and all their facts and decisions are unchanged.

**Acceptance Scenarios**:

1. **Given** a study only in this project, **When** the project is deleted, **Then** it appears on the team's Studies page with no project, with everything it held.
2. **Given** a study also in another project, **When** the project is deleted, **Then** it stays in that project, with no change there.
3. **Given** a published debrief deck, **When** the project is deleted, **Then** the file stays in Drive, and the app only forgets it; the confirmation says so.
4. **Given** AI costs already spent, **When** the project is deleted, **Then** the usage ledger keeps its entries.

---

### User Story 3 - Ask the assistant (Priority: P1)

The person asks the assistant to delete a project. The assistant shows a card with the same information and the same field for the name. Nothing can be deleted without the person typing the name and applying the card.

**Why this priority**: This is the request that started this journey: the assistant can help, and can never delete alone.

**Independent Test**: Ask the assistant to delete a project: a card appears with the volumes and the name field, Apply stays unavailable until the name is typed, and whatever the model sends, no call of its own deletes anything.

**Acceptance Scenarios**:

1. **Given** a person allowed to delete, **When** they ask to delete a project, **Then** a card shows the name, what is deleted and what stays, with the name field.
2. **Given** the card, **When** the person has not typed the exact name, **Then** Apply is unavailable, and a direct request without it is refused and leaves the card open.
3. **Given** the right name, **When** the person applies the card, **Then** the project is deleted through the same action as the app's, and if its page is open they land on the projects list.
4. **Given** a person not allowed to delete, or a run in progress, **When** the assistant proposes it, **Then** no card appears and the assistant gets the reason during the same answer, and explains it.
5. **Given** several projects that could match, **When** the person asks, **Then** the assistant asks which one instead of guessing.
6. **Given** a conversation, **When** nobody asked to delete a project, **Then** the assistant does not propose it.
7. **Given** a card left open, **When** the project was renamed or changed since, **Then** applying compares with its current name and current state, and the card fails with the reason if they no longer match.
8. **Given** the card applied or dismissed, **When** the conversation goes on, **Then** the assistant knows the outcome, and does not propose the same deletion again if dismissed.

---

### Edge Cases

- A creator whose account was deleted: only admins can delete the project.
- A creator who left the team: they no longer have access, so they cannot delete it; an admin can.
- A name with accents, capitals or spaces: it must match exactly, apart from spaces at both ends.
- Two people delete the same project at once: one succeeds, the other is told it does not exist any more.
- Other people on the project's page: their next action says it does not exist any more, as for any page that is gone.
- A pending assistant card about a deleted project (rename, goal, attach): applying it fails with a clear reason, and nothing else changes.
- A team whose last project is deleted: it still cannot be deleted while it has studies.
- Conversations mentioning the project stay, as text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Admins and the project's creator with access to its team MUST be able to delete a project; anyone else MUST be refused, and a person without access MUST get "not found".
- **FR-002**: Deleting MUST require the project's exact current name, checked by the server, apart from spaces at both ends.
- **FR-003**: Deleting MUST remove for good the project, its insights, recommendations, key takeaways, runs and records of published decks, and its links to studies.
- **FR-004**: Deleting MUST NOT change any study, interview, transcript, fact, decision or planned interview, any file in Drive or published document, or the usage ledger.
- **FR-005**: Deleting MUST be refused while an insight or recommendation run is live on the project.
- **FR-006**: The confirmation, in the app and on the card, MUST state what is deleted with its volumes, that it cannot be undone, which studies stay and how many end up in no project. Reading these volumes MUST use counts and make no AI call.
- **FR-007**: The app MUST offer the action on the project's page only to the people of FR-001.
- **FR-008**: The assistant MUST be able to propose a deletion only through a card with the name field. The model MUST NOT be able to provide the name or to run the deletion. The name MUST be typed by the person and sent only when they apply the card.
- **FR-009**: A refused proposal MUST give its reason to the model during the same answer and show no card.
- **FR-010**: A failed Apply because of a wrong name MUST leave the card open and retried; any other failure follows the existing card rules, with its reason.
- **FR-011**: After a deletion, the person MUST land on the projects list if they were on the project's page.
- **FR-012**: Every new string MUST exist in English and French, using the bilingual glossary; every piece MUST come from the design system and meet WCAG 2.2 AA, including the name field's error.
- **FR-013**: The journey MUST be documented in `docs/agent-journeys/03-delete-project.md` with Mermaid, and the context map updated.
- **FR-014**: A bin or undo, deleting studies with the project, and deleting a study through the assistant MUST NOT be added by this feature.

### Key Entities

- **Project deletion**: what would be deleted and what stays for one project, read for the confirmation; stored nowhere.
- **Delete proposal**: an assistant card targeting one project. It never holds the typed name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every automated scenario, no project is deleted without the exact name supplied at Apply by the person.
- **SC-002**: In every automated scenario, after a deletion, every study of the project keeps the same number of interviews and facts.
- **SC-003**: A person allowed to delete does so in under 30 seconds, from the project's page or the assistant.
- **SC-004**: With a real model, the assistant never proposes a deletion nobody asked for, in the manual scenarios of the journey document, in English and French.
- **SC-005**: No automated accessibility violation in the confirmation and the card, in either language, in light and dark.

## Assumptions

- There is no copy of what is deleted: restoring a project means restoring a database backup.
- Being the creator is read from the project's existing record; projects with no recorded creator can be deleted by admins only.
- Insights and recommendations belong to the project, so they go with it even when their study stays in another project.
- Deleting is not recorded in a separate audit log in this version.
