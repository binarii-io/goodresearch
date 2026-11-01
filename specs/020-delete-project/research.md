# Research: Delete a research project

## R1. Keeping the model away from the deletion

- **Decision**: the generic Apply refuses `delete_project` with `NAME_REQUIRED`. Only `POST /api/assistant/proposals/:id/confirm-delete`, body `{ name }`, can run it. The tool has no name input, and the name is compared and dropped, never stored in the proposal or its history.
- **Rationale**: a guarantee by construction. The browser's route is the only path, and the model has no way to call a route.
- **Alternative**: an optional body on Apply; rejected, as a missing check would then delete.

## R2. A wrong name leaves the card open

- **Decision**: `confirm-delete` compares the name with the project's current name before claiming the proposal, and answers `NAME_MISMATCH` while the proposal stays `proposed`. Any other failure after the claim marks it `failed`, as for other cards.
- **Rationale**: a typing mistake must not burn the card (FR-010). The Research command checks the name again in its transaction.

## R3. What deletes what

- **Decision**: `projects.delete(id)` removes the row; cascades take insights, runs, consents, recommendations, takeaways, published decks and study links. Studies are not linked by a foreign key to the project any more (spec 019).
- **Rationale**: checked on the running database: all 8 foreign keys to `research_projects` cascade, and none is from a study.
- **Usage ledger**: entries have no key to the project, so they stay.

## R4. Rights

- **Decision**: `Project.canBeDeletedBy({ id, role })`: admin, or creator. Team access is checked first, so outsiders get `PROJECT_NOT_FOUND` and team members `FORBIDDEN`. `ProjectDetail` gains `canDelete`, which drives the button.

## R5. Volumes

- **Decision**: `GET /api/projects/:projectId/deletion` in Reporting: insights and recommendations (every status), whether takeaways and a published deck exist, studies, and how many have no other project. Only people allowed to delete can read it.
- **Rationale**: the existing count reads cover them. The card stores a snapshot in its preview; Apply checks the current state, not the volumes.

## R6. Assistant

- **Decision**: `delete_project { projectId }`, run during the answer, as for `attach_study`. The instructions say to propose it only when asked, and to ask when several projects match, and never to ask for the name in the conversation.
- **After the card**: no continuing answer. The outcome reaches the model at the next message. After deletion, `resultKind` is null: nothing to link to.

## R7. Leaving the page

- **Decision**: after a deletion, the page removes the project's queries and goes to `/`; from the card, only if the project's page is open, which the panel's page reference gives.
