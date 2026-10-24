# Feature Specification: Product identity, design system and app shell

**Feature Branch**: `003-brand-and-app-shell`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Update the design system and the whole layout based on the prototype's." The prototype's visual identity, app shell and page patterns (see [prototype reference](../../docs/domain/prototype-reference.md), *Shell* and *Home*) replace the neutral starter look of specs 001 and 002. Only the look and the layout change: no new data, no API change. Out of scope: search, recent projects, AI status, review-policy switch and the other shell parts that belong to features not built yet; any new screen.

## Clarifications

### Session 2026-10-24

- Q: Is the prototype's identity reused as is? → A: Yes for the product identity (name, wordmark, icon, colours, typeface), which belongs to goodresearch. Two deliberate deviations: the focus indicator and the active marks must meet WCAG 2.2 AA (the prototype's yellow focus outline is about 1.8:1 on white, below the 3:1 required), and a dark theme is kept (the prototype has none), built from the same identity.
- Q: What happens to the shell parts whose features do not exist yet (search, recent projects, lexicon, recommendations…)? → A: They are not shown. Each comes with its own feature. The shell is laid out so they can be added without redesign (navigation list, top bar slot).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A recognisable product identity everywhere (Priority: P1)

Anyone opening goodresearch, signed in or not, sees the same identity: the goodresearch wordmark and icon, the ink, paper and highlighter colours, one typeface, and the same shapes for buttons, fields, cards, dialogs, badges and messages. The browser tab shows the product icon.

**Why this priority**: Every other story uses these tokens and components; it is also the visible part of the change.

**Independent Test**: Open the sign-in page and any signed-in page in light and dark mode; compare the components with the Storybook stories; run the accessibility checks.

**Acceptance Scenarios**:

1. **Given** any page, **When** it loads, **Then** text uses the product typeface (served by the app itself, no third-party font service), the browser tab shows the product icon, and the colours come from the identity: ink for text and primary actions, paper for the background, highlighter only as a fill (active marks, highlights, soft tags), never as text colour.
2. **Given** the sign-in page, **When** someone opens it, **Then** it shows the wordmark, a short line on what the product does, and the sign-in buttons, centred on the paper background.
3. **Given** a person whose system is in dark mode, **When** they open the app, **Then** the same identity is shown on an ink background with the light variant of the wordmark, and every text and control keeps WCAG 2.2 AA contrast.
4. **Given** keyboard navigation, **When** focus moves to any control, **Then** a visible focus indicator with at least 3:1 contrast against its surroundings is shown.
5. **Given** the design system workbench (Storybook), **When** a contributor opens it, **Then** every component used by the app is shown in the new identity, light and dark, and passes the automated accessibility checks.

---

### User Story 2 - App shell with a sidebar (Priority: P1)

A signed-in person works in a shell made of a sidebar and a main column. The sidebar shows the wordmark, the navigation (Research projects, with a "new project" shortcut on the same line, also marked current on project and study pages; Teams; Members for admins) and, at the bottom, the person's account (the profile photo from the identity provider, or initials; name, email) with its menu and a sign-out button. The main column has a top bar with the language switch (FR / EN), then the page. The sidebar can be collapsed to a narrow rail of icons, and this choice is remembered on that browser. On a small screen the sidebar is replaced by a top bar with a menu button that opens the navigation.

**Why this priority**: It is the frame of every signed-in page.

**Independent Test**: Navigate between Projects, Teams and Members; collapse and expand the sidebar, reload; resize to a phone width and use the menu.

**Acceptance Scenarios**:

1. **Given** a signed-in page, **When** it loads, **Then** the sidebar shows the wordmark, the navigation entries the person is allowed to see, and their account; the current entry is marked (visually and for assistive technologies).
2. **Given** the "Research projects" line, **When** the person uses its "+" shortcut, **Then** the new-project dialog opens, as from the projects page.
3. **Given** the expanded sidebar, **When** the person collapses it, **Then** only icons remain (the icon of the product instead of the wordmark), each with its name available on hover, focus and to assistive technologies; after a reload it is still collapsed.
4. **Given** a screen narrower than 768 px, **When** the page loads, **Then** the navigation is reached through a menu button in a top bar, it closes after choosing an entry, and nothing scrolls horizontally.
5. **Given** the account area, **When** the person opens it, **Then** they find their email and role, connected sources and sign-out, as before; the language switch is in the top bar.
6. **Given** any signed-in page, **When** a keyboard user presses Tab first, **Then** a "Skip to content" link takes them to the page content.

---

### User Story 3 - Home with team folders and project cards (Priority: P2)

The home page "Research projects" shows the person's teams as folders, then the projects as cards. A team folder shows the team name and its number of projects; choosing it filters the projects to that team (choosing it again removes the filter), and the filter stays in the address as today. A project card shows a visual generated from the project (always the same for a given project), when it was last updated (relative: "2 days ago"), its team and its name; the whole card opens the project. A last "New project" card opens the creation dialog.

**Why this priority**: It is the first screen people see, but the current list works meanwhile.

**Independent Test**: With two teams and several projects, filter by a folder, clear the filter, open a project from its card, create a project from the last card.

**Acceptance Scenarios**:

1. **Given** a person in two teams, **When** they open the home page, **Then** a "Teams" section shows one folder per team with its project count, and a "Projects" section shows a count and one card per project, most recently updated first.
2. **Given** the team folders, **When** the person chooses one, **Then** it is marked as selected, the projects are filtered to that team and the address carries the filter; choosing it again shows all projects.
3. **Given** a project card, **When** the person activates it (pointer or keyboard), **Then** the project opens; its visual is the same on every visit.
4. **Given** no project yet, **When** the home page loads, **Then** the "New project" card is shown with the explanation of what a project is.
5. **Given** an admin without any team, or a member without any team, **When** they open the home page, **Then** they see the same guidance as today (first team, no access yet) in the new layout.

---

### User Story 4 - Page bars, list heads and study phases, as in the prototype (Priority: P2)

Detail pages (project, study, member) open with a bar across the content column: a square back button, the title as a breadcrumb (parent pages greyed and clickable, the current page in bold, editable in place where it is today), and the page's controls on the right. On a study page these controls are the folder pill and the phases as a segmented control (1 · Preparation, 2 · Fieldwork, 3 · Analysis); the study opens on Analysis, the only phase with something to do in this version, and the chosen phase is kept in the address. The project page then shows a "Research goal" card (team as an editable pill, goal editable in place, creation and update dates) and its studies as rows with a generated thumbnail, type, name, folder and last update. List pages (home, teams, members, connected sources) share one head: title, actions on the right, short description; teams are shown as folders.

**Why this priority**: Consistency of every page with the prototype; it changes no behaviour.

**Independent Test**: Open a project, then one of its studies, switch phases, reload, go back with the back button and the breadcrumb; open teams, members, a member, connected sources.

**Acceptance Scenarios**:

1. **Given** a project, study or member page, **When** it loads, **Then** its bar shows a back button, the breadcrumb and, for a study, the folder pill and the phases.
2. **Given** a study page, **When** it opens, **Then** the Analysis phase is selected; **When** the person chooses another phase, **Then** its content is shown and the address keeps the phase across reloads.
3. **Given** the phase control, **When** used with the keyboard, **Then** it behaves as tabs (arrow keys move between phases, the selected one is announced).
4. **Given** a page-level destructive action (delete a study), **When** the page is shown, **Then** it sits in a discreet disclosure at the bottom of the page, opening a danger zone with confirmation as today. Actions on a part of the page (detach a folder, delete a team) stay next to that part.

### Edge Cases

- Very long project, team or study names: truncated with an ellipsis in cards, folders and the sidebar, full text available on hover and to assistive technologies; never truncated in page titles.
- Many teams (e.g. 20): the folder grid wraps; no horizontal scroll.
- A team with no project: its folder shows "0 projects" and filtering by it shows the "no project" state for that team.
- Browser storage unavailable (private mode): the sidebar starts expanded and still works; only the memory of the choice is lost.
- Reduced motion preference: no hover lifts or transitions.
- Right-to-left languages are not supported in this version (same as before).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The design system MUST define the identity as tokens: ink, ink hover, highlighter, soft highlighter, paper, surface, second surface, border, muted text, error, plus radii and shadows; components MUST use only these tokens. Light and dark values MUST be provided.
- **FR-002**: The highlighter colour MUST be used only as a fill (selected or active marks, highlights, soft tags), never as text colour or as the only focus indicator.
- **FR-003**: The product typeface MUST be bundled with the app; no request to a third-party font or asset service.
- **FR-004**: The wordmark (light and dark variants), the icon and the favicons MUST be part of the design system and used by the sign-in page, the shell and the browser tab.
- **FR-005**: Every interactive component MUST show a focus indicator with at least 3:1 contrast; every text MUST meet WCAG 2.2 AA contrast in both themes.
- **FR-006**: Buttons MUST exist in primary (ink), secondary (bordered surface), ghost, link and destructive variants; fields, selects, cards, dialogs, menus, badges, tabs, segmented control, counts, tags and toasts MUST follow the identity.
- **FR-007**: Signed-in pages MUST be framed by the shell of User Story 2: sidebar (wordmark, navigation, account), top bar (language switch), page column; navigation entries depend on the role as today.
- **FR-008**: The sidebar MUST be collapsible to an icon rail; the choice MUST be remembered per browser and default to expanded.
- **FR-009**: Below 768 px the navigation MUST be reached through a menu button and MUST not cause horizontal scrolling.
- **FR-010**: The home page MUST show team folders (name, project count, select to filter, filter kept in the address) and project cards (generated visual stable per project, last update, team, name, whole card clickable), plus a "New project" card.
- **FR-011**: The generated visual MUST be decorative (hidden from assistive technologies) and derived only from the project id.
- **FR-012**: Detail pages (project, study, member) MUST use the page bar (back button, breadcrumb title, controls on the right); list pages (home, teams, members, connected sources) MUST use the shared list head; page-level destructive actions MUST be in a disclosure at the bottom of the page.
- **FR-013**: The study page MUST present its phases as an accessible tab control, open on Analysis, and keep the selected phase in the address.
- **FR-014**: Every new user-facing text MUST be available in English and French.
- **FR-015**: Motion (hover lifts, transitions) MUST be disabled when the person prefers reduced motion.
- **FR-016**: Existing behaviour of specs 001 and 002 MUST be unchanged: same routes, same data, same permissions, same messages. The only API change: the signed-in account exposes its profile photo address (`picture`, https only, null otherwise).
- **FR-017**: The profile photo MUST be shown only when it is an https address; otherwise, or if it cannot load, the initials are shown.

### Key Entities

None: no data is added or changed. The only state is the sidebar's collapsed flag, kept in the browser.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 automated accessibility violations (axe, WCAG 2.2 AA) on every Storybook story in both themes and on every end-to-end page.
- **SC-002**: The existing end-to-end scenarios of specs 001 and 002 pass with only selector updates, none with a behaviour change.
- **SC-003**: No component or page uses a colour, radius or font outside the design system tokens (checked in review and by searching the web app for raw colour values).
- **SC-004**: The app makes no request to a third-party domain for fonts, icons or images, except the person's own profile photo, served by their identity provider.
- **SC-005**: At 360 px width, every signed-in page is usable without horizontal scrolling.

## Assumptions

- The identity (name "goodresearch", wordmark, icon, ink #1c2230, highlighter #f5b82e, paper #f3f4f6, the Schibsted Grotesk typeface) is the product's own and is reused from the prototype; the typeface is under the SIL Open Font License.
- The dark theme keeps following the operating system setting, as in spec 001; no in-app theme switch.
- The language switch moves from the header to the top bar; the account menu moves to the sidebar foot.
- The current "Connected sources" page stays reachable from the account menu only.
