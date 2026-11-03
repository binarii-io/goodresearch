# Data model: One-click reconnection of Google grants

Migration `0058_google_grant_reconnect`. No new table.

## GrantProblem (value)

`'refused' | 'reauth-required' | 'unreadable'` — why a stored Google grant can no longer be used (research R1). Defined in each module's domain and in `packages/contracts` (`google-grants.ts`).

## AI provider connection (`ai_provider_connections`, AI Gateway)

| Change | Rule |
|---|---|
| + `grant_problem text null` | Set only for `provider = 'vertex'`, together with `status = 'needs-attention'` and `last_failure = 'INVALID_CREDENTIAL'`. Cleared when the connection is saved working (reconnect, setup, test). |

Transitions:

- `working` → `needs-attention` + `grant_problem` — a call, a check or the session check gets a refused grant, or the token cannot be decrypted.
- `needs-attention` + `grant_problem` → `working` — a reconnection whose checks pass, or a session check that mints a token again (the grant came back).
- Other `needs-attention` failures (permission, API disabled) keep `grant_problem = null` and the existing behaviour.

## Source connection (`ingestion_source_connections`, Ingestion)

| Change | Rule |
|---|---|
| + `lost_reason text null` | A `GrantProblem`; set with `status = 'lost'`, cleared with `status = 'connected'`. Older lost rows keep null (shown as `refused`). |

`markConnectionLost(accountId, reason)` takes the reason; `readRefreshToken` passes `unreadable`, the token minting passes what the classifier returns.

## OAuth states (`ai_oauth_states`, `ingestion_oauth_states`)

| Change | Rule |
|---|---|
| + `mode text not null default 'setup'` | `'setup' \| 'reconnect'`. |
| + `popup boolean not null default false` | Reconnect started in a pop-up: the callback redirects to `/google/done` instead of `returnTo`. |

Still single-use, 10 minutes, bound to the signed-in account, `returnTo` through `safeReturnPath` (FR-014).

## Pending Google grant (`ai_pending_google_grants`, unchanged)

Reused when a Vertex reconnection meets another account or failing checks: the setup form continues from it (spec 004).

## Me (contract, read model)

```
aiProvider: { required, status: 'none' | 'working' | 'needs-attention', grantProblem: GrantProblem | null }
drive:      { status: 'none' | 'connected' | 'lost', grantProblem: GrantProblem | null, account: string | null }
```

`account` is the person's own saved Google account, used for the notice text only.
