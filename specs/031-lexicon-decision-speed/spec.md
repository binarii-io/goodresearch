# Feature Specification: Fast decisions on lexicon terms in large studies

**Feature Branch**: `031-lexicon-decision-speed`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Fast decisions on lexicon terms in large studies. On a large interview study (about 57 validated interviews, 14 000 turns, 438 terms in the team's lexicon), editing a term or merging two terms takes 11 to 12 seconds on the deployed instance before the screen answers, while accepting or rejecting a term takes 0.2 to 0.3 s. Cause: the edit and the merge recounted the occurrences of every term of the team in every interview of the study, synchronously, before answering. Wanted: an edit or a merge answers about as fast as an accept (under one second at that volume), with exactly the same occurrence counts and places as a full recount would give for the terms concerned; the other terms' counts stay as they are. A full recount (the lexicon reading run, in the background) also gets faster. The server must not stay blocked for seconds while counting. A volume test guards it. No real data in the repository."

## Context

In a study's Enrichment, people decide on the terms of their team's lexicon (spec 010): accept, reject, edit (a new form or spellings) or merge two terms. Every term shows how often, and where, it appears in the study's validated interviews. A new form or new spellings change these occurrences, so an edit and a merge recount them before answering.

On a large study, an edit or a merge made the person wait 11 to 12 seconds, many times a day, while an accept answered at once. During that wait, the instance answered nobody else either.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit or merge a term without waiting (Priority: P1)

A researcher reviews the lexicon of a large study. They correct the form of a term, add a spelling, or merge two terms. The screen answers about as fast as when they accept a term, and the occurrences shown for that term are right at once.

**Why this priority**: it is the reported pain; it repeats for every term corrected.

**Independent Test**: on a study of the reported volume, edit a term and merge two terms; each answers in under one second, and the counts of the terms concerned are those a full recount gives.

**Acceptance Scenarios**:

1. **Given** a study of about 57 validated interviews, 14 000 turns and a lexicon of 438 terms, **When** a person edits a term, **Then** the answer comes in under one second and the term's occurrences (counts per spelling and interview, places) are exactly those a recount of the whole study gives for it.
2. **Given** the same study, **When** a person merges a term into another, **Then** the answer comes in under one second, the merged term has no occurrences left, and the target's occurrences are exactly those a full recount gives.
3. **Given** other terms with their occurrences, **When** a person edits or merges terms, **Then** the other terms' occurrences do not change.

---

### User Story 2 - Others are not held up meanwhile (Priority: P2)

While one person edits a term, the others using the instance keep getting their pages without a pause of several seconds.

**Why this priority**: the wait also hit everyone else on the same instance, but less often.

**Independent Test**: measure how long the instance is busy counting for one edit at the reported volume; it stays a fraction of a second.

**Acceptance Scenarios**:

1. **Given** the reported volume, **When** a person edits a term, **Then** the counting it needs keeps the instance busy for well under one second.

---

### User Story 3 - A full reading recounts faster (Priority: P3)

When the lexicon reading of a study runs in the background, the final recount of every term takes less time than before, with the same result.

**Why this priority**: useful, but it runs in the background and nobody waits for it on screen.

**Independent Test**: at the reported volume, the recount of every term takes clearly less time than before and gives the same occurrences.

**Acceptance Scenarios**:

1. **Given** the reported volume, **When** every term is recounted, **Then** it takes at most half the time it took before, with the same occurrences.

---

### Edge Cases

- An edit that changes nothing in the spellings (definition, category, scope) recounts the term all the same: the result does not change and stays fast.
- A merged term keeps no occurrences, whatever it had before.
- Terms of another language than an interview are not counted in it, as before.
- When the list of validated interviews cannot be read (Drive unavailable, no access), nothing is replaced, as before.
- Verdicts given on occurrences (spec 010) are kept, as before.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An edit of a term, or any decision that adds or rejects one of its spellings (variants accepted or rejected with an accept or a reject), MUST recount that term's occurrences in the study, and only that term's.
- **FR-002**: A merge MUST recount only the two terms concerned: the merged term keeps no occurrences, the target's are counted with its new spellings.
- **FR-003**: The occurrences recounted for a term MUST be exactly those a recount of every term of the study gives for it (counts per spelling and interview, places kept).
- **FR-004**: The occurrences of the other terms MUST NOT change on an edit or a merge.
- **FR-005**: At the reported volume, an edit or a merge MUST answer in under one second, and the counting MUST keep the instance busy for well under one second.
- **FR-006**: A recount of every term MUST give the same occurrences as before, in at most half the time.
- **FR-007**: An automated test at the reported volume, with made-up data only, MUST check FR-003 and a time bound.

### Key Entities

- **Occurrence** (spec 010): how often one spelling of a term appears in one interview, with up to 50 places.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At the reported volume, editing or merging a term answers in under one second (before: 11 to 12 seconds).
- **SC-002**: The occurrences shown after an edit or a merge are identical to those of a full recount for the terms concerned, in 100% of the volume test's cases.
- **SC-003**: A full recount at the reported volume takes at most half its former time.
- **SC-004**: No real study data is added to the repository.

## Assumptions

- The reported volume (57 interviews, about 14 000 turns, 438 terms) is the reference; larger studies get the same proportional gain.
- Each term's occurrences depend only on that term's spellings and on the interviews: recounting one term gives the same result as recounting all of them.
- The measurements on the deployed instance are confirmed after deployment; the volume test checks the same behaviour on made-up data.
- No change to what is shown, to the stored data or to the configuration.
