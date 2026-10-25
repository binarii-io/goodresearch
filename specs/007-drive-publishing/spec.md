# Feature Specification: Publish the study preparation to Drive and bring Drive edits back

**Feature Branch**: `007-drive-publishing`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Sending to Drive. Be smart: a person can edit from Drive, so how do we handle this synchronisation." Publish the study preparation documents (spec 006: interview guide, interview best practices, interview schedule, owned by the app) to the study's Google Drive folder (spec 002), and keep them in sync when people edit them in Drive, without breaking "AI proposes, humans decide".

## Clarifications

### Session 2026-10-25

- Q: After publication, which side is the reference? → A: The app, with a three-way synchronisation: Drive edits come back as changes the person accepts or rejects item by item; an item changed on both sides is a conflict to settle; nothing is overwritten without a decision.
- Q: When are Drive copies updated after app changes? → A: On demand, with an "Update in Drive" button; the state shows "out of date" in between, and unreviewed Drive changes must be reviewed (or explicitly replaced) first.
- Q: Which documents are published? → A: All three: the guide (two-way, item by item), the schedule (two-way, row by row) and the best practices (fixed content: published and replaced, Drive edits reported but not brought back).
- Q: Which Drive files may goodresearch change? → A: **Any file the person can edit themselves** in Drive (Google's own permissions decide), not only files goodresearch created. A colleague can therefore update or review the guide another team member published, and later features (organising the study folder) can work on existing files. The person grants this once, when they first publish or update; goodresearch still never deletes anything, and only writes the files of the study's folder that a feature is about.

## Synchronisation model (summary)

The app stays the **source of truth** (context map, PublishedDocument). A published file is a **copy that people may edit**. For each published file the app keeps the **content it last published** (the *base*). At any time, the app compares three versions of every item (guide question, framing field, section; schedule row):

| Base → App | Base → Drive | Result |
|---|---|---|
| unchanged | unchanged | in sync |
| changed | unchanged | the Drive copy is **out of date**: "Update in Drive" rewrites it |
| unchanged | changed | a **change from Drive** to review: accepted changes are applied to the app |
| changed | changed (differently) | a **conflict**: the person chooses the app version, the Drive version, or edits a merged text |

Nothing read from Drive is applied to the app without the person's decision, and the app never rewrites a Drive copy that has changes not yet reviewed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish the guide and the schedule to the study folder (Priority: P1)

On the Preparation tab of an interview study with a Drive folder, the person activates "Publish to Drive". If their Drive access does not allow creating files yet, the app asks for that additional consent first (limited to files the app creates). The app creates, in the study's folder, a document with the interview guide, a document with the interview best practices (in the interface language) and a spreadsheet with the interview schedule (one row per planned interview, a status column with a fixed list, a date and time column). Each published item shows a link, the publication time and its state ("in sync").

**Why this priority**: Teams run interviews from their shared drive; the guide must be where observers and interviewers already work.

**Independent Test**: With a guide and three planned interviews, publish; the three files appear in the Drive folder with the same content; the tab shows their links and "in sync".

**Acceptance Scenarios**:

1. **Given** a person whose Drive access is read-only, **When** they publish, **Then** they are asked for the additional consent (editing the Drive files they can edit), and after accepting they come back to the Preparation tab and the publication runs.
2. **Given** the consent, **When** the person publishes, **Then** a guide document, a best-practices document and a schedule spreadsheet are created in the study's folder, named after the study, and their links, publication time and state are shown.
3. **Given** a published schedule, **When** it is opened in Drive, **Then** its status column only accepts the six statuses (in the publication language) and its date column only accepts dates and times.
4. **Given** a study without a guide, **When** the person publishes, **Then** only the best practices and the schedule are published, and the guide can be published once it exists.
5. **Given** the person declines the consent or the folder cannot be written, **When** the publication fails, **Then** nothing is half-created silently: the tab says which file could not be published and why, and publishing can be retried.

---

### User Story 1b - Work on the same published files as a team (Priority: P1)

Several people prepare a study together. Alex publishes the guide; Sam, in the same team and with edit rights on the Drive folder, sees the published files on the Preparation tab, reviews the changes made in Drive and updates the Drive copies, with Sam's own Drive access. A person who can only read a published file in Drive sees its state and can review its changes into the app, but "Update in Drive" tells them they cannot edit the file and who can.

**Why this priority**: Studies are prepared by several people; a file only its author can update would break the team's work.

**Independent Test**: Alex publishes; Sam (edit rights on the folder) updates the guide in Drive from the app; Lee (view rights only) sees the state, reviews changes, and gets "you cannot edit this file in Drive" on update.

**Acceptance Scenarios**:

1. **Given** a guide published by Alex, **When** Sam (edit rights) opens the Preparation tab, **Then** Sam sees the same published files, states and pending Drive changes as Alex.
2. **Given** Sam changed the guide in the app, **When** Sam updates in Drive, **Then** the same file Alex published is rewritten with Sam's access, and the publication records Sam as the last to update.
3. **Given** Lee can only view the file in Drive, **When** Lee updates, **Then** the update is refused with "You can view this file in Drive but not edit it" and the name of its owner; reviewing Drive changes into the app still works.
4. **Given** two people review the same Drive changes at once, **When** both decide, **Then** each change is decided once (the second sees it already decided).

---

### User Story 2 - See whether the Drive copies are up to date (Priority: P1)

After publication, each published file has a state: in sync, out of date (changed in the app), changed in Drive (to review), conflict, or unavailable (deleted, trashed, moved out of the folder, or no access). The state is checked when the Preparation tab opens and when the person asks for a check; the tab shows when it was last checked.

**Why this priority**: Without a visible state, people cannot know which copy to trust; it is the base of every other story.

**Independent Test**: Change a question in the app: the guide shows "out of date". Change a question in the Drive document: after a check, the guide shows "changed in Drive".

**Acceptance Scenarios**:

1. **Given** a published guide unchanged on both sides, **When** the tab opens, **Then** it shows "in sync" and the time of the last check.
2. **Given** the guide changed in the app since publication, **When** the state is shown, **Then** it is "out of date" with the number of items changed.
3. **Given** the document was edited in Drive, **When** the state is checked, **Then** it is "changed in Drive" with the number of changes, who edited it last in Drive and when.
4. **Given** the file was deleted, trashed or moved out of the study folder, or the person lost access, **When** the state is checked, **Then** it is "unavailable" with the reason, and the person can publish a new copy (the old link is no longer used) or forget the publication.
5. **Given** the file was renamed in Drive, **When** the state is checked, **Then** the new name is shown and the file stays linked (a rename is not a content change).

---

### User Story 3 - Review the changes made in Drive (Priority: P1)

When a published file changed in Drive, the person opens "Review the changes from Drive". For the guide, each change is shown item by item: a question reworded (before / after), a follow-up added or removed, a question added or removed in a section, a section title or duration changed, a framing text changed. For the schedule, each change is shown row by row: a row added, a field changed (status, date, interviewer, notes…), a row removed. The person accepts or rejects each change (or all at once); accepted changes are applied to the app's data as a new version (guide origin "from Drive"), rejected ones stay in Drive until the next update overwrites them, which the app announces.

**Why this priority**: This is how Drive edits come back without the AI or the app deciding for the person (constitution IV).

**Independent Test**: In Drive, reword a question, add a follow-up and change two statuses in the schedule; review: four changes are listed; accept three, reject one; the app guide and schedule reflect the three.

**Acceptance Scenarios**:

1. **Given** a question reworded in the Drive document, **When** the person reviews, **Then** the change shows the question's section, the text before and after, and keeps the question's identity (later coverage counts it as the same question).
2. **Given** a new question typed in the document under a theme, **When** the person reviews, **Then** it is listed as "question added in <theme>" and, if accepted, gets a new identity.
3. **Given** text that cannot be matched to a guide item (a paragraph outside the structure, a heading removed), **When** the person reviews, **Then** it is listed as "not understood" with the text, and accepting is not offered; the person can copy it into the app editor.
4. **Given** schedule rows changed in Drive, **When** the person reviews, **Then** each row is identified by the same person to interview and its changed fields are listed; an invalid value (unknown status, unreadable date, too long text) is shown as such and cannot be accepted.
5. **Given** the person accepts changes, **When** they are applied, **Then** the app versions increase, the published copy is now in sync for the accepted items, and rejected items are marked "will be replaced at the next update".

---

### User Story 4 - Update the Drive copies after changes in the app (Priority: P2)

When the app's guide or schedule changed since the last publication, the person activates "Update in Drive". The app rewrites the Drive file's content in place (same file, same link, same sharing) and the state becomes "in sync". If Drive changes are waiting for review, the app first asks to review them (or to explicitly discard them): it never overwrites unreviewed Drive edits. If both sides changed the same item, the item is a conflict to settle first.

**Why this priority**: Keeps one link for everyone while the app evolves; it depends on US2 and US3 to be safe.

**Independent Test**: Edit a question in the app, update in Drive: the same document now shows the new text; edit the same question both in the app and in Drive: the update asks to settle the conflict first.

**Acceptance Scenarios**:

1. **Given** app changes and no Drive change, **When** the person updates, **Then** the same file is rewritten (link and sharing unchanged) and the state is "in sync".
2. **Given** Drive changes not reviewed, **When** the person updates, **Then** they are offered to review them first or to discard them explicitly ("Replace the Drive version"), with the number of changes that would be lost.
3. **Given** the same item changed in the app and in Drive, **When** the person reviews, **Then** it is shown as a conflict with both texts; they keep the app's, take Drive's, or write the final text.
4. **Given** the Drive file changed between the review and the update (someone is editing it), **When** the person updates, **Then** the update is refused with "changed in Drive meanwhile" and a new check runs.

---

### User Story 5 - Ask the assistant to explain or merge Drive changes (Priority: P3)

In the review, the person can ask the assistant to propose a merged wording for a conflict or to explain what changed; the assistant answers with a proposal (a card) that the person applies or not, with the writing checks of spec 006 applied to the proposed questions.

**Why this priority**: Helpful for long guides, not needed for the sync to be correct.

**Independent Test**: With one conflict, ask the assistant for a merged wording; a card proposes it; apply it; the conflict is settled with that text.

**Acceptance Scenarios**:

1. **Given** a conflict, **When** the person asks for a merged wording, **Then** the assistant proposes one text, never applied without the person's Apply.

---

### Edge Cases

- The schedule spreadsheet: people sort, filter, add columns or tabs, colour cells. Sorting and formatting are not changes; an extra column or tab is ignored and kept as it is at the next update; a removed or renamed expected column makes the file "changed in Drive" with a "structure changed" item that cannot be accepted (the next update restores the structure).
- A schedule row added in Drive without a person to interview is listed as invalid. A row whose hidden identity was erased (copy-pasted rows) is treated as a new row.
- Names of people in the schedule are written to the study folder, which only people with access to the folder can read; they are still never sent to an AI provider (the assistant of US5 only receives guide texts).
- Several people publish or update at the same time: one wins; the others are told the copy changed meanwhile.
- The person who published leaves the team or deletes their account: the files stay in Drive (they are the person's files in a shared folder); anyone who can edit them in Drive keeps updating them.
- A person's edit rights in Drive change (made viewer, removed from the folder): the next update tells them; their review of Drive changes still works while they can read the file.
- The guide document is converted, duplicated or downloaded by people: copies are not tracked; only the published file is.
- The study is deleted in the app: published files stay in Drive (nothing is ever deleted in a source, constitution VII); the app forgets them.
- Very large edits in Drive (the whole document rewritten): the review lists every item as changed or not understood; accepting none keeps the app guide, and the next update restores the published structure.
- The best practices document is fixed content: changes made to it in Drive are shown as "changed in Drive" but are not brought back; updating replaces it (after the same warning).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A person who can act on an interview study with a Drive folder MUST be able to publish its guide, its best practices and its schedule as files created in that folder.
- **FR-002**: Publishing, updating and reading published files MUST use the acting person's own Drive access. Writing needs a separate consent that lets goodresearch edit **the files the person can edit in Drive** (Google's permissions decide, whoever created the file); it is asked only when the person first publishes or updates, and declining it leaves everything else unchanged.
- **FR-002a**: goodresearch MUST only write the files a feature is about (here, the study's published files, created in the study's folder) and MUST NOT delete or trash any file.
- **FR-002b**: Published files, their states and pending Drive changes MUST be shared by everyone who can act on the study; each decision on a Drive change MUST be taken once; a person without edit rights on a file MUST be told so (with the file's owner) when updating.
- **FR-003**: For each published file the app MUST keep the file's link, the time and author of the publication, and the content it published (the base), item by item, with stable item identities written into the file in a way people do not normally edit (guide items, schedule rows).
- **FR-004**: The app MUST compute each file's state (in sync, out of date, changed in Drive, conflict, unavailable) by comparing the base, the app's current data and the file's current content, item by item; a rename, a move within the folder, sorting or formatting MUST NOT count as a change.
- **FR-005**: The state MUST be checked when the Preparation tab opens (at most once every 5 minutes per file) and on demand, and show when it was last checked.
- **FR-006**: Changes read from Drive MUST be listed item by item with before and after, and MUST be applied to the app only when the person accepts them; accepted changes create a new version of the guide or schedule rows, with the origin "from Drive" and the Drive editor's name when known.
- **FR-007**: Changes read from Drive MUST be validated with the same rules as the app's editors (spec 006 limits); invalid or unmatched changes MUST be shown and MUST NOT be acceptable.
- **FR-008**: Updating a Drive copy MUST rewrite the same file in place and MUST be refused while Drive changes are unreviewed, unless the person explicitly chooses to replace them; it MUST be refused if the file changed since the last check.
- **FR-009**: An item changed on both sides MUST be presented as a conflict with both versions; the person keeps one or writes the final text.
- **FR-010**: Unavailable files (deleted, trashed, moved out of the folder, no access) MUST be reported with the reason; the person can publish a new copy or forget the publication. goodresearch MUST never delete or trash a file in Drive.
- **FR-011**: The best practices MUST be published in the interface language of the person publishing; changes to them in Drive are reported, never brought back.
- **FR-012**: Schedule data written to Drive MUST NOT be sent to an AI provider; the assistant (US5) only works on guide texts.
- **FR-013**: All texts MUST exist in English and French; the review list, states and dialogs MUST meet WCAG 2.2 AA.

### Key Entities

- **PublishedDocument** (context map): a file published from the app: what it holds (guide, best practices, schedule), the study, the file's identity and link at the source, the person who published, the publication time, the base content, the last known state and check time.
- **DriveChange**: one difference read from a published file, for one item: kind (changed, added, removed, not understood, invalid, conflict), before, after, the person's decision (pending, accepted, rejected).
- **Item identity**: the link between an app item (guide section, question, framing field; planned interview) and its place in the published file.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Publishing a guide of 60 questions and a schedule of 300 rows completes in under 30 seconds.
- **SC-002**: 100 % of edits made in Drive to guide items and schedule rows are either listed for review or reported as not understood; none is overwritten without the person's explicit decision (tested on edit, add, remove, reorder, conflict).
- **SC-003**: A reworded question accepted from Drive keeps its identity in 100 % of cases.
- **SC-004**: Renaming, moving within the folder, sorting or formatting a published file never produces a change to review.
- **SC-005**: No schedule content appears in any request to an AI provider.

## Assumptions

- The Drive folder of the study is the one attached in spec 002; publishing to another folder is out of scope.
- Change detection runs on demand and when the tab opens; live notifications from Drive are out of scope (they need a public callback that self-hosted instances may not have).
- A published file belongs to the person who published it, in the shared folder; sharing follows the folder; who can edit it is decided in Drive, not in goodresearch.
- The wider Drive consent (editing files the person can edit) also prepares later features that organise the study folder (moving, renaming files); each such feature gets its own spec and never deletes.
- The publication language of the guide headings and schedule column names is the interface language of the person who publishes; it does not change at later updates.
- Real-time co-editing, publishing analysis outputs and other drives are out of scope.
