# Feature Specification: Walking skeleton — sign-in, team access and research projects

**Feature Branch**: `001-walking-skeleton`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "First walking skeleton of goodresearch. A person deploying goodresearch with `docker compose up` can open the app, create the first account (which becomes the workspace owner), sign in and out, and set their interface language (English or French). Once signed in, they land on an empty home page, create a workspace team, then create a research project with a name, a research goal and an optional team, and see it listed on the home page and open its overview page (name and goal editable in place). Signing in with an external OIDC provider is possible when the deployer configures one, but is not required. Everything is accessible (keyboard, screen readers) and every screen exists in both languages. Out of scope: studies, sessions, transcripts, AI features, inviting other members."

## Clarifications

### Session 2026-10-24

- Q: When an external identity provider is configured, what happens the first time a person without an account signs in? → A: The deployer configures an allow-list of email addresses and email domains. An allowed person gets an account and joins the workspace with no team, so they see no project until an admin grants them access to one or more teams. A person can belong to several teams.
- Q: Can a project exist without a team? → A: No. Every project belongs to exactly one team; access to projects is granted through team membership.
- Q: Can a project belong to several teams? → A: No, exactly one. To share, add the person to the project's team.
- Q: Which roles exist? → A: Two workspace roles. **Admin** manages teams, members and their team access, and sees every project. **Member** sees, creates and edits the projects of their teams.
- Q: Must access changes (role, team membership, activation) be kept in a history that admins can consult? → A: Yes, from this feature: every access change is recorded (who, what, when), cannot be edited, and admins see it per person.
- Q: Can an admin permanently delete a person's account, beyond deactivating it? → A: Yes, by anonymisation: name and email are erased and replaced by "Deleted account", all sessions end, sign-in is impossible forever; history and projects stay consistent. Irreversible.
- Q: How do people sign in? → A: **Only through an external identity provider; goodresearch never manages passwords.** Any standard OpenID Connect provider can be configured; the first release documents and tests **Google** only. Other presets (e.g. Proton through SimpleLogin) come later. *(This supersedes the initial description's "create the first account" with email and password and "OIDC not required".)*
- Q: Without passwords, who becomes the first admin of a fresh instance? → A: The deployer lists **initial admin emails** in the configuration; a person with one of these emails becomes admin when they sign in. Nobody else can take over a fresh instance.
- Q: Some providers do not assert a verified email or may send an alias. What is the rule? → A: A verified email is required by default. The deployer can mark a provider as **trusted** in the configuration; its emails are then accepted as given. The allow-list applies to the email received.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set up an instance and sign in as its first admin (Priority: P1)

A deployer configures an identity provider (Google), their own email as initial admin and the access allow-list, starts goodresearch on their own infrastructure, opens it and signs in with the provider. They become admin and are asked to create a first team, since every project belongs to a team. They can sign out and sign back in.

**Why this priority**: Nothing else is reachable without signing in and a team. It proves the product can be self-hosted from a single command plus a provider configuration.

**Independent Test**: Start an instance configured with a provider and an initial admin email, sign in as that person, create the first team, sign out, sign in again.

**Acceptance Scenarios**:

1. **Given** a configured instance, **When** someone opens the app while signed out, **Then** they see a sign-in screen with one button per configured provider (e.g. "Sign in with Google") and no email or password field.
2. **Given** `admin@example.org` is listed as initial admin, **When** that person signs in for the first time with a verified email, **Then** their account is created as **admin** and they are asked to create a first team.
3. **Given** an admin and no team yet, **When** they create a team, **Then** they land on the home page with an empty state inviting them to create a first project in that team.
4. **Given** a signed-in user, **When** they sign out, **Then** their session ends and any protected page redirects to sign-in.
5. **Given** an instance started without any provider configured, **When** someone opens it, **Then** a page explains that sign-in is not configured yet and links to the deployment documentation; no other page is reachable.
6. **Given** the provider rejects or cancels the sign-in, **When** the user returns to goodresearch, **Then** they see a generic message offering to try again, without technical details.

---

### User Story 2 - Create and browse research projects (Priority: P1)

A signed-in user creates a research project in one of their teams by giving it a name and a research goal (the research question, objectives and hypotheses). The home page lists the projects they can access; opening one shows its overview page where the name, goal and team can be edited in place.

**Why this priority**: The project is the entry point of every research activity; it is the first piece of real product value.

**Independent Test**: Sign in as admin, create a project, see it on the home page, open it, edit its name and goal, reload and see the changes kept.

**Acceptance Scenarios**:

1. **Given** a user with access to at least one team and no visible project, **When** they land on the home page, **Then** they see an empty state explaining what a project is, with a primary action to create one.
2. **Given** the create-project dialog, **When** the user enters a name, a goal and picks one of their teams (pre-selected if they have only one) and confirms, **Then** the project is created, they are taken to its overview page, and it appears on the home page.
3. **Given** the create-project dialog, **When** the name is empty or no team is chosen, **Then** creation is refused with a message next to the field; the goal may be left empty.
4. **Given** a project overview, **When** the user edits the name or the goal in place and confirms (or leaves the field), **Then** the change is saved and a confirmation is announced; pressing Escape cancels the edit.
5. **Given** a project overview, **When** the user moves the project to another team they have access to, **Then** the project is attached to that team and members who lose access no longer see it.
6. **Given** several visible projects, **When** the user views the home page, **Then** projects are listed most recently updated first, each showing its name, team and last update.
7. **Given** projects in several of the user's teams, **When** they select a team filter on the home page, **Then** only that team's projects are listed; the filter is kept in the page address.

---

### User Story 3 - Give colleagues access through teams (Priority: P1)

The deployer lists allowed email addresses and domains in the instance configuration. A colleague signs in with the provider for the first time and finds an empty space explaining that an admin must give them access. The admin sees the new member, grants them access to one or more teams, and the colleague now sees and works on those teams' projects.

**Why this priority**: Research is a team activity; without this the instance is single-user. It also defines the access model every later feature relies on.

**Independent Test**: With an allow-list configured, sign in as an allowed colleague, check they see nothing, grant them a team as admin, check they now see exactly that team's projects.

**Acceptance Scenarios**:

1. **Given** an allow-list containing `alex@example.org` and the domain `research.example.com`, **When** `alex@example.org` or `sam@research.example.com` signs in for the first time, **Then** an account is created as **member** with no team; **when** `kim@other.example` tries, **Then** access is refused with a message to contact the administrator, and no account is created.
2. **Given** a member with no team, **When** they sign in, **Then** they see an empty state explaining that they have no access yet and that an admin must add them to a team, and no project is visible.
3. **Given** the admin's members screen, **When** the admin views it, **Then** every account is listed with name, email, role, teams, provider and last sign-in; members without a team are highlighted.
4. **Given** a member, **When** the admin grants them access to teams A and B, **Then** the member sees exactly the projects of teams A and B and can create projects in A or B.
5. **Given** a member of team A, **When** the admin removes them from team A, **Then** team A's projects disappear from their home page and opening one directly is refused.
6. **Given** a member, **When** the admin promotes them to admin (or demotes an admin to member), **Then** their rights change at their next action; the last remaining active admin cannot be demoted, deactivated or deleted.
7. **Given** a member, **When** the admin deactivates them, **Then** they are signed out and can no longer sign in, even if still on the allow-list; reactivation restores their previous teams.
8. **Given** any access change above, **When** the admin opens that person's access history, **Then** it lists each change with the admin who made it, what changed and when, newest first.
9. **Given** an account, **When** the admin deletes it after typing a confirmation, **Then** its name and email are replaced by "Deleted account" everywhere, its sessions end and it can never sign in again; if the same person later signs in, a new, unrelated account is created (subject to the allow-list).

---

### User Story 4 - Manage teams (Priority: P2)

An admin creates, renames and deletes teams.

**Why this priority**: Needed as soon as there is more than one group; the first team is already created in story 1.

**Independent Test**: As admin, create two teams, rename one, try deleting a team with projects, move its projects, delete it.

**Acceptance Scenarios**:

1. **Given** the teams screen, **When** the admin creates a team with a name, **Then** it appears in the team list, in team selectors and in the members screen.
2. **Given** an existing team "Growth", **When** the admin creates "growth " (different case or surrounding spaces), **Then** creation is refused because the name already exists.
3. **Given** a team, **When** the admin renames it, **Then** the new name appears everywhere; renaming to another team's name is refused.
4. **Given** a team that still has projects, **When** the admin tries to delete it, **Then** deletion is refused with the number of projects to move first.
5. **Given** a team with no project, **When** the admin deletes it after confirming, **Then** the team disappears and its members simply lose that membership.
6. **Given** a member, **When** they open the teams screen, **Then** they see the teams they belong to and who else is in them, but cannot change them.

---

### User Story 5 - Use the app in my language, with any input method (Priority: P2)

Any user can switch the interface between English and French at any time, including on the sign-in screen; the choice is remembered for their account. Every flow of this feature can be completed with a keyboard only and with a screen reader.

**Why this priority**: The product ships bilingual and accessible from day one (constitution VIII); this story makes it verifiable.

**Independent Test**: Complete stories 1–4 in French, then in English, keyboard only, with a screen reader announcing every control and status change.

**Acceptance Scenarios**:

1. **Given** a first visit, **When** the app opens, **Then** it uses the browser's preferred language if it is English or French, otherwise English.
2. **Given** any screen, **When** the user switches language, **Then** all interface text changes immediately without losing what they were typing; signed-in users find the same language at their next sign-in, on any device.
3. **Given** user-entered content (project names, goals, team names), **When** the language changes, **Then** that content is shown as entered, never translated.
4. **Given** any flow of this feature, **When** it is performed with the keyboard only, **Then** every action is reachable, focus is always visible and follows a logical order, and dialogs trap and restore focus.
5. **Given** a screen reader, **When** the user navigates, **Then** every control has an accessible name, errors are announced, and saved changes are announced.

---

### Edge Cases

- Two initial admins sign in at the same moment on a fresh instance: both become admins (both are listed); nobody else does.
- An email is listed as initial admin but is not on the allow-list: it is still allowed (initial admins are implicitly allowed).
- An initial admin email is removed from the configuration after that person signed in: they keep their account and role; roles are then managed in the app.
- The provider does not assert a verified email (or the claim is missing) and is not marked trusted: sign-in is refused with a message to contact the administrator, and no account is created or matched.
- A person signs in again with the same provider identity after changing their email at the provider: they reach the same account; the stored email is updated if the new one is still allowed, otherwise sign-in is refused.
- A person signs in with a second configured provider using the same verified email as their existing account: the sign-in attaches to that account.
- An email is removed from the allow-list while the person already has an account: they can no longer sign in; an admin can still deactivate or delete them explicitly.
- Allow-list matching ignores case; a domain entry matches that exact domain only, not its subdomains, unless the subdomain is listed too.
- The provider is unreachable: the sign-in button shows a generic error; already signed-in users keep working until their session expires.
- A user edits a project in place while it was changed in another tab or by someone else: the save is refused with a message inviting them to reload, rather than silently overwriting.
- A member opens a direct link to a project of a team they are not in: they see a "not found or no access" page that does not reveal whether the project exists.
- A member loses access to a team while they are on one of its projects: their next action is refused and they are sent back to the home page with an explanation.
- Very long project names or goals: names are limited (FR-016); goals accept long multi-paragraph text and keep line breaks.
- The session expires while editing: the user is asked to sign in again and returns to the page they were on.

## Requirements *(mandatory)*

### Functional Requirements

**Sign-in**

- **FR-001**: Users MUST sign in only through an external identity provider using OpenID Connect. The system MUST NOT store, accept or manage passwords.
- **FR-002**: The deployer MUST be able to configure one or more providers (display name, issuer, client credentials, trusted flag). The first release MUST document and test a Google configuration; any other standard OpenID Connect provider MUST work with the same mechanism.
- **FR-003**: Without any provider configured, the app MUST show a "sign-in not configured" page linking to the deployment documentation and expose nothing else.
- **FR-004**: An account MUST be created or matched only when the provider asserts a verified email, unless the deployer marked that provider as trusted.
- **FR-005**: The deployer MUST be able to configure **initial admin emails**. A person signing in with one of them MUST get the admin role at account creation. Initial admin emails are implicitly allowed.
- **FR-006**: The deployer MUST be able to configure an access allow-list made of email addresses and email domains. A first sign-in matching it MUST create a **member** account with no team; a first sign-in matching neither the allow-list nor the initial admin emails MUST be refused with no account created.
- **FR-007**: A returning person MUST be recognised by their provider identity; a sign-in through another configured provider with the same verified (or trusted) email MUST attach to the existing account.
- **FR-008**: Sign-in error messages MUST be generic and MUST NOT reveal whether an email has an account or why the provider refused it.
- **FR-009**: Every page except sign-in MUST require a signed-in, active account; sessions MUST expire after 7 days of inactivity and at most 30 days after sign-in, and can be ended by signing out.

**Roles and access**

- **FR-010**: Each account MUST have exactly one workspace role: **admin** or **member**.
- **FR-011**: Admins MUST see and act on every team and project. Members MUST see and act only on the projects of the teams they belong to.
- **FR-012**: Any request for a project outside the user's access MUST be refused in the same way as a missing project (no disclosure of its existence).
- **FR-013**: Admins MUST be able to list all accounts (name, email, role, teams, provider, last sign-in), grant and remove team memberships, promote and demote admins, and deactivate and reactivate accounts. The last active admin MUST NOT be demoted, deactivated or deleted.
- **FR-014**: Changes to roles, memberships and activation MUST take effect on the user's next request; a deactivated or deleted account's sessions MUST end immediately.
- **FR-014a**: Every access change (account created, role change, team membership granted or removed, deactivation, reactivation, deletion) MUST be recorded as an access event with the acting account (none for automatic events), the affected account, the change and the time. Access events MUST NOT be editable or deletable from the app. Admins MUST be able to view the access history of each account.
- **FR-014b**: Admins MUST be able to delete an account by anonymisation after an explicit confirmation: name and email are irreversibly erased (shown as "Deleted account"), sessions and provider links end, sign-in becomes impossible, and the account's teams and role are removed; references in projects and history remain, pointing to the anonymised account.

**Projects**

- **FR-015**: Users MUST be able to create a project with a required name, an optional research goal and a required team among the teams they can access.
- **FR-016**: Project names MUST be 1–120 characters after trimming surrounding spaces; goals up to 10,000 characters; line breaks in goals MUST be preserved.
- **FR-017**: The home page MUST list the projects the user can access, most recently updated first, with name, team and last update; it MUST be filterable by team, with the filter reflected in the page address; and it MUST show an explanatory empty state when there is no project, distinct from the "no access yet" state of a member with no team.
- **FR-018**: Users MUST be able to open a project's overview page, which shows its name, goal, team, creation and last update dates.
- **FR-019**: Users MUST be able to edit a project's name, goal and team in place from the overview page; edits MUST be saved explicitly (confirm or leaving the field) and cancellable (Escape). A project can only be moved to a team the user can access.
- **FR-020**: The system MUST refuse an edit based on an outdated version of the project and tell the user to reload, instead of overwriting another change.

**Teams**

- **FR-021**: Admins MUST be able to create, rename and delete teams. Team names MUST be unique in the workspace, ignoring case and surrounding spaces, and 1–80 characters.
- **FR-022**: Deleting a team that still has projects MUST be refused; deleting an empty team MUST ask for confirmation and remove its memberships.
- **FR-023**: Members MUST be able to see the teams they belong to and those teams' members, without changing them.

**Language and accessibility**

- **FR-024**: Every interface text MUST exist in English and French; the language MUST be switchable from every screen, including sign-in, and MUST be stored per account once signed in.
- **FR-025**: The initial language MUST follow the browser preference when it is English or French, otherwise English.
- **FR-026**: User-entered content MUST never be translated.
- **FR-027**: All screens of this feature MUST conform to WCAG 2.2 level AA, including full keyboard operation, visible focus, accessible names, announced errors and announced status changes.

### Key Entities

- **Account**: a person who can sign in. Name, email, preferred language, role (admin or member), status (active, deactivated, deleted), last sign-in. Lifecycle: active ⇄ deactivated → deleted (anonymised, terminal).
- **Provider identity**: the link between an account and its identity at a provider (provider, subject). An account can have one per configured provider.
- **Workspace**: the single tenant of an instance; holds accounts, teams and projects.
- **Team**: a group that owns projects. Name unique in the workspace (case/space-insensitive). Has team members (0..n accounts); an account can be in several teams.
- **Team membership**: the link between an account and a team; it is what grants a member access to the team's projects.
- **Project**: a research question. Name, research goal, exactly one team, creation and last-update dates, version (to detect concurrent edits).
- **Access event**: an immutable record of an access change: acting account, affected account, change (type and details), time.
- **Instance configuration** (set by the deployer, not edited in the app): providers (with trusted flag), initial admin emails, access allow-list (emails and domains).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer who has created a Google sign-in client goes from the start command to a signed-in admin with a first team in under 15 minutes, following only the README.
- **SC-002**: A first-time user creates their first project in under 2 minutes after signing in, without documentation.
- **SC-003**: An admin gives a newly arrived colleague access to a team in under 1 minute from the members screen.
- **SC-004**: In access tests covering every combination of role (admin, member with no team, member of one team, member of several teams), 100% of project listings and direct project links return exactly the projects allowed, and nothing reveals the existence of other projects.
- **SC-005**: In sign-in tests covering initial admin, allow-listed email, allow-listed domain, non-listed email, unverified email (trusted and untrusted provider) and deactivated account, 100% of outcomes match FR-004 to FR-007, and no refused attempt creates an account.
- **SC-006**: 100% of the interface text of this feature is available in English and French (no untranslated string in either language).
- **SC-007**: Automated accessibility checks report zero serious or critical violations on every screen of this feature, and every flow is completed keyboard-only in manual testing.
- **SC-008**: Saved changes appear immediately after saving and are still there after a reload and after restarting the instance.
- **SC-009**: For 100% of access changes made during acceptance testing, the affected person's access history shows who made the change, what changed and when.
- **SC-010**: After an account deletion, a search of every screen of the feature finds no trace of the erased name or email.

## Assumptions

- One workspace per instance in this feature; several workspaces per instance may come later.
- Expected scale per instance: up to 500 accounts, 100 teams and 2,000 projects; lists stay usable (search or paging) at that size.
- Deployers create the sign-in client at their provider themselves (documented for Google). For local evaluation and automated tests, the development setup ships a local test identity provider; it is never used in production.
- No email server is required: no email verification or invitations by email in this feature.
- Provider configuration, initial admin emails and the allow-list are instance configuration (set by the deployer, applied at start); editing them from the app is out of scope.
- Roles inside a team (e.g. read-only) are out of scope; every team member can create and edit the team's projects.
- Project deletion and archiving, studies, sessions, transcripts, AI features and the project's research journey/progress indicators are out of scope.
- "Most recently updated" means the last change to the project's own fields (name, goal, team).
- The visual identity is the design system's initial theme (light and dark follow the operating system setting).
- The deployer is technically comfortable running containers; non-technical installation (installers, hosted offer) is out of scope.
