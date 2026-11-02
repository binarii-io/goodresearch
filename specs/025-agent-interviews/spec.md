# Feature Specification: Interviews with the assistant

**Feature Branch**: `025-agent-interviews`

**Created**: 2026-11-02

**Status**: Implemented

**Input**: User description: "The assistant lists, analyses, decides and validates interviews. The tool must be smart, with basic filters such as to decide, without transcript, without recording, so that it never has to list everything."

## Clarifications

### Session 2026-11-02

- Q: May the assistant receive the names of interviews? → A: Yes, under the same consent as the folder, per study and provider, so it can say what is wrong with a given interview. Without consent, or on a study set to anonymise names, counts only.
- Q: Must it list every interview each time? → A: No: it asks for counts first, then only what a filter selects. Without a filter it can still get them all, page by page, to unblock itself.
- Q: Do proposing and validating need two tools? → A: The assistant only proposes; validating is the person's Apply. Validating and excluding are separate tools and cards.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where interviews stand, by filter (Priority: P1)

The person asks what is left to do. The assistant gets the counts, then lists only what is asked: interviews to decide, without transcript, without recording, and so on.

**Why this priority**: The person wants to know what needs them, without reading through everything.

**Independent Test**: On a study with interviews in each state, each filter gives exactly the expected interviews, and counts come without any name.

**Acceptance Scenarios**:

1. **Given** a study, **When** the assistant asks for counts, **Then** it gets the number of interviews by state: to decide, without transcript, without recording, not analysed, ready to validate, validated, excluded.
2. **Given** a filter, **When** the assistant lists, **Then** it gets only the matching interviews, with what is left to decide on each.
3. **Given** several filters, **When** the assistant lists, **Then** an interview must match all of them.
4. **Given** a part of a name, **When** the assistant lists, **Then** accents and capitals do not count.
5. **Given** more interviews than a page holds, **When** the assistant lists, **Then** it is told how many match and can ask for the next page.
5a. **Given** no filter, **When** the assistant lists, **Then** it gets every interview, page by page, so it can always unblock itself.
6. **Given** no consent, **When** the assistant lists, **Then** the consent card appears; counts stay available.
7. **Given** a study set to anonymise names, **When** the assistant lists, **Then** it is refused with the reason, and counts stay available.
8. **Given** a person without access to the folder, **When** the assistant asks, **Then** it gets nothing.

---

### User Story 2 - Start the analysis (Priority: P1)

The assistant offers to analyse the interviews not analysed yet. A card shows how many, the estimated cost and what is sent. On Apply the run starts; at its end the assistant says what it found.

**Why this priority**: Proposals to decide come from the analysis.

**Independent Test**: Apply the card: the run starts with the same rules as the Fieldwork tab; at its end, the assistant gives the counts without a new message.

**Acceptance Scenarios**:

1. **Given** interviews not analysed, **When** the assistant proposes, **Then** a card shows their number, the estimated cost and the consent to send transcripts, when needed; nothing starts.
2. **Given** nothing to analyse, or a run in progress, **When** the assistant proposes, **Then** no card appears and it is told why.
3. **Given** a card, **When** the person applies it, **Then** the run starts.
4. **Given** the run over, or one minute passed, **When** the assistant continues, **Then** it gives the counts or says the run goes on. This AI call is counted in the conversation's cost, and the run's own cost stays shown where it is today.

---

### User Story 3 - Decide the proposals (Priority: P1)

A card groups proposals by interview: people, date, language, name. The person unticks what they refuse, or leaves it undecided, and applies.

**Why this priority**: This is the repetitive work that one card makes fast.

**Independent Test**: On two interviews with proposals, untick one line and apply: ticked proposals are accepted, the other stays to decide.

**Acceptance Scenarios**:

1. **Given** interviews with proposals, **When** the assistant proposes, **Then** one card shows each interview and its proposals, each with its origin.
2. **Given** a proposal with a date found elsewhere that differs, **When** shown, **Then** the card flags it and it starts unticked.
3. **Given** a card, **When** the person applies it, **Then** ticked proposals are accepted, unticked ones stay to decide, and none is rejected.
4. **Given** an interview changed since the card, **When** applied, **Then** that interview fails with its reason, and the others go on.

---

### User Story 4 - Validate or exclude (Priority: P1)

A card lists the interviews ready to validate. Others can be excluded, with a reason asked of the person.

**Why this priority**: Validation is what lets interviews move on to the next phases.

**Independent Test**: Apply a card validating two interviews and excluding one with its reason: states follow, and each line gives its outcome.

**Acceptance Scenarios**:

1. **Given** interviews ready, **When** the assistant proposes, **Then** a card lists them, each to untick.
2. **Given** an interview to exclude, **When** the assistant proposes it, **Then** the line needs a reason, which the person can correct on the card.
3. **Given** an interview without transcript, or already decided, **When** proposed, **Then** the app's rules apply and that line gives the reason.
4. **Given** a card applied, **When** it ends, **Then** the assistant says where things stand and what comes next, with choices; the next step of the study moves on.

### Edge Cases

- A document joined to an interview without transcript stays a document: the Fieldwork tab shows the missing transcript in red, with the reason on hover, and the document with its own icon; a missing recording has its own icon too.
- The assistant says plainly that an interview has no transcript, even if a document summarises it, and that accepting suggestions validates nothing.
- Filters that match nothing: an empty list, with the counts, not an error.
- An analysis running: cards deciding the interviews it covers are refused with the reason.
- A person's decision is never overwritten: a card only touches what is still undecided.
- A new inventory between card and Apply: lines whose interview changed fail with their reason.
- Consent given for the folder covers the list; the analysis keeps its own consent, as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST be able to read counts of a study's interviews by state, without any name and without consent.
- **FR-002**: The assistant MUST be able to list interviews by filters, combined: to decide, without transcript, without recording, not analysed, ready to validate, validated, excluded, part of a name.
- **FR-003**: Without any filter, the list MUST give every interview. A list MUST hold at most 50 interviews per page, say how many matched, and let the assistant ask for the next page.
- **FR-004**: Lists MUST need the consent of spec 024 for this study and provider, and MUST be refused on a study set to anonymise names.
- **FR-005**: The assistant MUST be able to propose starting the analysis, on a card with the number, the estimated cost and the consent when needed.
- **FR-006**: The assistant MUST be able to propose, on one card, the proposals to accept by interview; unticked ones stay to decide.
- **FR-007**: The assistant MUST be able to propose, on separate cards, interviews to validate and interviews to exclude, an exclusion needing a reason. It MUST have no tool that accepts, validates or excludes by itself.
- **FR-008**: Cards MUST be built by the app from its own data, MUST run the rules of the Fieldwork tab, and each line MUST give its outcome.
- **FR-009**: Nothing MUST change before Apply, and no decision of a person MUST be overwritten.
- **FR-010**: After a card or an analysis, the assistant MUST go on by itself with where things stand; this AI call MUST be recorded and counted.
- **FR-011**: The study's next step MUST take interviews into account: analysing, deciding, validating, then the next phase.
- **FR-012**: The journey MUST be documented in `docs/agent-journeys/08-interviews.md`, and the context map MUST state what the AI provider may receive.

### Key Entities

- **Interview counts**: numbers by state; no name.
- **Interview filter**: the states and name part selecting a list.
- **Decision card**: interviews and their proposals, to untick.
- **Validation card**: interviews to validate or exclude, with reasons.

## Success Criteria *(mandatory)*

- **SC-001**: Each filter returns exactly the matching interviews, alone and combined.
- **SC-002**: Without consent, 0 interview names reach the AI provider.
- **SC-003**: A person can accept the proposals of 20 interviews in one card, in under a minute of their own time.
- **SC-004**: No decision of a person is ever overwritten by a card.
- **SC-005**: "What is left to do?" is answered with counts, without listing any interview.

## Assumptions

- "To decide" means an interview still proposed, with at least one proposal undecided; "ready to validate" means proposed, with a transcript and nothing left to decide.
- A list gives names, state, transcript and recording presence, and each proposal's field and value; never the transcript's text, which `read_file` gives.
- Files keep being renamed by the folder card or the Fieldwork tab.
- Delivered in two pull requests: reading and analysis first, then deciding and validating.
