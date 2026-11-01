# Contracts: Create a research project with the assistant

## HTTP

### `POST /api/assistant/conversations/:conversationId/continue`

Operation `continueAssistantConversation`. Same guard and same events as `sendAssistantMessage`.

Body: `{ page: AssistantPage, language: 'en' | 'fr' }`

| Status | When |
|---|---|
| 200 `text/event-stream` | The last message is a finished answer holding an applied `create_project` |
| 404 `CONVERSATION_NOT_FOUND` | Not the person's conversation |
| 409 `NOTHING_TO_CONTINUE` | Anything else, including a second call |

The `start` event omits `personMessageId`.

### Changed schemas

- `ProposalKind`: adds `report_project_progress`.
- `GuideProgress` items: `key` also accepts `question`, `decision`, `team`; `audience` and `hypotheses` already exist.
- `ProposalPreview`: unchanged.

## Model tools

### `create_project` (run during the answer)

Input: `name` (1–120), `teamId`, `question` (required), `objectives` (required), `hypotheses` (may be empty).

| Output | When |
|---|---|
| `Card shown to the person. Wait for their decision and add nothing.` | Valid |
| `Refused: <points> not done. Ask the person, report the progress, and propose only once every point is done.` | No framing, or a point not done |
| `Refused: question and objectives must not be empty.` | Empty values |
| `Refused: the goal is too long.` | Composed goal over 10,000 characters |
| `Refused: use a team id listed in the context.` | Team out of reach |

### `report_project_progress` (recorded at once, ends the answer)

Input: `question`, `audience`, `decision`, `hypotheses`, `team`, each `missing | partial | done`.

### `load_skill`

Offered on every page. `project-framing` is listed on every page; `interview-guide-design` only on an interview study the person can act on.

## Panel

- The progress bar shows the latest report with its own title ("Project framing" / "Cadrage du projet"); hidden once its project is applied.
- After Apply on a `create_project`: page opens, then the continuation streams without a person's bubble. Stop works as usual.
