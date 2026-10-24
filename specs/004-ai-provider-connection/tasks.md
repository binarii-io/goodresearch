---
description: "Task list for 004-ai-provider-connection"
---

# Tasks: Per-person AI provider connection

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Foundational

- [X] T001 Add `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google-vertex` to the catalog (versions older than the 3-day release age) and `apps/api/package.json`
- [X] T002 Config in `packages/config/src/env.ts` per [contracts/configuration.md](contracts/configuration.md): `ai: { offered, models, timeoutMs, fake }`, `google` client (with `GOOGLE_DRIVE_*` fallback); tests in `packages/config`
- [X] T003 Move `google-oauth.ts` to `apps/api/src/platform/google/oauth.ts` (scope and callback path as parameters) and `token-cipher.ts` to `apps/api/src/platform/crypto/token-cipher.ts` (HKDF info as parameter; Drive keeps `goodresearch/source-connections/v2`); ingestion uses them; existing tests still green
- [X] T004 Contracts in `packages/contracts/src/ai.ts` (Provider, ProviderView, Check, FailureCode, requests) and errors `AI_PROVIDER_NOT_OFFERED`, `AI_CHECK_FAILED`, `AI_PROVIDER_REQUIRED`, `GOOGLE_NOT_CONFIGURED`, `GOOGLE_GRANT_REQUIRED`; `Me.aiProvider`
- [X] T005 Module skeleton `apps/api/src/modules/ai-gateway/` (index, ports, compose wiring), schema + migration (`ai_provider_connections`, `ai_pending_google_grants`, `ai_oauth_states`, `ai_usage_entries` with immutable trigger in custom SQL)

## Phase 2: US1 — API keys (P1) 🎯 MVP

- [X] T006 [P] [US1] Test-first `domain/failure.ts`: classification of provider errors into the closed set (R4), authorisation codes
- [X] T007 [P] [US1] Test-first use case `connect-api-key` with a fake runner: trims the key, checks with a minimal call, saves only on success, hint = last 4, ledger entry on success and failure
- [X] T008 [US1] `infrastructure/ai-sdk.model-runner.ts` (Anthropic, OpenAI, Vertex via auth client, fake when enabled) with error mapping; adapter tests with a fake `fetch`
- [X] T009 [US1] Routes `GET /api/ai-provider`, `PUT /api/ai-provider/api-key`; `Me.aiProvider`; API component tests (no credential in any response or log)
- [X] T010 [US1] Web: gate in `_authenticated.tsx`, route `setup.ai-provider.tsx` (`/setup/ai-provider`) (provider choice, explanation, key form, failure messages + actions), sign-out on the step; first-team step after it
- [X] T011 [US1] e2e: fresh admin → provider step → `test-invalid` refused → `test-ok` accepted → first team; axe

## Phase 3: US2 — Vertex AI (P1)

- [X] T012 [P] [US2] Test-first `domain/checklist.ts`: order, blocking rules, project ID format, regions list
- [X] T013 [US2] `google-cloud.fetch-api.ts` (Service Usage, testIamPermissions) with fake `fetch` tests
- [X] T014 [US2] Use cases `start-vertex-consent`, `complete-vertex-consent` (pending grant, 1 h), `check-vertex-project` (saves on success, revokes nothing on failure); routes and component tests with fake Google
- [X] T015 [US2] Web: Vertex option → consent → project + region form → checklist with per-check status, reason and fix links; re-run without new consent

## Phase 4: US3 — Manage (P2)

- [X] T016 [US3] Use cases `test-provider` (needs-attention on authorisation failure, back to working on success), `remove-provider` (delete + revoke Google), switch = connect over an existing one (old credential deleted, Google revoked)
- [X] T017 [US3] Web page `_authenticated/ai-provider.tsx` (PageTitle, view, usage, test, switch, remove with confirmation); account menu entry
- [X] T018 [US3] e2e: test again, remove → step again

## Phase 5: US4 — Gateway and ledger (P2)

- [X] T019 [US4] Test-first `run-task.ts`: resolves the caller's connection only (FR-012), `AI_PROVIDER_REQUIRED` without one, structured output validated with Zod, streamed text, one ledger entry per call (tokens, duration, outcome), needs-attention on authorisation failure
- [X] T020 [US4] Account deletion hook: delete credentials and revoke Google (workspace module calls the ai-gateway port); integration test of the immutable ledger

## Phase 6: Polish

- [X] T021 i18n FR; docs: README (deploy: AI providers, Google client scopes and redirect URIs), ADR-0005 update (per-person provider, offered list), context map (AI provider connection, usage entry), `apps/api` env example, dev compose (`AI_FAKE_PROVIDER=true`)
- [X] T022 `pnpm check`, `pnpm test`, `pnpm e2e`; quickstart with a real Anthropic or OpenAI key if available

## Dependencies & execution order

Phase 1 blocks all. US1 before US2 (runner, gate, step). US3 and US4 after US1. Polish last.
