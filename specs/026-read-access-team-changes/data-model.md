# Data Model: Read access for everyone, changes for the team

No table and no migration: rights are computed at each request from role, memberships and the resource's team.

## Relation (computed)

| Person | `relation` | Reads | Changes, AI runs, reserved content |
|---|---|---|---|
| Admin | `team` | everything | yes |
| Member of the owning team | `team` | everything | yes |
| Other active member | `reader` | open list, redacted | no |
| Deactivated or unknown | none | no | no |

The folder barrier then applies to every relation: without confirmed access, only name, type and team, whatever the relation. Admins keep their two exceptions (detach the folder, delete the study).

`canChange = relation === 'team'`.

`canDelete = role is admin, or the person created the project and belongs to its team`.

## Changed reads

- **ProjectSummary, ProjectDetail**: `canChange`; `team` on summaries if missing.
- **StudySummary, TeamStudy, StudyDetail**: `canChange`. `StudyDetail` already has `team` and `anonymised`.
- **ProjectStudy** (synthesis port): `anonymised`.
- **Reader's fact**: statement, polarity, theme, status, neutral interview label; verbatims only when anonymised, with pseudonyms; no file name, no person's name.
- **Reader's insight, recommendation**: same rule for quotes; facts of a study without folder access as a count; recommendation `owner` null.
- **Source status for a reader**: access kind and folder owner as today's message needs; no inventory.

## Error

`READ_ONLY`, 403, with `{ team: { id, name } }`.

## Unchanged

Member, Team, TeamMembership, AccessEvent, Study, Project: no field added. Deleting a team with work, moving a project: unchanged.
