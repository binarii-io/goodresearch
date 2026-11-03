# API contract: One-click reconnection of Google grants

Schemas in `packages/contracts/src/google-grants.ts` (`GrantProblem`, `ReconnectStart`, `ReconnectResult`, `GrantCheck`) and `me.ts` (new fields). Every route requires a signed-in account and acts only on that account's own connections.

## Vertex AI (AI Gateway)

| Route | Body | Result | Refusals |
|---|---|---|---|
| `POST /api/ai-provider/google/reconnect` | `{ returnTo: string, popup: boolean }` | `{ url }` (Google, `login_hint` = saved account) | `AI_PROVIDER_REQUIRED` (no saved Vertex AI connection), `AI_PROVIDER_NOT_OFFERED`, `GOOGLE_NOT_CONFIGURED` |
| `POST /api/ai-provider/grant/check` | — | `GrantCheck` | — |
| `GET /api/ai-provider/google/callback` (existing) | — | in reconnect mode: redirect to `/google/done?connection=vertex&result=R` (pop-up) or `returnTo?google=R` | |

## Google Drive (Ingestion)

| Route | Body | Result | Refusals |
|---|---|---|---|
| `POST /api/sources/google-drive/reconnect` | `{ returnTo: string, popup: boolean }` | `{ url }` (saved access, `login_hint` = saved account) | `DRIVE_NOT_CONNECTED` (no saved connection), `DRIVE_NOT_CONFIGURED` |
| `POST /api/sources/google-drive/grant/check` | — | `GrantCheck` | — |
| `GET /api/sources/google-drive/callback` (existing) | — | in reconnect mode: redirect to `/google/done?connection=drive&result=R` or `returnTo?drive=R` | |

## Values

- `R` (`ReconnectResult`): `reconnected | checks-failed | other-account | missing-right | cancelled | error`. `checks-failed` exists for Vertex AI only.
- `GrantCheck`: `{ state: 'none' | 'ok' | 'unreachable' } | { state: 'problem', grantProblem: GrantProblem }`.

## Web route

`/google/done?connection=vertex|drive&result=R` — signed-in page, no layout: posts `{ connection, result }` on `BroadcastChannel('goodresearch-google')`, closes the window, otherwise says the window can be closed. `result` is validated against `ReconnectResult`; anything else shows `error`.

## Unchanged

Setup routes of spec 004 (`/google/start`, `/vertex/check`) and the Drive connect route of spec 002 keep their behaviour; `mode` defaults to `setup`.
