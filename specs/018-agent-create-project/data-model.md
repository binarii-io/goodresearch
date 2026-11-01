# Data model: Create a research project with the assistant

No new table. One allowed value is added to `assistant_proposals.kind`: `report_project_progress`.

## Project framing (derived, not stored)

The state of a framing is read from a conversation's proposals.

| Point | Weight | Done when (instructions to the model) |
|---|---|---|
| `question` | 30 | The person confirmed a clear question |
| `audience` | 20 | The person said who is concerned |
| `decision` | 25 | The person confirmed the decision to support |
| `hypotheses` | 15 | The person gave some, or said there are none yet |
| `team` | 10 | Only one team, or the person chose or confirmed |

States: `missing`, `partial`, `done` (shared with the guide). The percentage is computed by the app.

**Rule `currentFraming(proposals)`**: among applied `report_project_progress`, take the one with the latest `decidedAt`. If a `create_project` was applied later, there is no current framing. The framing is complete when every point of that report is `done`.

## Proposal `report_project_progress`

Recorded at once (state `applied`), no card. `values`: the five states. `preview.progress`: percent and items. Malformed: state `invalid`, previous report stands.

## Proposal `create_project`

| Field | Before | Now |
|---|---|---|
| Tool input | `name`, `teamId`, `goal` | `name`, `teamId`, `question`, `objectives`, `hypotheses` |
| `values` | `name`, `teamId`, `goal` | the input, plus composed `goal` |
| `preview` | `name`, `teamName`, `goal` | unchanged |
| `error` | unused when `invalid` | the refusal reason, repeated in the history |

Apply reads `name`, `goal`, `teamId`, so cards stored before this feature still apply.

**State transitions** are unchanged: `proposed → applying → applied | failed`, `proposed → dismissed`; a refusal is stored as `invalid`.

## Message

An assistant message from a continuation has no person's message before it. `pageKind` and `pageId` hold the page sent to the endpoint.
