# Quickstart: Per-person AI provider connection

1. Dev stack (`docker compose -f compose.yaml -f compose.dev.yaml up -d --build`, `AI_FAKE_PROVIDER=true`): sign in as `admin@example.org` → provider step before anything else.
2. Choose the test provider, key `test-invalid` → "invalid key" with its action; key `test-ok` → home page (first team step for a fresh admin).
3. Account menu → "AI provider": provider, masked key, usage 2 calls; "Test again"; "Remove" → provider step again.
4. Real stack with keys: Anthropic or OpenAI key → accepted in < 10 s.
5. Real stack with Google: Vertex AI → consent → project + region → checklist green → home. Disable the Vertex AI API in the project, "Test again" → needs attention.
6. `pnpm test`, `pnpm e2e` green; `select * from ai_usage_entries` shows one row per check, no prompt.
