# Data model: Assistant chat in a side panel

## assistant_conversations

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| account_id | text FK auth_users | cascade on delete; deleted on anonymisation |
| title | text | from the first message (60 characters), renamable (1–80) |
| created_at, last_activity_at | timestamptz | list sorted by last activity |

## assistant_messages

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| conversation_id | text FK | cascade |
| role | text | `person` · `assistant` |
| text | text | Markdown subset for the assistant |
| status | text | `complete` · `streaming` · `stopped` · `failed` |
| failure | text? | AI failure code (spec 004) |
| page_kind, page_id | text? | page the message was sent from |
| created_at | timestamptz | |

## assistant_proposals

| Column | Type | Notes |
|---|---|---|
| id | text PK | our id (cards, Apply) |
| call_id | text | the model's tool call id, only to replay the conversation to the model |
| message_id | text FK | cascade |
| kind | text | `create_project` · `update_project_goal` · `rename_project` · `create_study` · `rename_study` · `open_project` · `open_study` (opening is recorded as `applied` at once) |
| target_id | text? | project or study id |
| target_version | integer? | version of the target seen at proposal time (stale → refused on apply) |
| values | jsonb | validated input (raw input for `invalid`) |
| preview | jsonb | what the card shows: names, team, new and previous values |
| state | text | `proposed` → `applying` (claimed by one Apply) → `applied` · `failed`; `proposed` → `dismissed`; `invalid`: never shown, told to the model |
| result_id | text? | created/changed object |
| error | text? | error code when failed |
| decided_at | timestamptz? | |

Rules: a proposal is decided once; only the conversation owner can decide it; a `failed` apply can be retried only by a new proposal.
