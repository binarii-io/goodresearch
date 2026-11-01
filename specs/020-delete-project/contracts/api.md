# Contracts: Delete a research project

## HTTP

| Route | Purpose | Errors |
|---|---|---|
| `POST /api/projects/:projectId/delete`, body `{ name }` | `deleteProject`, answers 204 | `PROJECT_NOT_FOUND`, `FORBIDDEN`, `SYNTHESIS_RUNNING`, `NAME_MISMATCH` |
| `GET /api/projects/:projectId/deletion` | `getProjectDeletion`: the volumes | `PROJECT_NOT_FOUND`, `FORBIDDEN` |
| `POST /api/assistant/proposals/:proposalId/confirm-delete`, body `{ name }` | `confirmDeleteProposal`: the proposal | `PROPOSAL_NOT_FOUND`, `PROPOSAL_DECIDED`, `NAME_MISMATCH` |

`POST /api/assistant/proposals/:id/apply` on a `delete_project` answers `NAME_REQUIRED` and changes nothing.

## Schemas

- `ProjectDeletion`: `{ insights, recommendations, hasTakeaways, hasPublishedDeck, studies, studiesWithoutProject }`.
- `ProjectDetail`: adds `canDelete`.
- `ProposalKind`: adds `delete_project`.
- `ProposalPreview`: adds `deletion`.
- Errors: `NAME_MISMATCH` (422), `NAME_REQUIRED` (409).

## Model tool (run during the answer)

`delete_project { projectId }`

| Output | When |
|---|---|
| `Card shown to the person, who must type the project's name on it. Wait for their decision and add nothing.` | Valid |
| `Refused: use a project id listed in the context.` | Out of reach |
| `Refused: only an administrator or the project's creator can delete it.` | Not allowed |
| `Refused: wait for the run in progress on this project to finish.` | Live run |
