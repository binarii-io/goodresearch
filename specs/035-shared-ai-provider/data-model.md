# Data Model: A shared AI provider for the instance

- **Shared AI provider** (configuration only): `kind`, `model`, Vertex `project`, `region`, `auth` (`key` JSON | `instance`), API key for Anthropic / OpenAI, `teams` (ids, optional). Never stored, never sent.
- **Usage entry** (`ai_usage_entries`): + `shared boolean not null default false` (migration 0059). Existing rows: false.
- **Credential** (domain): + `{ provider: 'vertex', serviceAccount: { key } | 'instance', project, region }`.
- **AiFailure**: + `SHARED_PROVIDER_UNAVAILABLE` (what callers see; the ledger keeps the classified failure).
