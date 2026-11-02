# Tasks: Read access for everyone, changes for the team

**Input**: Design documents from `specs/026-read-access-team-changes/`

**Tests**: domain rules test-first (constitution V); use-case tests with fakes; route tests on the real app; e2e with the simulated Drive and the test provider. Test tasks come before what they prove and must fail first.

**Order constraint**: no read route opens before the guard (Phase 2) and redaction (Phase 7) are in place. US1's reads return reserved-free shapes only; Phase 7 completes them inside the same pull request.

## Phase 1: Setup

- [X] T001 Write the route inventory test, failing on any unclassified route, from contracts/access.md, in apps/api/tests/access-inventory.component.test.ts
- [X] T002 Confirm the takeaways and debrief read routes against apps/api/src/modules/synthesis/infrastructure/recommendation.routes.ts and debrief.routes.ts, and correct specs/026-read-access-team-changes/contracts/access.md

## Phase 2: Foundational

**Purpose**: The relation, the refusal and the `canChange` contract, needed by every story.

- [X] T003 Write the relation rule's tests (admin, member of the team, other active member, no access; `canChange`; `canDelete` for a creator in and out of the team) in apps/api/src/modules/research/tests/relation.test.ts
- [X] T004 Implement the pure rule in apps/api/src/modules/research/domain/relation.ts
- [X] T005 Add the `READ_ONLY` error with `{ team: { id, name } }` and `canChange` on ProjectSummary, ProjectDetail, StudySummary, TeamStudy, StudyDetail in packages/contracts/src/research.ts and packages/contracts/src/index.ts
- [X] T006 Add `getStudyReadAccess` (relation, type, teamId, anonymised, textAnalysed) next to `getStudyAccess`, unchanged, in apps/api/src/modules/research/application/queries/study-queries.ts, and export it through apps/api/src/modules/research/infrastructure/module.ts
- [X] T007 Add owner lookups by `studyId`, `projectId`, `sessionId`, `publicationId`, `plannedInterviewId`, `teamId` in the research, ingestion and publishing modules, each through its `index.ts`
- [X] T008 Write the guard's tests (outsider 403 with the team on a change and on a reserved GET, team member and admin pass, unknown id passes through, GET of the open list untouched) in apps/api/src/platform/http/change-guard.test.ts
- [X] T009 Implement the guard as a `preHandler` on routes with one of these ids, except the GET routes of the open list, in apps/api/src/platform/http/change-guard.ts, register it in apps/api/src/platform/http/app.ts, and give it its lookup in apps/api/src/compose.ts
- [X] T010 Extract the folder check from `resolveStudyAccess`, shared by both gates, in apps/api/src/modules/ingestion/application/access.ts

**Checkpoint**: Nothing is opened yet; every change and reserved read from outside the team answers `READ_ONLY`.

## Phase 3: User Story 2 - Only the team changes its work (P1)

**Goal**: No change or AI run from outside the team, by any way in.

**Independent Test**: As an outsider, send every kind of change directly: each is refused, nothing changes, nothing in the ledger.

- [X] T011 [US2] Extend apps/api/tests/access-inventory.component.test.ts: every non-GET route with a real resource id answers `READ_ONLY` for an outsider, and the ledger stays unchanged
- [X] T012 [P] [US2] Write the tests for a creator who left the team (deletion refused, `canDelete` false) and a person removed from a team (refused at the next request) in apps/api/tests/project-deletion.component.test.ts and apps/api/tests/access.component.test.ts
- [X] T013 [US2] Require team membership for a creator in `canDelete` in apps/api/src/modules/research/application/queries/project-queries.ts, tested in apps/api/tests/read-access.component.test.ts
- [X] T014 [US2] Check that every run in the worker stops when its starter left the team, as in apps/api/src/modules/transcripts/application/commands/cleaning-commands.ts: ingestion, evidence, interview-quality and synthesis run commands; align any that differs, with a test in its module's tests

**Checkpoint**: The closed side is proven.

## Phase 4: User Story 1 - Read the research of other teams (P1)

**Goal**: Every active member finds and opens every project and study.

**Independent Test**: A member of team A reads a project and study of team B, and changes nothing.

- [X] T015 [US1] Write the outsider's reading tests, including a member of no team and a deactivated account, in apps/api/tests/read-access.component.test.ts
- [X] T016 [US1] Add `readProject` and `teams=mine|all` on `listProjects`, paged and counted in SQL, with `canChange`, in apps/api/src/modules/research/application/queries/project-queries.ts
- [X] T017 [US1] Add `readStudy`, `readStudies`, `readTeamStudies` with `canChange` in apps/api/src/modules/research/application/queries/study-queries.ts; `readStudy` runs the folder check for a reader and, without confirmed access, returns only name, type, team and access kind (no goal, no linked projects, no settings), wired in apps/api/src/compose.ts and tested in apps/api/tests/read-access.component.test.ts
- [X] T018 [US1] Add a read path for the guide, after the folder barrier, in apps/api/src/modules/research/application/queries/preparation-queries.ts
- [X] T019 [US1] Move the research read routes of contracts/access.md to the read gates in apps/api/src/modules/research/infrastructure/http.routes.ts
- [X] T020 [US1] Read the project overview, team overview and their costs through the read gates, in apps/api/src/modules/reporting/application/queries/overview-queries.ts and apps/api/src/compose.ts
- [X] T021 [US1] Add `readableProjectOf` for queries only, leaving `projectOf` team-gated for commands, in apps/api/src/modules/synthesis/application/project.ts and apps/api/src/modules/synthesis/application/ports.ts; wire it in apps/api/src/compose.ts
- [X] T022 [US1] Use it in apps/api/src/modules/synthesis/application/queries/insight-queries.ts, recommendation-queries.ts, takeaways-queries.ts and debrief-queries.ts
- [X] T022a [US1] Add `GET /api/teams/directory` (id and name of every team, for any active member; `GET /api/teams` unchanged) in apps/api/src/modules/workspace/application/queries/member-queries.ts and apps/api/src/modules/workspace/infrastructure/http.routes.ts, with its contract in packages/contracts/src
- [X] T023 [US1] Add the "mine / all teams" filter with team names in apps/web/src/routes/_authenticated/index.tsx, a team selector from the directory leading to any team's Studies page, and let any member open apps/web/src/routes/_authenticated/team-studies/$teamId.tsx
- [X] T024 [US1] Not needed on study cards: every card of a list belongs to one team, named by the page; the team shows on project cards, the badge and the team navigation

## Phase 5: User Story 3 - See at once that a page is read only (P1)

**Goal**: A badge names the team, and no control appears.

**Independent Test**: The same pages as a team member and as an outsider: badge and no control only for the outsider.

- [X] T025 [US3] Add `ReadOnlyBadge`, with a story and axe check, in packages/ui/src/components/read-only-badge.tsx and its stories file
- [X] T026 [US3] Provide `canChange` to a page's content with `useCanChange` in apps/web/src/features/workspace/read-only.tsx
- [X] T027 [US3] Show the badge and hide project-level controls in apps/web/src/routes/_authenticated/projects/$projectId.tsx, apps/web/src/features/research/project-journey.tsx, attach-study-dialog.tsx, detach-study-dialog.tsx, delete-project-dialog.tsx
- [X] T028 [US3] Show the badge and hide study-level controls in apps/web/src/routes/_authenticated/studies/$studyId.tsx (a reader's page opens on Analysis, as Fieldwork is reserved), apps/web/src/features/research/study-settings.tsx, apps/web/src/features/preparation/preparation-tab.tsx (for a reader, no call to `planned-interviews` or `publications`)
- [X] T029 [US3] Hide change and AI run controls in apps/web/src/features/synthesis (insights, recommendations, takeaways, debrief) and in apps/web/src/features/analysis/analysis-tab.tsx
- [X] T030 [US3] Show `READ_ONLY` as a message naming the team when a page left open is refused, then reload the page's data, in apps/web/src/features/workspace/errors.ts

## Phase 6: User Story 4 - Know why a study's content is not available (P1)

**Goal**: Withheld content always comes with its reason.

**Independent Test**: No access, source not connected, source outage: each gives its message, with only name, type and team.

- [X] T031 [US4] Write the tests for the source status of a reader (no inventory, three distinct kinds) in apps/api/tests/read-access.component.test.ts
- [X] T032 [US4] Serve `GET /api/studies/:studyId/source` through the read gate, with the access kind and folder owner and no inventory for a reader, in apps/api/src/modules/ingestion/application/queries/source-queries.ts and apps/api/src/modules/ingestion/infrastructure/http.routes.ts
- [X] T033 [US4] Show the owning team, and for a reader the existing messages without connection or attach actions that do not apply, in apps/web/src/features/ingestion/source-panel.tsx
- [X] T034 [US4] Add the "Folder access not confirmed" mark in apps/web/src/features/research/study-card.tsx and team-studies page, with no call to the source
- [X] T035 [US4] Add the note on studies left out of the counts in apps/web/src/features/research/project-journey.tsx, from a count given by apps/api/src/modules/reporting/application/queries/overview-queries.ts

## Phase 7: User Story 5 - Real names stay with the team (P1)

**Goal**: Findings without identities outside the team.

**Independent Test**: As an outsider with folder access, on both kinds of study, request each reserved content directly: nothing comes back.

- [X] T036 [US5] Write the redaction tests (neutral "Interview N" by interview dates; verbatims only when anonymised; pseudonyms only; no file name) in apps/api/src/modules/evidence/tests/reader-facts.test.ts
- [X] T037 [US5] Implement the rule in apps/api/src/modules/evidence/domain/reader-facts.ts
- [X] T038 [US5] Add the reader's facts page, through the read gate and folder barrier, in apps/api/src/modules/evidence/application/queries/analysis-queries.ts and apps/api/src/modules/evidence/infrastructure/http.routes.ts, with its shape in packages/contracts/src/facts.ts
- [X] T039 [US5] Write the tests for insights and recommendations (quotes by study's anonymisation, count only without folder access, `owner` null) in apps/api/src/modules/synthesis/tests/reader-views.test.ts
- [X] T040 [US5] Add `anonymised` to `ProjectStudy` in apps/api/src/modules/synthesis/application/ports.ts and apps/api/src/compose.ts, and apply the rule in insight-queries.ts, recommendation-queries.ts and debrief-queries.ts, with shapes in packages/contracts/src/insights.ts and packages/contracts/src/recommendations.ts
- [X] T041 [US5] Extend apps/api/tests/access-inventory.component.test.ts: every reserved GET answers `READ_ONLY` to an outsider, on an anonymised study and on one that is not, and no response body holds a seeded real name
- [X] T042 [US5] Show reserved tabs (Fieldwork, Enrichment, Quality) as "reserved to the team" in apps/web/src/routes/_authenticated/studies/$studyId.tsx, including for a direct link
- [X] T043 [US5] Show the reader's facts, with hidden verbatims and the reason, in apps/web/src/features/analysis/analysis-tab.tsx (for a reader, only `GET /api/studies/:studyId/facts`, no call to `facts-analysis`)
- [X] T044 [US5] Show hidden quotes and owners in apps/web/src/features/synthesis

## Phase 8: User Story 6 - The assistant reads everywhere, acts only in the team (P2)

**Goal**: Same rules in the assistant.

**Independent Test**: From another team's project, ask for a rename, a run and the interviews: no card, the reason given, nothing reserved in what goes to the provider.

- [X] T045 [US6] Write the tests (context without reserved content or next step; allowlist; stale card refused and marked failed; no consent card) in apps/api/src/modules/assistant/tests/read-only-page.test.ts
- [X] T046 [US6] Add `readProject`, `readStudy`, `readStudies` to `ResearchReads` in apps/api/src/modules/assistant/application/ports.ts, wired in apps/api/src/compose.ts
- [X] T047 [US6] Build a read-only page's context from them, without the next step, and tell the model that the owning team decides, in apps/api/src/modules/assistant/application/context.ts
- [X] T048 [US6] Limit the tools on a read-only page to the allowlist of research R7 in apps/api/src/modules/assistant/application/tools.ts
- [X] T049 [US6] Mark a refused card as failed with the `READ_ONLY` reason in apps/api/src/modules/assistant/application/commands/proposal-commands.ts

## Phase 9: Polish

- [X] T050 Run `pnpm generate` and `pnpm --filter @goodresearch/web i18n:extract`, and write the French strings in the catalogs, using the bilingual glossary
- [X] T051 [P] Update the tests that expected "not found" for an outsider's read, only where this spec changes it, in apps/api/tests/access.component.test.ts and apps/web/e2e/us3-access.spec.ts; every other existing test stays as is (SC-007)
- [X] T052 [P] Write the outsider's journey with axe, in English and French, in apps/web/e2e/read-only-access.spec.ts
- [X] T053 [P] Write docs/adr/0009-read-for-all-change-for-the-team.md, and add a pointer to it in the Consequences of docs/adr/0008-studies-owned-by-teams.md
- [X] T054 [P] Update Member, Team, TeamMembership, Folder access and add Read-only access and Reserved content in docs/domain/context-map.md, with the bilingual glossary
- [X] T055 [P] Update apps/api/README.md (specs/roadmap.md holds the owner's own notes: left as is)
- [X] T056 Run `pnpm check`, `pnpm test`, `pnpm e2e` and specs/026-read-access-team-changes/quickstart.md

## Dependencies

- Phase 1 → Phase 2 → all stories.
- US2 first: the closed side, before anything opens.
- US1 → US3, US4, US5, US6: they need the read routes.
- US3, US4 and US5 can proceed in parallel, apart from shared files (`$studyId.tsx`, `analysis-tab.tsx`).
- US6 can wait for the others, but ships in the same pull request: without it, the assistant answers nothing on another team's page.
- Polish last.

## Parallel Examples

- Phase 2: T003, T008 (tests in different files).
- US2: T012 alongside T013 once written.
- Polish: T051 to T055.
- After US1: API tasks of US4 (T031, T032) and US5 (T036, T037).

## Implementation Strategy

There is no shippable subset smaller than US1 to US5: opening reads without redaction would disclose real names. Build in this order inside one pull request, each commit keeping tests green: guard and relation, closed side, reads, redaction, assistant, screens, docs. Reads are opened with reader shapes that omit reserved fields until redaction fills them.
