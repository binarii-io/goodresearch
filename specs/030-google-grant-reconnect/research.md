# Research: One-click reconnection of Google grants

## R1. Telling the reasons apart (FR-002)

**Decision**: one pure classifier in `platform/google/token-refusal.ts` reads Google's token endpoint answer and returns `refused | reauth-required | null` (null: not a grant problem). `reauth-required` when `error_subtype` is `invalid_rapt` or `error_description` mentions `invalid_rapt` / `reauth`; `refused` for any other `invalid_grant`, or a 400/401 without a body; network errors and 5xx stay `UNREACHABLE` / infrastructure errors. A stored token that cannot be decrypted is `unreadable`, decided where it is decrypted. The three values form `GrantProblem`, written in each module's domain (`ai-gateway`, `ingestion`) and once in `packages/contracts`.

**Rationale**: the three places that mint access tokens (`google-cloud.fetch-api.ts`, `google-requests.ts`, the AI SDK run through `google-auth-library` in `ai-sdk.model-runner.ts`) see the same Google body; one function keeps them consistent. `google-auth-library` throws a `GaxiosError` whose `response.data` holds the same body: the runner passes it to the classifier instead of matching `invalid_grant` in the message.

**Alternatives considered**: new `AiFailure` values (`REAUTH_REQUIRED`, `CREDENTIAL_UNREADABLE`): rejected, `AiFailure` is also the ledger outcome and the closed set of spec 004; the grant problem describes the connection, not one call. The ledger keeps `INVALID_CREDENTIAL` for these calls.

## R2. Where the person reconnects without losing their place (FR-008, FR-009)

**Decision**: Google opens in a **pop-up window** started by the click. The OAuth callback, in reconnect mode, redirects the pop-up to `/google/done?connection=…&result=…`, a small page of the app that posts the result on a `BroadcastChannel('goodresearch-google')` and closes itself (or says "you can close this window" when the browser refuses). The page that opened it never navigates: what was typed stays in memory, the screen refetches what needs the connection, and the failed action is offered again. When the pop-up is blocked, the click falls back to a full-page redirect with `returnTo` = current path; the assistant's message needs no saving, as it is stored with the conversation before the AI call, and its failed answer offers **Send again**.

**Rationale**: a pop-up keeps the whole page state for free, so no resume machinery per screen. `BroadcastChannel` is same-origin and works even when Google's cross-origin opener policy cuts `window.opener` after the round trip, which `postMessage` to the opener would not survive.

**Alternatives considered**: full-page redirect only, with resume data per screen: much more code across every screen that calls AI or Drive. `prompt=none` silent re-authorization: Google issues no new refresh token without a consent screen, and `invalid_rapt` needs the password (spec, out of scope). Hidden iframe: Google refuses to be framed.

## R3. Reusing the saved settings (FR-004 to FR-007)

**Decision**: each module's OAuth state gains `mode: 'setup' | 'reconnect'`. A reconnect start requires a saved connection and builds the Google URL with `login_hint` = saved Google account and the same scopes (Vertex: cloud-platform + openid + email; Drive: read or edit as saved). On callback in reconnect mode:

- Vertex: exchange, read the account email; another account → keep a **pending grant** (spec 004) and return `other-account`; same account → run the existing four checks on the saved project and region (the body of `checkVertex` is extracted as `verifyAndSave(accountId, refreshToken, googleAccount, project, region)`), save only when they pass and return `reconnected`; otherwise keep the pending grant and return `checks-failed`, the setup form then opens with the saved values and the pending grant (its existing behaviour).
- Drive: exchange, compare the account with the saved `externalAccount`; another account → nothing saved, `other-account`; same → replace the token, keep `access` as granted, clear the lost reason, and **keep** the folder access checks (same account, same rights), return `reconnected`.

**Rationale**: the checks and the pending grant already exist (spec 004); reconnecting is the same path without the form. Keeping folder access checks avoids re-checking every study after a token swap of the same account.

**Alternatives considered**: accepting another account on the one-click path: rejected (spec edge case, it would change whose project is billed or whose Drive is read).

## R4. Not sending the person to the setup page (FR-003)

**Decision**: `Me.aiProvider` gains `grantProblem: GrantProblem | null`. `needsAiProvider` (web) no longer redirects when `grantProblem` is set: the person stays where they are and sees the reconnect notice. `Me` also gains `drive: { status: 'none' | 'connected' | 'lost', grantProblem }` through a gate port, as `aiProvider` does (workspace module, no table read across modules).

**Rationale**: today `_authenticated.tsx` redirects every page to `/setup/ai-provider` as soon as the connection needs attention, which is the "whole setup again" the person reported.

## R5. Knowing before it fails (FR-012)

**Decision**: on the first authenticated page of a browser session (flag in `sessionStorage`), the web calls `POST /api/ai-provider/grant/check` and `POST /api/sources/google-drive/grant/check`. Each mints an access token from the stored grant: success clears a stale problem, a refusal sets it, unreachable changes nothing. No AI call, no ledger entry, no cost. A banner under the app header lists the connections needing reconnection with the action, on every page except the AI provider and Connected sources pages, which show the same notice in their content. Run screens rely on it rather than on a notice of their own.

**Rationale**: one token request per connection per session is negligible and needs no worker job.

**Alternatives considered**: a periodic worker job for all accounts: wasteful and notifies nobody until the person opens the app anyway.

## R6. Interrupted long-running work (FR-011)

**Decision**: no change to run engines. Each AI run already stores its results as each item completes and shows `AI_FAILED` with "try again"; after a reconnection the run screen shows the reconnect notice next to that failure, and starting again follows each run's existing rules. The spec's FR-011 is reworded accordingly ("keeps what it had already stored; starting again follows the run's existing rules").

**Rationale**: making six run engines resume only missing items is a separate change, not needed to fix the reported pain.

## R7. Login hint and consent prompt

**Decision**: keep `prompt=consent` and `access_type=offline` (a new refresh token needs them), add `login_hint`. Google then shows one screen on the right account; an organisation requiring a new sign-in adds its password step itself.
