# Research: A shared AI provider for the instance

## R1 — Settings

- **Decision**: `AI_SHARED_PROVIDER` (`vertex | anthropic | openai`, absent = none); Vertex: `AI_SHARED_VERTEX_PROJECT` (required without a key; with a key, its `project_id` by default), `AI_SHARED_VERTEX_REGION` (default `global`), `AI_SHARED_VERTEX_KEY` (a service account key JSON, optional: absent means the instance's own Google Cloud identity, Application Default Credentials); Anthropic / OpenAI: `AI_SHARED_API_KEY` (required). Model: the existing `AI_MODEL_<KIND>`. `AI_SHARED_TEAMS`: team ids, comma-separated, optional.
- **Tests and dev**: `AI_SHARED_PROVIDER=fake` is accepted only with `AI_FAKE_PROVIDER=true` (refused with an https `APP_URL`, as the fake itself).
- **Rationale**: same pattern as the other settings (env, validated at startup, secrets as env / files); team ids are stable where names change.
- **Startup checks** (FR-009): kind known, project id valid, key JSON parseable with `client_email` and `private_key`, API key present. Whether the identity really works is only known at the first call (logged then).

## R2 — Resolution order

- **Decision**: own connection (offered, any status) > shared (open to the person) > `AiProviderRequired`.
- **Rationale**: spec FR-003 and US2 scenario 4: a person's own provider needing attention keeps asking them, never switching silently.

## R3 — Who the shared provider is open to

- **Decision**: no `AI_SHARED_TEAMS` → everyone with access; else members of one of those teams, read through a Workspace port `teamIdsOf(accountId)` at resolution.

## R4 — Failures of the shared provider

- **Decision**: the ledger records the classified failure as today; the person's connection is never marked; the server logs `warn` with the failure and the shared kind (no secret); callers receive `ProviderCallError('SHARED_PROVIDER_UNAVAILABLE')` for authorisation, quota and API failures, so every screen says "the instance's AI is unavailable, contact your administrator"; rate limits and timeouts keep their own failures (retry later).

## R5 — Vertex AI without a person's grant

- **Decision**: `createVertex({ project, location, googleAuthOptions: { credentials } })` with the key, or `googleAuthOptions: { scopes: cloud-platform }` for Application Default Credentials; one auth client kept for the process.

## R6 — Deployment-agnostic, hosted on Google Cloud

- **Decision**: both Vertex AI modes stay. On Google Cloud (the planned host), no key: the service account of the Cloud Run service or VM with "Vertex AI User", plus `AI_SHARED_VERTEX_PROJECT`. Elsewhere, a service account key as a mounted secret (`AI_SHARED_VERTEX_KEY_FILE`), its project read from the key.
- **Rationale**: no long-lived secret where the platform gives an identity; the project stays deployable anywhere.
