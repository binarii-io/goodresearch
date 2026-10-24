# Configuration: Per-person AI provider connection

| Variable | Default | Meaning |
|---|---|---|
| `AI_PROVIDERS` | `vertex,anthropic,openai` | Providers offered to people, comma-separated; empty disables AI (no provider step) |
| `AI_MODEL_VERTEX` | `gemini-3.8-flash` | Model for Vertex AI |
| `AI_MODEL_ANTHROPIC` | `claude-sonnet-5-5` | Model for Anthropic |
| `AI_MODEL_OPENAI` | `gpt-5.5` | Model for OpenAI |
| `AI_CALL_TIMEOUT_MS` | `15000` | Timeout of a check call |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | none | Google OAuth client shared by Drive and Vertex AI (falls back to `GOOGLE_DRIVE_CLIENT_ID` / `_SECRET`) |
| `AI_FAKE_PROVIDER` | `false` | Dev and tests only: adds a fake provider (research R8) |

Vertex AI is offered only when a Google client is configured. The Google client needs the redirect URI `<APP_URL>/api/ai-provider/google/callback` and the `cloud-platform` scope on its consent screen.
