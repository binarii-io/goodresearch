# Feature Specification: Survey analysis — figures, themes of open answers, facts

**Feature Branch**: `029-survey-analysis`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Analysis of survey studies, after specs 027 and 028: flat sort and cross tabs on the counted responses, themes of open answers proposed by AI on masked text, facts proposed then validated so insights use them with interview facts. Stay consistent with the interview Analysis."

## Clarifications

### Session 2026-11-03

Decided by the user:

- Q: How far do the figures go? → A: **Flat sort and cross tabs**, as step 4 of the questionnaire method: per item, the distribution of its answers and, for scales, mean, median and share of agreement; then each item broken down by the answers of one profiling item.
- Q: How are open answers analysed? → A: **With AI, on masked text**: the app masks known names and identifying patterns before anything is sent; the AI proposes themes with quotes the app verifies; a person decides. This needs its own decision record (ADR-0011 left it open).
- Q: How do results reach insights and recommendations? → A: **Facts proposed, then validated by a person**, like the facts of interviews: a key figure or an accepted theme becomes a fact; insights use them with interview facts.
- Q: Who writes the statement of a fact made from a figure or a theme: the app from a sentence template, or the AI? → A: **The app, from a template**: a figure's fact states the value, the item and the base ("62 % of the 42 respondents agree with: …") in English and French; a theme's fact takes the theme's description. No AI call to create a fact; only a person's edit is translated into the other language by AI, as for interview facts.

Decided by default; each can be revisited at review:

- Q: Which responses do the figures use? → A: The **counted** ones only (spec 028: consent given, profile answered, within the target). The tab says how many responses that is, and how many were set aside.
- Q: What is the base of a percentage? → A: The counted responses **that answered the item** (a multiple-choice item: the respondents, so percentages may add up to more than 100 %). Each figure shows its base.
- Q: When is a base small? → A: Under **30** responses, a figure is flagged "small base"; under **5**, a percentage is not shown, only the count. Facts can still be proposed from a small base, with the flag carried along.
- Q: What is the share of agreement? → A: The share of the two highest points of a 5- or 7-point scale ("top-2-box"), and the two lowest as share of disagreement.
- Q: When are figures computed? → A: At each read of the tab, from the stored responses; never stored, so a new reading or a changed target rule moves them at once.
- Q: Do facts from figures move with new responses? → A: No: a fact keeps the figure, base and filter it was made from (a snapshot). When the same figure computed today differs, the fact shows **Figure changed** with the new value, until a person updates or keeps it.
- Q: What does the AI receive for themes? → A: For one open item: its wording and its answers, masked, with an anonymous number per answer; nothing else from the responses. Quotes come back as answer number plus exact masked excerpt, verified by the app or dropped.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the flat sort (Priority: P1)

On the Analysis tab of a survey study, a person sees, item by item and section by section, how the counted responses answered: bars with counts and percentages for choice items, and for scales the distribution with mean, median, share of agreement and share of disagreement. Each figure shows its base.

**Why this priority**: It is the first result of a survey, and every fact on figures starts from it.

**Independent Test**: With counted responses on every item kind, open Analysis, check each figure by hand against the responses.

**Acceptance Scenarios**:

1. **Given** counted responses, **When** a person opens Analysis, **Then** each choice item shows each option's count and percentage over the respondents who answered it, in the questionnaire's order of options.
2. **Given** a 7-point scale, **Then** it shows the count per point, the mean (one decimal), the median, the share of the two highest points and of the two lowest, with the base.
3. **Given** a multiple-choice item, **Then** percentages are over respondents and the screen says they may add up to more than 100 %.
4. **Given** a base under 30, **Then** the item is flagged "small base"; under 5, percentages are hidden and counts stay.
5. **Given** a response set aside by the target rule or with refused consent, **Then** it counts in no figure; the tab says how many counted responses the figures use, and how many were set aside.
6. **Given** a change of the target rule or a new reading, **When** the person comes back to Analysis, **Then** the figures follow without any action.
7. **Given** an option written by hand in the form (spec 028), **Then** it is counted under "Other answers", never as an option.

---

### User Story 2 - Cross by a profiling item (Priority: P1)

A person picks one profiling choice item (for example "Your role") and sees every other choice and scale item broken down by its answers: one column per answer, each with its base, and the total.

**Why this priority**: Comparing groups is where a survey says more than averages; facts like "62 % of product managers agree…" come from here.

**Independent Test**: Cross by a profiling item, check one cell by hand, switch back to no cross.

**Acceptance Scenarios**:

1. **Given** a profiling choice item, **When** a person picks it, **Then** each item shows, per answer of the profiling item, its counts and percentages (choice) or mean and share of agreement (scale), with the base of each column and the total.
2. **Given** a column with a base under 30, **Then** it is flagged; under 5, its percentages are hidden.
3. **Given** a respondent who did not answer the profiling item, **Then** they count in the total and in no column.
4. **Given** the cross is removed, **Then** the flat sort comes back.
5. **Given** a multiple-choice profiling item, **Then** a respondent counts in each column they chose, and the screen says so.

---

### User Story 3 - Themes of open answers (Priority: P1)

For one open item, a person asks for themes. The app masks the answers, sends them, and shows the themes proposed, each with a short label, a description, how many answers it covers and verified quotes. The person accepts, renames, merges or rejects each theme, and can move an answer from one theme to another.

**Why this priority**: Open answers often say why; without themes, they are a list nobody reads.

**Independent Test**: On an open item with 40 answers, one holding a name, ask for themes; check the name never left the app, that every quote is in the answers, decide each theme.

**Acceptance Scenarios**:

1. **Given** an open item with counted answers, **When** a person asks for themes and confirms the estimated cost, **Then** the app proposes themes, each with its label (English and French), description, number of answers and up to 5 quotes.
2. **Given** any answer, **Then** before it is sent, known names and identifying patterns (emails, phone numbers, web addresses, long numbers) are replaced by a mark such as "[name]"; the screen shows the same masked text.
3. **Given** a quote returned by the AI, **When** it is not found word for word in the masked answer it cites, **Then** it is dropped; a theme left with no verified answer is dropped and counted as such.
4. **Given** themes proposed, **When** a person accepts, renames, merges two, rejects one, or moves an answer, **Then** it is recorded with who and when; a rejected theme is not proposed again for this item.
5. **Given** answers read after the themes, **Then** the item says how many answers are in no theme, and the person can ask again for those only; decided themes stay.
6. **Given** a call, **Then** it goes through the AI Gateway, is in the usage ledger, and its cost shows on the item and in the tab's total.
7. **Given** an open item with fewer than 5 counted answers, **Then** themes are not offered; the answers are listed.

---

### User Story 4 - Facts from figures and themes (Priority: P1)

From a figure (an option's share, a scale's share of agreement or mean, in the flat sort or in a cross column) or from an accepted theme, a person proposes a fact. The app writes a neutral statement in English and French from a sentence template (figure) or the theme's description (theme), with no AI call; the person edits it if needed and validates. Validated facts of survey studies feed the insights of the project with those of interviews.

**Why this priority**: It is how a survey counts in the project's findings, with the same chain of evidence as interviews.

**Independent Test**: Make a fact from a cross-tab figure and one from a theme, validate both, run insights on the project, find both facts as evidence.

**Acceptance Scenarios**:

1. **Given** a figure, **When** a person makes a fact from it, **Then** the fact holds the statement, the item, the value, the base, the cross (if any) and the target rule's version, with the small-base flag when it applies; its theme is the questionnaire section of the item.
2. **Given** an accepted theme, **When** a person makes a fact from it, **Then** the fact holds the statement, the theme, its share of the item's answers and its verified quotes as support.
3. **Given** the statement written by the app, **Then** it comes from a template filled with the figure's value, item and base ("62 % of the 42 respondents agree with: …"), in English and French, holds no name, and creating it calls no AI.
4. **Given** a fact proposed, **When** a person accepts, edits or rejects it, **Then** it follows the statuses of interview facts; only accepted and edited facts are findings.
5. **Given** facts of a figure, **When** the same figure computed today differs (new responses, changed rule), **Then** the fact shows "Figure changed" with the new value until a person updates it to today's figure or keeps it.
6. **Given** the project's insights, **When** they are run, **Then** accepted survey facts are used with interview facts, and an insight shows each fact's source: interview or survey item.
7. **Given** a study with accepted facts, **Then** the project page's Facts step counts them and stops saying "Will come from the studies".

---

### User Story 5 - With the assistant (Priority: P2)

The assistant knows where the analysis stands, as counts: items, open items with or without themes, facts proposed and decided. It can propose themes for an open item (running the same masked analysis, after the person confirms its cost) and propose facts from figures through cards to apply.

**Why this priority**: The interview Analysis works this way; the survey should too, but the screen alone is enough to analyse.

**Independent Test**: Ask the assistant where the analysis stands, ask for themes on one item, ask for facts on the most striking figures, apply the cards.

**Acceptance Scenarios**:

1. **Given** a survey study, **When** a person asks where the analysis stands, **Then** the assistant answers from counts, without any answer text.
2. **Given** a request for facts, **Then** the assistant reads figures computed by the app (never computes them) and proposes facts through a card; each is checked against today's figure before it is saved on Apply.
3. **Given** a request for themes, **Then** the assistant starts the same masked analysis after the person confirms its cost; it never receives the answers itself.
4. **Given** a person who can only read, **Then** the assistant reads counts and proposes nothing, as in spec 026.

---

### User Story 6 - Readers and privacy (Priority: P2)

Figures, themes, quotes and facts follow the access rules of spec 026; deleting a study deletes them.

**Why this priority**: Answers are personal data; quotes come from them.

**Independent Test**: Open Analysis as a member outside the team and as an admin; delete a study and check its themes and facts are gone.

**Acceptance Scenarios**:

1. **Given** a member outside the owning team, **Then** the Analysis tab shows "reserved to the team"; accepted facts are read in the project's insights as any fact, with quotes masked.
2. **Given** a deleted study, **Then** its themes, their decisions and its facts are deleted; insights linked to its facts show "Evidence changed" as for interview facts.

---

### Edge Cases

- No counted response yet: the tab says so and links to Fieldwork; nothing else is shown.
- An item added after responses (spec 028 allows it): its base is the responses that answered it; earlier ones are not counted as "no answer".
- An item reworded after responses: figures count every answer together, and the item says how many answered the former wording.
- An item removed from the questionnaire is no longer shown; facts made from it keep their snapshot and show "Item removed".
- A theme with every answer moved out: it stays empty until a person rejects it.
- An open answer that is only a name or a mark after masking: kept out of the analysis and counted as "nothing left after masking".
- Hundreds of open answers: they are sent in parts; themes are merged by the app across parts, labelled by the AI once; the cost estimate covers every part.
- The AI provider fails or returns nothing usable: nothing is saved, the cost of the call still shows, the person can retry.
- Two people deciding the same theme or fact: the second is told it changed meanwhile.
- A study with both a refused consent and a contact item: neither appears anywhere in Analysis.
- Study anonymised (spec 009): no effect on figures; masking still applies to open answers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A survey study's Analysis tab MUST show, for its counted responses, the flat sort of every choice and scale item, section by section, in the questionnaire's order, with the number of counted and set-aside responses.
- **FR-002**: Figures MUST be computed by the app from the stored responses at each read, never by AI and never stored, over the counted responses only (spec 028 FR-008).
- **FR-003**: For a choice item, the app MUST show each option's count and percentage over the respondents who answered it, plus "Other answers" for values not among its options; for a multiple-choice item, percentages are over respondents and the screen says they may exceed 100 %.
- **FR-004**: For a scale, the app MUST show the count per point, mean (one decimal), median, share of the two highest points and share of the two lowest, with its base.
- **FR-005**: A base under 30 MUST be flagged "small base"; under 5, percentages MUST be hidden and counts kept.
- **FR-006**: A person MUST be able to cross every choice and scale item by one profiling choice item: one column per answer with its base, plus the total; respondents who did not answer the profiling item count only in the total; with a multiple-choice profiling item, a respondent counts in each column chosen.
- **FR-007**: For an open item with at least 5 counted answers, a person MUST be able to ask for themes after seeing the estimated cost; the app MUST mask the names the team knows (its members, the participants and people scheduled in its studies, the person terms of its lexicon) and identifying patterns (emails, phone numbers, web addresses, numbers of 6 digits or more) before sending, and show the same masked text.
- **FR-008**: The AI MUST receive only the item's wording and its masked answers, each with an anonymous number. Themes come back with label and description (English and French) and quotes as answer number plus excerpt; the app MUST verify each quote word for word in the masked answer, drop the others, and drop a theme left without a verified answer.
- **FR-009**: A person MUST be able to accept, rename, merge, reject a theme and move an answer between themes, each recorded with who and when; a rejected theme MUST not be proposed again for that item; a run after new answers MUST only theme the answers in no theme.
- **FR-010**: A person MUST be able to propose a fact from a figure (flat sort or cross column) or from an accepted theme. The app writes a neutral statement in English and French without AI: from a sentence template filled with the value, item and base for a figure, from the theme's description for a theme; the fact keeps a snapshot of its source: item, value, base, cross, target rule version, small-base flag, or theme with its share and quotes. A figure or theme has at most one fact not rejected; a theme's share counts only answers of counted responses.
- **FR-010a**: The Analysis tab MUST offer "Find facts" on every tab, as the interview Analysis does (same place, name and look). The AI receives the flat sort as the app computed it and the accepted themes with their share, never an answer of a respondent, and points at up to 10 figures or themes worth a fact; the app checks each against today's figures and accepted themes, writes the statement as in FR-010 and proposes it. A figure or theme that already has a fact, whatever its status, is left out. The call shows its estimate before it runs, goes through the AI Gateway under the ledger ref `survey-facts:<studyId>` and its cost counts in the tab's cost. A person still makes a fact from a figure's card.
- **FR-011**: Survey facts MUST follow the statuses of interview facts (`proposed | accepted | edited | rejected`), the translation of a person's edit into the other language, and only accepted and edited facts are findings. Their theme is the questionnaire section of their item; their polarity is set by the person, neutral by default.
- **FR-012**: When a figure computed today differs from a fact's snapshot, the fact MUST show "Figure changed" with the new value until a person updates it or keeps it; a fact whose item is gone MUST show "Item removed".
- **FR-013**: Insights MUST use accepted survey facts with interview facts, and show each fact's source; the project page MUST count survey facts in its Facts step. An insight's support MUST show interview participants and survey respondents apart ("N participants · M respondents"); its confidence keeps the interview rule, and supporting survey facts with a base of 30 or more raise it by one level, at most high.
- **FR-014**: The assistant MUST receive only counts and figures computed by the app, never answer text; it MAY start a theme analysis after the person confirms its cost, and propose facts from figures through cards checked against today's figure before saving on Apply.
- **FR-015**: Every AI call (themes, translations of a person's edits) MUST go through the AI Gateway, be recorded in the usage ledger, and its cost MUST show on the item and in the Analysis tab's total.
- **FR-016**: Figures, themes, quotes and facts MUST follow spec 026: the Analysis tab is reserved to the owning team and admins; facts read in insights show only masked quotes.
- **FR-017**: Deleting a study MUST delete its themes, their decisions and its facts.
- **FR-018**: Reads MUST load only what the screen shows: counts and figures in SQL, open answers one item and one page at a time.
- **FR-019**: The next step of a survey study MUST go on after Fieldwork: read the figures, theme the open items, make and decide facts.
- **FR-020**: All texts MUST exist in English and French, using the glossary, with new terms added in the same change; screens MUST meet WCAG 2.2 AA; bars MUST carry their numbers in text, not only in length.
- **FR-021**: Sending masked open answers to an AI provider MUST be recorded as a decision (ADR), stating what is masked, what is sent and what is never sent.

### Key Entities

- **Figure** (computed, never stored): an item's distribution, mean, median, shares and base, optionally per column of a cross.
- **OpenAnswerTheme**: for one open item, a label and description (English and French), its answers, its verified quotes, origin (`ai | person`), status (`proposed | accepted | rejected`), who decided and when.
- **Survey fact**: a Fact (Evidence) whose support is a figure snapshot (item, value, base, cross, rule version, small-base flag) or an accepted theme with its share and quotes, instead of verbatims of an interview.
- **Theme analysis run**: one masked analysis of an open item: answers sent, parts, cost, outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every figure of the flat sort and of a cross matches a count made by hand on a reference set covering every item kind (tested).
- **SC-002**: No name known to the workspace and no identifying pattern appears in anything sent to an AI provider (tested on what is sent).
- **SC-003**: 100 % of quotes shown are found word for word in the answers they cite.
- **SC-004**: A person goes from a figure to a validated fact in three actions or fewer.
- **SC-005**: Accepted survey facts appear as evidence in the project's insights, with their source, in the same run as interview facts; an interview-only project's confidence levels are unchanged (tested).
- **SC-006**: The Analysis tab shows its figures within 2 seconds for 5,000 counted responses and 80 items.
- **SC-007**: Changing the target rule changes the figures at the next read, and every fact made from a figure that moved shows "Figure changed".
- **SC-008**: The cost of every theme analysis and translation shows in the Analysis tab; creating a fact costs nothing.
- **SC-009**: The tab and its dialogs have no axe violation in light and dark themes.

## Assumptions

- Spec 028's stored responses, response states and target rule are reused; figures never read the form service.
- Spec 028's task T030 is done: the user checked real responses, grids included, on their own form (2026-11-03). Shipped with this spec.
- Facts of interviews (spec 012) and insights over facts (spec 013) exist; survey facts join them as another kind of support, not a new pipeline.
- Masking relies on names the workspace knows and on patterns; a name nobody registered can still pass. The decision record says so, and the screen says answers are masked before analysis, not anonymised.
- Out of scope: quotes of open answers in the debrief deck (it shows interview quotes only; survey facts appear by their statement), weighting, significance tests, exports to spreadsheets, charts beyond simple bars, cross tabs by two items at once, scale grids shown as one table.
