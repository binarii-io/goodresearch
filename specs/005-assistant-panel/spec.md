# Feature Specification: Assistant chat in a side panel

**Feature Branch**: `005-assistant-panel`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "A chat assistant present everywhere, which opens in a panel on the right with a button next to the language switch; the opening and closing are animated." It runs on the person's own AI provider (spec 004). It is an intermediate feature before the interview guide assistant (006), which will reuse the panel.

## Clarifications

### Session 2026-10-24

- Q: What can the assistant do in this version? → A: It knows the page that is open (project, study) and can **propose actions** (create a project or a study, rename them, write the research goal), each executed only after the person confirms it (constitution IV, AI proposes, humans decide).
- Q: Are conversations kept? → A: Yes, as a **list of conversations** the person can reopen, rename and delete, stored for them on the server (available on all their devices).
- Q: How does the panel open on a computer? → A: It **pushes the content**: the page narrows so the page and the chat are read side by side. On a phone it takes the whole screen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open the assistant from anywhere and chat (Priority: P1)

On any signed-in page, a button at the right end of the top bar, next to the language switch and right beside the panel, opens the assistant panel on the right. The panel slides in while the page narrows to make room; the same button (or the panel's close button, or Escape) slides it out. In the panel the person types a question and the answer appears as it is written. They can stop an answer in progress. The panel stays open, with the same conversation, while they move between pages, and it is open again after a reload if it was open before.

**Why this priority**: It is the frame of every AI interaction to come; alone, it already helps people with their research questions.

**Independent Test**: Open the panel on the home page, ask a question, see the answer stream in, navigate to a project with the panel open, close it with Escape, reload.

**Acceptance Scenarios**:

1. **Given** any signed-in page, **When** the person activates the assistant button at the right end of the top bar, **Then** the panel slides in from the right in about 200 ms while the page content narrows, focus moves to the message field, and the button shows it is pressed.
2. **Given** the open panel, **When** the person activates the button again, the panel's close button or presses Escape in the panel, **Then** it slides out, the page takes its full width again and focus returns to the assistant button.
3. **Given** the panel, **When** the person sends a message, **Then** it appears in the conversation at once and the answer is shown as it is written; a "Stop" button ends it, keeping what was written.
4. **Given** the person prefers reduced motion, **When** the panel opens or closes, **Then** it appears or disappears without sliding.
5. **Given** a phone-width screen, **When** the panel opens, **Then** it covers the whole screen, with the close button at the top.
6. **Given** the provider fails (quota, outage, revoked key), **When** an answer is requested, **Then** the panel shows the reason and the action in plain words (spec 004 texts), and a link to the AI provider page when the person must act.

---

### User Story 2 - The assistant knows the open page (Priority: P1)

When the person asks something, the assistant receives the context of the page they are on: the project (name, team, research goal) and its studies; the study (name, type, phase, folder name when the person has access to it). It answers with that context ("Rephrase this goal", "What studies would help this project?"). A line under the field says which page the assistant is looking at.

**Why this priority**: The value of an in-app assistant over a general chat is that it knows what the person is working on.

**Independent Test**: Open a project with a goal, ask "Summarise the goal of this project in one sentence": the answer is about that goal; open a study and ask what phase it is in.

**Acceptance Scenarios**:

1. **Given** a project page, **When** the person sends a message, **Then** the assistant receives the project's name, team, research goal and the names and types of its studies, and the panel shows "Looking at: Project <name>".
2. **Given** a study page, **When** the person sends a message, **Then** the assistant receives the study's name, type, current phase, its project's name and goal, and the folder's name only if the person has access to the folder (spec 002 FR-010a); never file names or file contents in this version.
3. **Given** a page without a specific object (home, teams, members), **When** the person sends a message, **Then** the assistant receives which page it is and the person's teams.
4. **Given** the context of a page the person cannot access, **When** a message is sent, **Then** no data of that page is sent (the context is built on the server with the person's own permissions).

---

### User Story 3 - The assistant proposes actions the person confirms (Priority: P1)

The assistant can propose to create a project (name, team, goal), write or rewrite a project's research goal, rename a project, create an interview study in a project, or rename a study. A proposal appears in the conversation as a card describing exactly what will change, with "Apply" and "Dismiss". Nothing changes until the person applies it; applying runs the same action as the corresponding button in the app, with the person's permissions and the same validation, then the card shows the result with a link to the created or changed object. The assistant is told the outcome and continues.

**Why this priority**: The product owner wants an assistant that helps do the work, not only talk; confirmation keeps people in control (constitution IV).

**Independent Test**: On a project page, ask "Write a research goal about onboarding friction": a card shows the new goal; "Apply" updates the project page; ask "Create a study for 8 interviews with new users": a card shows the study; "Dismiss" creates nothing.

**Acceptance Scenarios**:

1. **Given** a conversation, **When** the assistant proposes an action, **Then** a card shows its kind, the target (project, team) and every value that will be written, with "Apply" and "Dismiss"; nothing has changed yet.
2. **Given** a proposal card, **When** the person applies it, **Then** the change is made exactly as shown, with the person's permissions; the card shows "Applied" with a link, and the open page reflects the change.
3. **Given** a proposal the person may not apply (no access to the team, the study's folder, a name already used, stale version), **When** they apply it, **Then** the card shows the same error message as the app's own form, and nothing changes.
4. **Given** a proposal card, **When** the person dismisses it, **Then** it shows "Dismissed" and the assistant is told, so it does not propose it again unchanged.
5. **Given** an applied or dismissed card, **When** the conversation is reopened later, **Then** the card shows its final state and cannot be applied again.
6. **Given** a project goal changed elsewhere since the proposal, **When** the person applies a goal proposal, **Then** it is refused with the "changed in the meantime" message (optimistic concurrency, spec 001).

---

### User Story 4 - Keep, find and manage conversations (Priority: P2)

The panel header shows the current conversation's title and a list button. The list shows the person's conversations, most recent first, with their title and date; the person can open one, start a new one, rename one, or delete one (with confirmation). A new conversation gets a title from its first message. Conversations are private to the person.

**Why this priority**: Useful from the second day of use; the panel works with a single conversation meanwhile.

**Independent Test**: Have two conversations, switch between them, rename one, delete the other, sign in on another browser and find the remaining one.

**Acceptance Scenarios**:

1. **Given** the panel, **When** the person opens the list, **Then** their conversations appear most recent first, with title and last activity.
2. **Given** the list, **When** the person chooses "New conversation", **Then** an empty conversation opens; it gets a title from its first message.
3. **Given** a conversation, **When** the person renames it, **Then** the new title shows in the header and the list.
4. **Given** a conversation, **When** the person deletes it and confirms, **Then** it and its messages are deleted; another conversation (or an empty one) opens.
5. **Given** another person, **When** they use the app, **Then** they never see someone else's conversations; an admin does not see them either.
6. **Given** account deletion (spec 001), **When** an account is deleted, **Then** its conversations are deleted.

### User Story 5 - The assistant opens pages (Priority: P2)

The person asks the assistant to open a project or a study ("open the onboarding project", "take me to the diary study"). The assistant opens the page as if the person had navigated to it; the panel stays open and the message keeps a link to that page. Opening a page changes no data, so there is no card to confirm. The assistant knows the projects the person can open (most recent first) and the studies of the open project.

**Why this priority**: The product owner wants the assistant to move around the app with the person; it builds on US1–US3.

**Independent Test**: From a project page, ask to open one of its studies: the study page opens with the panel still open; ask to open a project: its page opens.

**Acceptance Scenarios**:

1. **Given** the panel, **When** the person asks to open a project or a study they can access, **Then** that page opens, the panel stays open with the conversation, and the message shows "Opened the project/study" with a link.
2. **Given** a project or study the person cannot access, **When** the assistant tries to open it, **Then** nothing opens and the assistant is told the object is out of reach.
3. **Given** a conversation reopened later, **When** its messages are shown, **Then** the opened pages appear as links and nothing navigates by itself.
4. **Given** a study, **When** the person asks for one of its tabs (Preparation, Fieldwork, Analysis), **Then** the assistant opens the study on that tab (or switches tab on the open study); the current tab is part of the page context it receives.

### User Story 6 - See what the conversation costs (Priority: P2)

Next to the Send button, a small circle shows, on hover or keyboard focus, the cost of the whole conversation and the cost of the last message. It updates after each answer. Costs come from the person's usage records priced with a dated catalog: each call is priced on the day it was made, so a price change (for example Gemini 3.8 Flash doubling on 1 January 2027) applies only to calls from that day.

**Why this priority**: People pay their own provider (spec 004); they want to see what they spend while they work.

**Independent Test**: Send two messages, hover the circle: the conversation total and the last message's cost appear; with an unpriced model, "unknown" appears instead of a misleading total.

**Acceptance Scenarios**:

1. **Given** a conversation, **When** the person hovers or focuses the circle, **Then** it shows "This conversation: $x" and "Last message: $y", in the interface language.
2. **Given** a new answer, **When** it completes, **Then** both amounts are updated.
3. **Given** a call made with a model that has no price, **When** costs are shown, **Then** the amounts say "unknown".
4. **Given** a price that changes on a date, **When** calls are priced, **Then** each call uses the price in force on its day.

### Edge Cases

- No working AI provider (spec 004 gate): cannot happen inside the app shell; if the provider fails during a conversation, the error is shown in the panel and the conversation is kept.
- A very long conversation: only the most recent messages that fit a fixed budget are sent to the model, plus the page context; older ones stay visible.
- The person navigates while an answer is being written: the answer keeps streaming in the panel.
- The person closes the browser during an answer: the part written so far is saved; the usage entry is recorded (spec 004).
- The model proposes an action with invalid values (empty name, unknown team): the proposal is not shown as a card; the assistant is told the values were invalid.
- The model proposes an action on an object the person cannot see: refused when building the card, never shown.
- Text from the model is shown as plain text with simple formatting (paragraphs, lists, bold, code); links are shown only for https addresses; no HTML from the model is rendered.
- Two tabs with the same conversation: messages sent in one appear in the other when it is reopened or refreshed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every signed-in page MUST show an assistant button at the right end of the top bar (after the language switch, beside the panel), with a state (pressed / not pressed) exposed to assistive technologies.
- **FR-002**: The panel MUST open on the right, pushing the page content on screens of 768 px and wider and covering the screen below; opening and closing MUST be animated (slide and width, about 200 ms) unless the person prefers reduced motion.
- **FR-003**: Opening moves focus into the panel; closing (button, close button, Escape) returns focus to the assistant button; the open state is remembered per browser.
- **FR-004**: Answers MUST stream as they are written and can be stopped; partial answers are kept.
- **FR-005**: Each message MUST be sent with the context of the open page, built on the server from the page reference and the person's own permissions (projects, studies, folder names only with folder access), and never file names or contents.
- **FR-006**: The assistant MUST only propose the actions listed in User Story 3; each proposal is validated against the same rules as the app's forms before it is shown.
- **FR-007**: A proposal MUST be applied only after the person's explicit "Apply", through the same commands as the app (permissions, validation, versions), at most once; dismissing is recorded and told to the assistant.
- **FR-008**: Conversations and messages MUST be stored per person, visible only to that person, listable, renamable and deletable; deleted with the account.
- **FR-009**: Every model call MUST go through the AI Gateway of spec 004 with the person's provider (task `assistant`), and provider failures MUST be shown with the spec 004 texts.
- **FR-010**: Text from the model MUST be rendered safely: no HTML, only paragraphs, lists, emphasis, code and https links.
- **FR-011**: Every user-facing text MUST be available in English and French; the assistant answers in the interface language unless the person writes in another one.
- **FR-013**: The assistant MUST be able to open a project or study page the person can access, at once and without confirmation (no data changes); only when the answer is being received, never when a past conversation is shown.
- **FR-014**: The panel MUST show the conversation's total cost and the last message's cost (USD), computed when read from a dated price catalog (built-in for the default models, extendable by the deployer with `AI_PRICES`); unknown when a model has no price.
- **FR-012**: The panel MUST meet WCAG 2.2 AA: the conversation is a log announced to screen readers, proposal cards and their buttons are reachable by keyboard, and the streaming answer does not flood screen readers (announced when complete).

### Key Entities

- **Conversation**: owner, title, created and last activity dates.
- **Message**: conversation, role (person / assistant), text, status (complete / stopped / failed), page reference it was sent from, date.
- **Action proposal**: message it belongs to, kind (create project, update goal, rename project, create study, rename study), target reference, values, state (proposed / applied / dismissed / failed), result reference, decided by and when.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The panel opens or closes in at most 250 ms, and the first words of an answer appear within 3 s of sending for a typical question (provider permitting).
- **SC-002**: 100 % of applied proposals produce exactly the change shown on their card; 0 changes happen without "Apply".
- **SC-003**: 0 context data from a page or object the person cannot access is ever sent to the model (checked by tests).
- **SC-004**: A person can find and reopen a past conversation in under 10 seconds.
- **SC-005**: 0 automated accessibility violations (WCAG 2.2 AA) with the panel open and closed, in English and French, on desktop and phone widths.

## Assumptions

- The assistant's instructions (role, tone, what it may propose) are product text maintained in the repository, in English, without company or customer context; the answer language follows the person.
- The message budget sent to the model is a fixed number of recent messages and characters (set in the plan); no summarisation of older messages in this version.
- Search across conversations, sharing a conversation, attachments, reading Drive file contents and the interview guide are out of scope (the guide comes in 006, in this panel).
- Usage stays visible on the "AI provider" page (spec 004); no per-conversation cost display in this version.
