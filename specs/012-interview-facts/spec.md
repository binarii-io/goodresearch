# Feature Specification: Interview verbatims and facts

**Feature Branch**: `012-interview-facts`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Analysis phase (« Analyse ») of an interview study, first step: cutting each interview into verbatims, then facts. Study setting "Text analysed": by default the transcript with its corrections applied, proposed ones included (rejected ones not), as in the prototype; alternative: only the latest validated clean version. Step 1, verbatims: the AI reads each validated interview in full and extracts verbatims one by one: an exact excerpt of what an interviewee said, verified in the text or dropped, attributed to the participant, known names never sent to the AI. Step 2, facts: the AI groups the verbatims of an interview into facts: a short neutral statement supported by 1 to N verbatims, with a polarity and a guide theme. A person decides every fact; only accepted facts feed later steps. Runs in the worker per study, estimate and consent, cost per interview and total on the Analysis tab. Out of scope: participant profiles, interview quality, insights and recommendations (project level, later), deck."

## Clarifications

### Session 2026-10-28

- Q: Does a person also validate each verbatim, or only the facts? → A: Only the facts. The interview view shows the whole transcript with the verbatims highlighted; a person adds a verbatim by highlighting text in an interviewee's turn (attached to a fact or left unused), or sets one aside, which is never proposed again.
- Q: In which language is a fact's statement written? → A: In every language of the app (English and French). The AI writes both in the fact pass, in the same call. When a person writes or edits a statement, it is saved at once and translated into the other language in the background by the AI, with its cost recorded and shown. Verbatims stay in the interview's language (exact quotes). Lighter models for small tasks are left to a later gateway spec.
- Q: When the text of an interview already read changes, is it always marked "To analyse again"? → A: No. Its verbatims are always looked for again in the new text, at no cost; the interview is marked "To analyse again" only when a verbatim is lost, when turns changed outside the corrections (a transcript re-imported), or when the anonymisation or the text-analysed setting changed. A word corrected in Cleaning alone does not mark it.
- Q: Besides the interview view, is there a list of all the study's facts? → A: Yes: a "Facts" view in the Analysis tab, next to the interviews, over the whole study, with the same filters (status, theme, polarity, participant, interview) and decisions (accept, edit, reject, accept all shown); each fact links to its verbatims in its interview.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cut the interviews into verbatims and facts (Priority: P1)

In « 4 · Analysis », the person sees the validated interviews of the study and activates "Find facts". A confirmation shows how many interviews will be read, how many parts the AI will read and the estimated cost. The AI reads each interview in full, part by part, and first extracts **verbatims**: exact excerpts of what an interviewee said, each one an idea in their own words. The app checks each verbatim against the text and keeps it only if it is found there, in an interviewee's turn. The AI then groups the verbatims of the interview into **facts**: a short, neutral statement ("Finding the team's data takes several tools"), supported by one or more verbatims, with a polarity and the theme of the interview guide it belongs to.

**Why this priority**: Facts with their exact verbatims are the evidence every later step (insights, recommendations, deck) is built on. Without them, the study has transcripts but no findings.

**Independent Test**: With a validated interview where the interviewee says three times, in different words, that they cannot find their team's data, and once that the newsletter is useful, the reading gives verbatims that are exact excerpts of those turns, one fact "cannot find the team's data" (negative, theme of the matching guide section) supported by the three verbatims, and one fact about the newsletter (positive); nothing comes from the interviewer's turns.

**Acceptance Scenarios**:

1. **Given** a study with validated interviews, **When** the person activates "Find facts", **Then** a confirmation shows the number of interviews, the number of parts the AI will read, the estimated cost and, the first time, that the text of the transcripts (known names replaced) is sent to their AI provider; nothing runs before it is confirmed.
2. **Given** an interview, **When** the AI reads it, **Then** it reads the analysed text (FR-002) in full, in parts of about 60 turns that overlap by a few turns, with the guide's theme sections and the study's research goal, and the names the app knows replaced by placeholders.
3. **Given** a verbatim proposed by the AI, **When** it comes back, **Then** the app keeps it only if its text is found in that turn, the turn is spoken by an interviewee, and it is within the length limits; otherwise it is dropped and counted as "left out".
4. **Given** the verbatims of an interview, **When** they are grouped, **Then** each fact has a neutral statement without any person's name, a polarity (positive, negative, neutral), a theme (a theme section of the guide, or "Other") and one or more verbatims of that interview; a verbatim may support more than one fact, and a verbatim no fact uses stays listed as "unused".
5. **Given** a reading in progress, **When** the person looks at the tab, **Then** each interview shows waiting, verbatims (part X of Y), facts, done or failed (with its reason), and the run can be stopped; what was found is kept.
6. **Given** a reading, **When** it ends, **Then** its cost is shown on the Analysis tab (this run and the study total) and on each interview's row, and recorded in the usage ledger.

---

### User Story 2 - Decide the facts of an interview (Priority: P1)

The person opens an interview: the transcript is shown with its verbatims highlighted, and the facts beside it, each with its statement, polarity, theme and verbatims. They accept, edit or reject each fact, or accept all those shown. They can also create a fact from unused verbatims or by selecting text in an interviewee's turn, and add or remove a fact's verbatims.

**Why this priority**: AI proposes, people decide. Only accepted facts will feed insights.

**Independent Test**: The person rejects one fact, edits the statement and theme of another, removes a verbatim from a third, creates a fact by selecting a sentence, then accepts all the others shown. The interview shows "Done"; the rejected fact is not proposed again when the interview is read again.

**Acceptance Scenarios**:

1. **Given** an interview with facts, **When** the person opens it, **Then** the transcript shows each verbatim in place, the facts are listed beside it with filters by status (to decide, accepted, rejected), theme, polarity and participant, and selecting a fact highlights its verbatims in the transcript (and the reverse).
2. **Given** a fact, **When** the person accepts, edits (statement, polarity, theme, verbatims) or rejects it, **Then** the decision is kept with who and when, and the version seen is checked ("changed meanwhile").
3. **Given** a selection of text in an interviewee's turn, **When** the person highlights it as a verbatim, **Then** it is kept exactly as written and highlighted in the transcript, and it can be attached to an existing fact, start a new one, or stay unused; a selection in an interviewer's turn is refused.
7. **Given** a verbatim, **When** the person sets it aside, **Then** it is removed from its facts that are still to decide, no longer highlighted, and never proposed again by a new reading; verbatims are not validated one by one, only facts are.
4. **Given** a fact created or edited by a person, **When** it is saved, **Then** it is accepted, it needs at least one verbatim, and its statement must not hold a known person's name.
5. **Given** "accept all shown", **When** the person confirms, **Then** every fact shown and still to decide is accepted, each with its own version check.
6. **Given** a rejected fact, **When** the interview is read again, **Then** no fact with the same verbatims or nearly the same statement is proposed again.

8. **Given** facts in several interviews, **When** the person opens the "Facts" view of the Analysis tab, **Then** every fact of the study is listed with its statement, polarity, theme, participant, interview and verbatims, with filters by status, theme, polarity, participant and interview, the same decisions as in the interview view, and a link to each verbatim in its interview.

---

### User Story 3 - Choose which text is analysed (Priority: P2)

In the study's settings, the person chooses the **text analysed**: "With the corrections" (default, as in the prototype: the transcript with every correction of Cleaning applied, those still to decide included, rejected ones not) or "Validated clean version only" (an interview without a validated clean version is not analysed).

**Why this priority**: Teams that clean every interview want evidence quoting only what a person checked; others want facts before cleaning is finished.

**Independent Test**: With one interview cleaned and validated and one with corrections still to decide, "With the corrections" analyses both, quoting the corrected words; "Validated clean version only" analyses the first and shows "Not clean yet" on the second.

**Acceptance Scenarios**:

1. **Given** the default setting, **When** an interview is read, **Then** the text is its raw version with the accepted, edited and still-to-decide corrections applied (rejected ones not), including the pseudonyms when anonymisation is on.
2. **Given** "Validated clean version only", **When** an interview has no validated clean version, **Then** it is listed as "Not clean yet" and not read.
3. **Given** the setting is changed, **When** the tab is shown, **Then** the interviews whose analysed text differs from the one they were read on are marked "To analyse again".

---

### User Story 4 - Follow the analysis of each interview (Priority: P3)

The Analysis tab lists the validated interviews with their state: "Not analysed", "Facts to decide (X)", "Done", "To analyse again", "Not clean yet", "No transcript", with the number of verbatims and accepted facts and what their readings cost. Each interview can be read alone ("Find facts" / "Find facts again").

**Why this priority**: Shows what is left before the project-level synthesis.

**Independent Test**: With four interviews, one never read, one with 6 facts to decide, one done and one whose cleaning changed a turn holding a verbatim since, the tab shows the four states; the changed one keeps its verbatim, flagged "text changed".

**Acceptance Scenarios**:

1. **Given** validated interviews, **When** the tab opens, **Then** each shows its state, its counts and its cost, and the tab's header counts the interviews done.
2. **Given** an interview whose analysed text changed since it was read (a correction decided, a new clean version, a re-imported transcript), **When** the tab is shown, **Then** its verbatims are looked for again in the new text: those found keep their facts at their new place, those no longer found are flagged "text changed", never deleted; the interview shows "To analyse again" only when a verbatim was lost or its turns changed outside the corrections, and a word corrected in Cleaning alone does not mark it.
3. **Given** one interview, **When** the person activates "Find facts again" on its row or in its view, **Then** only that interview is read again in full, with the same estimate and consent; decided facts stay, and facts still to decide are replaced by the new reading's.

---

### Edge Cases

- No validated interview: the tab explains that interviews are validated in Fieldwork, with a link.
- No interview guide: every fact gets the theme "Other"; the reading still runs.
- An interview without transcript: listed as "No transcript", not read.
- A speaker that matches no one of the roster: when the interview has exactly one interviewee and the speaker is not a known interviewer, their turns are the interviewee's; otherwise the verbatim is kept as "speaker not identified" and its facts wait for a person to attribute them.
- A turn spoken by an interviewer: no verbatim; a verbatim the AI places there is dropped.
- A verbatim found twice (overlapping parts, or a second reading): kept once; a verbatim inside another of the same turn is merged into the longer one.
- A verbatim holding a placeholder (a known name replaced): kept, shown with the pseudonym or the name as the study's anonymisation says; a fact statement holding a known name or a placeholder is dropped.
- The AI proposes a fact citing a verbatim that does not exist: the citation is dropped; a fact left without verbatim is dropped and counted.
- The provider fails on a part: retried once, then the interview fails with its reason; the others go on, and the verbatims already found are kept.
- An interview reopened or excluded in Fieldwork: no longer listed; its verbatims and facts are kept and deleted only with its session.
- Anonymisation turned on or off: the interviews read are marked "To analyse again" (their verbatims are shown in the new text when found).
- Two people decide the same fact at once: the second is told it changed meanwhile.
- A cleaning or a lexicon reading of the study is running: "Find facts" waits for it to end, and the reverse.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The study's Analysis tab (fourth phase) MUST list the validated interviews (spec 009) with their analysis state ("Not analysed", "Facts to decide (X)", "Done", "To analyse again", "Not clean yet", "No transcript"), the counts of verbatims and accepted facts, the date of the last reading and what their readings cost.
- **FR-002**: The study MUST have a setting **text analysed**: `with corrections` (default) — the raw version with the corrections of Cleaning (spec 011) applied, accepted, edited and still to decide, rejected ones not, including the lexicon's and the names' corrections computed for interviews never cleaned — or `clean only` — the latest validated clean version, an interview without one being "Not clean yet".
- **FR-003**: "Find facts" MUST read the interviews never read and those to analyse again, with an option to read them all again. Like Cleaning (spec 011 FR-002), it MUST first import the raw versions that are missing or changed in Drive; each interview MUST also be readable alone ("Find facts" / "Find facts again" on its row and in its view), read again in full whatever its state. A confirmation MUST show the number of interviews, the number of parts for the AI and the estimated cost before running.
- **FR-004**: The **verbatim pass** MUST read the analysed text of each interview in full, in parts of about 60 turns overlapping by a few turns and kept under a size limit, with the study's research goal, the guide's theme sections and, for each turn, whether its speaker is an interviewee or an interviewer. The AI MUST be asked for verbatims only: for each, its turn, its exact text and a short reason of at most 200 characters why it matters to the research goal.
- **FR-005**: The app MUST keep a verbatim only when its turn is in the part's new turns, is spoken by an interviewee (or attributed as in the edge cases), its text is found in that turn (ignoring case, spaces and apostrophe style; the kept text is the turn's own), and it has between 3 and 120 words. Others MUST be dropped and counted as "left out".
- **FR-006**: The **fact pass** MUST send, per interview, the kept verbatims with their ids and turn order, the guide's theme sections and the research goal, and ask for facts: a neutral statement of at most 200 characters in each language of the app (English and French), a polarity (`positive | negative | neutral`), a theme (one of the guide's theme sections, or "Other") and the ids of its verbatims. The app MUST keep a fact only when it cites at least one known verbatim of that interview, its theme is one sent, and its statement holds no known name or placeholder; unknown ids are dropped.
- **FR-007**: The names the app knows (rosters, schedule, team members, speaker labels, lexicon terms of category person) MUST be replaced by placeholders in everything sent, whether anonymisation is on or off, and read back only inside the app (spec 011 FR-007).
- **FR-008**: Each verbatim MUST record its interview, turn, place in the turn, text, participant, reason, the run that found it, its origin (`ai | person`) a flag when its text is no longer found in the analysed text, and whether a person set it aside. Each fact MUST record its interview, statement, polarity, theme, verbatims, origin, status (`proposed | accepted | edited | rejected`), who decided and when, and a version.
- **FR-009**: A person MUST be able to accept, reject or edit a fact (statement, polarity, theme, verbatims), accept all facts shown at once, create a fact from one or more verbatims, highlight text in an interviewee's turn to make a verbatim (attached to a fact or left unused), and set a verbatim aside (never proposed again). Verbatims have no decision of their own; only facts are decided. A fact created or edited by a person is accepted, needs at least one verbatim and no known name in its statement. Each decision records who and when and checks the version seen. Update: a decided fact stays in the list where it was decided (facts are listed in creation order, never moved by a decision); its card shows "Accept" and "Reject" side by side with the choice made highlighted (a decision can be changed), then "Edit"; the status filters of the interview view and of the "Facts" view start on "All".
- **FR-010**: A new reading of an interview MUST keep its decided facts and their verbatims, replace its facts still to decide (update, spec 014: the AI gets the interview's facts already there and takes one up by its reference rather than writing it again; a fact still to decide taken up keeps its identity and place, with the new reading's words and verbatims; a decided one is never changed), merge a verbatim found again with the existing one, never propose again a verbatim set aside, and never propose again a fact whose verbatims are all those of a rejected fact or whose statement shares 60% or more of its words with a rejected fact's.
- **FR-011**: When the analysed text of an interview changes (a correction decided, a new clean version, a raw version re-imported, the setting or the anonymisation changed), its verbatims MUST be looked for again in the new text: found ones move to their new place, the others are flagged "text changed" and never deleted, at no AI cost. The interview MUST show "To analyse again" only when a verbatim is no longer found, when turns changed outside the corrections (a raw version re-imported), or when the anonymisation or the text-analysed setting changed; a correction decided alone MUST NOT mark it.
- **FR-012**: A reading MUST run in the background, one per study at a time and not while a lexicon reading or a cleaning of the study runs (and the reverse), show the state of each interview (waiting, verbatims part X of Y, facts, done, failed with a reason), allow stopping it, and keep what was found. A part that fails is retried once; a failure of one interview MUST NOT stop the others. Update: while a reading runs, the Analysis tab lists the interviews it covers with where each one stands, and each row of the interview list shows its own reading; one interview can be taken out until its own reading ends ("Take out"): nothing of that reading is kept for it, it shows "Taken out", and the others go on.
- **FR-013**: Each AI call MUST go through the AI Gateway with the person's own AI connection and be recorded in the usage ledger with what it was for and which interview. The Analysis tab MUST show the cost of the last reading and the study's total, and each interview's row and view what its own readings cost, whoever ran them.
- **FR-014**: Before the first reading of a study by a person, a confirmation MUST say that the text of the transcripts, known names replaced, is sent to their AI provider; it is asked again when the provider changes (spec 009 FR-011).
- **FR-015**: Facts and verbatims MUST show the participant's pseudonym when the study's anonymisation is on, and their name otherwise; a fact statement never holds a name.
- **FR-016**: A fact's statement MUST exist in English and French and be shown in the viewer's language. When a person writes or edits it in one language, it MUST be saved at once and translated into the other by the AI in the background (shown "translating…" meanwhile, the person's own AI connection, recorded in the usage ledger and counted in the interview's cost); a failed translation leaves the other language marked "not translated", with a retry. A person may also edit each language by hand. Verbatims are never translated.
- **FR-017**: Only accepted and edited facts MUST count as the interview's findings for later steps; rejected ones are never used outside the interview's view. Update (spec 013): the project's insights may also read facts still to decide when a person asks for it; they are shown "to validate" there and count only once accepted.
- **FR-018**: The Analysis tab MUST offer a "Facts" view over the whole study, next to the interviews: every fact with its statement, polarity, theme, participant, interview and verbatims, filters by status, theme, polarity, participant and interview, the decisions of FR-009 on facts (accept, edit, reject, accept all shown), and a link to each verbatim in its interview.
- **FR-019**: Reading, deciding and changing the setting MUST follow the study's access rules (spec 002 FR-010a).
- **FR-020**: All texts MUST exist in English and French; the Analysis tab, the interview view, the "Facts" view and the dialogs MUST meet WCAG 2.2 AA, and a fact's status or polarity MUST never be shown by colour alone.

### Key Entities

- **Analysis run** (per study): one "Find facts": who started it, the interviews it covers, state per interview (parts read, facts pass), stopped or finished, its cost reference, how many verbatims and facts were left out.
- **Verbatim**: an exact excerpt of an interviewee's turn: interview, turn, place, text, participant, reason, origin, run, "text changed" flag, set aside or not (no decision of its own).
- **Fact** (Evidence context): a neutral statement (in English and French) supported by one or more verbatims of one interview, with polarity, theme, origin, status, who decided and when.
- **Text analysed** (study setting): `with corrections` or `clean only`.
- **Theme**: a section of kind theme of the study's interview guide (spec 006; introduction, warm-up and wrap-up sections are not themes), or "Other".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every kept verbatim is found word for word in its turn of the analysed text, and none comes from an interviewer's turn (tested).
- **SC-002**: Every kept fact cites at least one verbatim of its own interview, and no fact statement holds a known person's name (tested).
- **SC-003**: No name the app knows is sent to an AI provider (tested).
- **SC-004**: Every AI call of a reading appears in the usage ledger, and the cost on the Analysis tab equals the sum of the ledger entries of the study's readings (tested).
- **SC-005**: A person can decide the facts of a one-hour interview (about 25 facts) in under 15 minutes, using filters and "accept all shown", in the interview view or the study's "Facts" view.
- **SC-006**: Reading 30 one-hour interviews completes in under 30 minutes with a standard AI provider, and the page stays usable meanwhile.
- **SC-007**: After a correction is decided in Cleaning, every verbatim still present in the text keeps its facts, and none is deleted (tested).
- **SC-008**: A rejected fact is never proposed again by a new reading of its interview (tested).
- **SC-009**: The Analysis tab, the interview view and the dialogs have no axe violation in light and dark themes.

## Assumptions

- The verbatims and facts belong to the study's Evidence; insights, recommendations and the deck are project-level steps of later specs and only read accepted facts.
- Speakers are told apart with the roster of spec 009 and the speaker labels: a label matching an interviewer is an interviewer; one matching an interviewee is that interviewee. Participant profiles (role, team) are a later spec.
- The themes are the guide's theme sections (spec 006) at the time of the reading; a section removed later keeps its facts, shown under the old title until edited.
- A verbatim stays inside one turn; a fact cites verbatims of one interview only.
- The estimate uses the text size of the parts and the person's model price (spec 005); the real cost comes from the ledger.
- Any member of the team (or an admin) with access to the study can read, decide and change the setting; no separate role.
- Translations use the provider's model chosen by the deployer; a lighter model for small tasks (translation) is a later change of the AI Gateway.
- Out of scope: participant profiles, interview quality, insights, recommendations, key takeaways, deck, fact export, cross-interview grouping of facts.
