# Feature Specification: Cleaning review without duplicates, with steady buttons and context

**Feature Branch**: `034-cleaning-review-comfort`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Cleaning corrections without duplicates, steady buttons and turn context. (1) In an interview's Cleaning view, a correction set aside because another one applies at the same place (shown "Hidden by another correction here") is still listed with its own buttons even when it makes exactly the same change (same words replaced by the same text, e.g. the lexicon's and the AI's "décathlon → Decathlon"); a person sees two proposals and, after accepting the first, a second one they no longer understand. Wanted: such a duplicate is not listed (nor counted); a set-aside correction proposing a different change stays listed as today. (2) After a person accepts, rejects or reopens a correction (one, or all shown), its buttons become clickable again for a fraction of a second before the row disappears or changes. Wanted: the buttons stay disabled until the interview is shown again with the decision. (3) With filters, the view shows only the turns with corrections, which is sometimes not enough to decide. Wanted: on each turn, a button to see the conversation around it (the two turns before and after, with their speakers and times), read on demand, closed again at will. No real data in the repository."

## Context

In an interview's Cleaning view (spec 011), corrections come from several sources (a person, the lexicon, names, the AI after the lexicon, the AI); at one place, one applies and the others are set aside. When two sources propose the very same change at the same place, the person sees it twice and must decide twice. Separately, the buttons of a decision come back for an instant before the view shows the result, inviting a second click; and with the filters on, a turn is shown alone, without the conversation that would help decide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One proposal per change (Priority: P1)

A researcher reviews an interview where the lexicon and the AI both propose "décathlon → Decathlon" at the same place. One proposal is shown; deciding it settles that change.

**Why this priority**: reported as confusing; it doubles the decisions to make.

**Independent Test**: an interview where two sources propose the same change at one place: one row, counted once; accept or reject it, nothing else about that change remains.

**Acceptance Scenarios**:

1. **Given** two sources proposing the same change at the same place, **When** the interview is shown, **Then** one correction is listed (the one that applies there) and the count to decide counts it once.
2. **Given** that correction accepted, **When** the view is shown again, **Then** no other proposal of that change remains at that place.
3. **Given** that correction rejected, **When** the view is shown again, **Then** the same change does not come back from the other source, and the analysed and clean texts do not apply it.
4. **Given** two sources proposing different changes at the same place, **When** the interview is shown, **Then** the one that applies is listed under "To decide" and the one set aside is listed under "All", marked as such (update: "To decide" shows what its count takes).

---

### User Story 2 - Buttons stay off until the result shows (Priority: P2)

A researcher accepts a correction. Its buttons, and those of the other corrections, stay disabled until the view shows the decision.

**Why this priority**: a second click on a row about to change gives a refusal or an unwanted decision.

**Independent Test**: click accept; until the row changes, the decision buttons are disabled.

**Acceptance Scenarios**:

1. **Given** a decision clicked (accept, reject, reopen, or "accept all shown"), **When** the view is not yet shown again, **Then** the decision buttons are disabled.
2. **Given** the view shown again, **When** the person looks at the remaining rows, **Then** their buttons are enabled.
3. **Given** a decision refused, **When** the message shows, **Then** the buttons are enabled again.

---

### User Story 3 - The conversation around a turn (Priority: P2)

A researcher hesitates on "pertes → perfs". They open the context of that turn and read the two turns before and after, with their speakers and times, then close it.

**Why this priority**: helps decide without leaving the view or removing the filters.

**Independent Test**: on a filtered view, open a turn's context: the two turns before and after show, with that turn marked; close it.

**Acceptance Scenarios**:

1. **Given** a turn in the view, **When** the person opens its context, **Then** the two turns before and after it show with their speakers, times and text as the view shows it (corrections in place, names masked when the study is anonymised), the turn itself marked.
2. **Given** the first or last turn of the interview, **When** its context opens, **Then** only the turns that exist are shown.
3. **Given** the context open, **When** the person closes it, **Then** the view is as before.

---

### Edge Cases

- The same change from three sources: one listed.
- Changes counted the same only when the same words at the same place are replaced by the same text (case included).
- A person's own correction identical to a proposal: the person's applies and the proposal is not listed.
- "Accept all shown" accepts each change once.
- The context of a turn reads nothing until it is opened.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A correction set aside at a place where another correction makes exactly the same change (same place, same words, same replacement) MUST NOT be listed, counted or decided separately.
- **FR-002**: A decision on the listed correction MUST settle that change at that place for every source: once rejected, the same change from another source MUST NOT be listed nor applied to the analysed or clean texts.
- **FR-003**: A set-aside correction making a different change MUST stay listed under "All", marked as set aside; the "To decide" and "Accepted" filters MUST show exactly what their counts take (update after merge, research R4).
- **FR-004**: After a decision is clicked, the decision buttons of the view MUST stay disabled until the view shows the result, or until the decision is refused.
- **FR-005**: Each turn MUST offer to show the conversation around it: up to two turns before and after, with speakers, times and text as the view shows it, the turn marked; read only when asked and closed at will.
- **FR-006**: The context MUST follow the study's masking (anonymised names).
- **FR-007**: No real study data in the repository.

### Key Entities

- **Correction** (spec 011): a change at a place of a turn, from a source, with a status.
- **Turn**: one speaker's words in the transcript, with its time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An identical change proposed by several sources at one place is listed and decided once, in 100% of the tested cases.
- **SC-002**: No decision button can be clicked between a decision and the view showing it.
- **SC-003**: A turn's context opens in one click and shows up to four neighbouring turns.
- **SC-004**: No real study data is added to the repository.

## Assumptions

- "The same change" means same turn, same place, same length and the same replacement text.
- Two turns before and after are enough; more is out of scope.
