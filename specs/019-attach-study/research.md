# Research: Link a study to several projects

## R1. Where the link lives

- **Decision**: a table `research_study_projects (study_id, project_id, linked_at)`, primary key on both, cascade from both sides. The links are part of the Study aggregate, and attach and detach bump its version.
- **Rationale**: most of the app reads a project's studies through `listStudies`, and only Research reads `project_id` (checked with a search of the code). Reporting and Synthesis then follow with no change (FR-005).
- **Cascade**: deleting a project removes its links only, so its studies survive. Journey 3 decides what the person is offered.

## R2. Access

- **Decision**: `research_studies.team_id`, required. `getStudy`, `getStudyAccess`, the study commands and the preparation queries read it instead of going through the project.
- **Rationale**: a study without a project must stay reachable (FR-018), and this removes a join.

## R3. The study's goal

- **Decision**: `research_studies.goal`, backfilled from the project; `createStudy` copies the project's goal. `context` in `compose.ts` (used by facts and interview review) reads the study's. Synthesis keeps the project's.
- **Rationale**: the two `context` functions are the only places where study-level AI steps get a goal.

## R4. Team page and picker

- **Decision**: `GET /api/teams/:teamId/studies?notInProject=` returns id, name, type, projects and `canAttach`, in one SQL read plus the folder summaries. Search filters by name on the server (`q`), and at most 100 rows are returned, most recent first, with a note when more exist.
- **Rationale**: load only what is shown; the attach dialog reuses it. The page's counts and costs are read apart through Reporting (`/studies/overview`, `/costs`), like a project's, so the list never waits for them.

## R5. Runs in progress

- **Decision**: a `ProjectRunGate` port on Research, wired in `compose.ts` to Synthesis's unfinished insight and recommendation runs. Detach is refused with `SYNTHESIS_RUNNING`.

## R6. Citations outside the project

- **Decision**: the insight query compares each linked fact's study with the project's current studies, and returns `outside` next to the existing `deleted`.
- **Rationale**: computed at read time; nothing stored changes, and attaching the study again clears it.

## R7. Moving a project

- **Decision**: `moveProjectToTeam` refuses with `STUDY_SHARED` if one of its studies is in another project; otherwise it updates the project and its studies in one transaction.

## R8. Deleting a team

- **Decision**: a team with a study cannot be deleted, like a team with projects. The foreign key is `restrict` and the command refuses first with `TEAM_HAS_STUDIES`.
- **Rationale**: a study without a project would otherwise block it with a raw error, or be lost.

## R9. Assistant

- **Decision**: `attach_study`, `detach_study`, `update_study_goal` are run during the answer, as `create_project` is, so a refusal reaches the model at once. The context gives, on a project page, the team's other studies (at most 30, names and projects), and on a study page both goals. The continuing answer of journey 1 is told it may mention a related study.
- **Cost**: each valid card takes one more model step, as for `create_project`.

## R10. "Opened from"

- **Decision**: the project link of a study card adds `?from=<projectId>`. The study page uses it for the breadcrumb if the study is still in that project, otherwise the earliest link, otherwise the team's page.
