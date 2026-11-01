# Data model: Link a study to several projects

## `research_studies`

| Column | Change |
|---|---|
| `team_id` | New, required, references the team (`restrict`). Backfilled from the project |
| `goal` | New, text, default empty, at most 10,000 characters. Backfilled from the project |
| `project_id` | Removed, after the backfill of the links |

## `research_study_projects` (new)

| Column | Rule |
|---|---|
| `study_id` | References the study, cascade |
| `project_id` | References the project, cascade |
| `linked_at` | Required. Backfilled from the study's `created_at`, keeping the first project first |

Primary key: both ids. Index on `project_id`.

## Study aggregate

- `attach(project)`: refused with `DIFFERENT_TEAM` when the project's team differs, and `ALREADY_LINKED` when linked.
- `detach(projectId)`: refused with `NOT_LINKED` when not linked. Zero links remain allowed.
- `changeGoal(goal)`: at most 10,000 characters; an empty goal is allowed.

Every change bumps `version`.

## Rules outside the aggregate

- Attach needs access to the project, and folder access to the study when it has a folder.
- Detach needs access to the project, and no unfinished synthesis run on it.
- Moving a project: refused with `STUDY_SHARED` if a study is in another project; otherwise team of the project and of its studies change together.
- Deleting a team: refused with `TEAM_HAS_STUDIES`.

## Derived, not stored

- Breadcrumb project: see research R10.
- Citation state `outside`: see research R6.
