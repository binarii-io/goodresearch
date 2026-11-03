# Quickstart: One-click reconnection of Google grants

## Automated

```sh
pnpm exec vitest run --project api:unit   # classifier, reconnect use cases with fakes
pnpm test                                  # + Testcontainers (migration 0058, stores)
pnpm e2e                                   # reconnect flow on the dev stack (fake Google)
```

Expected:

- Classifier: `invalid_grant` + `invalid_rapt` → `reauth-required`; other `invalid_grant` → `refused`; 5xx or network → no grant problem.
- Vertex reconnect, same account, checks pass → connection `working`, same project and region, `grant_problem` null, no pending grant left.
- Vertex reconnect, checks fail → connection unchanged, pending grant kept, result `checks-failed`.
- Vertex or Drive reconnect, other account → nothing saved, result `other-account`.
- Drive reconnect keeps `access` and the folder access checks.
- `Me` with a grant problem → no redirect to `/setup/ai-provider`.
- Grant check: unreachable never sets a problem; a minted token clears one.

## By hand (dev stack with the dev Google adapters)

1. Sign in, connect Vertex AI and Drive.
2. Make the grant refused (dev: the fake token endpoint answers `invalid_grant` / `invalid_rapt` for a marked token; real: remove the app at myaccount.google.com/permissions).
3. Type a message in the assistant and send it → notice "Google needs you to sign in again" with **Reconnect Google**; the page does not change.
4. Click it → pop-up on Google, account pre-filled → consent → pop-up closes, the notice disappears, the typed message is offered with **Send again**.
5. Open a study with a Drive folder after making the Drive grant refused → same notice on the folder, reconnect, folder loads.
6. Reload in a new tab with a refused grant → banner under the header, without running anything.
7. Block pop-ups and repeat 4 → full-page round trip, back on the same page with the message restored.
