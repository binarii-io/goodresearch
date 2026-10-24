# HTTP API: Assistant

All routes: signed-in person, own conversations only (others → 404 `CONVERSATION_NOT_FOUND`).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/assistant/conversations` | | `ConversationSummary[]` (id, title, lastActivityAt) |
| POST | `/api/assistant/conversations` | | `{ id }` |
| GET | `/api/assistant/conversations/:id` | | `{ id, title, messages: Message[] }` with proposals |
| PATCH | `/api/assistant/conversations/:id` | `{ title }` | 204 |
| DELETE | `/api/assistant/conversations/:id` | | 204 |
| POST | `/api/assistant/conversations/:id/messages` | `{ text, page: { kind, id? }, language }` | `text/event-stream` |
| POST | `/api/assistant/proposals/:id/apply` | | `Proposal` (state applied/failed, resultId, error) |
| POST | `/api/assistant/proposals/:id/dismiss` | | `Proposal` |

SSE events (JSON in `data`): `{ type: 'start', personMessageId, assistantMessageId }`, `{ type: 'text', delta }`, `{ type: 'proposal', proposal }`, `{ type: 'done', status }`, `{ type: 'error', failure }`.
