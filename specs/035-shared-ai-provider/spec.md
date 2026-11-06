# Feature Specification: A shared AI provider for the instance

**Feature Branch**: `035-shared-ai-provider`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Shared AI provider for the instance. Today each person must connect their own AI provider at first sign-in (Vertex AI through their own Google account, or an Anthropic or OpenAI key, ADR-0005 update spec 004: no shared instance key), and Vertex grants sometimes need a reconnection (spec 030). Wanted: the deployer can configure one shared AI provider for the instance (Vertex AI through a Google Cloud service account — the machine's own identity when the instance runs on Google Cloud, or a service account key given as a secret — or an Anthropic or OpenAI key of the instance), with its project, region and model. When it is configured, people no longer have to connect a provider before using the app: their AI calls go through the shared provider. A person may still connect their own provider, which then takes precedence for their own calls; they can remove it to go back to the shared one. Every call is still recorded per person in the usage ledger and its cost shown in the screen that uses it, so who spends what stays visible; the AI provider page tells the person which provider their calls use (shared or their own). The deployer can restrict the shared provider to people of some teams (by default everyone with access to the instance). The shared credentials never leave the server and are never shown. If the shared provider fails (revoked, quota), calls fail with a clear message for the person and the deployer is told in the logs; no reconnection is asked of the person. Spending caps are out of scope for now. No real data in the repository."

## Context

Since spec 004, each person connects their own AI provider before using the app: their own Google account for Vertex AI (with a Google Cloud project), or an Anthropic or OpenAI key. It keeps who spends what visible and bills each person's own access, but it asks every newcomer for a cloud project or a key, and a Google consent that expires now and then (spec 030). Organisations that pay for one AI account for everyone want the app to use it directly: nobody has to set anything up, and the cost per person stays visible in the app.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the AI without connecting anything (Priority: P1)

The deployer configured a shared AI provider. A researcher signs in for the first time and goes straight to their projects; the interview guide assistant, the lexicon, cleaning and analysis work for them, through the shared provider.

**Why this priority**: it is the point of the feature: no setup for people, no reconnection.

**Independent Test**: with a shared provider configured, a new account signs in, is not asked to connect a provider, and an AI action succeeds and shows its cost.

**Acceptance Scenarios**:

1. **Given** a shared provider configured and a person with access and no provider of their own, **When** they sign in, **Then** they are not sent to the AI provider setup.
2. **Given** that person, **When** they use an AI action, **Then** it runs through the shared provider and its cost shows in that screen, recorded for that person.
3. **Given** no shared provider configured, **When** a person without a provider signs in, **Then** they are asked to connect one, as today.

---

### User Story 2 - Know and choose which provider is used (Priority: P2)

A researcher opens the AI provider page: it says their calls use the instance's shared provider (its kind and model, never its credentials). They may connect their own provider, which is then used for their calls; removing it brings them back to the shared one.

**Why this priority**: people keep the choice spec 004 gave them, and know who pays.

**Independent Test**: on the AI provider page, see "shared provider"; connect one's own: the page and the next AI call use it; remove it: back to the shared one.

**Acceptance Scenarios**:

1. **Given** a person using the shared provider, **When** they open the AI provider page, **Then** they see that their calls use the instance's shared provider, its kind and model, and an option to connect their own.
2. **Given** a person who connected their own provider, **When** they use an AI action, **Then** their own provider is used.
3. **Given** that person, **When** they remove their own provider, **Then** their next calls use the shared provider, without being asked to set one up.
4. **Given** a person whose own Vertex consent needs a reconnection, **When** a shared provider is configured, **Then** they are offered the reconnection (spec 030) or the removal of their own provider; their calls never silently switch to the shared provider.

---

### User Story 3 - Limit the shared provider to some teams (Priority: P3)

The deployer limits the shared provider to the members of some teams. A person outside those teams is asked to connect their own provider, as today.

**Why this priority**: lets an organisation pay for some teams only; by default everyone with access may use it.

**Independent Test**: limit to team A; a member of A uses the shared provider; a person in no listed team is asked to connect their own.

**Acceptance Scenarios**:

1. **Given** the shared provider limited to some teams, **When** a member of one of them signs in, **Then** they use it as in User Story 1.
2. **Given** the same limit, **When** a person in none of those teams signs in without a provider, **Then** they are asked to connect their own, and the AI provider page says the shared provider is not open to them.
3. **Given** a person removed from the last listed team, **When** they next use an AI action, **Then** it is refused with a message asking them to connect their own provider.

---

### Edge Cases

- The shared provider refuses calls (credentials revoked, quota reached, model unavailable): the action fails with a message saying the instance's AI is unavailable and to contact the administrator; nobody is asked to reconnect; the server logs say why, without the credentials.
- The shared provider is misconfigured at startup (missing project, unreadable key): the instance refuses to start with a message naming the setting, as for other settings.
- The deployer removes the shared provider: people without a provider of their own are asked to connect one at their next visit.
- Work started by a person in the background (a reading, a cleaning, an analysis) uses the provider that person uses when each call is made.
- The costs a person sees, and the ledger, say whether a call went through the shared provider or their own.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The deployer MUST be able to configure one shared AI provider for the instance: Vertex AI with a Google Cloud project, region and model, authenticated by the instance's own Google Cloud identity or by a service account key given as a secret; or an Anthropic or OpenAI key with a model.
- **FR-002**: When a shared provider is open to a person and they have none of their own, they MUST NOT be asked to connect a provider, and their AI calls MUST use the shared provider.
- **FR-003**: A person's own connected provider MUST take precedence for their calls; removing it MUST bring them back to the shared provider when it is open to them.
- **FR-004**: Every AI call MUST still be recorded for the person who made it, with its cost, and shown in the screen that uses it; the record MUST say whether the shared provider or the person's own was used.
- **FR-005**: The AI provider page MUST tell the person which provider their calls use (shared or their own), with its kind and model, and never show shared credentials.
- **FR-006**: The deployer MUST be able to limit the shared provider to the members of some teams; by default it is open to everyone with access to the instance.
- **FR-007**: Shared credentials MUST stay on the server: never sent to the browser, never written in logs, never stored in the database.
- **FR-008**: When the shared provider fails, the action MUST fail with a message for the person that the instance's AI is unavailable, without asking them to reconnect, and the server MUST log the reason (without credentials).
- **FR-009**: A misconfigured shared provider MUST stop the instance at startup with a message naming the setting.
- **FR-010**: Without a shared provider, everything MUST work as today (spec 004).
- **FR-011**: No real data in the repository; tests use made-up providers.

### Key Entities

- **Shared AI provider**: set by the deployer for the instance; kind (Vertex AI, Anthropic, OpenAI), model, and for Vertex AI a project, a region and how it authenticates; optionally the teams it is open to.
- **AI connection** (spec 004): a person's own provider, unchanged.
- **Usage entry** (spec 004): one per AI call, for the person, now saying which provider served it (shared or own).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a shared provider, a new person reaches their projects and uses an AI action without any provider step (0 setup screens).
- **SC-002**: 100% of AI calls are recorded for the person who made them, with the provider that served them.
- **SC-003**: Shared credentials appear in no response, page or log, in 100% of the tested cases.
- **SC-004**: People using the shared provider are never asked to reconnect a Google account for the AI.
- **SC-005**: No real study data is added to the repository.

## Assumptions

- Spending caps per person or team are out of scope; costs stay visible per person and per screen.
- One shared provider per instance; offering several is out of scope.
- The deployer is responsible for the shared account's quotas and bills; the app does not track its balance.
- A person's own provider keeps working exactly as today (spec 004, spec 030).
- Choosing the shared provider is a structuring change of the spec 004 decision ("no shared instance key"); it is recorded as an update of ADR-0005.
