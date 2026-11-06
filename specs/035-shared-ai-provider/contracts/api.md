# Contracts: A shared AI provider for the instance

`GET /api/ai-provider` (`getAiProvider`) — `AiProviderPage` gains:

```text
shared: { provider: 'vertex' | 'anthropic' | 'openai', model: string, open: boolean } | null
serving: 'own' | 'shared' | null   // what the person's calls use now
```

Never any credential, project key or team list.

`GET /api/me` — `aiProvider.required` is false for a person the shared provider serves.

Failures: `SHARED_PROVIDER_UNAVAILABLE` in `AiFailure`, where AI failures are reported (assistant, checks).
