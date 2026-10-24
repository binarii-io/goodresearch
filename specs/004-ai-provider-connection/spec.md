# Feature Specification: Per-person AI provider connection

**Feature Branch**: `004-ai-provider-connection`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Add an AI provider. At sign-in, ask the person which provider they want to use: Google Vertex AI natively, an Anthropic API key or an OpenAI API key. We need it for the agent that helps define the interview guide." The interview guide assistant itself is the next feature (005); this feature delivers the provider connection it will use, and the AI Gateway every AI call goes through (constitution IV).

## Clarifications

### Session 2026-10-24

- Q: One feature or two? → A: Two. This one connects a provider per person; 005 builds the interview guide assistant on top of it.
- Q: When is the provider asked? → A: At first sign-in, and it is mandatory: a signed-in person without a working provider cannot use the app until they set one up. This applies to existing accounts at their next visit.
- Q: How does the person use Vertex AI? → A: With their own Google account, as in the prototype: a separate Google consent (Google Cloud access), plus their Google Cloud project and region, checked before saving (API enabled, permission, a real minimal call).
- Q: Does the deployer control the offered providers? → A: Yes. The configuration lists the offered providers (all three by default). Every person uses their own credentials; there is no shared instance key.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose and connect a provider with an API key (Priority: P1)

After signing in for the first time, a person lands on a "Choose your AI provider" step before anything else. It explains, in plain words, that goodresearch's AI assistants run on the person's own provider account, so the costs and the data processing are theirs, and that the key is stored encrypted. They choose Anthropic or OpenAI, paste their API key and confirm. The app makes a minimal real call to check the key, then saves it and lets them in. Until a working provider is saved, every signed-in page leads back to this step.

**Why this priority**: Every AI feature, starting with the interview guide assistant, depends on it; API keys are the simplest path.

**Independent Test**: Sign in with a new account, get the provider step, try a wrong key (refused with a clear reason), then a valid key (accepted), reach the home page; sign out and in again without being asked again.

**Acceptance Scenarios**:

1. **Given** a signed-in person without a provider, **When** they open any page of the app, **Then** they are taken to the provider step, and they can only choose a provider or sign out.
2. **Given** the provider step, **When** the person looks at it, **Then** it shows only the providers the deployer offers, each with a one-line description and a link to where to get a key or set up the account.
3. **Given** an Anthropic or OpenAI choice, **When** the person submits a key, **Then** the app checks it with a minimal real call and saves it only if the call succeeds; the key is never shown again in full (only its last 4 characters).
4. **Given** a key that is wrong, revoked, without credit or rate limited, **When** the check runs, **Then** the step stays open with the reason in plain words (invalid key, no credit or quota, provider unreachable) and what to do.
5. **Given** a person with a working provider, **When** they sign in again, **Then** they are not asked again.

---

### User Story 2 - Connect Google Vertex AI with one's Google account (Priority: P1)

A person who chooses Vertex AI is sent to Google to grant goodresearch access to Google Cloud on their behalf (a separate consent from sign-in and from Google Drive). Back in the app, they enter their Google Cloud project ID and pick a region. The app runs a short checklist and shows each check with its result and, when it fails, how to fix it: project ID format, access to the project and Vertex AI API enabled, permission to call models, and a real minimal call (which proves billing and model availability in the region). The provider is saved when every blocking check passes.

**Why this priority**: Vertex AI is the provider the product owner's organisation uses; it is offered natively.

**Independent Test**: With a test Google Cloud project, choose Vertex AI, consent, enter the project and region, see the checklist pass, reach the home page. With a project where the API is disabled, see the failing check and its fix.

**Acceptance Scenarios**:

1. **Given** the provider step, **When** the person chooses Vertex AI, **Then** the app explains the consent and sends them to Google; refusing the consent brings them back to the step with a message, nothing saved.
2. **Given** the consent was granted, **When** the person enters a project ID and a region, **Then** the checklist runs and shows, per check, passed / failed / not checkable, with the reason and the fix (for example "Enable the Vertex AI API in this project", with a link).
3. **Given** a blocking check fails, **When** the person fixes it in Google Cloud, **Then** they can run the checklist again without consenting again.
4. **Given** every blocking check passes, **When** the person confirms, **Then** the provider is saved and they reach the app.
5. **Given** the Google access is later revoked by the person in their Google account, **When** an AI call fails for that reason, **Then** the provider is marked as needing attention and the person is taken back to the provider step at their next page load.

---

### User Story 3 - See, test, change or remove one's provider (Priority: P2)

From the account menu, "AI provider" shows the current provider, its model, the masked key or the Google Cloud project and region, when it was last checked, and the usage recorded so far (number of calls and tokens). The person can test it again, switch to another offered provider, or remove it; removing it brings back the mandatory provider step.

**Why this priority**: Keys expire and people change accounts; it is needed soon after launch but not for the first AI feature to work.

**Independent Test**: Open "AI provider", test it, switch from Anthropic to OpenAI, remove it and get the provider step again.

**Acceptance Scenarios**:

1. **Given** a saved provider, **When** the person opens "AI provider", **Then** they see the provider, model, masked credential or project and region, last successful check, and their recorded usage.
2. **Given** the page, **When** they choose "Test again", **Then** the minimal call runs and the result is shown; a failure marks the provider as needing attention.
3. **Given** the page, **When** they switch provider and the new one passes its check, **Then** it replaces the old one, whose credentials are deleted.
4. **Given** the page, **When** they remove the provider and confirm, **Then** the credentials are deleted and they are taken to the provider step; for Vertex AI, the page links to the person's Google account permissions, where Google access can be withdrawn.

---

### User Story 4 - Every AI call is recorded (Priority: P2)

Every call to a provider, including the checks of this feature, goes through one gateway that uses the person's provider, constrains the output to a schema when the task asks for structured data, and records a usage entry: who, which task, which provider and model, tokens in and out, duration, success or failure reason. Entries cannot be changed or deleted. Nothing of the prompt or the answer is recorded.

**Why this priority**: Constitution IV requires it; the guide assistant (005) will rely on it from its first call.

**Independent Test**: Run a key check and a Vertex AI check; read the usage entries (person, task "provider-check", provider, model, tokens, outcome); try to modify one in the database and see it refused.

**Acceptance Scenarios**:

1. **Given** any AI call, **When** it completes or fails, **Then** exactly one usage entry is recorded, without prompt or answer text.
2. **Given** a usage entry, **When** anyone tries to change or delete it, **Then** the change is refused.
3. **Given** the person's provider is unusable (key revoked, consent withdrawn), **When** a call fails for that reason, **Then** the provider is marked as needing attention and the failure reason is recorded.

### Edge Cases

- The deployer offers no provider (empty list): the provider step is not shown and AI features say that AI is not configured on this instance; nothing else is blocked.
- The deployer removes a provider a person already uses: at their next page load they are asked to choose an offered one.
- An admin signing in on a fresh instance: the provider step comes before the "create the first team" step.
- The provider is unreachable during the check (timeout, outage): the step says so and allows retrying; nothing is saved.
- A key pasted with spaces or line breaks: trimmed before checking.
- Two browser tabs: saving in one is picked up by the other at its next page load.
- Account deletion (spec 001 anonymisation): the provider credentials are deleted; usage entries stay, attached to the anonymised account.
- The Google Cloud project has the API enabled but the model is not available in the chosen region: the real-call check fails with "model not available in this region; choose another region".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The deployer MUST be able to choose which providers are offered (Vertex AI, Anthropic, OpenAI; all three by default) and the model used for each, with sensible defaults.
- **FR-002**: A signed-in, active person without a working provider MUST be taken to the provider step from every signed-in page, except sign-out, when at least one provider is offered.
- **FR-003**: The provider step MUST explain that AI runs on the person's own provider account (costs and data processing), that credentials are stored encrypted, and link to each provider's setup page.
- **FR-004**: API keys (Anthropic, OpenAI) MUST be checked with a minimal real call before being saved; only a successful check saves them.
- **FR-005**: Vertex AI MUST use the person's own Google account through a separate, revocable consent, plus a Google Cloud project ID and a region chosen from a list; the checklist of User Story 2 MUST pass its blocking checks before saving.
- **FR-006**: Credentials (API keys, Google refresh tokens) MUST be stored encrypted, never returned by the API, never logged, and shown only masked (last 4 characters) or as project and region.
- **FR-007**: Check failures MUST be explained in plain words with the action to take, without exposing raw provider errors that may contain secrets.
- **FR-008**: A person MUST be able to see, test again, switch and remove their provider; switching or removing deletes the previous credentials. Google access is not revoked by the app: Google revokes a whole app grant at once, which would also cut a new Vertex AI token and Google Drive; the page links to the person's Google account permissions instead.
- **FR-009**: A provider whose calls fail for an authorisation reason MUST be marked as needing attention, which brings back the provider step at the next page load.
- **FR-010**: Every AI call MUST go through the AI Gateway, use the calling person's provider, and record exactly one append-only usage entry (person, task, provider, model, input and output tokens, duration, outcome) without prompt or answer text.
- **FR-011**: The AI Gateway MUST offer to the other modules one way to run a task: with a schema-constrained structured output, or as streamed text, so the guide assistant (005) can use it without knowing the provider.
- **FR-012**: A person's provider MUST only ever be used for that person's own actions, never for another person's request or a background job started by someone else.
- **FR-013**: Account deletion MUST delete the provider credentials; usage entries are kept.
- **FR-014**: Every user-facing text MUST be available in English and French.

### Key Entities

- **AI provider connection**: one per person; provider (vertex / anthropic / openai), model, encrypted credential (API key or Google refresh token), Google Cloud project and region for Vertex AI, status (working / needs attention), last successful check, created and updated dates.
- **Usage entry**: append-only record of one AI call: person, task, provider, model, input and output tokens, duration, outcome (success or failure reason), date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person with a valid Anthropic or OpenAI key goes from first sign-in to the home page in under 1 minute.
- **SC-002**: A person with a ready Google Cloud project connects Vertex AI in under 3 minutes, consent included.
- **SC-003**: 100 % of AI calls, including checks, produce exactly one usage entry; 0 entries contain prompt or answer text.
- **SC-004**: No credential appears in an API response, a log line or a usage entry (checked by tests on every endpoint of this feature and on logs).
- **SC-005**: Every check failure shown to a person names its cause among a fixed list and gives an action; no raw provider error text is shown.
- **SC-006**: 0 automated accessibility violations (WCAG 2.2 AA) on the provider step and the "AI provider" page, in English and French.

## Assumptions

- The model is chosen by the deployer per provider (configuration, with defaults suited to conversational assistants); people do not pick models in this version.
- Vertex AI uses the same Google OAuth client as Google Drive (one Google client per instance), with its own consent for Google Cloud access; the deployer enables the needed API scopes on that client.
- No spending limit or budget is enforced by the app in this version; usage is visible to the person (User Story 3).
- Admins do not see other people's credentials; an admin-facing usage overview is a later feature.
- Local models and other providers can be added later as adapters behind the same gateway; they are out of scope.
