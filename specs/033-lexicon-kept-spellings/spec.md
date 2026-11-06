# Feature Specification: Lexicon decisions reflect what is kept

**Feature Branch**: `033-lexicon-kept-spellings`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Lexicon term decisions reflect what is kept. (1) In the term's Change dialog, each spelling has a kept / not this term switch; today the excerpts and counts shown below ("Where it was found") ignore these switches, so a spelling switched off still shows its excerpts and still counts until the dialog is saved. Wanted: excerpts and counts update at once to show only what will be taken into account with the spellings kept (the term's form always kept). (2) On the lexicon list, accepting a decided term's new spellings (the check on an accepted term in "To decide") sometimes leaves the term in the list: when a decision is refused because the term changed meanwhile (a teammate, or a reading of interviews that added spellings), the list keeps its old copy of the term, so every new click is refused again. Wanted: after a refused decision the list is read again, so the person sees the term as it is now and the next click works; the message says the term changed. Same for the change and merge dialogs. No real data in the repository."

## Context

The lexicon (spec 010) lists the team's terms found in a study. A term has a form and spellings found in the interviews; a person keeps or drops each spelling, and Cleaning (spec 011) corrects only what is kept. The Change dialog shows where the term was found, but that part ignores the spellings the person just switched off, so the person cannot see what their choice will take into account before saving. Separately, a decided term that gained new spellings comes back to "To decide"; accepting it sometimes does nothing visible, because the decision is refused when the term changed since the list was shown, and the list keeps showing the old copy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what a spelling choice takes into account (Priority: P1)

A researcher opens a term's Change dialog and switches off a spelling. The excerpts and counts under "Where it was found" drop that spelling's places at once; switching it back on brings them back.

**Why this priority**: it was reported as misleading: the dialog shows places that will not be corrected.

**Independent Test**: open a term with two spellings found in interviews, switch one off: its excerpts disappear and the counts go down by its occurrences, before saving.

**Acceptance Scenarios**:

1. **Given** a term with its form and a spelling "B" found in two interviews, **When** the person switches "B" off, **Then** the excerpts of "B" are no longer shown and each interview's count no longer includes "B".
2. **Given** an interview where only "B" was found, **When** "B" is switched off, **Then** that interview is no longer listed.
3. **Given** "B" switched off, **When** the person switches it on again, **Then** the excerpts and counts are as when the dialog opened.
4. **Given** every spelling switched off, **When** the dialog is shown, **Then** the places of the term's form stay listed (the form is always kept).

---

### User Story 2 - A refused decision does not get stuck (Priority: P1)

A researcher accepts the new spellings of an accepted term in "To decide". If the term changed since the list was shown, they are told it changed and the list shows the term as it is now; their next click works.

**Why this priority**: reported as terms that "do not leave" whatever the person does.

**Independent Test**: show the list, change the term elsewhere, click accept: a message says it changed, the row shows the current term, a second click accepts it and it leaves "To decide".

**Acceptance Scenarios**:

1. **Given** a term changed since the list was shown, **When** the person accepts, rejects or reopens it from the list, **Then** they see a message that the term changed and the list is read again.
2. **Given** the list read again after such a refusal, **When** the person clicks accept again, **Then** the decision is applied and the term leaves "To decide".
3. **Given** the Change or Merge dialog, **When** saving is refused because a term changed, **Then** the message says so and the list is read again.

---

### Edge Cases

- Two spellings overlapping at the same place (a phrase and one of its words): the place counts for the longest one, as today; switching the phrase off hides that place until the choice is saved, when its word is counted there.
- Spellings compare as written: an acronym and a word that differ only in case are different spellings.
- "Show every occurrence" follows the same switches as the first excerpts.
- A refusal for another reason (no access, invalid change) keeps today's message and does not need a new read.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: In the Change dialog, the excerpts shown under "Where it was found" MUST exclude places found only through a spelling switched off, at once and before saving.
- **FR-002**: The counts and verdicts per interview in that section MUST exclude the occurrences of the spellings switched off; an interview left with none MUST NOT be listed.
- **FR-003**: The term's form MUST always count as kept.
- **FR-004**: After a decision on a term is refused because the term changed (from the list, the Change dialog or the Merge dialog), the lexicon list MUST be read again and the person MUST see a message that the term changed.
- **FR-005**: Other refusals keep their current messages. After a refusal the dialog stays open with the person's changes, on the term's new version.
- **FR-006**: No real study data in the repository.

### Key Entities

- **Spelling** (spec 010): a way the term is written in the interviews, kept or not by a person.
- **Occurrence**: a place in an interview where a spelling of the term is found.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of the tested cases, switching a spelling off or on updates the excerpts and counts at once, matching what would be counted after saving.
- **SC-002**: After a refusal because the term changed, the next decision on that term succeeds in one click.
- **SC-003**: No real study data is added to the repository.

## Assumptions

- The counts shown after a switch match those the study shows once the choice is saved (only kept spellings are counted).
- A spelling already rejected before the dialog opened is not counted in the study; switching it back on shows its places once the choice is saved (it is counted then).
- A refusal because the term changed is already detected and reported as such today; only what the screen does afterwards changes.
