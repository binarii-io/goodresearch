# Contracts

## `POST /api/teams/:teamId/studies` (`createTeamStudy`)

Body: `{ name: 1..120, goal?: at most 10,000 }`. 201 `{ id }`. 404 `TEAM_NOT_FOUND` outside the person's teams; 422 `VALIDATION`. The type is interviews.

## Assistant tools

- `create_study { name, goal, projectId? | teamId? }`: run during the answer; returns the card's confirmation or the reason of the refusal.
- `report_study_progress { reuse, goal, place }`: recorded, ends the answer.
- Skill `study-framing`.

## `POST /api/assistant/conversations/:id/continue`

Also accepted right after an applied `create_study`.
