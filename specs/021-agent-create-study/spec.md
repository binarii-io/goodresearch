# Feature Specification: Create a study with the assistant

**Feature Branch**: `021-agent-create-study`

**Created**: 2026-11-01

**Status**: Implemented

**Input**: User description: "Agent journey 4: create a study with the assistant, through a guided dialogue, in a project or in no project. The assistant checks the team's existing studies, keeps asking until the study's goal and its place are settled, and proposes a card the server can refuse. On Apply the study opens and the assistant offers to prepare the interview guide. The team's Studies page can create a study in no project. Out of scope: deleting a study, creating several studies at once, opening a study on its current step, writing the guide in this journey."

## Clarifications

### Session 2026-11-01

- Q: Should the assistant ask questions before proposing a study? → A: Yes, as for a project: it keeps asking until it has what it needs, with visible progress, and the server refuses a proposal while a point is open.
- Q: May a study be created outside any project? → A: Yes, through the assistant and on the team's Studies page, since a study belongs to a team and may be in no project (spec 019).
- Q: Does the assistant ask for the type? → A: No: interviews is the only type available.
- Q: Does the form inside a project change? → A: No. It still asks for a name and copies the project's goal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Frame and create a study with the assistant (Priority: P1)

A person asks the assistant for a study. The assistant asks what this study must learn, starting from the project's goal when there is one, and where the study goes. Once everything is confirmed, it shows a card with the name it suggests, the study's goal and its place. The person applies it, the study opens, and the assistant offers to prepare the interview guide.

**Why this priority**: The study's goal is read by every AI step inside the study; a study created with only a name starts them without direction.

**Independent Test**: With the test provider, a proposal made while a point is open shows no card and its reason reaches the model; once every point is done, the card appears, and Apply creates the study with that goal, opens it and continues the conversation.

**Acceptance Scenarios**:

1. **Given** a person on a project page, **When** they ask for a study, **Then** the assistant proposes the project's goal as a starting point and asks what this study must learn in particular, without proposing a card yet.
2. **Given** points still open, **When** the assistant proposes a study, **Then** no card appears and the assistant is told which points are open during the same answer.
3. **Given** an empty goal, **When** the assistant proposes a study, **Then** no card appears and the assistant is told why.
4. **Given** every point done, **When** the assistant proposes a study, **Then** a card shows the name, the study's goal, and the project or "no project" with the team.
5. **Given** a card, **When** the person applies it, **Then** the study exists with this goal, its page opens and the assistant offers to prepare the interview guide, without preparing it.
6. **Given** a card, **When** the person dismisses it, **Then** nothing is created and the assistant is told.

---

### User Story 2 - Reuse before creating (Priority: P1)

Before proposing a new study, the assistant compares the request with the studies of the team. When one looks related, it says so and offers to reuse it in the project. The person may still want a new one.

**Why this priority**: Facts already collected are worth more than a duplicate study (spec 019).

**Independent Test**: With a real model and a team that has a related study, ask for a similar study: the assistant names it and offers to reuse it before any new study card.

**Acceptance Scenarios**:

1. **Given** a related study in the team, **When** the person asks for a study on the same subject, **Then** the assistant names it and offers to reuse it.
2. **Given** the person prefers a new study, **When** they say so, **Then** the dialogue continues towards a new study.
3. **Given** the person is on a page other than a project's, **When** they ask for a study, **Then** the assistant still knows the studies of their teams.

---

### User Story 3 - A study in no project (Priority: P2)

A person creates a study that feeds no project yet, through the assistant or with a button on the team's Studies page. It appears on that page, and can be linked to a project later.

**Why this priority**: A study can already end up in no project, but cannot start that way.

**Independent Test**: On the team's Studies page, create a study with a name: it opens, is listed on that page in no project, and can be attached to a project.

**Acceptance Scenarios**:

1. **Given** a team member on the team's Studies page, **When** they create a study with a name and an optional goal, **Then** it belongs to that team and is in no project.
2. **Given** the assistant and a person who wants no project, **When** every point is done, **Then** the card says "no project" and names the team.
3. **Given** a person with several teams and no project chosen, **When** the team is not settled, **Then** the assistant asks which team.
4. **Given** a team the person is not a member of, **When** a study is requested for it, **Then** it is refused.

### Edge Cases

- The person has no team: the assistant explains a team is needed, as for a project, and shows no card.
- The project on the card was deleted or moved before Apply: Apply fails with the reason and the card stays readable.
- The project's goal is empty: the assistant asks for the study's goal from scratch.
- The person asks to "just create it" with points open: the assistant says what is missing and mentions the forms, which do not need this framing.
- A framing is under way when a study was just applied: that framing is over; another study starts again with every point open.
- A project framing and a study framing in one conversation do not count for each other.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST cover three points before proposing a study: reuse (existing studies compared, and the person wants a new one), goal (what the study must learn, confirmed by the person), place (a project, or explicitly no project with its team).
- **FR-002**: The assistant MUST report the state of each point during the dialogue, and the panel MUST show the progress.
- **FR-003**: The system MUST refuse a study proposal while a point is open or when the goal is empty, and MUST give the reason to the assistant during the same answer.
- **FR-004**: The system MUST check when proposing and again on Apply that the person can use the project or team.
- **FR-005**: The card MUST show the name, the study's goal, and the project or "no project" with the team. Nothing is created without Apply.
- **FR-006**: Applying the card MUST use the same creation rules as the app, with the card's goal, and MUST open the study.
- **FR-007**: After Apply, the assistant MUST continue without a new message and offer to prepare the interview guide; this AI call MUST be recorded in the usage ledger and counted in the conversation's cost.
- **FR-008**: Once a study is being framed, the assistant MUST know the studies of the person's teams, on any page, within a limited list.
- **FR-009**: The team's Studies page MUST let a team member create a study with a name and an optional goal, in no project.
- **FR-010**: The form inside a project MUST stay as it is: a name, and a copy of the project's goal.
- **FR-011**: The type MUST stay interviews and MUST NOT be asked.
- **FR-012**: The journey MUST be documented in `docs/agent-journeys/04-create-study.md`, with its diagrams.

### Key Entities

- **Study framing**: the three points and their states, for one conversation; over once a study is applied.
- **Study**: unchanged; it can now start in no project.

## Success Criteria *(mandatory)*

- **SC-001**: No study card can appear while a point is open or with an empty goal: 100% of such proposals are refused, each with a reason reaching the assistant in the same answer.
- **SC-002**: Every study created through the assistant has a non-empty goal confirmed on its card.
- **SC-003**: In the scenarios with a real model, in English and French, a related study is mentioned before any new study card.
- **SC-004**: A person can create a study in no project from the team's Studies page in under a minute.
- **SC-005**: The conversation's cost includes the answer that follows Apply.

## Assumptions

- Any member of the team may create a study, as today; no admin or creator rule is added.
- A study in no project gets its goal from the card or form, and may start empty only through the form.
- Whether the person really confirmed a point, and whether two studies are related, is the model's judgement: checked by scenarios, not by code.
- The study page keeps opening on its usual tab (parked).
- Right after a project's creation, the assistant only asks whether to prepare a first study; the framing starts with the person's answer, and the project just framed supplies its goal, so the assistant only has it confirmed.
