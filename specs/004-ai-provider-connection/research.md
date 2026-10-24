# Research: Per-person AI provider connection

## R1. Calling the three providers

- **Decision**: Vercel AI SDK 7 (`ai`) with `@ai-sdk/anthropic`, `@ai-sdk/openai` and `@ai-sdk/google-vertex`, behind a `ModelRunner` port (`generate` with a Zod schema, `stream` for text). Vertex AI uses `createVertex({ project, location, googleAuthOptions: { authClient } })` where `authClient` is a `google-auth-library` `OAuth2Client` holding the person's refresh token (it refreshes access tokens itself). No Application Default Credentials, no service account.
- **Rationale**: ADR-0005 already chose the AI SDK; one API for structured output and streaming across providers; the Vertex provider accepts a ready auth client.
- **Alternatives considered**: provider SDKs directly (three APIs to maintain); Vertex `headers` with our own token (the Node entry still asks `google-auth-library` for a token first); Vertex express-mode API keys (not available for all models, not "native").

## R2. Google consent for Vertex AI

- **Decision**: OAuth code flow with PKCE and state, scope `https://www.googleapis.com/auth/cloud-platform` only, `access_type=offline`, `prompt=consent`, no `include_granted_scopes`. The token is separate from Drive's, but Google revokes per app and person: revoking any token of the client withdraws the whole grant (Drive included, and a newer Vertex AI token). So the app never revokes Vertex AI tokens; it deletes them and links to the person's Google account permissions (PR #4 review). Same Google OAuth client as Drive; the config moves to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, with `GOOGLE_DRIVE_CLIENT_ID` / `_SECRET` still read as a fallback. Callback `/api/ai-provider/google/callback`.
- **Rationale**: same pattern as Drive (spec 002), already reviewed; one client per instance for deployers.
- **Note for deployers**: `cloud-platform` is a sensitive scope: an External app needs Google verification; an Internal app (Workspace) does not.

## R3. Vertex AI checklist (prototype rules)

Run in order; a failed blocking check stops the rest.

| # | Check | How | Blocking |
|---|---|---|---|
| 1 | Project ID format | `^[a-z][a-z0-9-]{4,28}[a-z0-9]$` | yes |
| 2 | Project access and Vertex AI API enabled | `GET serviceusage.googleapis.com/v1/projects/{p}/services/aiplatform.googleapis.com` → `state = ENABLED`; 403/404 → no access or unknown project | yes |
| 3 | Permission to call models | `POST cloudresourcemanager.googleapis.com/v3/projects/{p}:testIamPermissions` with `aiplatform.endpoints.predict` | no ("not checkable" when it cannot be verified) |
| 4 | Real minimal call | gateway `generate` "Reply OK", max 8 output tokens, configured model, chosen region | yes (proves API, permission, billing, model in region) |

Regions: a fixed list in the domain (`global`, `europe-west1`, `europe-west4`, `us-central1`, `us-east4`, `asia-northeast1`…), default `global` when the model supports it.

## R4. Failure classification

- **Decision**: a pure function maps provider errors (status, provider error type/code) to a closed set: `INVALID_CREDENTIAL` (401, invalid key, revoked grant), `PERMISSION_DENIED` (403), `NO_CREDIT_OR_QUOTA` (OpenAI `insufficient_quota`, Anthropic credit balance too low, 429 quota), `RATE_LIMITED` (429 rate), `MODEL_UNAVAILABLE` (404 model / not in region), `API_DISABLED` (Vertex service disabled), `UNREACHABLE` (timeout, network, 5xx), `UNKNOWN`. The UI shows a message and an action per code; raw provider text is never shown or stored.
- **Authorisation codes** (`INVALID_CREDENTIAL`, `PERMISSION_DENIED`, revoked Google grant) mark the connection `needs-attention`.

## R5. Gate

- **Decision**: `Me` gains `aiProvider: { required: boolean, status: 'none' | 'working' | 'needs-attention' }` (`required` = at least one provider offered). The `_authenticated` layout redirects to `/setup/ai-provider` when required and status is not `working`; the setup route is signed-in but outside the shell (sign-out available). AI endpoints refuse with `AI_PROVIDER_REQUIRED` server-side. Other endpoints are not blocked server-side: the gate is a product step, not a security boundary.
- **Order** for a fresh admin: provider step, then "create the first team".

## R6. Storage and ledger

- **Decision**: `ai_provider_connections` (one row per account, credential encrypted with the token cipher, purpose `goodresearch/ai-provider-credentials/v1`, AAD = account id; `credential_hint` = last 4 characters of a key); `ai_usage_entries` append-only (trigger refuses UPDATE and DELETE, as `workspace_access_events`), foreign key to the account without cascade (account deletion anonymises, spec 001).
- **Token cipher**: moved to `platform/crypto` with the HKDF info as a parameter; Drive keeps `goodresearch/source-connections/v2`, so existing tokens still decrypt.

## R7. Default models

- **Decision**: configuration `AI_MODEL_VERTEX`, `AI_MODEL_ANTHROPIC`, `AI_MODEL_OPENAI`, defaults `gemini-3.8-flash`, `claude-sonnet-5-5`, `gpt-5.5` (current general-purpose models listed by the provider packages at implementation). People do not choose models in this version; deployers change them without a release.

## R8. Dev and test stack

- **Decision**: a `fake` runner adapter enabled only by `AI_FAKE_PROVIDER=true` (dev compose and tests) accepts keys starting with `test-ok` and classifies `test-invalid`, `test-quota` as failures, so e2e can walk the step without real providers. Never enabled in the production image defaults.
