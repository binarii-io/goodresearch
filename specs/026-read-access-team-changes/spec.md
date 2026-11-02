# Feature Specification: Read access for everyone, changes for the team

**Feature Branch**: `026-read-access-team-changes`

**Created**: 2026-11-02

**Status**: Implemented

**Input**: User description: "Every active member of the workspace can read every project and study; only the members of the owning team, and admins, can change them."

## Clarifications

### Session 2026-11-02

- Q: Who is "the team"? → A: The team that owns the project or study. Member, Team and TeamMembership stay; there is no per-project list of people.
- Q: What counts as a change? → A: Anything that changes data, including validating, giving an opinion on a remark and editing the lexicon.
- Q: May a person outside the team start an AI run? → A: No: it costs money, so it is reserved to the team and admins.
- Q: May a person outside the team use the assistant? → A: Yes, to read, with its cost shown as today. It neither proposes nor applies any action outside the team.
- Q: Does reading bypass the folder barrier? → A: No. Without access to a study's folder, a person sees only its name and type, even in the team, and the screen says clearly that the folder is not accessible.
- Q: Are real names readable outside the team? → A: Not in this first version. The schedule, participants' identities and raw transcripts stay with the team and admins. Others read facts, insights and recommendations, and verbatims only on an anonymised study.
- Q: Who may delete a project? → A: An admin, or its creator only while still a member of its team.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the research of other teams (Priority: P1)

A member wants to know what other teams have learned. They find every project and study of the workspace, and open them, whichever team owns them.

**Why this priority**: Research only pays off when people outside the team that ran it can find it. This is the purpose of the feature.

**Independent Test**: With a member of team A only, open a project and a study of team B: they are listed and readable, with no change possible.

**Acceptance Scenarios**:

1. **Given** a member of team A, **When** they list projects with the "All teams" filter, **Then** they see the projects of every team, each with its team's name.
2. **Given** a member of team A, **When** they open a project of team B, **Then** they read its goal, studies, insights, recommendations, key takeaways, debrief and costs.
3. **Given** a member of team A, **When** they open a study of team B they have folder access to, or with no folder, **Then** they read its goal, guide, phases, facts and costs.
4. **Given** a member of no team, **When** they sign in, **Then** they can read like any other member, and cannot create a project or study.
5. **Given** a deactivated account, **When** it tries to read, **Then** it is refused as today.

---

### User Story 2 - Only the team changes its work (Priority: P1)

A team wants to be sure nobody outside it alters its project, its study or its decisions. Whatever the way in (screen, direct request, assistant), a change from outside the team is refused.

**Why this priority**: Opening reading without this rule would let anyone change anything. It ships with User Story 1 or not at all.

**Independent Test**: As a member outside the team, send every kind of change directly, without going through the screens: each is refused and nothing changes.

**Acceptance Scenarios**:

1. **Given** a member outside the owning team, **When** they try any change on the project or study, **Then** it is refused with a reason that names the owning team, and nothing changes.
2. **Given** a member outside the owning team, **When** they try to start an AI run, **Then** it is refused and nothing is recorded in the usage ledger.
3. **Given** a member of the owning team or an admin, **When** they make a change, **Then** it works as it does today.
4. **Given** a project's creator who left its team, **When** they try to delete the project, **Then** it is refused.
5. **Given** an admin, **When** they delete a project, **Then** it works as today, with the project's exact name typed.
6. **Given** a person removed from a team, **When** they next try a change, **Then** it is refused, without signing in again.

---

### User Story 3 - See at once that a page is read only (Priority: P1)

A person outside the team opens a page. They understand right away that they can read but not change it, and which team to contact.

**Why this priority**: Without it, people look for missing buttons or take the page for a broken one.

**Independent Test**: Open the same project and study as a team member and as an outsider: the outsider sees the badge and no change control, and the screens remain usable with a keyboard and a screen reader.

**Acceptance Scenarios**:

1. **Given** a person outside the team, **When** they open a project or study, **Then** a "Read only" badge names the owning team.
2. **Given** a person outside the team, **When** they read any page of it, **Then** no change control or AI run control appears.
3. **Given** a team member or an admin, **When** they open the same page, **Then** there is no badge and every control stays.
4. **Given** a person whose interface is in French or English, **When** they read the badge, **Then** it is in their language.

---

### User Story 4 - Know why a study's content is not available (Priority: P1)

A person opens a study whose folder they cannot access. Instead of an empty-looking page, the screen says the folder is not accessible, and how to get access.

**Why this priority**: Opening reading makes this case far more frequent: many readers have no right on the folders of other teams.

**Independent Test**: Open a study as a person without folder access, then without a connected source, then during a source outage: each gives its own message, and only the name and type show.

**Acceptance Scenarios**:

1. **Given** a person without access to the folder, **When** they open the study, **Then** they see its name, type and owning team, a message that the folder is not accessible, and how to ask for access.
2. **Given** a person who has not connected the source, **When** they open the study, **Then** the message tells them to connect it.
3. **Given** a source outage, **When** they open the study, **Then** the message says the source is unavailable and not that access is missing.
4. **Given** a study listed in a project, **When** the person has no access to its folder, **Then** the list shows a "Folder access not confirmed" mark on that study (lists do not ask the source; opening the study checks).
5. **Given** a project with such a study, **When** the person reads the project's counts, **Then** a note says that one or more studies are left out because access to their folder is not confirmed.
6. **Given** a member of the owning team without folder access, **When** they open the study, **Then** they get the same message, and no action.

---

### User Story 5 - Real names stay with the team (Priority: P1)

The people interviewed agreed to talk to a research team, not to the whole organisation. Outside the team, a reader gets findings without identities.

**Why this priority**: This is personal data. Opening reading must not disclose it.

**Independent Test**: As an outsider with folder access, request directly each piece of reserved content, on an anonymised study and on a non-anonymised one: nothing reserved comes back.

**Acceptance Scenarios**:

1. **Given** a reader outside the team, **When** they open a study, **Then** the schedule, participants' identities, interviews and transcripts are not available, and the screen says they are reserved to the team.
2. **Given** a reader outside the team, **When** they read a fact, **Then** its interview appears under a neutral label, never a real name or a file name.
3. **Given** a study set to anonymise names, **When** a reader outside the team reads a fact, **Then** its verbatims are shown with pseudonyms.
4. **Given** a study not set to anonymise names, **When** a reader outside the team reads a fact, **Then** its verbatims are hidden, and the screen says why.
5. **Given** a reader outside the team, **When** they read an insight or a recommendation, **Then** quotes and owners follow the same rule as verbatims, and the supporting facts of a study whose folder they cannot access appear as a count only.
6. **Given** a member of the owning team or an admin with folder access, **When** they open the same study, **Then** they see everything as today.

---

### User Story 6 - The assistant reads everywhere, acts only in the team (Priority: P2)

A person asks the assistant about another team's project. It answers from what that person may read, and does not offer to change anything.

**Why this priority**: The assistant is a way into the same data: it must follow the same rules, but the screens already deliver the value on their own.

**Independent Test**: Ask the assistant, from a project of another team, to rename it, to run an analysis and to list interviews: no card appears, it explains why, and no reserved content reaches the provider.

**Acceptance Scenarios**:

1. **Given** a person outside the team, **When** they ask the assistant about the project, **Then** it answers from what they may read, and the conversation's cost shows as today.
2. **Given** a person outside the team, **When** they ask for a change or a run, **Then** no card appears, and the assistant says the owning team decides.
3. **Given** an action card proposed earlier, **When** its person is no longer in the team and applies it, **Then** it is refused and marked failed.
4. **Given** a person outside the team, **When** the assistant builds its context, **Then** it gets no schedule, interview name, participant identity, transcript or reserved verbatim, consent or not.
5. **Given** a person outside the team, **When** the assistant needs the folder or the interviews, **Then** no consent card appears, as nothing could be sent anyway.

---

### Edge Cases

- A person belongs to several teams: each project or study follows its own team, so the same person can be an editor on one page and a reader on the next.
- A project moves to another team: with its studies, the rights follow at once; an open page refuses the next change and shows the badge after reloading.
- A page stays open while its person leaves the team: the controls may still show, the change is refused, and the page then shows the badge.
- A run was started before its person left the team: interviews not yet processed fail; what is done stays, with its costs, and a person of the team starts again.
- A study is detached or not linked to any project: it stays readable through its team's Studies page, by everyone.
- A team has no member left: its work stays readable, and only admins can change it.
- An admin without folder access: reads only the name and type, and can still detach the folder or delete the study, as today.
- A person's own settings, source connection and assistant conversations are theirs, not the team's: they keep them whatever the team. Conversations stay private.
- A person outside the team has the direct link to a reserved page: they get the "reserved to the team" message, not a "not found" one.
- A project or study that does not exist still gets "not found".

## Requirements *(mandatory)*

### Functional Requirements

**Reading**

- **FR-001**: Every active member of the workspace MUST be able to find and open every project and study, whatever their teams.
- **FR-002**: Lists of projects and studies MUST show each item's owning team, and offer a filter between the person's teams and all teams. It MUST start on the person's teams when they have any, on all teams otherwise.
- **FR-003**: A person outside the owning team MUST be able to read a project's goal, studies, insights, recommendations, key takeaways, debrief, and the costs shown on those pages.
- **FR-004**: A person outside the owning team MUST be able to read a study's goal, guide, phases, facts and costs, subject to FR-012 and FR-015.

**Changing**

- **FR-005**: Only members of the owning team and admins MUST be able to change a project, a study or anything inside them: creating, editing, deleting, attaching, validating, excluding, rejecting, giving an opinion, editing the lexicon, attaching a folder, publishing.
- **FR-006**: Only members of the owning team and admins MUST be able to start an AI run or any other AI step tied to a project or study. A refused request MUST NOT call a provider nor record any usage.
- **FR-007**: The rules of FR-005 and FR-006 MUST hold for every way in, whatever the screen shows: direct requests, assistant action cards, and background work started on a person's behalf.
- **FR-008**: A refused change MUST be distinguishable from "not found", and MUST name the owning team.
- **FR-009**: A project MUST be deletable only by an admin, or by its creator while a member of its team. The rest of the deletion flow stays as in spec 020.
- **FR-010**: A change of membership MUST apply from the person's next request, without signing in again. Creating a project or study stays limited to the person's own teams.

**Read-only display**

- **FR-011**: For a person outside the owning team, every project and study page MUST show a "Read only" badge naming the team, and no change or AI run control. The badge MUST be in English and French, and accessible to assistive technologies.

**Folder barrier**

- **FR-012**: The folder barrier (spec 002, FR-010a) MUST stay for everyone: without confirmed access to a study's folder, a person sees only its name, type and owning team. Admins keep their exceptions (detach the folder, delete the study).
- **FR-013**: The screen MUST state the reason and what to do, with one distinct message each for: no access to the folder, source not connected, source unavailable.
- **FR-014**: Lists of studies MUST mark a study whose folder access is not confirmed, and counts leaving such a study out MUST say so. Lists MUST NOT ask the source; opening the study checks, as today.

**Real names**

- **FR-015**: Outside the owning team, the following MUST NOT be available, by any way in: the interview schedule, participants' identities, interviews and their file names, transcripts in any version, the Enrichment and interview quality tabs. The screen MUST say they are reserved to the team.
- **FR-016**: Outside the owning team, a fact's interview MUST appear under a neutral label, with no real name or file name.
- **FR-017**: Outside the owning team, verbatims and quotes MUST be available only on a study set to anonymise names, with pseudonyms; otherwise the screen MUST say they are hidden and why. A recommendation's free-text owner MUST be hidden.
- **FR-018**: Admins MUST see what the owning team sees, subject to FR-012.

**Assistant**

- **FR-019**: The assistant MUST stay available to read any project or study the person may read, and its cost MUST show as today.
- **FR-020**: Outside the owning team, the assistant MUST NOT propose any action, and applying an existing card MUST be refused and marked failed; it MUST say that the owning team decides.
- **FR-021**: Outside the owning team, nothing reserved by FR-015 to FR-017 MUST reach the AI provider, even with the person's consent, and no consent card MUST appear for it.

**Data loading**

- **FR-022**: The new lists and pages MUST load only what the screen shows, and counts MUST be computed by the database.

### Key Entities

- **Member**: an account in the workspace, `admin` or `member`. Any active member can now read everything; the role does not change.
- **Team**: the owner of projects and studies. Now decides who changes, no longer who reads.
- **TeamMembership**: links an account to a team. Now gives the right to change and the access to reserved content.
- **Folder access**: unchanged second barrier, now explained on screen.
- **Read-only access**: not stored: what a person may do on a project or study, computed from their role, their teams and the study's folder and anonymisation setting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member of one team can open any project of another team in two steps or fewer from the projects list.
- **SC-002**: 100% of the change and AI run requests of the application are refused for a person outside the owning team, proven by one automated check per kind of request.
- **SC-003**: 100% of the reserved content is absent from what a person outside the team receives, in direct requests and in what the assistant sends to a provider, on both anonymised and non-anonymised studies.
- **SC-004**: A refused AI run costs nothing: no usage is recorded.
- **SC-005**: On every project and study page, a person outside the team can tell who owns it and that it is read only without any action.
- **SC-006**: In every case where a study's content is withheld, the screen gives the reason; no page withholding content looks empty.
- **SC-007**: For members of the owning team and admins, what they can see and do is unchanged, proven by the existing automated tests passing with no expected behaviour changed other than those of this spec.
- **SC-008**: The screens of this feature pass the WCAG 2.2 AA automated checks, in English and French.

## Assumptions

- "Raw transcripts" extends to every version in this first version: clean versions hold the same names, unless Cleaning replaced them, which a reader cannot verify. Interview quality and Enrichment are reserved for the same reason: they show interviewers' names and sentences, and team lexicons may list people.
- The filter of FR-002 starts on the person's teams so that the working view of current members stays as it is.
- The whole workspace is one organisation (one workspace per instance today); nothing is opened to anyone outside it.
- A study's guide is readable outside the team: its text does not hold participants' names; the schedule is separate.
- Existing data needs no change: rights are computed from the current teams and memberships.
- Sign-in, the allow-list, team and member management, and access history stay as they are.
- A finer role (read-only member, per-project editors, per-study sharing) and opening real names with a consent model are out of scope.
- Documentation in the same change: a new ADR (this changes the access rule of ADR-0008) and the context map (Member, Team, TeamMembership, Folder access).
