# Feature Specification: Project insights

**Feature Branch**: `013-project-insights`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Project insights (« Insights »), first step of the project-level synthesis, as in the prototype. The AI reads the accepted facts of the project's studies (anonymised fact lines: id, statement, polarity, theme, participant code, study), the project goal, the theme list and the existing insights (rejected ones as an avoid list), and proposes insights: theme, statement, description, counter-evidence, minority view, and links to facts as support or counter. Only known fact ids may be cited; max 25 new insights per pass; incremental, never rewriting a person's decision. The app computes confidence and polarity, never the AI. A person validates, edits, rejects, links or unlinks facts, creates insights by hand. Generate dialog (studies, fact scope), estimate and consent, runs in the worker per project, progress, stop, cost on the Insights tab. Cards with confidence, polarity, theme filter, facts grouped by participant; facts side panel with paging, search, polarity and unlinked filters. Out of scope: theme reclassification, recommendations, key takeaways, deck, network graph, evidence chain, participant profiles."

## Clarifications

### Session 2026-10-29

- Q: What replaces the prototype's spread condition for "high" confidence (≥3 teams, no team over 50%), since participants have no team yet? → A: None for now: "high" is at least max(5, 30% of the panel) supporting participants; the team condition comes back with participant profiles.
- Q: Can insights be proposed from facts not yet accepted? → A: Yes, on request ("Also read the facts still to decide" in the run dialog). Such a fact is shown "to validate" wherever it is linked, can be accepted or rejected from the insight, and counts for confidence and polarity only once accepted; a validated insight still needs one accepted supporting fact.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find the project's insights in its facts (Priority: P1)

The project page gets two tabs: "Overview" (the goal and the studies, as today) and "Insights". On "Insights", the person activates "Find insights". A dialog lets them choose the project's studies to read (those with accepted facts, all checked by default) and the scope: "Facts not yet in an insight" (default once insights exist) or "All accepted facts". It shows the number of facts, the estimated cost and, the first time, that the fact statements (no names, no verbatims) are sent to their AI provider. The AI reads the facts with the project's research goal and the themes, and proposes **insights**: a finding that holds across participants ("Teams rebuild the same reports because they cannot find existing ones"), with a description, the counter-evidence and the minority view, each linked to the facts that support it and those that go against it.

**Why this priority**: Insights are what the research question gets as an answer; facts alone are a list per interview. Every later step (recommendations, key takeaways, debrief) is built on validated insights.

**Independent Test**: With a project of one study where five participants each have an accepted fact saying they cannot find their team's data (negative) and one participant an accepted fact saying search works well for them (positive), "Find insights" proposes one insight on finding data, supported by the five facts and countered by the sixth; its polarity and confidence are computed by the app, and nothing is proposed from facts still to decide or rejected.

**Acceptance Scenarios**:

1. **Given** a project whose studies have accepted facts, **When** the person activates "Find insights", **Then** the dialog shows the studies with their counts of accepted facts, the scope, the number of facts that will be sent, the estimated cost and, the first time for this provider, what is sent; nothing runs before it is confirmed.
2. **Given** a confirmed run, **When** the AI is called, **Then** it receives, for each fact, only its id (a short reference of the run), its statement in the project's language, its polarity, its theme, its participant's code (`P01`…, prefixed by the study when there are several) and its study's short reference; plus the research goal, the theme list, the existing insights (theme, statement, their fact references) and the rejected insights' statements as a list to avoid. No name, no verbatim, no interview title is sent.
3. **Given** the AI's answer, **When** it comes back, **Then** each insight keeps only the fact references sent in this run; an insight with no remaining supporting fact is dropped and counted as "left out"; at most 25 new insights are kept per run.
4. **Given** a kept insight, **When** it is shown, **Then** its confidence (high, medium, low) and its polarity (positive, negative, neutral, mixed) are computed by the app from its linked facts (FR-008, FR-009), never taken from the AI, and its texts hold no percentage.
5. **Given** a run in progress, **When** the person looks at the tab, **Then** it shows where the run stands (sending, reading, saving) and can be stopped after the current call; what the calls already done found is kept.
6. **Given** a run, **When** it ends, **Then** its cost is shown on the Insights tab (this run and the project's total) and recorded in the usage ledger.

---

### User Story 2 - Decide the insights (Priority: P1)

The person reads the insight cards: theme, statement, confidence with a tooltip explaining it, polarity tag, the number of participants for and against. Opening one shows its description, counter-evidence and minority view, and its facts grouped by participant, each with its role (support or counter) and a link to its interview. They validate, edit or reject it; they link more facts or unlink some; they can also write an insight by hand.

**Why this priority**: AI proposes, people decide. Only validated insights will feed recommendations and the debrief.

**Independent Test**: The person rejects one proposed insight, edits the statement of a second and moves one of its facts from support to counter, validates a third, and writes a fourth by hand with two facts. A new "Find insights" run does not propose the rejected one again, does not change the edited one, and the confidence of the second is recomputed at once.

**Acceptance Scenarios**:

1. **Given** insights, **When** the tab opens, **Then** they are shown as cards grouped by theme with a filter by theme, status (to decide, validated, rejected), confidence and polarity, and a "Validate all shown".
2. **Given** an insight, **When** the person validates, edits (theme, statement, description, counter-evidence, minority view) or rejects it, **Then** the decision is kept with who and when, and the version seen is checked ("changed meanwhile").
3. **Given** an opened insight, **When** the person links a fact (support or counter), changes a fact's role or unlinks it, **Then** the link records who and when and its origin (`ai | person`), and the confidence and polarity are recomputed at once; an unlinked fact is never linked again by the AI to that insight.
4. **Given** "New insight", **When** the person writes a statement and links at least one supporting fact, **Then** it is saved as validated, with origin `person`.
5. **Given** the confidence tooltip, **When** it is shown, **Then** it gives the participants for and against, the panel size, the rule applied, and what is missing for "high" (e.g. "2 more participants").
6. **Given** a rejected insight, **When** a new run proposes one whose statement shares 60% or more of its words with it, or exactly its supporting facts, **Then** it is dropped.

---

### User Story 3 - Browse the facts beside the insights (Priority: P2)

A "Facts" side panel on the Insights tab lists the accepted facts of the project, paged, with a search on the statement and filters by polarity, theme, study and "not in any insight". From an opened insight, a fact can be linked from the panel as support or counter.

**Why this priority**: The person checks what the AI left out and builds insights by hand from facts no insight covers.

**Independent Test**: With 120 accepted facts, the panel shows them 25 per page; "not in any insight" with "negative" shows only the negative facts no insight links; linking one to an opened insight removes it from that filter.

**Acceptance Scenarios**:

1. **Given** the panel, **When** it opens, **Then** it lists the accepted facts with statement, polarity, theme, participant code, study and the number of insights citing it, 25 per page.
2. **Given** a search and filters, **When** they are applied, **Then** the list and its count follow them, and the page goes back to the first.
3. **Given** an opened insight, **When** the person links a fact from the panel, **Then** they choose support or counter, and the fact shows it is now cited.

---

### User Story 4 - Keep insights true when the facts change (Priority: P2)

Facts can still change after an insight was decided: a fact rejected, edited, deleted with its interview, or a study removed from the project. The insight keeps its links but shows what changed.

**Why this priority**: An insight's confidence must reflect the evidence as it stands, without silently rewriting what a person decided.

**Independent Test**: A validated insight supported by five facts; one is rejected in the study, another's polarity is changed. The insight shows "Evidence changed (2)", its confidence counts only the four accepted facts, and "Reviewed" clears the flag without changing the links.

**Acceptance Scenarios**:

1. **Given** a linked fact rejected later, or deleted with its interview or study, **When** the insight is shown, **Then** the link stays listed as "fact no longer accepted" (or "fact deleted"), it no longer counts for confidence and polarity, and the insight shows "Evidence changed".
2. **Given** a linked fact whose statement, polarity or theme changed after the insight was decided, **When** the insight is shown, **Then** it shows "Evidence changed" with that fact marked, until a person activates "Reviewed" or edits the insight.
3. **Given** a study moved out of the project or deleted, **When** the insight is shown, **Then** links to its facts are listed as "outside the project" (or deleted), not counted.

---

### Edge Cases

- No study with accepted facts: the Insights tab explains that facts are accepted in each study's Analysis tab, with links to the studies.
- A study without interview guide: its facts have the theme "Other"; themes of several studies' guides with the same title (ignoring case and accents) are one theme.
- The AI cites a fact reference it was not sent: the citation is dropped; an insight left without support is dropped and counted.
- The AI proposes an update to an insight a person decided (validated, edited, rejected): its texts are never changed; new facts it links are added as "suggested", not counted until a person accepts them (FR-006).
- The AI writes a percentage or a known name in a text: the insight is kept, the offending sentence is removed; a statement holding a name is dropped.
- A fact linked as both support and counter of the same insight: not possible; the last role chosen wins.
- More facts than fit in one AI call: the app splits them by theme into several calls, each with the insights of that theme, and counts every call in the run's cost.
- The provider fails: retried once, then the run fails with its reason; nothing of a failed call is saved, the calls that succeeded are kept.
- A person without access to one of the project's studies (its Drive folder, spec 002 FR-010a): that study is not offered in the dialog; on insights, its facts are counted but their statements are not shown to them.
- Two people decide the same insight at once: the second is told it changed meanwhile.
- A run already in progress for the project: "Find insights" is disabled and shows who started it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project page MUST have two tabs: "Overview" (goal and studies, as today) and "Insights". The Insights tab MUST show the insights grouped by theme, in creation order within a theme (a decision or a link never moves an insight), the counts per status, the cost of the last run and the project's total.
- **FR-002**: "Find insights" MUST open a dialog to choose the studies of the project the person can access that have accepted facts, and the scope: "All accepted facts" or "Facts not yet in an insight" (default once the project has insights). It MUST show the number of facts sent and the estimated cost, and run only once confirmed.
- **FR-003**: Accepted and edited facts (spec 012 FR-017) MUST be sent; facts still to decide MUST be sent only when the person asks for it in the dialog; rejected facts never. A fact still to decide MAY be linked, is shown "to validate" with "Accept the fact" and "Reject the fact" in the insight, and counts for confidence and polarity only once accepted; validating an insight needs one accepted supporting fact.
- **FR-004**: Each AI call MUST send only: per fact a short reference of the run, its statement in the project's language, polarity, theme, participant code (prefixed by the study when the project has several) and study reference; the project's research goal; the theme list; the existing insights of those themes (theme, statement, fact references); and the rejected insights' statements as a list to avoid. Names, verbatims, interview titles and study names MUST NOT be sent; the participant code is a pseudonym whatever the study's anonymisation.
- **FR-005**: The AI MUST be asked for insights: theme (one of those sent, or "Other"), a statement of at most 200 characters and a description of at most 1,000 characters, both in English and French, counter-evidence and a minority view (each required, "none" allowed), and the references of supporting and counter facts. The app MUST keep only references sent in the call, drop insights without a supporting fact, drop sentences with a percentage, drop statements holding a known name, and keep at most 25 new insights per run.
- **FR-006**: A run MUST be incremental: it adds new insights as proposed; for an insight still proposed it MAY replace its texts and links; for an insight a person decided (validated, edited, rejected) it MUST NOT change any text or remove any link, and facts it newly links are added as "suggested", shown on the insight and counted only once a person accepts them.
- **FR-007**: A new insight MUST be dropped when its statement shares 60% or more of its words with a rejected insight's, or when its supporting facts are exactly those of a rejected insight. A fact a person unlinked from an insight MUST never be linked to it again by the AI.
- **FR-008**: **Confidence** MUST be computed by the app from the counted links: the panel is the number of participants with accepted facts in the project's studies; "high" when the supporting participants are at least max(5, 30% of the panel), with no spread condition until participants have a team (participant profiles, later); "medium" when at least 3; "low" otherwise; counter-evidence from at least half as many participants as support lowers it one level. A tooltip MUST explain the counts, the rule and what is missing for "high".
- **FR-009**: **Polarity** MUST be computed by the app from the counted supporting facts: "neutral" when fewer than 30% are positive or negative; otherwise "positive" or "negative" when one of them is at least 60% of the polarised facts; "mixed" otherwise.
- **FR-010**: A person MUST be able to validate, edit (theme, statement, description, counter-evidence, minority view), reject, and "validate all shown" insights; link a fact as support or counter, change its role, unlink it; accept or dismiss suggested facts; and create an insight by hand with at least one supporting fact (saved as validated, origin `person`). Each decision records who and when and checks the version seen. An edited statement or description is saved at once and translated into the other language in the background, as facts are (spec 012 FR-016).
- **FR-011**: Each insight MUST record its project, theme, statement and description (English and French), counter-evidence, minority view, origin (`ai | person`), status (`proposed | validated | edited | rejected`), who decided and when, the run that proposed it, a version, and its links (fact, role `support | counter`, state `counted | suggested | unlinked`, origin, who and when).
- **FR-012**: When a linked fact is no longer accepted, is deleted, belongs to a study no longer in the project, or its statement, polarity or theme changed after the insight was decided, the insight MUST keep the link, show it with what changed, count only accepted facts of the project, and show "Evidence changed" until a person activates "Reviewed" or edits it. Update (spec 014 review): "Reviewed" lets go of a fact no longer accepted or deleted (it is unlinked), keeps one of a study away from the project (it may come back), and never leaves a decided insight without support.
- **FR-013**: The Insights tab MUST offer a facts side panel: the project's accepted facts the person can access, 25 per page, with statement, polarity, theme, participant code, study and the number of insights citing it; a search on the statement and filters by polarity, theme, study and "not in any insight"; and, from an opened insight, linking a fact as support or counter.
- **FR-014**: The Insights tab MUST work in two panes: the insights on the left, the insight selected on the right (the first one shown is selected by default), with its texts, decisions and facts grouped by participant (code, study), each with its role, statement, polarity and a link to the fact in its study's Analysis tab. The counts of an insight MUST also say how many participants its facts still to validate would add, and its confidence once they are accepted. The right pane edits in place: the statement, description, counter-evidence and minority view are edited where they are shown, the theme from a list, and "Validate" / "Reject" sit side by side at the top with the choice made highlighted.
- **FR-015**: A run MUST run in the background, one per project at a time, show its progress (calls done of total), allow stopping it (nothing of an unfinished call is kept), retry a failed call once, and keep the calls that succeeded.
- **FR-016**: Each AI call MUST go through the AI Gateway with the person's own AI connection and be recorded in the usage ledger with what it was for and which project. The Insights tab MUST show the cost of the last run and the project's total, translations included.
- **FR-017**: Before the first run on a project by a person, and again when their provider changes, a confirmation MUST say that fact statements, polarities, themes and participant codes (no names, no verbatims) are sent to their AI provider.
- **FR-018**: Running, deciding and viewing MUST follow the project's team access (spec 002); a study the person cannot access (Drive folder) MUST NOT be offered in the dialog, and its facts' statements MUST NOT be shown to them (counts only).
- **FR-019**: All texts MUST exist in English and French; the tabs, the cards, the dialogs and the side panel MUST meet WCAG 2.2 AA, and a confidence, polarity or status MUST never be shown by colour alone.

### Key Entities

- **Insight** (Synthesis context): a project-level finding: theme, statement and description (English and French), counter-evidence, minority view, origin, status, who decided and when, version, "evidence changed" flag; computed confidence and polarity (never stored as decided values).
- **Insight link**: an insight ↔ an accepted fact, with role (`support | counter`), state (`counted | suggested | unlinked`), origin, who and when.
- **Insight run** (per project): one "Find insights": who started it, studies and scope chosen, calls done of total, stopped or finished, cost reference, how many insights were left out.
- **Theme** (project level): the theme sections of the project's studies' guides, merged by title, plus "Other".
- **Panel**: the participants with accepted facts in the project's studies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every link of every insight points to a fact that was accepted when it was linked, and every AI-proposed insight has at least one supporting fact (tested).
- **SC-002**: No name, verbatim, interview title or study name is sent to an AI provider (tested).
- **SC-003**: Confidence and polarity shown always equal the app's computation from the counted links (tested, including the "lowers one level" rule).
- **SC-004**: A new run never changes a text or removes a link of an insight a person decided, and never proposes again a rejected insight (tested).
- **SC-005**: Every AI call of a run appears in the usage ledger, and the cost on the Insights tab equals the sum of the project's ledger entries for runs and translations (tested).
- **SC-006**: A run over 750 facts (30 interviews of 25 facts) completes in under 5 minutes with a standard AI provider.
- **SC-007**: A person can review and decide 25 proposed insights in under 20 minutes using the filters and "validate all shown".
- **SC-008**: The Insights tab, the dialogs and the side panel have no axe violation in light and dark themes.

## Assumptions

- A study belongs to one project (spec 002); the project's facts are the accepted facts of its studies. Attaching a study to several projects is a later change; links to facts of a study that left the project are kept and flagged.
- Insights belong to a new Synthesis context and only read facts through Evidence's public interface.
- The project's language for what is sent is the language of the person who runs it; the AI writes both languages, as for facts.
- A participant is one roster person of one study (spec 009 code); the same person in two studies counts twice until participant profiles exist.
- The estimate uses the size of the fact lines and the person's model price (spec 005); the real cost comes from the ledger.
- Any member of the project's team (or an admin) can run, decide and edit; no separate role.
- Out of scope: theme reclassification on the guide, recommendations, key takeaways, debrief deck, network graph, evidence chain, participant profiles, fact export.
