# Feature Specification: Project home

**Feature Branch**: `017-project-home`

**Created**: 2026-10-31

**Status**: Validated

**Input**: User description: "The Overview tab of a research project shows where the research stands and makes it desirable to continue, as in the prototype: the research goal and team, a five-step journey of clickable cards (Interviews, Facts, Insights, Recommendations, Debrief) with volumes and progress, the next step highlighted, study cards with their counts and AI cost, the project's total AI cost, and the key takeaways at the top once written. Out of scope: the network view."

## Clarifications

### Session 2026-10-31

- Q: Which step is the next step? → A: The first step that is empty or still has items to decide; none when all are done. The prototype only pointed to empty steps, so a project with every fact undecided showed no next step. Exception: Interviews counts as done from its first validated interview, since a few proposals are often left open while the research moves on; those still to validate stay visible on the card.
- Q: Which review policy applies to the counts? → A: None. The project-level review policy is not implemented; the page shows what is validated and what is to decide.
- Q: Are "Also in", "Detach" and "Attach an existing study" part of this page? → A: No. A study belongs to one project in the code today; they wait for a feature of their own.
- Q: What does the page look like? → A: As the mock-up validated with the maintainer: three states (in progress, finished, new project), key takeaways in a dark band under the goal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where the research stands and what to do next (Priority: P1)

Opening a project, the person sees under the research goal a chain of five cards: Interviews, Facts, Insights, Recommendations, Debrief. Each gives its volume and how much of it is decided. One is marked "Next step" with the action to take. Each card opens the place where that work is done.

**Why this priority**: This is what makes the project feel alive: at a glance the person knows how far the research has come and what to do now.

**Independent Test**: With a project of 24 interviews (3 to validate), 612 facts (148 validated, 464 to decide) and no insight, the page shows those numbers and marks Facts as the next step with "Decide the 464 facts left"; with only interviews to validate and none validated, Interviews is the next step with "Validate the interviews"; once the facts are decided, Insights becomes the next step.

**Acceptance Scenarios**:

1. **Given** a project with studies, **When** the Overview opens, **Then** the Interviews card shows the interviews kept (validated and to validate, not excluded), the participants and those to validate; the Facts, Insights and Recommendations cards show their volume (rejected ones left out), the number validated (edited ones included) and a progress bar with an equivalent text.
2. **Given** key takeaways are written, **When** the Overview opens, **Then** the Debrief card shows a check mark and "Key takeaways written"; otherwise a pencil and "Key takeaways to write".
3. **Given** the steps in order, **When** one is empty or has items to decide, **Then** the first such step, and only it, is marked "Next step" and shows its action above its summary, as in the validated mock-up; the mark is text, not colour alone.
4. **Given** all steps have items and nothing is left to decide, **When** the Overview opens, **Then** no step is marked and each shows that everything is validated.
5. **Given** a project with exactly one study, **When** the person activates the Interviews or Facts card, **Then** the matching phase of the study opens; **Given** several studies, **Then** the page moves to the Studies section. Insights and Recommendations open the matching tab, in every case; Debrief opens the Debrief tab once key takeaways are written, and before that the Recommendations tab, where they are written.
6. **Given** a new decision made elsewhere in the app, **When** the person comes back to the Overview, **Then** the counts are up to date.

---

### User Story 2 - Compare the studies and see what they cost (Priority: P1)

Under the journey, each study card shows its interviews validated, to validate and excluded, its facts and those to decide, its folder, and its AI cost, with the cost per use on hover and keyboard focus. The project's total AI cost sits next to the "Studies" title.

**Why this priority**: The cost of AI must be visible where it is used, and the cards tell which study needs attention.

**Independent Test**: With two studies, one with interviews and facts and one in preparation, the first shows its chips and cost with its breakdown; the second says it has no interview yet; the project total equals the costs of the studies plus those of the project's own synthesis.

**Acceptance Scenarios**:

1. **Given** a study, **When** its card is shown, **Then** chips show the interviews validated, to validate and excluded, the facts and the facts to decide; a chip with nothing to report is left out; the "to validate" and "to decide" chips are highlighted.
2. **Given** a study without interviews, **When** its card is shown, **Then** it says so instead of the chips.
3. **Given** a study with recorded AI calls, **When** its cost is shown, **Then** it covers every account's calls for that study, and hover or keyboard focus reveals the cost per use (analysis, lexicon, cleaning, quality, facts) with zero amounts left out.
4. **Given** a project, **When** its total cost is shown, **Then** it is the sum of its studies and of its own insights, recommendations and key takeaways, with that breakdown on hover or focus; nothing is shown while the total is zero and there is no study.
5. **Given** a call without a known price, **When** a cost includes it, **Then** that cost shows as unknown rather than a false amount, as on the Analysis screen. The Insights and Recommendations tabs keep their known amount and add "some calls have no price" (research R-costs).
6. **Given** a study whose folder the person cannot access, **When** the Overview opens, **Then** its card shows only its name and type (spec 002) and still opens the study's page, where access is asked for or Drive connected, its interviews and facts are left out of the journey, and the page says the counts leave out that many studies and that the project's AI cost includes them.

---

### User Story 3 - Read the outcome first (Priority: P2)

Once the key takeaways are written, they appear in a band directly under the goal, with a link to the debrief. They are the first result anyone reads on opening the project.

**Why this priority**: The page then answers the research question, not only the state of the work; it depends on spec 014 having been used.

**Independent Test**: A project without key takeaways shows no band; writing them on the Recommendations tab makes the band appear on the Overview, in the reader's language.

**Acceptance Scenarios**:

1. **Given** key takeaways are written, **When** the Overview opens, **Then** the band shows them in the reader's language, read-only, with a link to the Debrief tab.
2. **Given** they have no text in the reader's language, **When** the band is shown, **Then** it shows the other language, marked as such, as elsewhere in the app.
3. **Given** the takeaways may be out of date (spec 014), **When** the band is shown, **Then** it says so.
4. **Given** no key takeaways, **When** the Overview opens, **Then** there is no band and no empty space.

---

### User Story 4 - Start a new project (Priority: P2)

A new project shows the journey at zero, with "Create a first study" as the next step, which leads to the Studies section and its creation button.

**Why this priority**: The first screen sets out the whole method and shows the first action.

**Independent Test**: Create a project: every count is 0, Interviews is the next step, no cost is shown, and the Studies section says what a study is.

**Acceptance Scenarios**:

1. **Given** a project without study, **When** the Overview opens, **Then** Interviews is the next step with "Create a first study", the other cards say what they will come from, and no cost is shown.

---

### Edge Cases

- Interviews without facts yet: Facts is the next step with "Find the facts of the interviews", leading to the study.
- All facts rejected: the Facts volume is 0 and the step counts as empty.
- Facts validated and no insight: Insights is the next step with "Find insights"; the same goes for Recommendations.
- A step before the next one being empty is impossible by the rule; a later step may have items (insights kept after the study was emptied): it shows them unchanged, and the next step stays the earlier one.
- Every study closed to the person: Interviews is the next step and asks for access to a study's folder; it leads to the Studies section, never into a closed study. With one study open among others, the cards open that one.
- Facts of an interview excluded or sent back to validate leave the Overview and Analysis counts, while Insights and Recommendations keep reading them as today.
- A study with more than one project does not exist today; costs are never counted twice.
- An insight or recommendation run in progress: the counts show what exists now; the page does not follow the run live.
- Long names, long goals and large numbers wrap without breaking the layout; numbers follow the locale; at phone width the cards stack and the chevrons disappear.
- The page's data fails to load: the goal and team stay usable, and the journey shows an error with a retry. Costs that fail show an error with a retry beside the Studies title; a failed out-of-date check is said in the band.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Overview tab MUST keep the goal and team, editable in place as today, at the top.
- **FR-002**: The Overview MUST show the five steps in order, as links, visually chained, each with the rules of User Story 1.
- **FR-003**: Interview counts MUST use the session states (`validated`, `proposed`, `excluded`); participants are the interviewees of the kept interviews, counted once per person per study, without any name reaching the page.
- **FR-004**: Fact, insight and recommendation counts MUST leave out rejected items, count `accepted`/`validated` and `edited` as validated and `proposed` as to decide. Suggested links and evidence changes are not counted.
- **FR-005**: The next step MUST be computed by the rule of the clarifications, from those counts, and be tested as a domain rule.
- **FR-006**: Each study card MUST show the counts, folder and cost of User Story 2. Its link to the study stays the whole card.
- **FR-007**: Costs MUST be computed at read time from the usage ledger, for every account, as in the other screens; each MUST distinguish zero from unknown. The page itself makes no AI call and records nothing.
- **FR-008**: The project's total and breakdowns MUST be reachable by keyboard and exposed to assistive technology, not only on hover.
- **FR-009**: The key takeaways band MUST follow User Story 3 and never allow editing; they are still edited on the Recommendations tab.
- **FR-010**: The page MUST read through read-only queries, the counts never waiting for the costs or for the out-of-date check, which is asked only once key takeaways exist; they change nothing, sends nothing to an AI provider and opens no Drive connection.
- **FR-011**: Access MUST stay that of the project (its team) and of each study (its folder); a person without access to the project gets "not found", as today.
- **FR-012**: Every string MUST exist in English and French, using the bilingual glossary; every piece MUST come from the design system.
- **FR-013**: The page MUST meet WCAG 2.2 AA, including at 320 px wide and in the dark theme.
- **FR-014**: The network view, attaching or detaching a study, and deleting a project MUST NOT be added by this feature.

### Key Entities

- **Project overview** (read model): for a project, the five steps with their counts, the next step, the takeaways and the studies with their counts, then, read apart, the costs and whether the takeaways may be out of date. Stored nowhere.
- **Journey step**: `interviews | facts | insights | recommendations | debrief`, with a state (`empty`, `to-decide`, `done`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On opening a project, a person can tell in under 10 seconds how far the research has come and what to do next, in each of the three states.
- **SC-002**: From the Overview, the place of the next step is reached in one activation.
- **SC-003**: Every count on the page matches the count on the screen where the work is done, on the same data.
- **SC-004**: The Overview of a project with 40 interviews and 1,500 facts appears in under one second on the reference setup.
- **SC-005**: No automated accessibility violation in either language, in light and dark, in the three states.

## Assumptions

- The look follows the validated mock-up (https://claude.ai/artifact/WnakMR3w4qMMUQDqg2XqtJ), adapted to the design system.
- The key takeaways and their "may be out of date" state are those of spec 014.
- "Next step" advises; it never prevents working on another step.
- Costs not linked to a study or a project's synthesis (the assistant panel's general conversations) are not part of these totals, unless the ledger links them to the study.
