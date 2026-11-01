# Feature Specification: Link a study to several projects

**Feature Branch**: `019-attach-study`

**Created**: 2026-11-01

**Status**: Validated

**Input**: User description: "A study is no longer tied to a single research project, so an older study and its facts can feed a new project. From the app and through the assistant, a person can attach an existing study to a project and detach a study from a project. Out of scope: deleting a project, sharing a study between teams, re-extracting facts for the new project's goal, the network view."

## Clarifications

### Session 2026-11-01

- Q: Is detaching enough? → A: No. The need is reuse: an older study feeds a new project while staying in the first one. Attach comes first; detach completes it.
- Q: Can a study end up without a project? → A: Yes. It belongs to its team, which lists it on a Studies page, where it can be found and attached again.
- Q: Can a study be shared between teams? → A: No, not in this version: attaching would show it to another team. Only projects of the same team.
- Q: Do projects have their own decisions on a fact? → A: No. Facts belong to the study: a decision applies in every linked project, and the screen says the study is shared.
- Q: Are facts extracted again for the new project? → A: No. They are reused as they are, without an AI call.
- Q: Who owns a study? → A: A team, like a project. Its access follows its team, and it can only be linked to projects of that team.
- Q: Which research goal do a shared study's AI steps use? → A: Its own. A study gets its own research goal, used by the AI steps inside the study; the project keeps its goal, used by the AI steps over the project. No "main project" is needed for this.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reuse an existing study in a project (Priority: P1)

On a project's Studies section, a person chooses "Attach an existing study" and picks one of the studies of the team that they can open. The study appears among the project's studies with its interviews, facts and cost, and its facts become available to the project's insights, without any AI call.

**Why this priority**: This is the need: past research keeps its value for new questions, instead of being redone.

**Independent Test**: In a team with two projects, attach the first project's study to the second: it appears in both, the second project's journey counts its interviews and facts, and the usage ledger gains no entry.

**Acceptance Scenarios**:

1. **Given** a project, **When** the person opens the list of studies to attach, **Then** it holds only studies of the same team, that they can open, and not yet in this project.
2. **Given** a study picked, **When** it is attached, **Then** it stays in its first project and appears in this one, with no AI call.
3. **Given** a project with an attached study, **When** the person finds insights, **Then** the run reads its facts like those of the project's other studies.
4. **Given** a study already in the project, **When** the same attachment is requested again, **Then** it is refused and nothing changes.
5. **Given** no study to attach, **When** the person opens the list, **Then** it says so and offers to create a new study.

---

### User Story 2 - Detach a study from a project (Priority: P1)

A person removes a study from a project. It stays in its other projects, with all its interviews and facts. Insights already written keep citing its facts, marked as outside the project.

**Why this priority**: Attaching must be reversible, and this makes project deletion safer later: a study linked elsewhere survives.

**Independent Test**: Detach a shared study from one project after finding insights: it leaves that project's lists and counts, stays whole in the other, and the insights show its facts as outside the project.

**Acceptance Scenarios**:

1. **Given** a study in two projects, **When** the person detaches it from one and confirms, **Then** it leaves that project and nothing of the study is deleted.
2. **Given** a study in one project only, **When** the person detaches it, **Then** the confirmation says it will no longer be in any project and stays on the team's Studies page, and nothing of the study is deleted.
3. **Given** insights citing facts of a detached study, **When** they are read, **Then** the citations stay, marked "outside the project".
4. **Given** a run of insights or recommendations in progress on the project, **When** the person detaches a study, **Then** the action is refused until the run ends.

---

### User Story 3 - Know that a study is shared (Priority: P1)

Wherever a shared study is worked on, the person sees the other projects it feeds. A decision on a fact applies everywhere, so nobody changes another project's evidence without knowing.

**Why this priority**: Without it, rejecting a fact in one project silently changes another's. This is what makes sharing safe.

**Independent Test**: Open a shared study from either project: the page names the other project, the study cards show the sharing, and a fact rejected from one project is rejected in the other.

**Acceptance Scenarios**:

1. **Given** a shared study, **When** its card is shown in a project, **Then** it names the other projects ("Also in …"), in text.
2. **Given** a shared study, **When** its page is opened, **Then** it lists the projects it feeds with links to them, and its Analysis tab says that decisions on facts apply in all of them.
3. **Given** a study opened from a project, **When** the person goes back, **Then** they return to that project.
4. **Given** a study in one project, **When** it is shown, **Then** nothing about sharing appears, and the page looks as it does today.

---

### User Story 4 - Give a study its own research goal (Priority: P1)

Each study has a research goal, starting as a copy of its project's goal when it is created, and editable on the study's page. The study's AI steps read it, whichever project the study is seen from. The project's goal keeps guiding the insights, recommendations and key takeaways over all its studies.

**Why this priority**: A shared study needs one stable goal, and a study often asks a narrower question than its project. Without this, results would depend on the project it happens to belong to.

**Independent Test**: Change a study's goal, then find facts in a new interview: the run uses the study's goal. Find insights in the project: the run uses the project's goal. Existing studies show the goal of their project after the upgrade.

**Acceptance Scenarios**:

1. **Given** existing studies, **When** the feature is delivered, **Then** each holds a copy of its project's goal and its AI steps behave as before.
2. **Given** a new study, **When** it is created, **Then** its goal starts as a copy of the project's goal.
3. **Given** a study's page, **When** the person edits the goal, **Then** later AI steps of the study use it; facts already found do not change.
4. **Given** a project's goal changed, **When** its studies are read, **Then** their goals do not change, and the project's page says nothing was propagated.
5. **Given** a study attached to another project, **When** the project finds insights, **Then** it uses that project's goal over the study's facts, while the study keeps its own goal.

---

### User Story 5 - Find the team's studies (Priority: P1)

A team has a Studies page, in the main menu, listing all its studies the person can see, with their projects, or "No project". A person in several teams switches between them on the page. From it, a person opens a study, or attaches it to a project of the team.

**Why this priority**: A study without a project must stay reachable; this page is its home, and later lets a deleted project's studies survive.

**Independent Test**: Detach a study from its only project: it appears on the team's Studies page as "No project", opens normally, keeps its facts, and can be attached to another project from there.

**Acceptance Scenarios**:

1. **Given** a team, **When** the person opens its Studies page, **Then** it lists the team's studies as the same cards as in a project (interviews, facts, folder, AI cost), with the number of projects they are in, most recent first, searchable by name; a study in no project offers to attach it instead.
2. **Given** a study without a project, **When** its page is opened, **Then** every phase works as before, using the study's goal, and the breadcrumb leads to the team's Studies page.
3. **Given** a study without a project, **When** the person attaches it from this page, **Then** they choose among the team's projects, and it appears in the chosen one.
4. **Given** a study whose folder the person cannot open, **When** the list is shown, **Then** only its name, type and number of projects appear, as elsewhere.
5. **Given** a person outside the team, **When** they ask for the page or a study of the team, **Then** it does not exist for them.

---

### User Story 6 - Do it with the assistant (Priority: P2)

The person asks the assistant to reuse a past study, or to remove one from a project. The assistant knows the team's other studies, shows a card, and the person applies it. When a new project needs its first study, the assistant mentions a related existing study before proposing a new one.

**Why this priority**: It extends the guided journey, and the app's own buttons already deliver the capability.

**Independent Test**: From a project page, ask to reuse a named study: a card shows the study and project and what sharing means; Apply attaches it. Ask to detach a study's only project: the card says it will have no project and stay on the team's Studies page.

**Acceptance Scenarios**:

1. **Given** a project page, **When** the person asks to reuse a study, **Then** a card shows the study, the project and that decisions on facts are shared, and nothing changes until Apply.
2. **Given** a study to detach, **When** the assistant proposes it, **Then** the card says where the study stays (its other projects, or the team's Studies page), and nothing changes until Apply.
3. **Given** a request the app would refuse, **When** the assistant proposes it, **Then** no card appears and the assistant gets the reason during the same answer.
4. **Given** a new project just applied and a related study of the team, **When** the assistant continues, **Then** it mentions that study and offers to attach it, as well as creating a new one.
5. **Given** a study the person cannot open, **When** the assistant answers, **Then** it knows nothing about that study.

---

### Edge Cases

- The first project of a shared study is detached: the study stays whole in the others, with its own goal; its breadcrumb points to the earliest project left.
- A study's goal is emptied: allowed, as for a project; its AI steps then run without a goal, as a project without a goal does today.
- A person has access to the project but not to the study's folder: the card shows only the name and type, as today; they may detach it, but cannot attach it elsewhere.
- Changing the team of a project: its studies linked to this project only change team with it, as their access does today; refused with the reason if one of them is also in another project.
- Takeaways may be out of date after an attachment or a detachment: they say so, as they do when evidence changes.
- A study's cost appears in each project that uses it, marked as shared; within one project it is never counted twice. The project total says it includes shared studies.
- The same fact seen through two projects: one fact, one decision; each project has its own insights over it.
- Two people attach the same study at once: one link, and the second is told it is already there.
- A long list of studies to attach: it can be searched by name.
- Project pages opened elsewhere: counts refresh when the person comes back.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A study MUST belong to exactly one team and be linked to zero or more projects of that team. Existing studies MUST take the team of their project and keep that project, and new ones take the team of the project they are created in, with nothing changing on screen until a second link exists.
- **FR-002**: A person with access to a project MUST be able to attach a study they can open, from the same team, if it is not already in the project.
- **FR-003**: A person with access to a project MUST be able to detach a study from it, unless a synthesis run is in progress on that project. Detaching asks for confirmation, which says where the study stays.
- **FR-004**: Attaching and detaching MUST NOT delete, change or copy any interview, transcript, fact or decision, and MUST NOT make an AI call.
- **FR-005**: Every project-level read (journey counts, study cards, insights, recommendations, debrief, costs) MUST cover the studies linked to that project at read time, with existing access rules for each person.
- **FR-006**: A study MUST have its own research goal, copied from its project when created and at the upgrade for existing studies, then independent of it. AI steps inside the study MUST use the study's goal; AI steps over a project MUST use the project's goal. Changing a goal MUST NOT change results already produced.
- **FR-007**: The breadcrumb and "back" of a study page MUST follow where it was opened from, a project or the team's Studies page; otherwise the earliest project still linked, and the team's Studies page without a project.
- **FR-008**: The sharing MUST be stated in text as in User Story 3.
- **FR-009**: A person MUST NOT see through a shared study anything of a project they cannot open.
- **FR-010**: Citations of facts from a study no longer in the project MUST stay and be marked outside the project.
- **FR-011**: A project's team MUST NOT change while one of its studies is also in another project; otherwise its studies change team with it.
- **FR-012**: The assistant MUST receive the team's studies the person can open and may attach (names and projects only, at most 30), and MUST be able to propose attaching and detaching, and changing a study's goal, through cards that run the same actions, with the same checks. On a study page, its context MUST give the study's goal as well as the project's.
- **FR-013**: A refused proposal to attach or detach MUST give its reason to the model during the same answer and show no card.
- **FR-014**: The answer that follows a new project MUST be able to suggest attaching a related study. Whatever the model says, nothing is attached without Apply.
- **FR-015**: Every new string MUST exist in English and French, using the bilingual glossary; every piece MUST come from the design system and meet WCAG 2.2 AA.
- **FR-016**: The journey MUST be documented in `docs/agent-journeys/02-attach-study.md` with Mermaid, and the context map updated.
- **FR-018**: Each team MUST have a Studies page as in User Story 5, reading only what it shows. A study MUST stay usable without a project, in every phase; creating a study without a project is not added: a study is still created in a project.
- **FR-019**: A team with a study MUST NOT be deleted, like a team with projects.
- **FR-017**: Deleting a project, sharing between teams, extracting facts again for another goal, and the network view MUST NOT be added by this feature.

### Key Entities

- **Study**: now owned by a team, like a project.
- **Study link**: a study in a project of its team, with the moment it was made; a study has zero or more.
- **Study goal**: the research goal of a study, read by its AI steps; a copy of the project's at creation, then independent. The project's goal stays for the AI steps over the project.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person reuses a past study in a project in under 30 seconds, with no AI cost.
- **SC-002**: After attaching, every count on the project's Overview matches the study's own screens, on the same data.
- **SC-003**: In every automated scenario, no action links a study across two teams, and no study without a project loses its interviews or facts.
- **SC-004**: All existing screens behave the same for a study in one project: the existing end-to-end suite passes unchanged.
- **SC-005**: A person who opens a shared study can name the other projects it feeds within 5 seconds.
- **SC-007**: A study without a project is found from the team's Studies page in under 15 seconds.
- **SC-006**: No automated accessibility violation on the new pieces, in either language, in light and dark.

## Assumptions

- Access to a study follows its team, plus the existing folder barrier.
- Facts extracted for the study's goal are reused as they are; their "why it matters" may fit a new project less well, and the card says nothing more than that decisions are shared.
- The interview guide keeps its own objectives, as today; the guide design starts from the study's goal.
- New insights are not found automatically: the project's next step points to them, as today.
- Who may attach and detach is whoever has access to the project, like renaming a study.
- Only interview studies exist today; the links do not depend on the study type.
