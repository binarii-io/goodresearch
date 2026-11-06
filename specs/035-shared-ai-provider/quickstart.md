# Quickstart: A shared AI provider for the instance

1. `pnpm exec vitest run --project config` — settings.
2. `pnpm exec vitest run --project api:unit apps/api/src/modules/ai-gateway` — resolution, teams, failures, `shared`.
3. Dev stack with `AI_FAKE_PROVIDER=true` and `AI_SHARED_PROVIDER` set to the fake: a new account is not asked for a provider; an AI action works; the provider page says "shared".
4. Real Vertex (deployer): set `AI_SHARED_PROVIDER=vertex`, `AI_SHARED_VERTEX_PROJECT`, and either run on Google Cloud with a service account having "Vertex AI User", or give `AI_SHARED_VERTEX_KEY`.
