# Feature Specification: Project recommendations and key takeaways

**Feature Branch**: `014-project-recommendations`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Next step of the project synthesis, as in the prototype: recommendations from the project's insights, and the key takeaways. The AI reads the validated insights (and, on request, those still to decide) and proposes recommendations: an action, its rationale, a kind (build, test, investigate), an impact and an effort (high, medium, low), a success measure, and the insights it rests on. A person decides each one, edits it in place, sets an owner, links or unlinks insights, writes one by hand. The app computes the priority and turns a 'build' backed only by low-confidence insights into a 'test'. Key takeaways: the project's 2 to 4 sentence summary, drafted by the AI from the validated insights and recommendations, never saved without a person. Same patterns as spec 013: two panes, estimate and consent, background runs, costs on the tab, two languages, stable order."

## Clarifications

### Session 2026-10-29

- Q: Are the key takeaways part of this feature? → A: Yes: a block at the top of the Recommendations tab.
- Q: Can the key takeaways be drafted from what is not validated yet? → A: Yes, on request (FR-010a): the chain stays open, and what is not verified is shown as such everywhere.
- Q: Can recommendations be proposed from insights not yet validated? → A: Yes, on request ("Also read the insights still to decide" in the run dialog, unticked by default). Such an insight is shown "to validate" wherever it is linked, can be validated or rejected from the recommendation, and counts for the kind rule and the takeaways only once validated.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find recommendations in the insights (Priority: P1)

The project page gets a third tab, "Recommendations". The person activates "Find recommendations". A dialog shows the number of validated insights, an option to also read those still to decide, the estimated cost and, the first time, what is sent to their AI provider. The AI reads the insights with the research goal and proposes **recommendations**: what the team should do ("Add a shared catalogue of the team's reports"), why, whether to build it, test it first or investigate further, its impact and effort, how to measure success, and the insights it rests on.

**Why this priority**: Recommendations turn the findings into decisions the team can act on; they are what a debrief presents.

**Independent Test**: With a project of four validated insights, one of them of low confidence, "Find recommendations" proposes recommendations that each cite at least one of those insights; one proposed as "build" and resting only on the low-confidence insight is shown as "test", with the reason; each shows its priority, computed by the app.

**Acceptance Scenarios**:

1. **Given** a project with validated insights, **When** the person activates "Find recommendations", **Then** the dialog shows the number of insights that will be sent, the option "Also read the insights still to decide", the estimated cost and, the first time for this provider, what is sent; nothing runs before it is confirmed.
2. **Given** a confirmed run, **When** the AI is called, **Then** it receives for each insight only a short reference, its theme, its statement in the runner's language, its confidence level, its polarity and its number of supporting and counter participants; plus the research goal, the existing recommendations and the rejected ones as a list to avoid. No fact, verbatim, name, interview or study name is sent.
3. **Given** the AI's answer, **When** it comes back, **Then** each recommendation keeps only the insight references sent; one without an insight is dropped and counted as "left out"; at most 15 new recommendations are kept per run; one whose action holds a known name is dropped.
4. **Given** a kept recommendation, **When** it is shown, **Then** its priority is computed by the app (impact × 2 − effort, high 3, medium 2, low 1) and a "build" whose counted insights all have a low confidence is shown as "test", with the reason; neither is taken from the AI.
5. **Given** a run in progress, **When** the person looks at the tab, **Then** it shows where the run stands and can be stopped; nothing of a call answered after the stop is kept.
6. **Given** a run, **When** it ends, **Then** its cost is shown on the Recommendations tab (this run and the project's total) and recorded in the usage ledger.

---

### User Story 2 - Decide the recommendations (Priority: P1)

The tab works in two panes: the recommendations on the left, the one selected on the right (the first by default), with its fields edited in place and the insights it rests on. The person validates or rejects it (side by side, the choice highlighted), edits the action, rationale, success measure, kind, impact, effort and owner, links or unlinks insights, validates an insight still to decide from here, and writes a recommendation by hand.

**Why this priority**: AI proposes, people decide; only validated recommendations go to the takeaways and the debrief.

**Independent Test**: The person rejects one recommendation, edits the action of a second and sets its owner, changes the effort of a third (its priority follows at once), validates it, and writes a fourth by hand linked to two insights. A new run does not propose the rejected one again and does not change the edited one; the list keeps its order throughout.

**Acceptance Scenarios**:

1. **Given** recommendations, **When** the tab opens, **Then** they are listed in creation order with their status, kind, priority, impact and effort as text, with filters by status, kind and priority, and "Validate all shown"; the first one shown is open in the right pane.
2. **Given** the open recommendation, **When** the person edits a field in place, **Then** it is saved with the version seen ("changed meanwhile" otherwise), the recommendation becomes "edited", and a text written in one language is translated into the other in the background.
3. **Given** a recommendation, **When** the person links an insight, unlinks one, or validates or rejects an insight still to decide from it, **Then** the kind rule and the priority are recomputed at once; an unlinked insight is never linked again by a run.
4. **Given** "New recommendation", **When** the person writes an action and links at least one validated insight, **Then** it is saved as validated, with origin "person".
5. **Given** a rejected recommendation, **When** a new run proposes one whose action shares 60% or more of its words with it, or exactly its insights, **Then** it is dropped.

---

### User Story 3 - Key takeaways (Priority: P2)

At the top of the Recommendations tab, a "Key takeaways" block holds the project's summary in 2 to 4 sentences. The person writes it, or asks the AI for a draft from the validated insights and recommendations; the draft is shown beside the saved text and saved only when the person chooses to (as is or edited).

**Why this priority**: The takeaways open the debrief; they are what a stakeholder reads first.

**Independent Test**: With three validated insights and two validated recommendations, "Draft with the AI" shows a draft of 2 to 4 sentences without names or percentages; nothing is saved until the person saves it; after a recommendation is validated later, the block says the takeaways may be out of date.

**Acceptance Scenarios**:

1. **Given** validated insights, **When** the person activates "Draft with the AI", **Then** the cost is estimated and, the first time, consent is asked; the draft appears when ready, the person can keep working meanwhile, and its cost is recorded and shown.
2. **Given** a draft, **When** it is shown, **Then** it has 2 to 4 sentences in English and French, holds no known name and no percentage, and is never saved without the person's action ("Use this draft", then edit or save).
3. **Given** saved takeaways, **When** the validated insights or recommendations change afterwards, **Then** the block says "May be out of date" until saved again.
4. **Given** the takeaways, **When** a person edits them in place, **Then** they are saved with who and when and the version seen, and translated into the other language in the background.

---

### User Story 4 - Keep recommendations true when insights change (Priority: P3)

An insight a recommendation rests on can be rejected, deleted, edited or change confidence later. The recommendation keeps its links and shows what changed.

**Why this priority**: A recommendation must not silently rest on evidence that no longer holds.

**Independent Test**: A validated recommendation rests on two insights; one is rejected, the other's statement is edited. The recommendation shows "Insights changed (2)"; the kind rule counts only the remaining validated insight; "Reviewed" clears the flag for the edited one.

**Acceptance Scenarios**:

1. **Given** a linked insight rejected or deleted later, **When** the recommendation is shown, **Then** the link stays listed as such, no longer counts, and the recommendation shows "Insights changed".
2. **Given** a linked insight whose statement, theme or confidence level changed after the recommendation was decided, **When** it is shown, **Then** it shows "Insights changed" until a person activates "Reviewed" or edits the recommendation.

---

### Edge Cases

- No validated insight (and none still to decide): the tab explains that insights are found and validated in the Insights tab, with a link.
- The AI cites an insight reference it was not sent: the citation is dropped; a recommendation left without insight is dropped and counted.
- The AI proposes an update to a recommendation a person decided: its texts are never changed; insights it newly links come as "suggested", counted once accepted.
- A kind, impact or effort outside the lists: the recommendation is dropped and counted.
- An owner is free text (a role or a team, at most 100 characters); it is never sent to the AI and never proposed by it.
- The AI writes a percentage or a known name in the key takeaways draft: the sentence is removed; a draft left with fewer than 2 sentences is shown as failed, with a retry.
- A recommendations run and an insights run of the same project may run at once; each reads the other's objects as they are when it starts.
- Two people decide the same recommendation, or save the takeaways, at once: the second is told it changed meanwhile.
- A person without access to one of the project's studies: recommendations and insights are shown (they hold no study data); facts stay hidden as in spec 013.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project page MUST have a third tab, "Recommendations", with the key takeaways block at the top, then two panes: the recommendations on the left in creation order (a decision or a link never moves one), the one selected on the right (the first shown by default). The tab MUST show the counts per status, the cost of the last run and the project's total (runs, drafts and translations).
- **FR-002**: "Find recommendations" MUST open a dialog with the number of insights sent, the option "Also read the insights still to decide" (unticked), the estimated cost, and run only once confirmed. Rejected insights MUST never be sent.
- **FR-003**: Each AI call MUST send only, per insight, a short reference of the run, its theme, its statement in the runner's language, its confidence level, its polarity and its numbers of supporting and counter participants; the research goal; the existing recommendations not rejected (action, kind, insight references); and the rejected ones' actions as a list to avoid.
- **FR-004**: The AI MUST be asked for recommendations: an action (at most 200 characters) and a rationale (at most 1,000), both in English and French; a kind (`build | test | investigate`); an impact and an effort (`high | medium | low`); a success measure (at most 300 characters, both languages); and the references of the insights it rests on. The app MUST keep only references sent in the call, drop recommendations without an insight, with a value outside the lists, or whose action holds a known name, and keep at most 15 new ones per run.
- **FR-005**: A run MUST be incremental, as spec 013 FR-006: new recommendations come as proposed; one still proposed may get new texts and AI links; one a person decided keeps its texts, and insights newly linked to it come as "suggested"; a rejected one, and an insight a person unlinked, are left alone. FR-007 of spec 013 applies to recommendations (60% of the words of the action, or exactly the same insights, of a rejected one).
- **FR-006**: The **priority** MUST be computed by the app: impact × 2 − effort (high 3, medium 2, low 1). The **kind shown** MUST be "test" when the kind is "build" and every counted insight has a low confidence (spec 013 FR-008), with the reason; otherwise the kind given.
- **FR-007**: A person MUST be able to validate, reject (side by side, the choice highlighted), edit in place (action, rationale, success measure, kind, impact, effort, owner), "validate all shown", link an insight, unlink one, accept or dismiss a suggested one, validate or reject an insight still to decide from the recommendation, and create a recommendation by hand with at least one validated insight (saved as validated, origin `person`). Each decision records who and when and checks the version seen. Validating needs one counted validated insight; an edit makes a recommendation "edited" only when it rests on one (otherwise it stays proposed), and "validate all shown" says how many need a validated insight first.
- **FR-008**: Each recommendation MUST record its project, action, rationale and success measure (English and French), kind, impact, effort, owner, origin, status (`proposed | validated | edited | rejected`), who decided and when, the run, a version, its translation state, and its links (insight, state `counted | suggested | unlinked`, origin, who and when, and the insight as it was: statement, theme, confidence level).
- **FR-009**: A linked insight still to decide MUST be shown "to validate", MUST NOT count for the kind rule, and MUST NOT count as changed. When a linked insight is rejected, deleted, or its statement, theme or confidence level changed after the recommendation was decided, the recommendation MUST show "Insights changed" until a person activates "Reviewed" (which lets go of a rejected or deleted insight, but never leaves a decided recommendation without a validated insight) or edits it. A person's edit is never rewritten by a run, even while the recommendation is still proposed.
- **FR-010**: The **key takeaways** MUST be one text per project of 2 to 4 sentences, in English and French, with who saved it, when, and a version. "Draft with the AI" MUST send only the validated insights (statement, theme, confidence level) and the validated recommendations (action, kind, priority) with the research goal, and show the draft beside the saved text; a draft MUST NOT hold a known name or a percentage (such sentences removed) and MUST never be saved without the person's action; the first draft for a provider asks for consent in a dialog, and a failed draft keeps the one before. The block MUST show "May be out of date" when the validated insights or recommendations changed in meaning since the takeaways were saved (a decision, an edit, a new run's words, an insight's confidence; not a translation, a review or a suggested link).
- **FR-010a** (update, 2026-10-29): A draft MAY also read the insights and recommendations still to decide ("Also use what is still to decide", ticked by default when nothing is validated); they are marked as such for the AI, the draft says it includes items to validate, and saved takeaways show "Rests on N items to validate" until those are validated. The chain stays open, and what is not verified is shown as such everywhere.
- **FR-011**: A run and a draft MUST run in the background, one run per project at a time (and one draft), with progress and stop for the run, a call tried twice, and any other failure ending them as interrupted; a run whose worker stopped MUST show as interrupted.
- **FR-012**: Each AI call MUST go through the AI Gateway (a takeaways draft too: its estimate is shown before it runs, and what the drafts cost is shown in the takeaways block), with the person's own AI connection and be recorded in the usage ledger with what it was for and which project; the Recommendations tab MUST show the costs.
- **FR-013**: Before the first run or draft on a project by a person, and again when their provider changes, a confirmation MUST say what is sent (insights and recommendations, no facts, no names); one consent covers the project's synthesis (spec 013).
- **FR-014**: The right pane MUST show the insights a recommendation rests on, each with its statement, confidence, polarity and state, a link to it in the Insights tab, and an insights panel to link more (search, theme, confidence, "not used by any recommendation").
- **FR-016**: The left pane MUST offer a "Matrix" view next to the list: a prioritisation matrix of impact (rows, high on top) by effort (columns, low first), "Quick wins" marked, each recommendation not rejected in its cell. Dragging a recommendation to another cell, or moving it with the arrow keys (up and down: impact, left and right: effort), MUST save its new impact and effort with the version seen (it becomes "edited") and recompute its priority; selecting it opens it in the right pane. The same matrix will be shown in the debrief deck.
- **FR-015**: All texts MUST exist in English and French; the tab, the panes, the dialogs and the panel MUST meet WCAG 2.2 AA; kind, impact, effort, priority and status MUST never be shown by colour alone.

### Key Entities

- **Recommendation** (Synthesis): action, rationale and success measure (EN/FR), kind, impact, effort, owner, origin, status, who decided and when, version, translation state; its links to insights; computed priority and kind shown.
- **Recommendation link**: a recommendation ↔ an insight, with state, origin, who and when, and the insight's snapshot.
- **Recommendation run** (per project): who, the option chosen, calls done of total, stopped or finished, cost, left out.
- **Key takeaways** (per project): text EN/FR, translation state, who saved and when, version, the validated insights and recommendations it was saved over (to tell "may be out of date"); the last AI draft, never applied by itself.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every recommendation the AI proposes cites at least one insight sent in its run, and no fact, verbatim, name, interview or study name is sent (tested).
- **SC-002**: Priority and the kind shown always equal the app's computation (tested, including build → test).
- **SC-003**: A run never changes a decided recommendation's texts, never re-links an unlinked insight, never proposes again a rejected one (tested).
- **SC-004**: Key takeaways are never saved without a person's action, and a draft holds no known name or percentage (tested).
- **SC-005**: Every AI call appears in the usage ledger, and the costs on the tab equal the project's ledger entries for recommendations, drafts and translations (tested).
- **SC-006**: A run over 60 insights completes in under 2 minutes with a standard provider; a draft in under 1 minute.
- **SC-007**: A person can review and decide 15 proposed recommendations in under 15 minutes.
- **SC-008**: The tab, panes and dialogs have no axe violation in light and dark themes.

## Assumptions

- Recommendations and key takeaways belong to the Synthesis module (spec 013), with its consent, run and translation patterns.
- Confidence levels and participant counts of insights are those computed by spec 013 at the time of the run (sent) and at read time (kind rule).
- The owner is free text; linking it to a team member comes later.
- One project has one key takeaways text; its history is not kept beyond who and when.
- Out of scope: the debrief deck (and its impact × effort matrix), the evidence chain, the network graph, exports, recommendation-level comments.
