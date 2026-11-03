# Tasks: One-click reconnection of Google grants

**Input**: Design documents from `specs/030-google-grant-reconnect/`

**Tests**: Domain rules are test-first (constitution V): each test task comes before its code and must fail first.

**Format**: `[ID] [P?] [Story] Description`. `[P]`: different files, no incomplete dependency.

## Phase 1: Setup

- [X] T001 Add to docs/domain/context-map.md: grant problem (`refused | reauth-required | unreadable`) on AI provider connection and Source connection, "Reconnect Google" keeps the saved settings and the same Google account; glossary (Reconnect Google/Reconnecter Google, Google needs you to sign in again/Google vous demande de vous reconnecter, Use another account/Utiliser un autre compte)
- [X] T002 [P] Add a section "Update spec 030" to docs/adr/0005-provider-agnostic-infrastructure.md: grant problems classified from Google's token answer (research R1), reconnect in a pop-up with `BroadcastChannel` and full-page fallback (R2), no silent re-consent (`prompt=none` gives no refresh token; `invalid_rapt` needs the password)

## Phase 2: Foundational

- [X] T003 Write failing tests, then apps/api/src/platform/google/token-refusal.ts: `classifyTokenRefusal({ status, body })` → `'refused' | 'reauth-required' | null`; `reauth-required` when `error_subtype === 'invalid_rapt'` or `error_description` mentions `invalid_rapt`/`reauth`; `refused` for any other `invalid_grant` and for 400/401 without a usable body; `null` for 5xx and anything else (network errors never reach it)
- [X] T004 Write apps/api/drizzle/0058_google_grant_reconnect.sql through `db:generate`, after 0057: `ai_provider_connections.grant_problem text null`, `ingestion_source_connections.lost_reason text null`, on `ai_oauth_states` and `ingestion_oauth_states` "`mode text not null default 'setup'`" (`'setup' | 'reconnect'`) and "`popup boolean not null default false`"; check constraints on the three text columns' values; update the Drizzle schemas in apps/api/src/modules/ai-gateway/infrastructure/schema.ts and apps/api/src/modules/ingestion/infrastructure/schema.ts
- [X] T005 [P] Write packages/contracts/src/google-grants.ts (`GrantProblem`, `ReconnectStart { returnTo, popup }`, `ReconnectResult` = `reconnected | checks-failed | other-account | missing-right | cancelled | error`, `GrantCheck`), add `aiProvider.grantProblem` and `drive { status: 'none' | 'connected' | 'lost', grantProblem, account }` to packages/contracts/src/me.ts, export from index.ts
- [X] T006 [P] Add `GrantProblem` to apps/api/src/modules/ai-gateway/domain/grant-problem.ts and apps/api/src/modules/ingestion/domain/drive-gateway.ts (`DriveConnectionLost` takes a `reason: GrantProblem`)
- [X] T007 AI Gateway grant problem: `StoredConnection.grantProblem` in apps/api/src/modules/ai-gateway/application/ports.ts and the store (apps/api/src/modules/ai-gateway/infrastructure/ai.drizzle-store.ts, tests/fakes/in-memory-ai.ts), `setStatus` takes it; `ProviderCallError` carries an optional `grantProblem`; failing tests first in apps/api/src/modules/ai-gateway/tests/, then: `google-cloud.fetch-api.ts` `accessToken` uses the classifier (`INVALID_CREDENTIAL` + problem; null → `UNREACHABLE`), `ai-sdk.model-runner.ts` reads `GaxiosError.response.data` through the classifier instead of matching the message, `gateway.ts` `resolve` sets `unreadable` on a decrypt failure (vertex only) and `noteFailure` stores the problem; saving a working connection clears it
- [X] T008 Ingestion grant problem: failing tests first, then `google-requests.ts` throws `DriveConnectionLost(reason)` from the classifier (null → infrastructure error, not lost), `connection.ts` `readRefreshToken` marks `unreadable`, every `markConnectionLost(accountId)` call (access.ts, run-inventory.ts, source-commands.ts, study-files.ts) passes the reason; store and in-memory fake keep `lost_reason`, cleared on `saveConnection`; dev-drive.ts throws with `refused`
- [X] T009 `Me`: `gate` in apps/api/src/modules/ai-gateway/application/queries/provider-queries.ts returns `grantProblem` (vertex only; `null` with status `none` when the deployer no longer offers the provider, tested); a Drive gate in ingestion's index.ts returns `{ status, grantProblem, account }`; apps/api/src/modules/workspace/application/queries/get-me.ts takes both ports (no cross-module table read); `googleGranted` in provider-queries.ts uses `grantProblem` instead of `lastFailure`
- [X] T010 Web gate: `needsAiProvider` in apps/web/src/features/workspace/session.ts is false when `aiProvider.grantProblem` is set (no redirect to `/setup/ai-provider`); run `pnpm generate`

**Checkpoint**: grant problems are recorded with their reason and no longer send the person to the setup page.

## Phase 3: US1 - Reconnect Vertex AI in one click (P1) 🎯 MVP

**Independent test**: a saved Vertex AI connection with a refused grant; reconnect from the AI provider page; no form shown, connection working with the same project and region, back on the same page.

- [X] T011 [US1] Write failing use-case tests with fakes, then extract `verifyAndSave(accountId, refreshToken, googleAccount, project, region)` from `checkVertex` in apps/api/src/modules/ai-gateway/application/commands/provider-commands.ts (same four checks, save only when they pass, delete the pending grant on success); `checkVertex` calls it unchanged
- [X] T012 [US1] Write failing tests, then `startGoogleReconnect({ actor, returnTo, popup })`: `AI_PROVIDER_REQUIRED` without a saved Vertex AI connection, OAuth state with `mode: 'reconnect'`, `popup`, `returnTo` through `safeReturnPath`, URL with `loginHint` = saved `googleAccount` (add `loginHint` to `GoogleGrant.authorizationUrl` in ports.ts and infrastructure/module.ts)
- [X] T013 [US1] Write failing tests, then `completeGoogleGrant` in reconnect mode: exchange; scope missing → `missing-right`, nothing saved; email ≠ saved `googleAccount` → save a pending grant, `other-account`; else `verifyAndSave` on the saved project and region → `reconnected`, or keep a pending grant → `checks-failed` (the previous connection unchanged); setup mode unchanged
- [X] T014 [US1] Routes in apps/api/src/modules/ai-gateway/infrastructure/http.routes.ts per contracts/api.md: `POST /api/ai-provider/google/reconnect`; the callback in reconnect mode redirects to `/google/done?connection=vertex&result=R` when `popup`, else `returnTo?google=R` (Google `error` → `cancelled`); component test in apps/api/tests/ai-provider.component.test.ts with the OIDC test support
- [ ] T015 [P] [US1] *(Open: component tests inject the Google adapters instead; needed only for T030.)* Write apps/api/src/modules/ai-gateway/infrastructure/dev-google.ts (dev only, like ingestion's dev-drive.ts): consent page that redirects straight back, `dev-vertex-` refresh tokens, a marked token answering `invalid_grant` or `invalid_rapt`; wire it in infrastructure/module.ts when `config.driveFake` is on and no Google adapter is injected (same rule as `createDevDrive` in apps/api/src/modules/ingestion/infrastructure/module.ts)
- [X] T016 [US1] Write apps/web/src/features/google/reconnect.ts: `useGoogleReconnect(connection: 'vertex' | 'drive')` opens `window.open` synchronously on click, posts the start route with `popup: true` and sets the pop-up's location; listens on `BroadcastChannel('goodresearch-google')` for its own result and exposes `{ start, pending, result }`; a separate `useGoogleChannel()` mounted once in apps/web/src/routes/_authenticated.tsx invalidates `Me`, the AI provider page and sources queries in every open tab; when `window.open` returns null, starts with `popup: false` and `returnTo` = current path and assigns `location`
- [X] T017 [US1] Write apps/web/src/routes/google.done.tsx: signed-in, no layout, validates `connection` and `result` with the contract schema (anything else → `error`), posts on the channel, calls `window.close()`, otherwise shows "You can close this window" with a button
- [X] T018 [US1] *(The check call carries a `google-reconnect:*` ledger ref; the callback sends its cost to `/google/done` (or the page, without a pop-up) and the notice shows it.)* Write apps/web/src/features/google/reconnect-notice.tsx from `packages/ui`: reason per `GrantProblem` (refused: "Google no longer accepts goodresearch's access"; reauth-required: "Your organisation asks you to sign in to Google again"; unreadable: "The saved access can no longer be read"), the saved account, one **Reconnect Google** button with pending state; after a Vertex AI `reconnected`, the cost of the check call (its `provider-check` usage entry, read through the AI provider page query) is shown in the notice (AGENTS.md: cost in the screen that uses it); results announced in a `role="status"` region: `checks-failed` → link to `/setup/ai-provider?provider=vertex`, `other-account` → "Use another account" link to the full setup, `missing-right` and `cancelled` → try again
- [X] T019 [US1] Use the notice on apps/web/src/routes/_authenticated/ai-provider.tsx (replaces the link to setup for a grant problem), apps/web/src/features/ai/provider-forms.tsx (`FailureNotice` for vertex + `INVALID_CREDENTIAL`) and apps/web/src/routes/setup.ai-provider.tsx (messages for `google=checks-failed|other-account` in the full-page fallback)
- [X] T020 [US1] Run `pnpm --filter @goodresearch/web i18n:extract` and translate the new strings in apps/web/src/locales/fr per the glossary

**Checkpoint**: US1 works on the AI provider page; MVP.

## Phase 4: US2 - Resume the interrupted work (P1)

**Independent test**: type a message, make the grant refused, send; reconnect; the message is still there and **Send again** sends it.

- [X] T021 [US2] In apps/web/src/features/assistant/panel.tsx `Failure`: for `INVALID_CREDENTIAL` with `Me.aiProvider.grantProblem`, show the reconnect notice instead of the link to the AI provider page; keep `Live.personText`; after `reconnected`, show **Send again** that resends it; nothing is sent without that click
- [X] T022 [US2] *(No browser storage needed: the assistant stores the person's message with the conversation before calling the AI, so after a full-page round trip the last failed answer offers **Send again**.)* Full-page fallback: before assigning `location`, `useGoogleReconnect` stores the assistant draft (conversation id, text) in `sessionStorage` (try/catch); apps/web/src/features/assistant/state.tsx restores it once on load and deletes it; start dialogs of long-running actions are not saved (spec Assumptions)
- [X] T023 [US2] *(Done through one banner above every page (`GrantBanner`, T029) instead of a wrapper per run screen: the screen where a run failed shows the reconnect action at its top; study Drive screens point to it.)* On the run screens, show the reconnect notice next to `AI_FAILED` / `AI_PROVIDER_REQUIRED` when `Me.aiProvider.grantProblem` is set, keeping their existing "try again": apps/web/src/features/analysis, features/quality, features/synthesis, features/fieldwork, features/enrichment, features/surveys (themes) — one shared `AiReconnectIfNeeded` wrapper in apps/web/src/features/google/reconnect-notice.tsx
- [X] T024 [US2] Integration test in apps/api/tests/ai-provider.component.test.ts: a call with a refused grant is recorded in the ledger with `INVALID_CREDENTIAL` and no cost (FR-010), and sets `grant_problem`

## Phase 5: US3 - Same for Google Drive (P2)

**Independent test**: a Drive connection with a refused grant; open a study with a folder; reconnect there; back on the study, folder loaded.

- [X] T025 [US3] Write failing use-case tests with fakes, then in apps/api/src/modules/ingestion/application/commands/source-commands.ts: `startDriveReconnect({ actor, returnTo, popup })` (`DRIVE_NOT_CONNECTED` without a saved connection, saved `access`, `loginHint` = saved `externalAccount`, state `mode: 'reconnect'`) and `completeDriveConnection` in reconnect mode: scope missing → `missing-right`; account ≠ saved → `other-account`, nothing saved; same → token replaced, `status: 'connected'`, `lost_reason` null, folder access checks **kept** (no `clearFolderAccessOf`)
- [X] T026 [US3] Routes in apps/api/src/modules/ingestion/infrastructure/http.routes.ts: `POST /api/sources/google-drive/reconnect`; callback in reconnect mode redirects to `/google/done?connection=drive&result=R` or `returnTo?drive=R`; component test in apps/api/tests/sources.component.test.ts with dev-drive
- [X] T027 [US3] Web: the notice for Drive in apps/web/src/features/ingestion/source-panel.tsx (`ACCESS_LOST` and the lost state, instead of "reconnect from Connected sources") and apps/web/src/routes/_authenticated/sources.tsx; `DRIVE_NOT_CONNECTED` messages in features/fieldwork/labels.ts and features/enrichment/labels.ts point to the notice when `Me.drive.status` is `lost`; after `reconnected` the folder queries refetch; run i18n extract and translate the new strings in apps/web/src/locales/fr

## Phase 6: US4 - Know before it fails (P3)

**Independent test**: refused grant, open the app; banner without running anything; gone after reconnecting.

- [X] T028 [P] [US4] Write failing tests, then `checkGrant(actor)` in provider-commands.ts and `checkDriveGrant(actor)` in source-commands.ts: mint an access token; success clears a problem and sets the connection working (vertex) or connected (drive); a refusal records the problem; unreachable changes nothing; no ledger entry; routes `POST /api/ai-provider/grant/check` and `POST /api/sources/google-drive/grant/check` returning `GrantCheck`
- [X] T029 [US4] Write apps/web/src/features/google/grant-banner.tsx and mount it in apps/web/src/routes/_authenticated.tsx: once per browser session (flag in `sessionStorage`, try/catch) call both checks, then show one non-blocking banner per connection with a grant problem in `Me`, with the reconnect action; run i18n extract and translate the new strings in apps/web/src/locales/fr

## Phase 7: Polish

- [ ] T030 *(Open: needs T015.)* Playwright + axe in apps/web/e2e/google-reconnect.spec.ts on the dev stack: Vertex AI refused → notice in the assistant → reconnect in the pop-up → **Send again**; Drive refused → reconnect from the study; pop-up blocked → full-page round trip restores the draft
- [X] T031 [P] Update the READMEs of apps/api/src/modules/ai-gateway and apps/api/src/modules/ingestion where they describe connection states
- [ ] T032 *(`pnpm check`, unit and integration tests, generate and i18n done; quickstart by hand open.)* Run `pnpm check`, `pnpm test`, `pnpm generate`, i18n extract; run quickstart.md by hand on the dev stack

## Dependencies

- Phase 2 blocks every story. T003 before T007 and T008; T004 and T005 before T007 to T010.
- US1 (T011–T020) before US2 (T021–T023 reuse the notice and hook).
- US3 needs Phase 2 and T016–T018 (hook, done page, notice); independent of US2.
- US4 needs Phase 2 and the notice (T018).

## Parallel opportunities

- T001 ∥ T002; T005 ∥ T006 (after T004); T007 ∥ T008 once T003 is done.
- T015 ∥ T011–T014; T025–T026 (API of US3) ∥ US1 web tasks; T028 ∥ T027.

## Implementation strategy

MVP = Phases 1–3: a Vertex AI grant problem no longer sends the person to the setup page and is fixed in one click with the saved project and region. Then US2 (nothing lost), US3 (Drive), US4 (early warning), each shippable on its own within the same PR.
