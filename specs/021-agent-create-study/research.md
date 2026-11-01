# Research: Create a study with the assistant

## R1: One framing per kind of object

- **Decision**: a separate report `report_study_progress`, ended by an applied `create_study`.
- **Rationale**: a conversation can frame a project then a study; the reports must not count for each other (spec edge case).
- **Alternatives**: one report with a subject field: more validation for no gain.

## R2: After a project is applied

- **Decision**: the continuing answer only asks whether the person wants a first study, or offers to reuse one; `create_study` is not offered in it. The next message starts the framing.
- **Rationale**: a card there would always be refused, since no framing exists yet.

## R3: One tool, in a project or in none

- **Decision**: `create_study` takes `name`, `goal`, and exactly one of `projectId` or `teamId`.
- **Rationale**: "no project" is then explicit, and the tool cannot guess a team.

## R4: Cards from before this change

- **Decision**: a card stored without a goal still applies, and copies the project's goal.
- **Rationale**: open cards survive a deployment. The form uses the same path.

## R5: Studies in the context

- **Decision**: the list arrives with the skill `study-framing` and stays in the context while it is loaded, on every page: 30 studies at most, each team with its share, and the model is told when the list is cut. A project's page already lists its own team's.
- **Rationale**: reuse must be possible from any page, without loading every team's studies on each message. Studies behind a folder the person cannot access are left out, as on a project's page.
