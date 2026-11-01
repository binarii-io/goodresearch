# Feature Specification: Create a research project with the assistant

**Feature Branch**: `018-agent-create-project`

**Created**: 2026-11-01

**Status**: Validated

**Input**: User description: "Agent journey: create a research project through a guided dialogue with the assistant, as described in docs/agent-journeys/01-create-project.md. The assistant keeps asking until it has every piece of information, like the interview guide design, shows its progress, and proposes the project only then. After Apply, the project opens and the assistant continues with the first study. Out of scope: an editable card, other journeys, changing the interview guide design."

## Clarifications

### Session 2026-11-01

- Q: Are the questions the assistant asks today defined by the app? → A: No, the model writes them, so they differ between conversations. This feature defines what must be found out.
- Q: May the assistant propose a project with information still missing, marked "to confirm"? → A: No. It keeps asking until it has everything, like the interview guide design.
- Q: What must it find out? → A: Research question, audience, decision to support, hypotheses, team. It suggests the name itself.
- Q: May hypotheses stay empty? → A: Only if the person says explicitly they have none yet.
- Q: What if the person insists on creating the project at once? → A: The assistant explains what is missing and keeps asking; it mentions the form, which stays as it is.
- Q: What happens after Apply? → A: The project opens and the assistant continues on its own by proposing the first study, at the cost of one more AI call.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Frame a project in a dialogue (Priority: P1)

A person asks the assistant, from any page, for help to create a research project. The assistant asks one or two short questions at a time about what it does not know yet: what the person wants to understand, about whom, what the results should help decide, what they expect to find, and for which team. A progress indicator in the panel shows how far the framing is. Once every point is covered, the assistant proposes the project with a name it suggests, and the card shows the name, team, question, objectives and hypotheses.

**Why this priority**: The research goal guides every later step; a vague goal weakens the interview guide, the insights and the recommendations.

**Independent Test**: Starting from "Help me create a research project", answer each question: no card appears before the last point is covered, the progress moves after each answer, and the final card holds what was said.

**Acceptance Scenarios**:

1. **Given** a person who gave no information, **When** they ask for help to create a project, **Then** the assistant asks one or two questions and shows no card.
2. **Given** a message that already gives the topic and the decision, **When** the assistant answers, **Then** it has the person confirm what it understood and asks only about what is missing.
3. **Given** any answer of the dialogue, **When** it ends, **Then** the panel shows the state of the framing, in text as well as visually.
4. **Given** a person who does not know what they will decide, **When** they say so, **Then** the assistant suggests options to help them choose and shows no card yet.
5. **Given** a person who says they have no hypotheses yet, **When** they say so, **Then** the assistant accepts it and moves on, and the card says there are none yet.
6. **Given** every point is covered, **When** the assistant answers, **Then** it summarises what it understood and asks whether it may propose the project; **When** the person agrees, **Then** the card shows a suggested name, the team, the question with its audience, the objectives and the hypotheses, and nothing is created until the person applies it.
7. **Given** a person who asks for changes to a card, **When** they say what to change, **Then** the assistant proposes a new card with the change, which replaces the open one: the earlier card shows as dismissed and can no longer be applied.

---

### User Story 2 - A project is never proposed unframed (Priority: P1)

Whatever the model does, the app refuses a project proposal while a point is open or when the question or objectives are empty. The assistant learns why within the same answer and goes back to asking; the person never sees a broken or empty card, and is never told about a card that does not exist.

**Why this priority**: This is what makes "always ask the right questions" true: instructions guide the model, but only the app can guarantee the result.

**Independent Test**: With the test provider, send a proposal while a point is still open, then one with an empty question: no card appears in either case, and the reason reaches the model during the answer.

**Acceptance Scenarios**:

1. **Given** a framing with a point not done, **When** the model proposes a project, **Then** the app refuses it, no card appears and the model receives the reason during the same answer.
2. **Given** an empty question or empty objectives, **When** the model proposes a project, **Then** the app refuses it in the same way.
3. **Given** a team the person cannot use, **When** the model proposes a project, **Then** the app refuses it in the same way.
4. **Given** a project already created in the conversation, **When** the person asks for a second one, **Then** the framing starts again and earlier answers do not open the way to a new proposal.
5. **Given** the form for a new project, **When** a person fills it in alone, **Then** it behaves exactly as today, including with an empty goal.

---

### User Story 3 - Continue on the new project (Priority: P2)

When the person applies the card, the project is created as with the form, its page opens, and the assistant continues on its own by proposing a first study, shown as a card that the person decides on.

**Why this priority**: Creating the project is only the start of the research; the assistant keeps the person moving instead of stopping on a link.

**Independent Test**: Apply a project card: the project page opens, a new answer from the assistant appears without a new message from the person, and it offers a first study which is created only on Apply. The conversation's cost includes this answer.

**Acceptance Scenarios**:

1. **Given** a project card, **When** the person applies it, **Then** the project is created with the same permissions and validation as the form, and its page opens.
2. **Given** the project was created, **When** its page opens, **Then** the assistant continues without a new message and proposes a first study.
3. **Given** that answer, **When** it ends, **Then** its AI call is recorded in the usage ledger and included in the conversation's cost.
4. **Given** the proposed study, **When** the person dismisses it, **Then** nothing is created and the assistant does not propose it again unchanged.
5. **Given** applying the card fails, **When** the person sees the card, **Then** it shows the reason, the page does not change and the assistant does not continue.
6. **Given** the continuing answer fails (provider down, no credit), **When** it stops, **Then** the project stays created and open, and the panel shows the failure as for any answer.
7. **Given** the conversation went on after the card was shown, **When** the person applies the card, **Then** the project page opens, the assistant does not continue on its own, and no error is shown.

---

### User Story 4 - Teams, duplicates and impatience (Priority: P2)

The assistant handles the situations around the dialogue: it takes the only team without asking, asks when there are several and nothing tells which, explains when the person has no team, points out a similar existing project, and keeps to the framing when the person says "just create it".

**Why this priority**: These cases decide whether the dialogue feels intelligent or mechanical, but the main journey works without them.

**Independent Test**: Run the manual scenarios of the journey document with a real model, in English and French.

**Acceptance Scenarios**:

1. **Given** one team, **When** the framing runs, **Then** the assistant does not ask about the team.
2. **Given** several teams and no hint in the message or page, **When** the framing runs, **Then** the assistant asks which team; **Given** a hint, **Then** it has the person confirm it.
3. **Given** no team, **When** the person asks for a project, **Then** the assistant explains that a team is needed and shows no card.
4. **Given** a similar project among those the person can open, **When** the framing reaches it, **Then** the assistant points it out and offers to open it; the person may still create a new one.
5. **Given** a person who says "just create it" with points missing, **When** the assistant answers, **Then** it says what is missing, keeps asking and mentions the form for a project without framing.

---

### Edge Cases

- The person changes topic during the framing: the assistant answers, and the framing can resume with what is known.
- The person moves to another page during the framing: the framing and its progress continue in the conversation.
- The person dismisses a card: the framing stays covered, and the assistant asks what to change rather than repeating the same card.
- The person stops an answer during the framing: what was said stays, and the last recorded progress stands.
- A card from before this feature is still pending: applying it works as it did, with the goal it holds.
- The person applies a card, then quickly navigates elsewhere: the project's page opens once, and the continuing answer is about the new project.
- Several proposals in one answer: only those that pass the checks appear.
- The model reports a malformed progress: it is refused with the reason, and the previous progress stands.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST be able to frame and propose a project from every page, and MUST ask one or two short questions at a time, never a block of questions.
- **FR-002**: The framing MUST cover five points: research question, audience, decision to support, hypotheses, team. The assistant MUST suggest the project name itself.
- **FR-003**: The assistant MUST NOT ask for what the message, page or conversation already gives; it MUST have the person confirm what it inferred. A point is done only once the person answered or confirmed it, or, for the team, when the person has only one.
- **FR-004**: After each answer of the framing, the state of each point (missing, partial, done) MUST be recorded and the panel MUST show the progress, computed by the app, as text and visually.
- **FR-005**: The app MUST refuse a project proposal unless the latest progress of the current framing has every point done. A framing starts after the last project applied in the conversation.
- **FR-006**: A project proposal MUST provide a question and objectives, both non-empty, and hypotheses, which may be empty only when the person said they have none. The app MUST compose the research goal from them, with headings in the language of the person's interface, and the card MUST show them. A new project proposal MUST replace an open one in the conversation.
- **FR-007**: Any refused proposal MUST give its reason to the model during the same answer, and MUST show no card.
- **FR-008**: The project MUST be created only on the person's Apply, through the same action as the form, with the same permissions and validation, at most once (constitution IV).
- **FR-009**: After a successful Apply of a project, the panel MUST open the project's page and the assistant MUST continue without a new message from the person, proposing a first study through a card.
- **FR-010**: The continuing answer MUST go through the AI Gateway, be recorded in the usage ledger, and count in the conversation's cost. The dialogue's other answers are recorded and shown the same way.
- **FR-011**: With no team, the assistant MUST explain and propose nothing.
- **FR-012**: The assistant MUST point out a similar project among those in its context and offer to open it, without preventing a new one.
- **FR-013**: The form for a new project and the behaviour of the other assistant actions MUST NOT change. Interview guide design MUST behave as it does today.
- **FR-014**: Proposal cards already pending MUST still apply as they did.
- **FR-015**: Every new string MUST exist in English and French, using the bilingual glossary, and every piece MUST come from the design system; the progress MUST meet WCAG 2.2 AA.
- **FR-016**: The answers and reasons sent to the model MUST hold no data outside the person's permissions, as for the existing page context.
- **FR-017**: Editing a card directly MUST NOT be added by this feature.
- **FR-018**: The journey document MUST be updated in the same change so that "Today" and "Target" match what is delivered, and the context map MUST define any new term.
- **FR-019**: Once every point is done, the assistant MUST summarise what it understood and ask whether it may propose the project before proposing it.

### Key Entities

- **Project framing**: the state of the five points in a conversation, as last reported; belongs to the conversation, stored with its other tool outcomes; ends when a project is applied.
- **Project proposal**: a suggested name, a team, a question, objectives and hypotheses; decided once by the person.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every automated scenario, no project card appears while a point is open or with an empty question or objectives.
- **SC-002**: With a real model, all the manual scenarios of the journey document pass in English and French.
- **SC-003**: A person who gives everything in their first message gets a card after at most one confirmation exchange.
- **SC-004**: Every project created through the assistant has a research goal with a question and objectives.
- **SC-005**: From Apply, the project page is open in under one second, on the reference setup, and the assistant's next answer starts without any action from the person.
- **SC-006**: No automated accessibility violation in the panel with the progress and the new card, in either language, in light and dark.

## Assumptions

- The framing reuses the interview guide design's way of working: a method the assistant follows, a progress the model reports and the app computes, and a bar in the panel.
- The app can check that a progress was reported, not that the person really answered. Marking a point done without an answer is prevented by instructions only, and checked by the manual scenarios.
- Similar projects are looked for among the 30 most recent projects the assistant receives today; one beyond that goes unnoticed.
- The audience stays part of the question, as the project has no audience field; the interview guide design refines it later.
- The project's goal stays one text: existing projects, the form and later AI steps read it as they do today.
- The journey document, docs/agent-journeys/01-create-project.md, is the reference for the diagrams and the manual scenarios.
