# Contracts: Link a study to several projects

## HTTP

| Route | Purpose | Errors |
|---|---|---|
| `POST /api/projects/:projectId/studies/:studyId/link` | `attachStudy` | `PROJECT_NOT_FOUND`, `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED`, `DIFFERENT_TEAM`, `ALREADY_LINKED` |
| `DELETE /api/projects/:projectId/studies/:studyId/link` | `detachStudy` | `PROJECT_NOT_FOUND`, `STUDY_NOT_FOUND`, `NOT_LINKED`, `SYNTHESIS_RUNNING` |
| `PATCH /api/studies/:studyId/goal` | `updateStudyGoal`, body `{ goal, version }` | `STUDY_NOT_FOUND`, `FOLDER_ACCESS_REQUIRED`, `VALIDATION`, `VERSION_CONFLICT` |
| `GET /api/teams/:teamId/studies?q=&notInProject=` | `listTeamStudies`: at most 100, plus `hasMore` | `TEAM_NOT_FOUND` |

## Changed schemas

- `StudyDetail`: `project` becomes `projects: { id, name }[]` (earliest first); adds `team: { id, name }`, `goal`.
- `StudySummary`: adds `alsoIn: { id, name }[]`.
- `ProposalKind`: adds `attach_study`, `detach_study`, `update_study_goal`.
- `ProposalPreview`: adds `otherProjects: string[]`.
- Insight citation state: adds `outside`.
- Errors: `DIFFERENT_TEAM`, `ALREADY_LINKED`, `NOT_LINKED`, `SYNTHESIS_RUNNING`, `STUDY_SHARED`, `TEAM_HAS_STUDIES`.

## Model tools (run during the answer)

| Tool | Input | Refusals returned to the model |
|---|---|---|
| `attach_study` | `studyId`, `projectId` | Out of reach, other team, already linked, no folder access |
| `detach_study` | `studyId`, `projectId` | Out of reach, not linked, run in progress |
| `update_study_goal` | `studyId`, `goal` | Out of reach, too long, no folder access |

A valid call shows a card and returns `Card shown to the person. Wait for their decision and add nothing.` Apply runs the commands above.
