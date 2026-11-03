# Implementation Plan: One-click reconnection of Google grants

**Branch**: `030-google-grant-reconnect` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/030-google-grant-reconnect/spec.md`

## Summary

When Google refuses a stored grant (Vertex AI or Drive), say why (refused, organisation sign-in required, unreadable), keep the person where they are, and reconnect in one click: Google opens in a pop-up on the saved account, the callback reuses the saved project and region (Vertex AI) or access level (Drive), runs the existing checks, replaces the token only when they pass, and tells the page through a `BroadcastChannel`. The app no longer redirects to the setup page for a grant problem; a session check warns early. No change to run engines.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, React, TanStack Router/Query, Lingui, `packages/ui`. No new dependency (`BroadcastChannel` and `window.open` are browser APIs).

**Storage**: PostgreSQL. Migration `0058_google_grant_reconnect`: `grant_problem` on `ai_provider_connections`, `lost_reason` on `ingestion_source_connections`, `mode` and `popup` on both OAuth state tables ([data-model.md](data-model.md)).

**Testing**: Vitest test-first on the token refusal classifier and on the reconnect use cases with in-memory fakes (both modules); Testcontainers for the migration and stores; a dev Google grant adapter for Vertex AI (as `dev-drive.ts` for Drive) so Playwright + axe can run the reconnect flow.

**Target Platform**: The self-hosted web app.

**Project Type**: Web service + web app in a modular monolith.

**Performance Goals**: The session check costs one token request per connection, once per browser session.

**Constraints**: Google issues a new refresh token only after its consent screen (`prompt=consent`, `access_type=offline`); an organisation's re-authentication needs the person's password. Callback state single-use, 10 minutes, same account, return path inside the app.

**Scale/Scope**: Two connections per person; about 10 screens show AI or Drive failures.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | Spec 030 in the same PR. |
| II. DDD, modules | Grant problem lives in each module's domain; the classifier is in `platform/google` (shared infrastructure, already holds `oauth.ts`). `Me` gets Drive status through a gate port, as for the AI provider; no cross-module table read. |
| III. Provider-agnostic | Google stays in adapters and `platform/google`; domain code knows `GrantProblem`, not Google errors. |
| IV. AI proposes | No AI output involved. Failed calls stay in the ledger (`INVALID_CREDENTIAL`, no cost); the session check makes no AI call. |
| V. Test-first | Classifier and reconnect rules written test-first, fakes not mocks. |
| VI. Contracts | New routes and `Me` fields in Zod contracts, client regenerated; callback `result` validated on the web route. |
| VII. Privacy | No token, Google error text or email in logs; `login_hint` is the person's own saved account. Least privilege unchanged (same scopes as saved). |
| VIII. Accessible, i18n | Notices with `role="alert"`/`status`, pop-up result announced; EN + FR strings; components from `packages/ui`. |
| IX. Simplicity | No new table, no job, no run engine change; pop-up avoids per-screen resume state. |

Gate: pass, before and after design. No Complexity Tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/030-google-grant-reconnect/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/src/
├── platform/google/
│   ├── oauth.ts                     # login_hint already; unchanged scopes
│   └── token-refusal.ts             # NEW classifier (research R1) + test
├── modules/ai-gateway/
│   ├── domain/grant-problem.ts      # NEW GrantProblem
│   ├── application/ports.ts         # StoredConnection.grantProblem, GoogleGrant.authorizationUrl(loginHint), OAuth state mode/popup
│   ├── application/gateway.ts       # resolve/noteFailure set grantProblem
│   ├── application/commands/provider-commands.ts  # startGoogleReconnect, completeGoogleGrant (reconnect mode), verifyAndSave, checkGrant
│   ├── application/queries/provider-queries.ts    # gate + googleGranted use grantProblem
│   └── infrastructure/
│       ├── google-cloud.fetch-api.ts   # GrantRefused(problem) via classifier
│       ├── ai-sdk.model-runner.ts      # GaxiosError body → classifier
│       ├── dev-google.ts               # NEW dev grant adapter (e2e)
│       ├── schema.ts, ai.drizzle-store.ts, http.routes.ts
├── modules/ingestion/
│   ├── domain/drive-gateway.ts      # DriveConnectionLost(reason)
│   ├── application/connection.ts    # unreadable → markConnectionLost(…, 'unreadable')
│   ├── application/commands/source-commands.ts  # startDriveReconnect, completeDriveConnection (reconnect mode), checkDriveGrant
│   └── infrastructure/google-requests.ts, dev-drive.ts, schema.ts, store, http.routes.ts
├── modules/workspace/application/queries/get-me.ts  # aiProvider.grantProblem, drive gate
└── drizzle/0058_google_grant_reconnect.sql

packages/contracts/src/google-grants.ts, me.ts

apps/web/src/
├── features/google/
│   ├── reconnect.ts                 # useGoogleReconnect: pop-up, BroadcastChannel, fallback redirect, query invalidation
│   ├── reconnect-notice.tsx         # reason + "Reconnect Google" (+ "Use another account" on other-account)
│   └── grant-banner.tsx             # session check + banner
├── routes/google.done.tsx           # NEW pop-up landing page
├── routes/_authenticated.tsx        # no redirect on grantProblem; banner
├── features/assistant/panel.tsx     # notice + "Send again" with the kept message
├── features/ai/provider-forms.tsx, routes/_authenticated/ai-provider.tsx, routes/setup.ai-provider.tsx
├── features/ingestion/source-panel.tsx, routes/_authenticated/sources.tsx
└── run screens showing AI_FAILED / AI_PROVIDER_REQUIRED (analysis, quality, synthesis, fieldwork, enrichment, survey themes): notice when Me has a grant problem
```

**Structure Decision**: existing modules only; one new web feature folder `features/google` for the shared reconnect hook and notices.

## Documentation to update in the same PR

- `docs/adr/0005-provider-agnostic-infrastructure.md`: section "Update spec 030": grant problems, reconnect in a pop-up with `BroadcastChannel`, no silent re-consent.
- `docs/domain/context-map.md`: AI provider connection and Source connection gain the grant problem and "Reconnect Google"; glossary EN/FR ("Reconnect Google" / « Reconnecter Google », "Google needs you to sign in again" / « Google vous demande de vous reconnecter »).
- READMEs of `ai-gateway` and `ingestion` modules if they describe connection states.

## Complexity Tracking

None.
