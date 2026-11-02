# Research: Read access for everyone, changes for the team

## R1 — Open by explicit list, not by widening the gate

**Decision**: `getStudyAccess`, `getProject`, `getStudy`, `listStudies` keep today's meaning (team or admin). New `readProject`, `readStudy`, `readStudies`, `getStudyReadAccess` serve only the routes of [contracts/access.md](contracts/access.md).

**Rationale**: These gates are shared by queries and commands across research, ingestion, transcripts, evidence, interview-quality, synthesis and the assistant. Synthesis's `projectOf`, for one, serves both. Widening them would open every change and every reserved read at once; a forgotten call would be a leak. With new read gates, a forgotten call only stays closed.

**Alternatives**: Widen and add a write check to each command: fails open. A `mode` argument on each gate: every caller must choose, and a wrong default is silent.

## R2 — A central guard for refusals

**Decision**: A platform `preHandler` on routes with a `studyId`, `projectId`, `sessionId`, `publicationId`, `plannedInterviewId` or `teamId` parameter, except the GET routes of the open list. It asks a lookup given by `compose.ts` for the owning team, and answers `403 READ_ONLY` with the team's name when the person is outside it. Unknown ids pass through, and the use case answers "not found". `POST /api/projects` carries its team in the body and owns nothing yet: it keeps its answer, `TEAM_NOT_FOUND`. The guard runs before input validation, so a refusal never depends on the body.

**Rationale**: FR-008 needs one distinct refusal; use cases answer `*_NOT_FOUND` today. About 90 routes would otherwise change one by one. Use-case gates stay, so a missed route is still refused, only with the old answer.

**Alternatives**: Map errors route by route: long and easy to miss. Change every use case's error: same, with more tests to rewrite.

## R3 — An inventory test classifies every route

**Decision**: An integration test walks the registered routes. Each GET is in the open list or must refuse an outsider; each change must return `READ_ONLY`; a new route that is not classified fails the test.

**Rationale**: Proves SC-002 and SC-003, and keeps future specs from reopening the hole.

## R4 — One redaction rule on the server

**Decision**: A pure function per module boundary, on the same rule: a reader gets a fact with `interview: "Interview N"` (order of interview dates), verbatims only if the study is anonymised, pseudonyms only. Synthesis needs each study's `anonymised` flag: added to `ProjectStudy`. A recommendation's `owner` becomes null for a reader.

**Rationale**: FR-015 to FR-017. The client never receives what it must not show.

**Alternatives**: Hide in the client: reserved content would still travel.

## R5 — Lists never call the file source

**Decision**: Lists use the access already recorded (`folderName` is null until confirmed), and say **"Folder access not confirmed"**. The check runs when the person opens the study.

**Rationale**: A list of all teams would otherwise call the source once per study (FR-014). The list cannot say "not accessible" for a person never checked, so the spec's wording is corrected.

## R6 — A removed person's run stops

**Decision**: Keep today's behaviour, where the worker checks the starter's access. Interviews not yet processed fail; what is done stays, with its costs; someone in the team starts again.

**Rationale**: Read in the cleaning run (`cleaning-commands.ts`). Letting a run finish would keep reading a folder and spending under the name of someone who left; supporting it would need a separate worker gate. The spec's edge case is corrected. The tasks check that other runs behave alike.

## R7 — The assistant outside the team

**Decision**: The page context comes from the read gates and leaves out what is reserved, including the next step, which comes from interview states. On a read-only page the tools are limited to an allowlist: `open_project`, `open_study`, `offer_choices`. No skill, no framing, no creating: that is for a page of the person's own teams. No new reading tool.

**Rationale**: FR-019 to FR-021. An allowlist stays closed when a tool is added. Applying a stale card is refused by the commands. So in this version the assistant answers about a project from its goal and studies, as its context does today; it does not read insights.

## R8 — Deletion

**Decision**: The command already requires team membership. `canDelete` in the project's reading now requires it too, for a creator.

**Rationale**: Today's reading says `admin or creator`, so a creator outside the team would see the button.

## R10 — A study's detail and the folder barrier

**Decision**: For a reader, `GET /api/studies/:studyId` runs the folder check, as opening a study does, and without confirmed access returns only name, type, team and access kind: no goal, no linked projects, no settings. Lists keep using the recorded access (R5). A reader's study page opens on Analysis, as Fieldwork is reserved.

**Rationale**: FR-012. The current detail returns the goal without checking the folder, as the screen hides it; a reader must not receive it.

## R11 — A directory of teams

**Decision**: `GET /api/teams/directory` returns the id and name of every team to any active member. `GET /api/teams` is unchanged.

**Rationale**: FR-001: `GET /api/teams` returns only a member's own teams, so a study in no project of another team could not be reached. Member counts and other details stay as they are.

## R12 — A reader's debrief holds no quote

**Decision**: Outside the team the deck is built without verbatims, on anonymised studies too.

**Rationale**: FR-017 would allow them on an anonymised study, but the deck's masking relies on names read through the team's gates. A deck without quotes is the safe first version; insights and facts remain readable.

## R9 — List filter

**Decision**: `teams=mine|all` on `listProjects` and a team selector on the Studies page. The web client starts on `mine` when the person has teams.

**Rationale**: FR-002, FR-022; pagination and counts stay in SQL.
