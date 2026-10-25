# Feature Specification: Studies in projects, with Google Drive as the source of interview studies

**Feature Branch**: `002-studies-drive-source`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Studies in research projects, with Google Drive as the source of interview studies. A project member can create a study inside a project: a study is one method run to collect evidence for the project's research question. Each study has a name, a type and the study phases Preparation, Fieldwork and Analysis. The first and only available type is "interviews"; other types (survey, usability test) are shown as coming later. For an interview study, the person connects their Google Drive (a separate consent from sign-in, asked only when needed, revocable) and picks the Drive folder that holds the study's recordings and transcripts; the app then shows the folder's name and its content inventory (files with kind transcript, media or other, grouped by first-level sub-folder), and can refresh it. Nothing is ever written or deleted in Drive. The project overview lists its studies; a study page shows its type, phases, and source folder. Access follows the project's team. Out of scope: matching transcripts and recordings into sessions, importing transcripts, any AI feature, other source connectors than Google Drive, attaching a study to several projects."

## Clarifications

### Session 2026-10-24

- Q: How does a person choose the Drive folder? → A: By pasting the folder's Drive link, as in the prototype. *(Google's picker was considered first and dropped: with the picker-only permission, picking a folder gives no access to the files inside it, so no inventory is possible.)* The Drive permission is read-only for metadata and content, requested once, because importing transcripts (next feature) needs to read content.
- Q: When a study has a folder attached, whose Drive access is used? → A: Each person's own. The folder is a second access barrier on top of the team: a team member must also have access to the folder in Drive. When a person opens a study with a folder, the app checks their access automatically; without it, they cannot act on the study.
- Q: What does a team member without access to the study's folder see? → A: The study exists (name, type), but neither its inventory nor any file name, and they cannot change anything. A message tells them to ask the folder's owner for access in Drive; access is checked again next time they open the study.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a study in a project (Priority: P1)

A member of a project's team creates a study from the project overview: they give it a name and choose its type. Only "Interviews" can be chosen; "Survey" and "Usability test" are visible but marked as coming later. The study appears on the project overview and opens on its own page, organised in three phases: Preparation, Fieldwork and Analysis.

**Why this priority**: The study is the container of every piece of evidence to come; nothing else in this feature exists without it.

**Independent Test**: Open a project, create an interview study, see it listed on the overview, open it, rename it.

**Acceptance Scenarios**:

1. **Given** a project overview, **When** a team member chooses "New study", enters a name and keeps the type "Interviews", **Then** the study is created in that project and its page opens.
2. **Given** the type choice, **When** the user looks at the options, **Then** "Survey" and "Usability test" are shown as "coming later" and cannot be selected.
3. **Given** a project with studies, **When** someone opens the project overview, **Then** its studies are listed with name, type, source status (no folder / folder attached, with the folder name only for people whose access to it was confirmed, FR-010a) and last update, most recently updated first.
4. **Given** a study page, **When** the user views it, **Then** it shows the study name (editable in place), its type, and the three phases as sections, Preparation, Fieldwork and Analysis, each explaining what will happen there; the source folder is part of Analysis.
5. **Given** a study with an empty name, **When** the user tries to create or rename it, **Then** it is refused with a message next to the field.
6. **Given** a person without access to the project's team, **When** they open a link to one of its studies, **Then** they see the same "not found or no access" page as for projects.

---

### User Story 2 - Connect Google Drive and attach the study's folder (Priority: P1)

For an interview study, the person attaches the Google Drive folder that holds the interview recordings and transcripts by pasting its Drive link. The first time they do it, the app explains why it needs to read their Drive and sends them to Google to consent. This permission is separate from signing in, asked only at that moment, and can be revoked at any time. The study then shows the folder's name and a link to open it in Drive.

**Why this priority**: Without a source, an interview study has no evidence; it is the first real step of the analysis workflow.

**Independent Test**: As a person who never connected Drive, paste a folder link on a study: consent, come back, see the folder's name on the study page.

**Acceptance Scenarios**:

1. **Given** a person who never connected Google Drive, **When** they choose "Attach a Drive folder" on an interview study, **Then** the app explains what the permission allows (reading the folders and files the person can open in Drive; in this feature only their names, types, dates and sizes are read, file content will be read when transcripts are imported) and that nothing is ever modified, then sends them to Google's consent screen.
2. **Given** they consent, **When** they paste a folder link (any Drive folder URL form, or the folder's identifier), **Then** the app checks that it is a folder they can open, and the study shows the folder's name, its owner and a link opening it in Drive.
3. **Given** they refuse or cancel the consent, **When** they come back, **Then** the study stays without a folder and a message explains that the folder can be attached later.
4. **Given** a person already connected, **When** they attach a folder to another study, **Then** no new consent is asked.
5. **Given** a study with a folder, **When** a team member replaces it with another folder after confirming, **Then** the previous inventory is discarded and the new folder's inventory is taken.
6. **Given** a study whose folder was attached by a colleague, **When** another team member opens it, **Then** the app checks their own Drive access to that folder (asking them to connect Drive first if needed); with access they see the inventory and can act; without it they see only the study's name and type, the folder owner's name, a message to ask for access in Drive, and no action.
7. **Given** a team member whose access to the folder was removed in Drive, **When** they open the study again, **Then** the inventory and actions are no longer available to them.
8. **Given** the account menu, **When** a person opens "Connected sources", **Then** they see whether Google Drive is connected and with which Google account, and can disconnect it; disconnecting revokes the permission at Google.

---

### User Story 3 - See and refresh the folder inventory (Priority: P1)

Once a folder is attached, the study shows what it contains: every file in the folder and its sub-folders, classified as transcript, media (recordings) or other, grouped by first-level sub-folder (for example one sub-folder per domain or per interviewer). The team refreshes it when new files are added.

**Why this priority**: The inventory is what the next feature (matching transcripts and recordings into sessions) builds on, and it lets the team check that the right folder is attached.

**Independent Test**: Attach a folder containing sub-folders with documents, recordings and other files; check counts and classification; add a file in Drive; refresh; see it appear.

**Acceptance Scenarios**:

1. **Given** a folder is attached, **When** the inventory is taken, **Then** the study lists every file of the folder and of all its sub-folders with name, kind (transcript, media, other), group (first-level sub-folder, or "Root" for files directly in the folder), size when known and last modification date, with totals per kind and per group.
2. **Given** files of different formats, **When** they are classified, **Then** text documents and transcript files (Google Docs, Word documents, plain text, subtitle files) are "transcript", audio and video files are "media", everything else is "other".
3. **Given** a Drive shortcut inside the folder, **When** the inventory is taken, **Then** it is listed as the file it points to (once, even if the target is also in the folder).
4. **Given** an inventory, **When** a team member chooses "Refresh", **Then** the inventory is taken again and the study shows when it was last refreshed and by whom; files removed from Drive disappear, new ones appear.
5. **Given** a large folder, **When** the inventory runs, **Then** the page shows progress and stays usable; the inventory completes even if the person navigates away.
6. **Given** any inventory or refresh, **When** it runs, **Then** nothing is created, modified, moved or deleted in Drive.

---

### Edge Cases

- The folder was deleted, moved to the trash or is no longer shared with the person refreshing: the refresh fails with an explanation and a suggestion to attach another folder; the last inventory stays visible, marked as outdated.
- The person who wants to refresh has no Drive connection yet: they are asked to connect first.
- A team member has a Drive connection but the folder is not shared with them: they see the "no access" state and the folder owner's name, never the file names.
- Nobody in the team can access the folder anymore (deleted in Drive): an admin detaches it or deletes the study (FR-010b).
- The Drive permission was revoked at Google (outside the app): the next action needing Drive asks to reconnect.
- The folder contains thousands of files or deep sub-folders: the inventory still completes (see SC-004) and shows progress.
- Two team members refresh the same study at the same time: only one inventory runs; the other person sees it in progress.
- A file with no recognised type (no extension, unusual format): classified as "other".
- The pasted link is not a Drive folder (a file, a document, another site, a malformed link) or points to a folder the person cannot open: refused with an explanation, nothing is attached.
- The study's project is moved to another team: the study follows the project and its access.

## Requirements *(mandatory)*

### Functional Requirements

**Studies**

- **FR-001**: Team members of a project (and admins) MUST be able to create a study in that project with a required name (1–120 characters after trimming) and a type.
- **FR-002**: The type "interviews" MUST be the only selectable type; "survey" and "usability test" MUST be displayed as coming later and MUST NOT be selectable.
- **FR-003**: A study MUST belong to exactly one project and follow that project's access rules (FR-011/FR-012 of spec 001): outside access, it does not exist.
- **FR-004**: The project overview MUST list the project's studies, most recently updated first, with name, type, source status and last update; the folder name is shown only to people whose access to the folder was confirmed (FR-010a).
- **FR-005**: The study page MUST show the name (editable in place, with the same conflict rule as projects), the type and the phases Preparation, Fieldwork and Analysis. In this feature, Preparation and Fieldwork describe what will come; Analysis holds the source folder and its inventory. *(Spec 008: the source folder and its inventory moved to Fieldwork, renamed « Passation » in French.)*
- **FR-006**: Team members MUST be able to delete a study after confirmation; deleting a study removes its inventory from the app and never touches Drive.

**Drive connection and folder access**

- **FR-007**: Reading Google Drive MUST use a permission separate from sign-in, requested only when a person first needs it (attaching a folder or opening a study with a folder), after an explanation of what the permission allows and what this feature reads.
- **FR-008**: People MUST attach a folder by pasting its Drive link (all Drive folder URL forms, or the bare identifier). The Drive permission MUST be read-only; the app MUST NOT create, modify, move or delete anything in Drive. In this feature the app MUST only read folder and file metadata, never file content, and MUST only read the attached folder and its sub-folders.
- **FR-009**: Each person MUST be able to see their Drive connection (connected Google account, date) and disconnect it; disconnecting MUST revoke the permission at Google and remove the stored permission from the app.
- **FR-010**: Stored Drive permissions MUST be encrypted at rest and MUST only be used for the actions of the person who granted them; one person's permission MUST NEVER be used for another person's request.
- **FR-010a**: For a study with a folder, access requires both the project's team (spec 001) and the person's own access to the folder in Drive. The app MUST check the person's folder access when they open the study and before any action (result reusable for at most 5 minutes). A person whose access is not confirmed MUST see only the study's name, type and a message explaining how to get access, and MUST NOT see the inventory, any file name or perform any action, with one exception (FR-010b).
- **FR-010b**: Admins MUST be able to detach a study's folder (discarding its inventory) or delete the study even without access to the folder, so that a study whose folder was deleted in Drive is never stuck.
- **FR-010c**: Access to a folder attached by someone else MUST be checked automatically with the person's own Drive permission; a person without a Drive connection is first asked to connect.

**Source folder and inventory**

- **FR-011**: A team member with access to the folder (FR-010a) MUST be able to attach one Drive folder to an interview study, replace it after confirmation (discarding the previous inventory), or detach it.
- **FR-012**: Attaching or refreshing MUST take an inventory of every file in the folder and its sub-folders, recording name, kind, group, size (when known), last modification date and a link to open it in Drive.
- **FR-013**: Kinds MUST be assigned as: transcript (Google Docs, Word documents, plain text, subtitle formats such as VTT and SRT), media (any audio or video), other (everything else). Shortcuts MUST be resolved to their target and each file listed once.
- **FR-014**: The group of a file MUST be its first-level sub-folder under the attached folder, or "Root" for files directly in it.
- **FR-015**: The inventory MUST run in the background with visible progress, MUST complete even if the person leaves the page, and only one inventory per study MUST run at a time.
- **FR-016**: The study MUST show the last inventory's date, the person who ran it, totals per kind and per group, and the file list (filterable by kind and group). A failed refresh MUST keep the last successful inventory visible, marked as outdated, with the reason.

**Language and accessibility**

- **FR-017**: All new screens MUST exist in English and French and meet WCAG 2.2 AA (as in spec 001).

### Key Entities

- **Study**: a method run inside a project. Name, type (interviews; survey and usability test later), project, creation and update dates, version.
- **Source folder**: the Drive folder attached to an interview study: Drive folder identifier, name, owner, link, attached by, attached at.
- **Inventory**: the last listing of a source folder: started and finished at, run by, status (running, done, failed with reason), files.
- **Inventory file**: a file found in the folder: Drive file identifier, name, kind (transcript, media, other), group, size, last modified, link.
- **Drive connection**: a person's read-only permission on their Drive: Google account, granted at, encrypted permission; one per person.
- **Folder access**: whether a given person can access a study's folder: person, study, last checked at, result (granted or denied).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member creates an interview study and attaches its Drive folder, including the first Drive consent, in under 3 minutes.
- **SC-002**: For a folder of 500 files in up to 20 sub-folders, the inventory is complete in under 1 minute.
- **SC-003**: In tests on a sample folder covering every listed format, 100% of files are classified in the expected kind and group, and each shortcut target appears exactly once.
- **SC-004**: Inventories of folders up to 10,000 files complete without error and show progress at least every 5 seconds.
- **SC-005**: Over all automated tests, no request that modifies Drive is ever sent (only read requests).
- **SC-006**: In access tests, a person outside the project's team gets "not found" for 100% of the study's pages and actions.
- **SC-008**: In tests with team members who have and do not have access to the folder in Drive, 100% of the latter see no inventory, no file name and no action other than the admin exception (FR-010b).
- **SC-007**: After a person disconnects Drive, 100% of later actions needing Drive ask them to reconnect, and their permission is no longer stored.

## Assumptions

- Google Drive is the only source in this feature; the Drive connection is designed so that other sources (upload, other drives) can be added later without changing studies.
- Deployers enable the Google Drive API and declare the read-only Drive permission on their Google consent screen. Google classifies it as restricted: no verification for an *Internal* app (Google Workspace organisation); an *External* app shows a warning and is limited to 100 users until verified by Google. The README documents both.
- People who sign in with another provider can still connect Google Drive (sign-in and Drive are separate).
- Study phases are sections of the study page; there is no phase status to manage in this feature.
- Matching files into sessions, importing transcripts, reading file content and AI features are out of scope.
- Expected volume per study: typically 20–200 files, up to 10,000.
