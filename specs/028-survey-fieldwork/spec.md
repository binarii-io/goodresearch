# Feature Specification: Survey fieldwork — open the form, read the responses, keep those of the target

**Feature Branch**: `028-survey-fieldwork`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Fieldwork of survey studies, after spec 027: open and close the form, read its responses through the form service, set aside what does not count, follow the progress. Stay consistent with the interview Fieldwork."

## Clarifications

### Session 2026-11-02

Decided by the user:

- Q: When are responses read? → A: **When the Fieldwork tab opens, plus a Refresh button.** No push notifications: they would make the deployer run one more service.
- Q: Who writes the target rule? → A: **A manual screen**, where a person ticks the accepted answers of each profiling item; **the assistant can pre-fill it through a card to apply**. The app applies the rule without AI, says how many responses were set aside and why, and deletes nothing.
- Q: Does the phase list change? → A: A survey study only offers Preparation, Fieldwork and Analysis (shipped with this spec; spec 027 updated).

Decided by default; each can be revisited at review:

- Q: What may change once responses exist? → A: Changes that would break the link between responses and items are refused at the update: removing an item, changing its kind, scale or options, moving a scale in or out of a grid. Rewording an item and adding one stay possible, with a warning naming how many responses answered the former version. The app's questionnaire can still be edited; only writing to the form is refused, and the screen says what to undo.
- Q: Can a closed form reopen? → A: Yes: opening and closing are decisions of a person, each confirmed, and can alternate. Responses already read stay.
- Q: Are responses kept in the app? → A: Yes, as a copy used by the app, refreshed from the source, which stays the truth: a response deleted at the source leaves the app at the next read. Nothing is ever deleted at the source.
- Q: Do responses go to an AI provider? → A: Not in this spec. Open answers are free text and may hold names. The assistant gets counts only, and for the rule, the items and their options, never an answer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open and close the form (Priority: P1)

On the Fieldwork tab of a survey study, a person opens the published form to responses, after a confirmation that recalls the checks left (review, pre-test). The tab then gives the link to share. Later, they close it.

**Why this priority**: Nothing can be collected without it, and it is the moment the questionnaire stops being only a draft.

**Independent Test**: Publish a questionnaire, open the form, copy the link, close it, reopen it.

**Acceptance Scenarios**:

1. **Given** a published form in sync, **When** a person opens it and confirms, **Then** it accepts responses and the tab shows the link to share, with who opened it and when.
2. **Given** a form collecting respondents' identities, **When** a person tries to open it, **Then** it is refused, saying what to change in the form; nothing is opened.
3. **Given** a form whose consent no longer ends the form on refusal, **When** a person tries to open it, **Then** it is refused for that reason.
4. **Given** a form out of date, changed at the source, in conflict or unavailable, **When** a person tries to open it, **Then** it is refused, pointing to the Preparation tab.
5. **Given** review or pre-test not marked, **When** a person opens the form, **Then** the confirmation names them, and the person can still go on.
6. **Given** an open form, **When** a person closes it and confirms, **Then** it stops accepting responses and those already received stay.
7. **Given** a form opened or closed by hand at the source, **When** the tab is shown, **Then** it shows the real state.
8. **Given** a study without a published form, **When** the tab is shown, **Then** it says so and links to Preparation.

---

### User Story 2 - Read the responses (Priority: P1)

When the Fieldwork tab opens, the app reads the responses with the person's own access, and a Refresh button reads them again. The tab says when they were last read, the number of responses against the target number, and how many are set aside, by reason.

**Why this priority**: This is what the user wants from the app: exploiting the data here, without depending on the results spreadsheet.

**Independent Test**: Submit responses to an open form, open the tab, see them counted; submit another one, refresh.

**Acceptance Scenarios**:

1. **Given** responses at the source, **When** the tab opens, **Then** they are read, each answer attached to its item, including items shown as grid rows and shuffled.
2. **Given** the tab open, **When** a person activates Refresh, **Then** new responses appear, changed ones are updated, and those deleted at the source are gone; the same response read twice counts once.
3. **Given** a response refusing consent, **When** it is read, **Then** it holds no answer and is counted apart as a refusal.
4. **Given** a contact item, **When** responses are read, **Then** its answers are never stored or shown.
5. **Given** a question added in the form and unknown to the questionnaire, **When** responses are read, **Then** its answers are not stored and the tab says how many such questions were left out.
6. **Given** a person who cannot read the form at the source, **When** the tab opens, **Then** they see what was last read and when, and why it cannot be refreshed.
7. **Given** the source failing, **When** reading, **Then** what was read before stays, and the tab says the reading failed.
8. **Given** responses already read and the results spreadsheet linked or not, **Then** the counts are the same: the app never reads the spreadsheet.

---

### User Story 3 - Keep the responses of the target (Priority: P1)

A person says, for each profiling item, which answers belong to the target. Responses outside it are set aside, never deleted, and the tab says how many. Changing the rule brings them back at once.

**Why this priority**: The method allows sending widely then filtering; findings on the wrong people would mislead.

**Independent Test**: With responses in hand, tick accepted answers, see the counts move, untick, see them come back.

**Acceptance Scenarios**:

1. **Given** a profiling item with choices, **When** a person ticks accepted answers and saves, **Then** a response is out of target when its answer is not among them, and the counts update.
2. **Given** a multiple-choice profiling item, **When** the rule applies, **Then** one accepted answer among those given is enough.
3. **Given** several filtered items, **When** the rule applies, **Then** a response must pass all of them.
4. **Given** a filtered item a response did not answer, **When** the rule applies, **Then** the response is set aside as "profile not answered", counted apart.
5. **Given** responses set aside, **When** the rule changes or is removed, **Then** they count again; nothing was deleted.
6. **Given** two people editing the rule, **When** the second saves, **Then** they get "changed meanwhile".
7. **Given** no rule, **Then** every response with consent counts, and the tab says no target filter is set.
8. **Given** a profiling item that is open or a scale, **Then** it cannot be filtered, and the screen says so.

---

### User Story 4 - Read a response (Priority: P2)

The team can list responses, by page, with their date and state, and open one to read its answers item by item.

**Why this priority**: People must be able to check what they collect; statistics come with spec 029.

**Independent Test**: Open a response, read its answers; filter on those set aside.

**Acceptance Scenarios**:

1. **Given** responses, **When** the list is shown, **Then** it shows one page with counts computed by the app, filtered by state: counted, out of target, profile not answered, refused consent.
2. **Given** a response, **When** opened, **Then** its answers are shown item by item, an item with no answer being marked so.
3. **Given** an answer to a former wording, **When** shown, **Then** it is marked as such.

---

### User Story 5 - Protect what was collected (Priority: P1)

Once responses exist, an update of the form that would break their link to items is refused, and a rewording warns.

**Why this priority**: A broken link silently loses or misattributes answers, which is the worst outcome for trust in the data.

**Independent Test**: With responses, remove an item in the app and update: refused. Reword one and update: warned, then done.

**Acceptance Scenarios**:

1. **Given** responses, **When** an update would remove an item or change its kind, scale or options, or move a scale in or out of a grid, **Then** it is refused, naming the items, and the form is unchanged.
2. **Given** responses, **When** an update rewords an item, **Then** a confirmation says how many responses answered the former wording; once confirmed, the item keeps its identity and the former wording is kept for them.
3. **Given** responses, **When** an update adds an item, **Then** it goes through, and earlier responses show no answer for it.
4. **Given** responses, **When** the shuffle setting is changed, **Then** the update is refused if it would move a scale in or out of a grid.
5. **Given** a change made directly in the form that breaks a link, **When** read, **Then** the affected answers are not attached to another item, and the tab reports them.

---

### User Story 6 - With the assistant (Priority: P2)

The assistant knows where the fieldwork stands, as counts. It proposes opening or closing through a card, and pre-fills the target rule through a card, from the target audience of the framing.

**Why this priority**: Consistency with the interview journeys; the screen already allows every action.

**Independent Test**: Ask where things stand, ask to open, ask for the target rule, apply each card.

**Acceptance Scenarios**:

1. **Given** a survey study, **When** the person asks what is left, **Then** the assistant answers from counts computed by the app, and the next step comes from the app.
2. **Given** a person's request, **When** the assistant proposes opening or closing, **Then** a card names what will happen, the same refusals apply, and nothing changes before Apply.
3. **Given** a proposal of a rule, **When** shown, **Then** the card lists the accepted answers per item, may only use existing items and options, and how many responses it would set aside is computed by the app.
4. **Given** any of this, **Then** no answer of a response reaches the AI provider (tested on what is sent), and the rule's cost is shown on the tab.
5. **Given** a person who can only read, **Then** the assistant reads and proposes nothing, as in spec 026.

---

### Edge Cases

- Thousands of responses: read page by page from the source; a reading stops cleanly and says what it did.
- Two people refreshing at once: the same response is stored once.
- A form republished after being removed: former responses are from another form: they are not attached to it, and the tab says so.
- A study's folder detached or replaced: what was read stays until the study is deleted; refresh is refused with the reason.
- Editing a response at the source: the new answers replace the former ones at the next read.
- An option written by hand in the form, unknown to the item: kept as given and shown as "not in the options"; it never passes a target rule.
- Consent answered by neither option: treated as a refusal.
- Study anonymised: no effect: respondents are not identified.
- Deleting the study: imported responses and rule are deleted; the form and its responses stay at the source.
- An account deleted: the person who opened or closed shows as a deleted account.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A survey study's Fieldwork tab MUST show the state of the form, opening and closing, the link to share once open, the counts and the responses. A survey study MUST offer only the phases Preparation, Fieldwork and Analysis.
- **FR-002**: Opening and closing MUST be a person's confirmed action, with their own access at the source, recording who and when.
- **FR-003**: Opening MUST be refused while the form collects identities, its consent does not end it on refusal, or it is not in sync. Review and pre-test MUST be recalled and block nothing.
- **FR-004**: Responses MUST be read from the form service, when the tab opens (at most once a minute per study) and whenever a person activates Refresh, with the person's own access; never from the results spreadsheet; never in the background without a person.
- **FR-005**: Each answer MUST be attached to its item through the identity kept at publication. An answer to a question the item map does not know MUST NOT be stored and MUST be reported as a count.
- **FR-006**: The contact item's answers MUST never be stored, shown or sent anywhere. A refusal of consent MUST store no answer.
- **FR-007**: Reading MUST be idempotent: one stored response per response at the source; updated when changed; removed when gone from the source. A failed reading MUST leave what was read before.
- **FR-008**: A response's state MUST be computed by the app at read time, never stored: refused consent; profile not answered; out of target; counted.
- **FR-009**: The target rule MUST hold, per single- or multiple-choice item of a profiling section, its accepted options; saved against the version seen, with who and when. A change applies at once and deletes nothing. An option the rule names and the item no longer has MUST be reported. The rule is optional: the screen stays folded until a person adds a target, and removing it saves an empty rule, so every response counts.
- **FR-010**: Counts MUST be computed by the app with SQL, and the list MUST load one page (load only what is shown).
- **FR-011**: Once a response exists, an update of the form MUST be refused when it removes an item, changes its kind, scale or options, or moves it in or out of a grid, naming the items. A rewording MUST ask for a confirmation giving the number of responses concerned, keep the identity, and keep the former wording for them. Adding an item MUST go through.
- **FR-011a**: The same rule MUST apply when accepting a change made in the form: once a response exists, accepting the removal of an item or a change of its kind, scale or options is refused, naming the items; the person rejects it, and the next update writes the item back.
- **FR-012**: The assistant MUST receive only counts on responses, and tools to count, to propose opening, closing and a target rule. Proposals are cards saved on Apply, checked by the same rules, for this study only. A rule's options are checked against the item's.
- **FR-013**: No answer MUST reach an AI provider. Every AI call MUST be in the usage ledger, with its cost on the tab.
- **FR-014**: Responses, counts and the rule MUST be reserved to the owning team and admins (spec 026), behind the folder access barrier; a read-only person's Fieldwork tab stays "reserved to the team".
- **FR-015**: Deleting a study MUST delete its imported responses and rule, and never anything at the source.
- **FR-016**: The next step on a survey study MUST be computed by the app and go on after publication: checks, open the form, collect up to the target number, close, then Analysis when it exists.
- **FR-017**: All texts MUST exist in English and French, using the glossary, with new terms added in the same change; screens MUST meet WCAG 2.2 AA.

### Key Entities

- **SurveyResponse** (a new Surveys context): one response read from the form: its identity at the source, submission time, consent given or refused, and its answers per item. No identity of the respondent.
- **ResponseReading**: when responses were last read, by whom, how it went, how many questions were left out.
- **TargetRule**: per filtered item, its accepted options; version, who, when.
- **Form state** (Publishing, extended): opened or closed, by whom, when; the link to share; the former wordings of items reworded after responses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person goes from a published form to a link to share in two actions.
- **SC-002**: 100 % of answers read are attached to the right item, on a form holding every item kind, with shuffled grid rows.
- **SC-003**: No contact answer and no respondent identity is stored, and no answer appears in anything sent to an AI provider (tested).
- **SC-004**: Reading the same responses twice changes no count.
- **SC-005**: Every response set aside is counted by reason, and removing the rule brings every one back.
- **SC-006**: No update of the form can detach existing responses from their items through the app (tested on each refused change).
- **SC-007**: The tab shows counts and the first page within 2 seconds for 5,000 responses already read.
- **SC-008**: The tab and the dialogs have no axe violation in light and dark themes.

## Assumptions

- Spec 027's form, item map and sync are reused. The user published a real form successfully on 2026-11-02: creation in the folder, filling and the source scope work against the real service. Refusing consent, shuffled grid rows and reading responses remain to verify with real responses (quickstart).
- Reading responses needs edit access to the form; the plan verifies it. Viewers see what was last read.
- Statistics, reading open answers, facts and insights are spec 029. The stored answers must allow them.
- A question left in the form and not accepted being proposed again after each update (spec 027 limit) does not affect reading: its answers are left out and reported. It stays out of scope.
- No invitations or reminders: the team shares the link itself.
