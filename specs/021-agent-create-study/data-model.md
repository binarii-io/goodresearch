# Data model: Create a study with the assistant

## Study framing (assistant, derived)

Points and weights: `reuse` 20, `goal` 50, `place` 30. States: missing, partial, done. The framing under way is the latest applied `report_study_progress`, unless a `create_study` was applied since.

## Proposal

New kind `report_study_progress` (migration 0046 widens the check). `create_study`:

| Field | In a project | In no project |
|---|---|---|
| targetId | project id | null |
| values | name, goal | name, goal, teamId |
| preview | name, goal, projectName | name, goal, teamName |

Checks in order: input, project or team in reach, non-empty goal, open points.

## Study (research)

`Study.create` accepts `projectId: null`: no link. No schema change.
