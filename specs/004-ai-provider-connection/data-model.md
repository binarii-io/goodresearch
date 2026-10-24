# Data model: Per-person AI provider connection

## ai_provider_connections (one per account)

| Column | Type | Notes |
|---|---|---|
| account_id | text PK, FK auth_users | cascade on hard delete; credentials deleted on anonymisation |
| provider | text | `vertex` · `anthropic` · `openai` |
| model | text | model of the last successful check (audit); calls and the page always use the configured model |
| encrypted_credential | text | API key or Google refresh token, token cipher v2 (AAD = account id) |
| credential_hint | text? | last 4 characters of an API key; null for Vertex |
| google_account | text? | Vertex: the Google account email that granted access |
| gcp_project | text? | Vertex only |
| gcp_region | text? | Vertex only |
| status | text | `working` · `needs-attention` |
| last_failure | text? | failure code (R4) |
| last_checked_at | timestamptz | last successful check |
| created_at, updated_at | timestamptz | |

States: none (no row) → `working` (check passed) ⇄ `needs-attention` (authorisation failure on a call or a test; a successful test returns to `working`) → none (removed).

A Vertex consent completed but not yet checked is kept in `ai_pending_google_grants` (account id PK, encrypted refresh token, google account, expires after 1 hour), so the checklist can be re-run without consenting again; it becomes the connection when the checklist passes.

## ai_oauth_states

Same shape as `ingestion_oauth_states` (state, account id, PKCE verifier, return path, expiry 10 min), single use.

## ai_usage_entries (append-only)

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| account_id | text FK auth_users | no cascade |
| task | text | e.g. `provider-check`, later `guide-assistant` |
| provider, model | text | |
| input_tokens, output_tokens | integer? | null when unknown (failure before a response) |
| duration_ms | integer | |
| outcome | text | `success` or a failure code (R4) |
| created_at | timestamptz | |

Trigger `ai_usage_entries_immutable` refuses UPDATE and DELETE.
