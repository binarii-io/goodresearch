# Feature Specification: One fact lifecycle for every type of study

**Feature Branch**: `039-common-fact-lifecycle`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "One fact lifecycle for every type of study. Today facts are born, decided and read differently by study type: interview facts are proposed, accepted, edited or rejected on the interview study's Analysis tab; survey facts are proposed, accepted or rejected (an edit stays accepted) on the survey's Analysis tab; usability test facts exist only once a person accepted or edited an observation in a session's exploration, so observations still to decide give no fact. The project's Facts panel only lists and links facts. Insights, recommendations and takeaways already read facts by one rule (rejected never; still to decide only when asked), but the insight run dialog greys out a study without accepted facts until "Also read the facts still to decide" is ticked, unticked by default, which people read as a block. Wanted: the same statuses for every source (to decide, accepted, edited, rejected), the same decision actions (accept, edit, reject, reopen) with the same labels in one shared Facts component used on the Analysis tab of every study type and in the project's Facts panel, where facts can now be decided too; usability test observations still to decide give facts to decide, and deciding the observation or its fact decides both (the observation stays the evidence: moment, screenshot, checks); survey facts gain the edited status; the same eligibility for insights, recommendations and takeaways whatever the study type; the insight and recommendation dialogs show per study how many facts are accepted and still to decide, never grey out a study that only has facts to decide (choosing it reads them, said on screen), and read facts still to decide by default when none of the chosen studies has accepted facts; items built on facts still to decide stay marked to validate. Out of scope: changing how facts are found by the AI, merging facts across studies, new study types."

## Clarifications

### Session 2026-11-08

Decided by default from the requester's report (2026-11-08: "insights seem to be based only on validated facts", "the process should be common to every study, it is odd to diverge") and specs 012, 013, 014, 029 and 038; each can be revisited at `/speckit-clarify`:

- Q: Which facts does a usability test study give before anyone decides? → A: One fact **to decide** for each observation the checks kept or doubted, as an interview analysis proposes facts. An observation the checks rejected gives none until a person accepts it.
- Q: Who can decide a fact from the project's Facts panel? → A: The same people who can decide it in its study: members of the study's team who can change it. Others read the facts as today.
- Q: What does "reopen" do? → A: A decided fact (accepted, edited or rejected) goes back to "to decide". Insights and recommendations built on it show that it changed, as they do today when a fact is edited.
- Q: Do survey facts need an "edited" status? → A: They already have it where they are kept (found while planning, 2026-11-08): an edited survey fact is stored as edited; only the survey's screens and the project's panel show it as "accepted". This spec shows it as "edited" everywhere.
- Q: Do the task results of a usability test also become facts the insights read? → A: **Yes, one fact per task at the study level** (requester, 2026-11-08), for example "Task 2: 3 failures out of 5 sessions", counted from the outcomes people decided across the study's sessions, and following the same lifecycle; not one fact per task and session.
- Q: Does the common Facts list offer "Accept all"? → A: **Yes, for every study type** (requester, 2026-11-08): it accepts the facts to decide shown (filter and search included), in the study's list and in the project's Facts panel; decided facts are left as they are.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Decide facts the same way in every study (Priority: P1)

Whatever the type of study (interviews, survey, usability test), the person finds the facts of the study in the same Facts list on its Analysis tab. Each fact shows the same status in the same words (to decide, accepted, edited, rejected) and offers the same actions with the same labels (accept, edit, reject, reopen). Each fact keeps the link to its own evidence: the verbatims of an interview, the figures of a survey, the observation of a usability test session with its moment, screenshot and checks.

**Why this priority**: three ways to decide the same thing make people doubt what "accepted" means and where to act; a common process is the requester's main ask.

**Independent Test**: In a project with one study of each type, each with facts to decide, accept one fact, edit one, reject one and reopen one in each study; the statuses, labels and actions are the same in all three, and each fact still opens its own evidence.

**Acceptance Scenarios**:

1. **Given** an interview study, a survey and a usability test study with facts, **When** the person opens the Analysis tab of each, **Then** the facts appear in the same list with the same statuses, filters and actions.
2. **Given** a survey fact to decide, **When** the person edits its statement, **Then** it is shown as "edited", as an interview fact is.
3. **Given** an accepted fact of any type, **When** the person reopens it, **Then** it is "to decide" again, and an insight built on it shows that this fact is to decide again.
4. **Given** a fact of any type, **When** the person opens its evidence, **Then** they reach the verbatims, the survey figures or the observation of the session, as each type has it.
5. **Given** a filtered list of facts to decide in any study, **When** the person chooses "Accept all", **Then** the facts to decide shown are accepted, decided ones are left as they are, and the list says how many were accepted.

---

### User Story 2 - Usability test observations give facts to decide (Priority: P1)

When a usability test session is analysed, each observation the checks kept or doubted gives a fact to decide right away, as an interview analysis proposes facts. Deciding the observation in the session's exploration or its fact in the Facts list decides both, so they never disagree.

**Why this priority**: without facts to decide, a usability test study contributes nothing to insights until every observation is reviewed, and "read the facts still to decide" does nothing for it: the divergence the requester saw.

**Independent Test**: Analyse a usability test session; its observations kept by the checks appear as facts to decide in the study's Facts list; accept one fact there and see its observation accepted in the session; reject another observation in the session and see its fact rejected.

**Acceptance Scenarios**:

1. **Given** a session just analysed, **When** the person opens the study's Facts list, **Then** each observation the checks kept or doubted has a fact to decide, and observations the checks rejected have none.
2. **Given** a fact to decide from an observation, **When** the person accepts, edits or rejects it in the Facts list, **Then** the observation shows the same decision in the session's exploration.
3. **Given** an observation, **When** the person decides it in the session's exploration, **Then** its fact shows the same decision in the Facts list.
4. **Given** an observation the checks rejected, **When** the person accepts it, **Then** its fact appears, accepted.
5. **Given** a session analysed again, **When** the new analysis ends, **Then** facts of observations a person decided stay as decided, and facts still to decide follow the new observations.
6. **Given** a study whose sessions have decided task outcomes, **When** the person opens its Facts list, **Then** each task with at least one decided outcome has one fact to decide stating its outcomes across the sessions (for example "Task 2: 3 failures out of 5 sessions").
7. **Given** an accepted task fact, **When** an outcome of that task is decided or corrected in a session, **Then** the fact's figures change and it goes back to "to decide", saying that its figures changed.

---

### User Story 3 - Decide facts from the project (Priority: P2)

On the project's Facts panel, which gathers the facts of all its studies, the person can now decide facts with the same actions as in their study, without opening each study.

**Why this priority**: the project is where people prepare insights; deciding there saves a round trip per study, but the study's own list already covers the need.

**Independent Test**: In a project with facts to decide from two studies of different types, accept and reject facts from the project's Facts panel; each study's Analysis tab shows the same decisions.

**Acceptance Scenarios**:

1. **Given** a fact to decide in the project's Facts panel, **When** a person who can change its study accepts it, **Then** it is accepted in its study too.
2. **Given** a person who can only read a study, **When** they open the project's Facts panel, **Then** they see its facts without decision actions.
3. **Given** a study that feeds several projects, **When** a person decides one of its facts from one project, **Then** the decision shows in every project, as decisions in the study do today.

---

### User Story 4 - Insights read facts to decide when that is all there is (Priority: P1)

When the person starts finding insights or recommendations, the dialog shows for each study how many facts are accepted and how many are still to decide. A study that only has facts to decide is never greyed out: choosing it reads its facts to decide, and the dialog says so. When none of the chosen studies has accepted facts, the dialog reads the facts still to decide by default. Insights and recommendations built on facts still to decide stay marked "to validate".

**Why this priority**: this is the block the requester hit ("insights can only be based on validated facts?"); the rule was right, the screen hid it.

**Independent Test**: In a project whose studies have only facts to decide, open the insight dialog: no study is greyed out, reading the facts to decide is on and said, the run works, and its insights are marked "to validate".

**Acceptance Scenarios**:

1. **Given** studies with accepted facts and facts to decide, **When** the person opens the insight dialog, **Then** each study shows both counts.
2. **Given** a study with no accepted fact but facts to decide, **When** the person opens the dialog, **Then** the study can be chosen, and choosing it turns on reading the facts to decide, said in words next to the option.
3. **Given** chosen studies none of which has accepted facts, **When** the dialog opens, **Then** reading the facts to decide is on by default; the person can still turn it off, and the dialog then says no fact is left to read.
4. **Given** a run that read facts to decide, **When** its insights appear, **Then** each insight built on a fact to decide is marked "to validate", as today.
5. **Given** studies of different types with the same statuses, **When** insights, recommendations and takeaways are found, **Then** they read the same facts whatever the type of study: never rejected ones, facts to decide only when asked.

---

### Edge Cases

- A fact decided by two people at once: the second sees that it changed and decides again, as today (version seen).
- A usability observation whose fact cannot be made (a statement naming a person): the decision is refused with the reason, and both stay as they were (spec 038 rule).
- Reopening a fact an insight was built on: the insight keeps its link and shows that the fact is to decide again; nothing is deleted.
- An edited survey fact, then reopened: back to "to decide", its edited statement kept.
- A study with neither accepted facts nor facts to decide: greyed out in the dialog, with the reason ("no fact yet").
- A project with many facts: the Facts panel keeps its pages, search and filters; the decision actions do not load more than the page shows.
- A usability session deleted, or a study removed from the project: its facts leave the panel and the insight dialog, as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every fact, whatever its study type, MUST have one of four statuses: to decide, accepted, edited, rejected; the same words MUST be used everywhere the status is shown, in both languages.
- **FR-002**: Every fact MUST offer the same decision actions to a person who can change its study: accept, edit (its statement), reject, and reopen once decided; each decision MUST be refused if the fact changed since the person saw it.
- **FR-003**: The Analysis tab of every study type MUST show its facts in the same Facts list, with the same filters (to decide, accepted, rejected, all), the same counts and the same actions; each fact MUST open its own evidence (verbatims, survey figures, usability observation).
- **FR-003a**: The Facts list of every study type, and the project's Facts panel, MUST offer "Accept all" on the facts to decide shown (with the filter and search applied), to people who can change their studies; it MUST leave decided facts as they are, say how many it accepted, and skip a fact that changed meanwhile, saying so.
- **FR-004**: An edited fact, survey facts included, MUST be shown as "edited" (not "accepted") wherever its status is shown.
- **FR-005**: Reopening a decided fact MUST make it "to decide" again and keep its current statement; insights built on it MUST show that this fact is to decide again.
- **FR-006**: When a usability test session's analysis ends, each observation the checks kept or doubted MUST give a fact to decide; an observation the checks rejected MUST give no fact until a person accepts it.
- **FR-007**: Deciding a usability observation MUST decide its fact the same way, and deciding the fact MUST decide its observation the same way; they MUST never show different decisions.
- **FR-008**: A usability session analysed again MUST keep the facts of observations a person decided, and replace the facts still to decide with those of the new observations.
- **FR-008a**: A usability test study MUST have one fact per task of its protocol with at least one decided outcome, stating in both languages how many sessions succeeded, partly succeeded, failed or did not attempt it, counted from decided outcomes only; it follows the lifecycle of FR-001 and FR-002, and when its figures change after a decision it MUST go back to "to decide", saying its figures changed.
- **FR-009**: The project's Facts panel MUST offer the decision actions of FR-002 on each fact to people who can change its study, and only to them; decisions taken there MUST apply in the study and in every project it feeds.
- **FR-010**: Insights, recommendations and takeaways MUST read facts by one rule for every study type: never rejected facts; facts to decide only when asked; accepted and edited facts always.
- **FR-011**: The insight dialog MUST show, for each study, its number of accepted (or edited) facts and its number of facts to decide; the recommendation dialog, which reads insights, MUST show the number of validated insights and of insights to decide, and read insights to decide by default when none is validated.
- **FR-012**: A study with only facts to decide MUST be choosable in those dialogs; choosing it MUST turn on reading facts to decide, and the dialog MUST say so in words.
- **FR-013**: When none of the chosen studies has accepted facts, reading facts to decide MUST be on by default; turning it off MUST be possible, with the dialog saying that no fact is left to read.
- **FR-014**: Insights and recommendations built on facts to decide MUST stay marked "to validate" until those facts are decided.
- **FR-015**: A study with no fact at all MUST be shown in the dialogs as not choosable, with the reason.
- **FR-016**: Facts to decide made from usability observations MUST follow the same rules as other facts: a statement never names a person, the study's anonymisation applies, and their translation and its cost are recorded as for other facts.

### Key Entities

- **Fact**: what a study establishes, with its statement in two languages, its theme, its polarity, its study and its status (to decide, accepted, edited, rejected); its evidence depends on its source.
- **Evidence of a fact**: verbatims of interviews; figures of a survey question; the observation of a usability test session (moment, screenshot, checks); for a task fact, the sessions with their decided outcome.
- **Usability observation**: what the analysis of a session found; it is the evidence of its fact, and its decision is the fact's decision.
- **Task fact**: one per task of a usability test study, stating its decided outcomes across the sessions; its evidence is the list of sessions with their outcome.
- **Run of insights or recommendations**: reads the facts of the chosen studies by the rule of FR-010, with or without facts to decide.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a project with one study of each type, a person decides a fact in each study with the same actions and words, without any study-specific step (checked on the three types).
- **SC-002**: 100% of the observations kept or doubted by the checks of an analysed usability session appear as facts to decide in the study's Facts list, and every task with a decided outcome has its task fact.
- **SC-003**: An observation and its fact never show different decisions (checked after each action from either side).
- **SC-004**: In a project whose studies have only facts to decide, a person starts a run of insights in at most two clicks from the dialog, with no setting to find.
- **SC-005**: Every insight built on a fact to decide is marked "to validate" until its facts are decided.
- **SC-006**: A person decides 10 facts from two studies in the project's Facts panel without leaving it, or accepts all the facts to decide shown in one action.

## Assumptions

- The facts of every type already reach the project's synthesis by one read path and one eligibility rule; this spec aligns how they are born, decided and shown, not how the AI finds them.
- "Accepted" and "edited" both count as decided and are read the same way by insights; the difference only tells whether a person changed the statement.
- The Facts list of each study keeps today's search, pages and filters; usability facts reuse the theme of their task, as in spec 038.
- Decisions follow the existing rights: team members who can change a study decide; readers of a study only read (spec 026).
- Translating facts to decide from usability observations costs AI calls like other facts; the cost is recorded under the session's analysis and shown where it is spent.
- The project's Facts panel keeps showing facts not rejected by default, with "to decide" marked as today.
