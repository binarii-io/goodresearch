# Feature Specification: Survey preparation — questionnaire with the assistant, best practices, publication as a form

**Feature Branch**: `027-survey-preparation`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Integrate survey studies, based on the method 'Comment construire un questionnaire en 4 étapes' (OCTO). Create a questionnaire on Google Drive, have the data in the results spreadsheet, and exploit it on our side. Stay consistent with the interview process in naming and structure."

## Clarifications

### Session 2026-11-02

- Q: Where does the app read the responses from, given that the form service cannot link a results spreadsheet by program (verified in its documentation: the link is read-only)? → A: **From the form service**, with stable question identifiers, in spec 028. The results spreadsheet stays available to the team: the app guides the one-click link in the form and detects it, without depending on it.
- Q: How is the work cut? → A: **Three successive specs**, one pull request each: 027 Preparation (this spec), 028 Fieldwork (opening, responses, filtering the target audience), 029 Analysis (statistics computed by the app, open answers, facts).

Decided by default for this spec, following the interview process; each can be revisited at review:

- Q: What is the structure? → A: Same shape as the interview guide: one **Questionnaire** per survey study, a **framing**, then ordered **sections** of kind `introduction | profiling | theme | closing`, holding ordered **items**. It follows the method's order: objective, themes, optional sub-themes, items.
- Q: Is a schedule needed? → A: No. A survey has no planned interview, and recruitment is described in the framing: no name of a real person is held.
- Q: What can really be randomised? → A: The service found no setting for the order of questions across a form. So: the options of unordered choices are shuffled; consecutive Likert items of a theme sharing a legend are published as one grid whose rows are shuffled (an open question between them makes two grids, shuffled separately, as the screen says), unless the person turns it off for the questionnaire; the order of themes stays fixed. The screen says so plainly.
- Q: What does the optional email at the end mean, given that nothing is deleted at the source? → A: The method says the email is "not kept". The app never imports it (spec 028), but the answer does stay in the form and its spreadsheet until a person removes it. The default text says it is used only to send the results and then deleted, and the app reminds the person to delete it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a survey study (Priority: P1)

A person creates a study of type Survey, with the same form and the same assistant card as an interview study. Its page has the phases that apply to a questionnaire: Preparation, Fieldwork and Analysis (Lexicon, Enrichment and Quality work on transcripts and on how interviews were conducted). Preparation is usable; the following phases say that they come later.

**Why this priority**: Nothing else exists without it; the type is declared today but refused.

**Independent Test**: Create a survey study from the Studies page and through the assistant, open it, read the phases.

**Acceptance Scenarios**:

1. **Given** a person in a team, **When** they create a study with the type Survey, **Then** it is created and the Preparation tab offers the questionnaire, not the interview guide or the schedule.
2. **Given** a survey study, **When** its page is shown, **Then** only Preparation, Fieldwork and Analysis are offered, even from an old link to another phase; Fieldwork and Analysis say they come later and hold no interview screen.
3. **Given** a survey study, **When** a command reserved to interview studies is requested (guide, schedule, sessions), **Then** it is refused with the existing "not an interview study" outcome.
4. **Given** a project with an interview study and a survey study, **When** its overview is shown, **Then** the survey study neither blocks nor distorts the interview counts and its next step.

---

### User Story 2 - Design the questionnaire with the assistant (Priority: P1)

On the Preparation tab, the person activates "Design with the assistant". The panel opens on a new conversation; the assistant loads the questionnaire design skill and follows the method in order: a concrete objective, the themes and optional sub-themes ("what information do I need?"), the target audience and recruitment, how it is administered, then the items. It chooses each item's format from what is measured: facts as categorical items, perceptions as Likert scales, open questions as a complement. A progress bar shows the eight points. When they are covered and the person agrees, it checks the items with the app's rules and proposes the whole questionnaire as a card; applying it saves it.

**Why this priority**: This is the job of the Preparation phase, and where the method's discipline protects the answers.

**Independent Test**: Start the design, answer a few questions, see the progress move, ask for the questionnaire, apply the card, read it on the Preparation tab.

**Acceptance Scenarios**:

1. **Given** a survey study the person can change, **When** they activate "Design with the assistant", **Then** the request is sent as their first message, the line "Using the skill: Questionnaire design" is shown, and the assistant answers with what it already knows and its first question.
2. **Given** a design conversation, **When** the assistant reports progress, **Then** the panel shows the percentage computed by the app from the eight points: objective and themes 20, hypotheses 5, target audience and recruitment 15, administration and consent 10, profiling items 10, thematic items 25, format and order 10, bias review 5.
3. **Given** the person agreed, **When** the assistant proposes the questionnaire, **Then** the items were checked first (line "Checked N items"), and the card shows the sections, the number of items per kind, the estimated time, what the rules still flag, and the expandable full text; nothing is saved before Apply.
4. **Given** a saved questionnaire, **When** the person asks for a change, **Then** the assistant proposes the whole updated questionnaire; if someone changed it meanwhile, Apply fails with "changed meanwhile" and nothing changes.
5. **Given** the Preparation tab, **When** a design conversation has cost something, **Then** the tab shows that cost for the study, whoever ran it.

---

### User Story 3 - Read, edit and download the questionnaire (Priority: P1)

The tab shows the framing, then the sections in order, each item with its kind, its options or scale, what is measured, and what analysis it allows. The person can edit everything by hand, and "Write it myself" starts from an empty questionnaire holding the default consent and closing texts. They can download it as Markdown.

**Why this priority**: The assistant must not be the only way in, and the team must be able to review the questionnaire outside the app.

**Independent Test**: Write a questionnaire by hand with each item kind, save, reload, download.

**Acceptance Scenarios**:

1. **Given** a survey study without a questionnaire, **When** the tab is shown, **Then** it explains what it is for and offers "Design with the assistant" and "Write it myself".
2. **Given** a questionnaire, **When** the person edits an item and saves, **Then** the version increases, the origin says "edited by hand", and an item whose text is unchanged keeps its identifier.
3. **Given** two people editing, **When** the second saves, **Then** they get "changed meanwhile" and their edit is not applied.
4. **Given** an invalid questionnaire (empty item, choice with one option, no consent text, over the limits), **When** saving, **Then** the problem is shown next to the field and nothing is saved.
5. **Given** a questionnaire, **When** the person downloads it, **Then** a Markdown file named after the study holds the same content.
6. **Given** a person outside the owning team, **When** they open the tab, **Then** they read the questionnaire with the "Read only" badge and no change control (spec 026).

---

### User Story 4 - Get warned about what weakens the answers (Priority: P2)

The app checks the questionnaire with fixed rules and shows what to review next to each item and for the whole: a double question, a negation, a leading wording, a factual question asked as a scale, an item asking for directly identifying data, different legends between scales, no open question for a long stretch of scales, no profiling item. It also shows the estimated time to answer.

**Why this priority**: These are the method's rules, and a person writing by hand needs them as much as the assistant does.

**Independent Test**: Write items breaking each rule and see each flagged; save anyway.

**Acceptance Scenarios**:

1. **Given** an item that asks two things, or a factual question as a Likert scale, **When** it is checked, **Then** it is flagged with the reason in the interface language; it can still be saved.
2. **Given** an item asking for a first name, a surname or an email outside the closing contact item, **When** it is checked, **Then** it is flagged as directly identifying.
3. **Given** more than 10 closed items in a row, **When** the questionnaire is checked, **Then** the app suggests an open question to break the series.
4. **Given** any questionnaire, **When** shown, **Then** the estimated time is computed by the app from the kinds of items, and is labelled as an estimate.

---

### User Story 5 - Publish the questionnaire as a form (Priority: P1)

The person publishes the questionnaire: a form is created in the study's source folder, with the person's own source access and editing consent, holding the consent text, the items and the thanks. It is **not yet open to responses**, which belong to Fieldwork. The tab gives its links, and later compares the app and the form as for other published files. It also guides the link of the results spreadsheet in the form, and detects it.

**Why this priority**: This is what the user asked for: the questionnaire lives in the team's Drive, while the app keeps the structure that will let it exploit the responses.

**Independent Test**: Publish, open the form, check each item against the app, change an item in the app and update, change one in the form and review it, link a spreadsheet and see it detected.

**Acceptance Scenarios**:

1. **Given** a questionnaire and a source folder, **When** the person publishes, **Then** a form is created in the folder, closed to responses, collecting no identity of the respondent, and the app records the identity of each of its items.
2. **Given** a study without a source folder, or a person without editing consent or edit access, **When** they publish, **Then** the screen says what is missing, as for the other published files.
3. **Given** the published form, **When** a form item matches an app item, **Then** the item's kind, wording, options, scale and legend are the same.
4. **Given** an item changed in the app, **When** the file is checked, **Then** it is "out of date"; "Update in Drive" changes only what differs, and unchanged items keep their identity at the source.
5. **Given** an item changed in the form, **When** the file is checked, **Then** it is a Drive change a person accepts or rejects; changed on both sides, it is a conflict; a form item the app cannot express is "not understood".
6. **Given** the published form, **When** the tab is shown, **Then** it says what is randomised and what stays in a fixed order, and offers the link to the form for the person's own settings.
7. **Given** a form with no linked spreadsheet, **When** the tab is shown, **Then** it explains the one-click link in the form; once linked, **Then** at the next check the tab links to the spreadsheet. Nothing else depends on it.
8. **Given** the form was deleted, trashed or moved out of the folder, **When** checked, **Then** it is "unavailable", and nothing is deleted at the source by the app.

---

### User Story 6 - Check readiness before sending (Priority: P2)

Before Fieldwork, the tab shows the method's last checks: reviewed by another person, pre-tested by a few "naive participants" with the form's preview, consent and thanks present, recruitment and target size written. The person marks the human ones as done. They advise and block nothing.

**Why this priority**: The method insists on these checks, and they are easily forgotten; but only people can do them.

**Independent Test**: Mark the review and pre-test, see who did and when, reload.

**Acceptance Scenarios**:

1. **Given** a questionnaire, **When** the tab is shown, **Then** each check says done or to do; those the app can compute are computed, the others are marked by a person with their name and date.
2. **Given** the questionnaire changes after a check was marked, **When** the tab is shown, **Then** the check is marked "questionnaire changed since".
3. **Given** the assistant on the study, **When** it is told the next step, **Then** the step is computed by the app: questionnaire, folder, publication, checks, then Fieldwork when it exists.

---

### User Story 7 - Read the questionnaire best practices (Priority: P2)

The tab offers the questionnaire best practices, in the interface language, readable in a dialog and downloadable: the four steps of the method, biases to avoid, ethics, and thinking ahead to the analysis. The assistant applies the same rules.

**Why this priority**: Same role as the interview best practices, and the source method stops before analysis, which this text anticipates.

**Independent Test**: Open and download them in French and in English.

**Acceptance Scenarios**:

1. **Given** the tab, **When** the person activates "Read the best practices", **Then** the document opens in a dialog that returns focus when closed.
2. **Given** the document, **Then** it names no company or tool vendor, and cites its sources.

---

### User Story 8 - Publish through the assistant (Priority: P3)

The assistant can propose publishing the questionnaire with a card, as for the interview preparation (spec 023), and says what comes next.

**Why this priority**: Consistency with the interview journeys; the screen already allows the action.

**Independent Test**: Ask the assistant to publish, apply the card, read the result.

**Acceptance Scenarios**:

1. **Given** a questionnaire, **When** the assistant proposes publishing and the person applies, **Then** the same rules and refusals as on the screen hold.
2. **Given** a person who can only read, **Then** the assistant reads and proposes nothing, as in spec 026.

---

### Edge Cases

- A study's type cannot change: an interview study never becomes a survey, as a questionnaire and a guide never coexist.
- Republishing after the form was removed creates a new form; the former item identities are not reused.
- A form edited so that an item changes kind: a Drive change the person decides, validated by the same rules; an unsupported kind is "not understood" and stays only in the form.
- A person adds a file-upload or other unsupported question in the form: "not understood", reported, never imported.
- The form service is not enabled for the deployer's account: the screen says the source refused and what the deployer must do; the questionnaire is unchanged.
- A Likert series with fewer than 2 items in a theme: published as a single scale, with nothing to shuffle.
- Mixed legends: if items of one theme use different scales, only those sharing a legend form a grid.
- Anonymised study: the setting has no effect on the items; respondents are never identified, and spec 028 holds the rest.
- Assistant proposal for another study, or breaking the limits: refused, the assistant is told why.
- A proposal applied twice: applied once.
- Deleting the study deletes the questionnaire; the form stays at the source.
- Folder replaced or detached: the published form becomes "unavailable" for the app; the questionnaire stays.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A study of type `survey` MUST be creatable by the form and by the assistant card, with the same rules as an interview study (team, projects, goal), and its type MUST NOT change afterwards.
- **FR-002**: A survey study MUST have at most one questionnaire: a framing (objective, hypotheses, target audience, recruitment strategy `targeted | wide-then-filter`, administration mode, target number of responses with its reason, language `en | fr`, consent text, thanks text, shuffle setting) and ordered sections of kind `introduction | profiling | theme | closing`, each with a title and ordered items; an item of a theme section may name a sub-theme.
- **FR-003**: An item MUST have an app identifier, a text, a measure (`factual | subjective`), a required flag, and a kind: `likert` (5 or 7 points, default 7, two end labels), `single-choice` (binary included), `multiple-choice` or `open`. Choices hold 2 to 20 options, with an "ordered" flag for options that must not be shuffled. The closing section MAY hold one optional **contact item**, marked as such.
- **FR-004**: The questionnaire MUST be validated by the app: consent and thanks present, at least one theme section with one item; at most 12 sections, 80 items, 15 hypotheses; texts trimmed and non-empty, at most 600 characters for an item or option, 4,000 for a framing text.
- **FR-005**: An item identifier MUST be kept when a new version has the same id or the same text (ignoring case and spaces). Saving MUST check the version seen; a stale version is refused with "changed meanwhile". Each save records version, who, when and origin (`assistant | person | drive`).
- **FR-006**: The default consent text MUST be offered in the questionnaire's language and hold the objective, the format and length, anonymity and data use, "no right or wrong answer", the free choice to take part, and a place to announce sensitive themes. Refusing consent MUST end the form without access to the items.
- **FR-007**: The app MUST check with fixed rules, in English and French: double question, negation, leading wording, absolute word, too long (over 30 words), factual measure on a Likert scale, directly identifying data outside the contact item, inconsistent legends, more than 10 closed items without an open one, no profiling item, too many open items (at least 5, and more than a third of the items). Rules flag and never block. The same rules serve the screen and the assistant's tool.
- **FR-008**: The estimated time MUST be computed by the app from the number and kinds of items, and never by a model.
- **FR-009**: Each item kind MUST state what analysis it allows, in the interface language: Likert: distribution and median, read as ordered and not as a measure; choices: counts, shares and cross-tabulation with profiling items; open: reading by theme with a person's validation. The structure saved MUST let spec 029 compute them without another reading.
- **FR-010**: On the page of a survey study the person can change, the assistant MUST receive the questionnaire or its absence with its version, the list of skills, and tools to load a skill, check items, report progress and propose the whole questionnaire. Proposals follow the rules of spec 006 FR-006: same validation, this study only, a card, saved once on Apply.
- **FR-011**: The app MUST compute the percentage from the eight fixed weights of US2; unknown points count as missing.
- **FR-012**: Every AI call MUST be in the usage ledger, and the Preparation tab MUST show the design's cost for the study.
- **FR-013**: The questionnaire MUST be downloadable as Markdown and the best practices as Markdown, in the interface language for headings; the questionnaire's own text stays in its language.
- **FR-014**: Publishing MUST create one form in the study's source folder with the person's own access and editing consent, closed to responses, without collecting the respondent's identity, and MUST record the identity at the source of each item. Consent MUST come first and lead out of the form on refusal. If the form collects identities anyway (changed by hand, or forced by an organisation's policy), the tab MUST show a dedicated warning at each check, outside the sync states; spec 028 refuses to open such a form.
- **FR-015**: Publishing MUST respect the shuffle setting: unordered choices shuffled; with the setting on (default), consecutive Likert items of a theme sharing a legend as one grid with shuffled rows; ordered options and theme order fixed. The screen MUST state this before and after publishing.
- **FR-016**: The form MUST follow the three-way sync of spec 007: in sync, out of date, changed in Drive, conflict, unavailable; not understood and invalid for what cannot be taken in; nothing from the form changes the app without a person's decision, and an update changes only what differs, keeping item identities.
- **FR-017**: The tab MUST say whether a results spreadsheet is linked, guide the link when not, and link to it when it is, checked with the file. The app MUST NOT depend on it, nor read it.
- **FR-018**: Readiness checks MUST be shown: computed (consent and thanks, recruitment and target number, published and in sync), and marked by a person (review by another person, pre-test by naive participants, with name, date and the number of people for the pre-test). They block nothing, and show "questionnaire changed since" when the version moved.
- **FR-019**: Best practices MUST exist in English and French, name no company or tool vendor, and cover the four steps, biases, ethics, and analysis ahead. The assistant's skill MUST apply the same rules.
- **FR-020**: Reading and changing MUST follow spec 026: the questionnaire reads like the interview guide; changes need the owning team; folder access applies as for any study with a source folder. A read-only person gets no proposal.
- **FR-021**: Only survey studies have a questionnaire (`NOT_A_SURVEY_STUDY` otherwise); interview commands keep refusing survey studies. A survey study MUST offer no Lexicon, Enrichment or Quality phase; its Fieldwork and Analysis MUST show no interview screen and MUST NOT run an inventory of sessions. Project overview and next steps MUST leave survey studies out of interview counts.
- **FR-022**: Deleting a study MUST delete its questionnaire and never the form at the source.
- **FR-023**: All interface texts MUST exist in English and French, using the glossary, with the new terms added in the same change; screens MUST meet WCAG 2.2 AA.
- **FR-024**: The contact item's text MUST state that the address is used only to send the results and then deleted, and the tab MUST remind the team that deleting it at the source is theirs to do. Spec 028 never imports its answers.

### Key Entities

- **Questionnaire** (Research): one per survey study; framing, sections, items; version, last saved by and when, origin.
- **Item** (Research): one element of a questionnaire, a statement or a question; identifier, kind, measure, text, options or scale, optional sub-theme. Named after the method, since a Likert item is usually not a question.
- **Questionnaire section** (Research): kind, title and ordered items.
- **Readiness check** (Research): a human check marked on a questionnaire version; who, when, how many people.
- **Questionnaire design progress** (Assistant): latest report of a conversation for the eight points.
- **Item check** (Assistant, shared with the screen): what the app's rules flag.
- **Questionnaire best practices**: fixed content per language.
- **PublishedDocument** (Publishing, extended): a new kind, form, with its item identities, Drive changes and linked spreadsheet if any.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the Preparation tab, a person gets the assistant's first question in one action, and a saved questionnaire in one Apply once the design is done.
- **SC-002**: 100 % of saved questionnaires respect the limits of FR-004, whether written by the assistant, by hand or accepted from the form.
- **SC-003**: Every item of a questionnaire is found in the published form with the same kind, wording and options, and its identity at the source is recorded (checked on a questionnaire holding all kinds).
- **SC-004**: No form created by the app accepts a response or collects a respondent's identity before Fieldwork.
- **SC-005**: A person can tell, without leaving the tab, what is randomised, whether the form is up to date, whether a results spreadsheet is linked and which checks remain.
- **SC-006**: No concurrent change is lost silently: each is refused with "changed meanwhile" (tested).
- **SC-007**: Interview studies behave exactly as before: their existing tests pass unchanged.
- **SC-008**: The tab, the editor, the dialogs and the card have no axe violation in light and dark themes.

## Assumptions

- The method's source is the article by Joy Desdevises, OCTO Talks, 2022. It says nothing of analysis; what the best practices say about it comes from common survey research practice, and spec 029 settles it.
- The assistant panel, skills, proposals, progress bar, publishing and sync of specs 005, 006, 007 and 023 are reused, not doubled.
- Form service facts checked in its documentation on 2026-11-02: forms start unpublished; items are added after creation; the existing full source scope covers creating forms and reading responses; the linked spreadsheet is read-only; no setting for the order of questions across a form was found; grid rows and options can be shuffled. The plan verifies the rest against the real service: leading out on refused consent, not collecting identity, moving the form into the folder.
- The form service must be enabled in the deployer's account: a deployment change, to document.
- Pre-testing uses the form's preview, which records no response; a pre-test with real responses belongs to Fieldwork.
- Grids may be less comfortable on a phone; the shuffle setting lets the person choose one scale per item instead.
- Out of scope: opening the form, responses, filtering the target audience (028); statistics, open answers, facts, insights (029); other form services; conditional paths other than consent; several languages in one questionnaire; importing an existing form.
