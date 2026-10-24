# Implementation Plan: Per-person AI provider connection

**Branch**: `004-ai-provider-connection` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-ai-provider-connection/spec.md`

## Summary

New **ai-gateway** module (generic context "AI Gateway" of the context map): one provider connection per person (Vertex AI through the person's Google account, Anthropic or OpenAI API key), checked by a real minimal call before it is saved, encrypted at rest; a gateway port `runTask` (structured output or streamed text) used by every future AI feature; an append-only usage ledger. The web app gets a mandatory provider step after sign-in and an "AI provider" page. Google OAuth and the token cipher move from the ingestion module to `platform/` so Drive and Vertex share them. Decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google-vertex` (with its `google-auth-library` dependency for the person's OAuth client); `ai` 7 already in the stack decision (ADR-0005), added now

**Storage**: PostgreSQL: `ai_provider_connections`, `ai_pending_google_grants`, `ai_oauth_states`, `ai_usage_entries` (append-only trigger)

**Testing**: Vitest (domain: failure classification, checklist ordering, gate; use cases with a fake model runner and fake Google Cloud API; adapters against a fake `fetch`), API component tests with Testcontainers, Playwright for the provider step (fake provider in the dev stack)

**Target Platform**: unchanged

**Project Type**: web application (unchanged)

**Performance Goals**: a key check answers in < 10 s (timeout 15 s); the Vertex checklist in < 20 s

**Constraints**: credentials never leave the server in clear, never logged; one person's provider only for their own requests; no prompt or answer in the ledger

**Scale/Scope**: 2 new screens, ~8 endpoints, 1 new module

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec, plan, tasks in `specs/004-…` | ✅ |
| II. DDD pragmatic | AI Gateway is a generic context: plain handlers, a small `ProviderConnection` model with pure rules (failure classification, status transitions) | ✅ |
| III. Provider-agnostic | One `ModelRunner` port; AI SDK adapters per provider; offered providers and models are configuration | ✅ |
| IV. AI proposes | Gateway enforces schema-constrained output and the ledger for every call | ✅ |
| V. Test-first | Domain rules and use cases test-first with fakes | ✅ |
| VI. Contracts | Zod for HTTP, config, provider responses and model output | ✅ |
| VII. Privacy | Encrypted credentials (AAD = account), masked display, no prompt/answer stored, per-person use only | ✅ |
| VIII. a11y & i18n | Provider step and page in EN/FR, axe in e2e | ✅ |
| IX. Simplicity | AI SDK instead of three SDKs; checks over plain `fetch` | ✅ |

**Post-design re-check**: passed. ADR-0005 changes from "provider configured per workspace" to "per person, offered list per instance": recorded as an ADR update.

## Project Structure

### Documentation (this feature)

```text
specs/004-ai-provider-connection/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/http-api.md · contracts/configuration.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
apps/api/src/platform/
├── google/oauth.ts                 # moved from ingestion: authorization URL, code exchange, revoke; scope as parameter
└── crypto/token-cipher.ts          # moved from ingestion: purpose (HKDF info) as parameter, Drive keeps its info
apps/api/src/modules/ai-gateway/
├── index.ts                        # runTask (gateway port for other modules), gate query, compose
├── domain/                         # provider.ts (kinds, offered), failure.ts (classification), checklist.ts, usage.ts
├── application/
│   ├── ports.ts                    # ModelRunner, GoogleCloudApi, ProviderStore, UsageLedger
│   ├── commands/                   # connect-api-key, start-vertex-consent, complete-vertex-consent,
│   │                               # check-vertex-project (saves on success), test-provider, remove-provider
│   ├── queries/                    # my-provider (masked), usage-summary, provider-gate
│   └── run-task.ts                 # gateway: resolve person's provider → runner → ledger
├── infrastructure/                 # schema.ts, drizzle store, ai-sdk.model-runner.ts, google-cloud.fetch-api.ts, http.routes.ts
└── tests/                          # incl. fakes/fake-model-runner.ts, fakes/fake-google-cloud.ts
apps/web/src/
├── routes/_authenticated.tsx       # gate: no working provider → /setup/ai-provider
├── routes/setup/ai-provider.tsx    # provider step (outside the shell, signed-in)
├── routes/_authenticated/ai-provider.tsx   # "AI provider" page
└── features/ai/                    # provider-form, vertex-checklist, usage-summary
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: config (`AI_PROVIDERS`, models, timeouts, `GOOGLE_*` shared client), move Google OAuth and token cipher to `platform/`, module skeleton, schema + migration (append-only trigger), contracts and error codes, `Me.aiProvider`.
2. **US1 API keys**: failure classification (test-first), connect with check, gate in the web app, provider step.
3. **US2 Vertex AI**: consent (scope `cloud-platform`), Google Cloud checks over `fetch`, checklist UI, save on success.
4. **US3 manage**: page, test again, switch, remove (revoke), needs-attention.
5. **US4 gateway and ledger**: `runTask` (structured / streamed), ledger entries on every outcome, per-person guard, account deletion hook.
6. **Polish**: docs (README deploy section, ADR-0005 update, context map), i18n FR, e2e + axe, quickstart.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected because |
|---|---|---|
| Sensitive Google scope `cloud-platform` | Vertex AI has no narrower OAuth scope | A service-account key per person is a long-lived secret to paste and store (rejected by the product owner) |
