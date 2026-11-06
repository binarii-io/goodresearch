# Feature Specification: Fast study pages on large studies

**Feature Branch**: `032-study-pages-speed`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Fast Quality, Analysis, Cleaning and Lexicon pages on large studies. On a large interview study (57 validated interviews, about 14 000 turns, 438 terms in the team's lexicon), anonymised, on the deployed instance whose database is reached through a network: the Analysis page (facts) took 14.5 s, the Quality page 6.1 s, the Cleaning page 1.8 to 2.6 s alone and 6.5 to 10.4 s when other requests run, and the lexicon list (to decide, suspect terms) once 38 s for 1.1 MB (usually 0.5 s). The instance was not blocked: it waited, most likely on the database. […] Wanted: each of these pages answers in a few seconds at most at that volume, with a number of database queries that does not grow with the number of interviews, and exactly the same content as today. The lexicon list's size and its 38 s are explained and reduced if they come from the same cause or from loading more than the screen shows. A test at that volume bounds the number of queries or the time. Includes the previous fix (spec 031) in the same release. No real data in the repository."

## Context

A study's Quality tab (spec 013), Analysis tab (spec 012), Cleaning tab (spec 011) and lexicon list (spec 010) all show every validated interview through its analysed text: the raw transcript with the study's corrections applied. On a large study, these pages kept people waiting from 6 to 15 seconds, and the lexicon list once 38 seconds, while the instance itself was mostly idle: it was waiting for its stored data. The more interviews a study has, the longer the wait, so the problem grows with the studies the product is meant for.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Analysis and Quality without waiting (Priority: P1)

A researcher opens the Analysis tab, then the Quality tab, of a study of 57 interviews. Each shows its content in a few seconds at most, the same content as today.

**Why this priority**: they are the slowest pages reported (14.5 s and 6.1 s) and are opened many times a day during analysis.

**Independent Test**: on a study of the reported volume, open Analysis and Quality; each answers within the bound, with the same content as before the change.

**Acceptance Scenarios**:

1. **Given** an anonymised study of 57 validated interviews, about 14 000 turns and a lexicon of 438 terms, **When** a person opens the Analysis tab, **Then** it answers within 3 seconds on the deployed instance and shows the same interviews, facts, verbatims and states as before.
2. **Given** the same study, **When** a person opens the Quality tab, **Then** it answers within 3 seconds and shows the same interviews, remarks and states as before.
3. **Given** a study with twice as many interviews, **When** these pages are opened, **Then** the number of reads of stored data they need is the same as for the first study.

---

### User Story 2 - Cleaning stays quick when others work too (Priority: P2)

The Cleaning tab answers about as fast when colleagues use the instance at the same time as when it is alone.

**Why this priority**: it was already under 3 s alone, but up to 10 s under load, because it competes for the same stored data as the other pages.

**Independent Test**: open the Cleaning tab of a study of the reported volume; its reads of stored data do not grow with the number of interviews.

**Acceptance Scenarios**:

1. **Given** the reported volume, **When** a person opens the Cleaning tab, **Then** it answers within 3 seconds and shows the same interviews, states and counts as before.

---

### User Story 3 - The lexicon list shows what is on the screen (Priority: P2)

A researcher filters the lexicon to the terms to decide, or to the suspect terms. The list comes quickly and carries what the screen shows, not every place of every term.

**Why this priority**: once 38 s for 1.1 MB; usually 0.5 s, so less frequent than the others, but the size is out of proportion with what is shown.

**Independent Test**: on the reported volume, the filtered list answers within the bound, and its size is explained by what the screen shows.

**Acceptance Scenarios**:

1. **Given** the reported volume, **When** a person filters the lexicon to the terms to decide, **Then** it answers within 3 seconds and shows the same terms, counts and quotes as before.
2. **Given** a term with many places, **When** the list is shown, **Then** it carries only the quotes the list shows; every place of a term stays available on demand, as today.

---

### Edge Cases

- A study where the person's folder access check expired: the check is done once for the page, not once per interview.
- An interview without a transcript, or a study set to analyse clean transcripts only: shown as today.
- An anonymised study: pseudonyms are read once for the page and give the same text as today.
- A study with few interviews: no slower than today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Analysis, Quality, Cleaning and lexicon list pages MUST show exactly the same content as before the change, for the same study and person.
- **FR-002**: Showing any of these pages MUST read the study's stored data a number of times that does not grow with the number of interviews.
- **FR-003**: Access to the study, including the person's folder access check, MUST be resolved once per page, not once per interview.
- **FR-004**: At the reported volume, each of these pages MUST answer within 3 seconds on the deployed instance.
- **FR-005**: The lexicon list MUST NOT carry more than what the screen shows; places not shown stay available on demand.
- **FR-006**: An automated test at the reported volume, with made-up data only, MUST bound the number of reads of stored data of each page and check its content against the expected content.
- **FR-007**: The release MUST also include the fast lexicon decisions of spec 031.

### Key Entities

- **Analysed text** (spec 012): an interview's text as Analysis and Quality read it, computed from its raw transcript and the study's corrections; never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At the reported volume, the Analysis, Quality, Cleaning and filtered lexicon pages each answer in under 3 seconds (before: 14.5 s, 6.1 s, up to 10.4 s, up to 38 s).
- **SC-002**: The reads of stored data for one page stay the same when the number of interviews doubles.
- **SC-003**: Page content is unchanged in 100% of the volume test's checks.
- **SC-004**: No real study data is added to the repository.

## Assumptions

- The reported volume (57 interviews, about 14 000 turns, 438 terms, anonymised) is the reference.
- The deployed instance reaches its database through a network with a few milliseconds per round trip and a small pool of connections; the test reproduces a round trip per read.
- The measured times on the deployed instance are confirmed after deployment.
- No change to what is shown, to the configuration or to stored data is intended; a schema change is acceptable only if needed to read per study.
