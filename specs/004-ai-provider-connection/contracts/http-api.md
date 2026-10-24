# HTTP API: Per-person AI provider connection

All routes require a signed-in, active account. Errors are RFC 9457 problems with a `code`.

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/me` | | `Me` + `aiProvider: { required, status }` | |
| GET | `/api/ai-provider` | | `{ offered: Provider[], connection: ProviderView \| null, usage: { calls, inputTokens, outputTokens } }` | |
| PUT | `/api/ai-provider/api-key` | `{ provider: 'anthropic' \| 'openai', apiKey }` | `ProviderView` | `AI_PROVIDER_NOT_OFFERED`, `AI_CHECK_FAILED` (with `failure`) |
| POST | `/api/ai-provider/google/start` | `{ returnTo }` | `{ url }` | `AI_PROVIDER_NOT_OFFERED`, `GOOGLE_NOT_CONFIGURED` |
| GET | `/api/ai-provider/google/callback` | `?code&state` | 302 to `returnTo?google=granted\|error` | |
| POST | `/api/ai-provider/vertex/check` | `{ project, region }` | `{ checks: Check[], saved: boolean, connection: ProviderView \| null }` | `GOOGLE_GRANT_REQUIRED` |
| POST | `/api/ai-provider/test` | | `{ ok, failure? }` | `AI_PROVIDER_REQUIRED` |
| DELETE | `/api/ai-provider` | | 204 | |

`ProviderView`: `{ provider, model, status, credentialHint, googleAccount, project, region, lastCheckedAt, lastFailure }`; never the credential.

`Check`: `{ key: 'format' | 'api' | 'permission' | 'call', status: 'ok' | 'error' | 'skipped' | 'unknown', failure? }` (the UI holds the texts and fixes).
