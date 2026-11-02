# Contract: access by route

The source of truth is the inventory test (research R3); this is its starting point, to confirm against the registered routes (the debrief read, in particular). Any route not listed is closed.

## Open to every active member (read gate)

| Route | For a reader |
|---|---|
| `GET /api/projects?teams=mine\|all` | `all`: `limit` (50 by default), server `team` filter; with team and `canChange` |
| `GET /api/projects/:projectId` | `canChange`, `canDelete` |
| `GET /api/projects/:projectId/studies` | Folder mark |
| `GET /api/projects/:projectId/overview` and `/overview/costs` | Counts, costs; note on studies left out |
| `GET /api/projects/:projectId/insights`, `/insights/:insightId`, `/insight-facts` | Redacted |
| `GET /api/projects/:projectId/recommendations`, `/recommendations/:recommendationId`, `/recommendation-insights` | Redacted, no owner |
| `GET /api/projects/:projectId/takeaways/freshness` | As is (the only takeaways read route; `PATCH /takeaways` is a change) |
| `GET /api/teams/directory` | Id, name and project count of every team |
| `GET /api/projects/:projectId/debrief` | No quote, no owner, no published copy (research R12) |
| `GET /api/studies/:studyId` | `canChange`; after the folder check; without confirmed access, only name, type, team and access kind |
| `GET /api/studies/:studyId/guide` | After the folder barrier |
| `GET /api/studies/:studyId/source` | Access kind and folder owner; no inventory |
| `GET /api/studies/:studyId/facts` | After the folder barrier, redacted |
| `GET /api/teams/:teamId/studies`, `/studies/overview`, `/studies/overview/costs` | Folder mark |

## Reserved to the team and admins (stays closed)

Everything else under a study or project, including: `planned-interviews`, `sessions`, `source/files`, `facts-analysis`, `enrichment`, `lexicon`, `cleaning`, `quality`, `publications`, every `*/estimate`, `projects/:projectId/deletion`.

Answer for a reader: `403 READ_ONLY` with the team, so that a direct link shows "reserved to the team" instead of "not found".

## Every change

Any non-GET route carrying a resource id: `403 READ_ONLY` with the team, before the use case, with no usage recorded. `POST /api/teams/:teamId/studies` goes through the same guard. `POST /api/projects` carries its team in the body and owns nothing yet: it keeps its answer, `TEAM_NOT_FOUND`.

## Personal, outside this rule

`/api/me/*`, source connection, and assistant conversations.

## Unknown resource

`404`, as today.
