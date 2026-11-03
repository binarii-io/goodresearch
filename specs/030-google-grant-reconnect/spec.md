# Feature Specification: One-click reconnection of Google grants

**Feature Branch**: `030-google-grant-reconnect`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "One-click silent reconnection of Google grants (Vertex AI and Google Drive). Today, when a stored Google grant dies (refused by Google: expired, withdrawn, or a re-authentication required by the person's organisation), the person must redo the whole Vertex AI setup: Google consent, then the project/region form, the checks, then save. Wanted: access keeps renewing invisibly as today; the person is only involved when Google really requires them to sign in again. Then: a precise reason, a single 'Reconnect Google' action where the failure happened with the account pre-filled, the saved settings reused and checked automatically, back where they were with the interrupted action resumed or offered again; the setup form only if a check fails. Same for Drive. Optional: a light background check to warn before the failure. Out of scope: fully invisible re-consent."

## Context

A person holds two kinds of Google grants, each separate from sign-in: their **AI provider connection** to Vertex AI (spec 004: Google account, project, region) and their **source connection** to Google Drive (spec 002, spec 007: read or edit access). Short-lived access is already renewed without the person seeing it. What fails is the grant itself, when Google refuses it: withdrawn by the person, expired, or because the person's organisation requires them to sign in to Google again at a set interval. Only the person can fix that, by going through Google once more.

Today, for Vertex AI, that means redoing the full setup (consent, project and region form, checks, save) and then going back to what they were doing by hand. For Drive, the screen says the permission was revoked and sends the person to Connected sources. Both lose the person's place.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reconnect Vertex AI in one click, settings kept (Priority: P1)

A researcher's Vertex AI grant is refused by Google. On their next AI action, the screen says that Google needs them to sign in again and offers one action, "Reconnect Google". They go through Google's screen, already set on their account. Back in the app, their saved project and region are checked again without any form, the connection works again, and they are on the same screen as before.

**Why this priority**: it is the pain reported: a full setup each time, while one Google step would do.

**Independent Test**: with a saved Vertex AI connection whose grant is refused, run any AI action; reconnect; check that no project or region form was shown, that the connection is working, and that the person is back on the screen they started from.

**Acceptance Scenarios**:

1. **Given** a Vertex AI connection whose grant Google refuses, **When** the person runs an AI action, **Then** the action is not run, nothing is charged, and the screen shows why (Google needs them to sign in again) with a single "Reconnect Google" action.
2. **Given** the person chose "Reconnect Google", **When** Google's screen opens, **Then** it is set on the Google account of the saved connection.
3. **Given** the person consented on Google's screen with the same rights as before, **When** they come back, **Then** the saved project and region are checked again (access to the project, API enabled, a real call), the connection is replaced and working, and the person lands on the screen they started from, with no form shown.
4. **Given** the checks fail after reconnecting (project gone, API disabled, permission removed), **When** the person comes back, **Then** the setup form opens with the saved project and region filled in and the failed check explained; the previous connection stays as it was until a new one passes the checks.
5. **Given** the person cancels on Google's screen, unticks the needed right, or picks another Google account, **When** they come back, **Then** nothing saved changes, and the screen says what happened and offers "Reconnect Google" again. Another account is accepted only through the full setup.

---

### User Story 2 - Resume the interrupted work (Priority: P1)

The failure happened while the person was doing something: sending a message to the assistant, starting an analysis, cleaning transcripts. After reconnecting, their work is still there and they can run it again in one action.

**Why this priority**: reconnecting is only half the job if what the person typed or chose is lost.

**Independent Test**: type a message in the assistant, make the grant refused, send it; reconnect; check that the message is still there and can be sent again in one action.

**Acceptance Scenarios**:

1. **Given** a message to the assistant failed because of the grant, **When** the person comes back after reconnecting, **Then** the message they typed is still in the field, ready to send.
2. **Given** a long-running AI action (an analysis, a cleaning run) failed to start because of the grant, **When** the person comes back after reconnecting, **Then** the screen offers to start it again with the same choices, in one action. It is never started again without the person's action.
3. **Given** a long-running action stopped part-way because of the grant, **When** the person reconnects, **Then** the parts already stored are kept and the action can be started again from its screen.

---

### User Story 3 - Same for Google Drive (Priority: P2)

A researcher's Drive grant is refused by Google while they open a study folder, publish a document or read form responses. The screen says so where it happened and offers "Reconnect Google". After Google's screen, set on the saved account and asking for the same access as before (read or edit), they are back on the same screen and the folder loads again.

**Why this priority**: same pain, less frequent; the Vertex AI path comes first.

**Independent Test**: with a Drive connection whose grant is refused, open a study with a source folder; reconnect from that screen; check that the person is back on the study and that the folder loads.

**Acceptance Scenarios**:

1. **Given** a Drive connection whose grant Google refuses, **When** a screen needs Drive, **Then** it says that Google needs the person to sign in again and offers "Reconnect Google" there, not only from Connected sources.
2. **Given** the saved connection had edit access, **When** the person reconnects, **Then** Google is asked for edit access again, not read only.
3. **Given** the person consented, **When** they come back, **Then** they are on the screen they started from and what needed Drive is loaded again.

---

### User Story 4 - Know before it fails (Priority: P3)

When the person opens the app, a refused grant is noticed before they hit it mid-task: a discreet notice says which connection needs reconnecting, with the same one-click action.

**Why this priority**: useful, but stories 1 to 3 already cover the failure where it happens.

**Independent Test**: make a grant refused, open the app; check that the notice appears without running any AI or Drive action, and that it disappears once reconnected.

**Acceptance Scenarios**:

1. **Given** a grant Google now refuses, **When** the person opens the app, **Then** a notice names the connection (Vertex AI or Google Drive) and offers "Reconnect Google", without blocking anything else.
2. **Given** both grants are working, **When** the person opens the app, **Then** no notice appears and nothing asks for their attention.
3. **Given** the check could not reach Google (network), **When** the person opens the app, **Then** no notice appears; an unreachable Google is not a refused grant.

---

### Edge Cases

- Google is unreachable or slow: never shown as a refused grant, never asks to reconnect; the existing "unreachable" message stays.
- The stored grant can no longer be read by the app (e.g. after a change of the server's secret): same path as a refused grant, with its own reason, and the saved settings are reused.
- The organisation requires a new sign-in to Google: Google's screen asks for the password or second factor; the app does nothing different and says so in its reason ("your organisation asks you to sign in to Google again").
- The person reconnects with a different Google account than the saved one: refused on the one-click path (it would silently change whose project is billed); the person is sent to the full setup.
- Two tabs open: reconnecting in one makes the other work again on its next action, without a second reconnection.
- The deployer no longer offers Vertex AI: the existing rule applies (the person chooses a provider again); no reconnection is offered.
- The Google step is abandoned (tab closed): nothing saved changes; the next action shows the reconnection again.
- A failure that is not about the grant (quota, permission on the project, API disabled, model unavailable) never offers "Reconnect Google"; it keeps its own message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Short-lived access to Vertex AI and Drive MUST keep renewing without involving the person, as today.
- **FR-002**: The system MUST tell apart, for each Google grant, these reasons it can no longer be used: refused by Google (withdrawn or expired), a new sign-in required by the person's organisation, and the stored grant unreadable by the app. Each MUST be shown to the person in plain words. Google unreachable MUST NOT count as any of them.
- **FR-003**: When a grant can no longer be used, the connection MUST be marked as needing reconnection, and every screen that needs it MUST say so where the failure happened, with a single "Reconnect Google" action.
- **FR-004**: "Reconnect Google" MUST open Google's screen set on the Google account of the saved connection and asking for the same rights as the saved connection (Vertex AI; Drive read or edit).
- **FR-005**: After consent, the system MUST check the new grant against the saved settings (Vertex AI: the same checks as the setup of spec 004 on the saved project and region; Drive: the same access level and the same account) without showing any form, and MUST replace the stored grant only when the checks pass.
- **FR-006**: When a check fails after reconnecting, the system MUST open the existing setup with the saved values filled in and the failed check explained; the previous connection MUST stay unchanged until a new one is saved.
- **FR-007**: A reconnection with another Google account than the saved one, or without the needed right, MUST NOT change the saved connection; the person MUST be told why and offered the full setup or a new attempt.
- **FR-008**: After reconnecting, the person MUST land on the screen they started from.
- **FR-009**: What the person typed or chose before the failure (an assistant message, the choices of an analysis or cleaning run) MUST NOT be lost; after reconnecting, it MUST be offered again in one action and MUST NOT be run without that action.
- **FR-010**: A failure caused by the grant MUST NOT be charged and MUST be recorded in the usage ledger like any failed call (outcome only, no cost).
- **FR-011**: A long-running action stopped part-way by a refused grant MUST keep what it had already stored; starting it again follows that action's existing rules.
- **FR-012**: When the person opens the app, the system SHOULD check their Google grants at most once per session and show a discreet, non-blocking notice for each grant that needs reconnecting, with the same action.
- **FR-013**: Failures not caused by the grant MUST NOT offer "Reconnect Google".
- **FR-014**: The reconnection step MUST be protected like the existing consents: single-use, short-lived, tied to the signed-in person, and returning only to a page of the app.
- **FR-015**: Every new user-facing text MUST exist in English and French.

### Key Entities

- **AI provider connection** (spec 004): gains a reason for needing reconnection (refused, organisation sign-in required, unreadable). Its project, region and Google account are kept while it needs reconnection.
- **Source connection** (spec 002): same reasons; its access level (read or edit) and Google account are kept while it needs reconnection.
- **Reconnection attempt**: one pass through Google for one connection: which connection and the screen to go back to. Short-lived and single-use. Interrupted work stays in the person's browser, never on the server.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When Google only asks for consent again, a person gets a working Vertex AI or Drive connection back with one action in the app and one pass through Google's screen, with no form.
- **SC-002**: In 100% of reconnections where the checks pass, the person lands on the screen they started from.
- **SC-003**: No typed message and no chosen settings of an interrupted action are lost through a reconnection.
- **SC-004**: An unreachable Google never asks the person to reconnect.
- **SC-005**: A person never has to re-enter their Vertex AI project or region unless one of them no longer passes the checks.

## Assumptions

- Fully invisible re-consent is out of scope: Google gives a new lasting grant only after its own consent screen, and an organisation's sign-in requirement needs the person's password or second factor.
- How often Google refuses grants depends on settings outside the app (the organisation's Google Cloud re-authentication policy); this feature makes the reconnection cheap, not rarer.
- The Vertex AI and Drive grants stay separate consents (spec 004 FR-005); one reconnection fixes one connection. Signing in to the app itself is not affected.
- "Offered again in one action" for long-running actions reuses the existing start actions with the previous choices; nothing new is run on the person's behalf.
- The background check of story 4 uses no AI call and costs nothing. The checks after a Vertex AI reconnection include one small real call; its cost is shown in the reconnection notice.
- When the browser blocks the Google window and the app has to leave the page, the assistant message already sent is kept with its conversation and can be sent again; an open start dialog of a long-running action comes back with its usual choices.
