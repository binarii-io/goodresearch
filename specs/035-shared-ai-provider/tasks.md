---
description: "Task list for spec 035: a shared AI provider for the instance"
---

# Tasks: A shared AI provider for the instance

**Input**: Design documents from `specs/035-shared-ai-provider/`

**Tests**: test-first (constitution V) on settings, resolution, failures and the page.

## Phase 1: Setup

None (no new dependency).

## Phase 2: Foundational

- [X] T001 Test first then implement the `AI_SHARED_*` settings in packages/config/src/env.ts (+ env.test.ts): `AI_SHARED_PROVIDER` (`vertex | anthropic | openai`, `fake` only with `AI_FAKE_PROVIDER`), `AI_SHARED_VERTEX_PROJECT` (valid project id, required for vertex), `AI_SHARED_VERTEX_REGION` (default `global`), `AI_SHARED_VERTEX_KEY` (JSON with `client_email` and `private_key`, optional), `AI_SHARED_API_KEY` (required for anthropic / openai), `AI_SHARED_TEAMS` (ids); `config.ai.shared` or null
- [X] T002 Domain: shared Vertex credential in apps/api/src/modules/ai-gateway/domain/provider.ts; `SHARED_PROVIDER_UNAVAILABLE` in domain/failure.ts and the `AiFailure` enum of packages/contracts/src/ai.ts (an AI failure, shown with its reason and action, not an HTTP error code)
- [X] T003 Migration 0059: `ai_usage_entries.shared boolean not null default false` (schema.ts, `pnpm --filter @goodresearch/api db:generate`), store writes it

## Phase 3: User Story 1 - Use the AI without connecting anything (P1)

- [X] T004 [US1] Test first in apps/api/src/modules/ai-gateway/tests/shared-provider.test.ts: own > shared > required; usage entries carry `shared`; `providerOf` and `gate` (required false when the shared provider serves the person); a shared failure is logged, never stored on the person, and reaches the caller as `SHARED_PROVIDER_UNAVAILABLE` (authorisation, quota, API), rate limit and timeout unchanged
- [X] T005 [US1] Implement in application/gateway.ts, ports.ts (`shared` config, `teamIdsOf`, `log`), queries/provider-queries.ts
- [X] T006 [US1] Runner: Vertex with a service account key or the instance identity (`googleAuthOptions`), in infrastructure/ai-sdk.model-runner.ts; fake runner accepts the shared fake
- [X] T007 [US1] Wiring: config → module, `teamIdsOf` from Workspace, log, in apps/api/src/modules/ai-gateway/infrastructure/module.ts and apps/api/src/compose.ts
- [X] T008 [US1] Web: `SHARED_PROVIDER_UNAVAILABLE` message (EN/FR) in apps/web/src/features/workspace/errors.ts and wherever AI failures are labelled

## Phase 4: User Story 2 - Know and choose which provider is used (P2)

- [X] T009 [US2] Test first then implement `AiProviderPage.shared` and `serving` (packages/contracts, provider-queries page), client regenerated
- [X] T010 [US2] Web provider page: says shared or own, kind and model; "connect your own" stays; removing one's own goes back to shared; setup step skipped when not required (apps/web/src/routes/setup.ai-provider.tsx and the settings page)

## Phase 5: User Story 3 - Limit the shared provider to some teams (P3)

- [X] T011 [US3] Tests (in T004's file): with `teams`, a member uses it, a non-member is required to connect, `shared.open` false on their page

## Phase 6: Polish

- [X] T012 [P] ADR-0005 update, README configuration, .env.example, context map (shared AI provider, FR « fournisseur IA partagé »)
- [X] T013 E2E: not added — a shared provider on the dev stack would remove the provider step the spec 004 e2e covers; the gateway and gate tests (shared-provider.test.ts) cover the flow
- [X] T015 Review: one `servingOf` for the resolution order (gateway, gate, page, cost estimates); a streamed failure reported the same from `parts` and `done`, logged once; the shared card counts the shared calls only; the key checked with Zod, the region's format checked; README: `AI_PROVIDERS` empty leaves only the shared provider. Not done: checking at startup that `AI_SHARED_TEAMS` ids exist (teams live in the database), caching team reads across a request (two small reads, only when teams are set)
- [X] T014 Run `pnpm check`, all unit tests, AI gateway integration tests; restart the local stack

## Dependencies

T001–T003 before US1. T004 before T005. US2 after T005. US3 tests with T004.

## Implementation Strategy

One PR; US1 is the MVP.
