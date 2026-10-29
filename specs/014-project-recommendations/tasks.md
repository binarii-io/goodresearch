---
description: "Task list for 014-project-recommendations"
---

# Tasks: Project recommendations and key takeaways

Write the domain tests before the code (constitution V).

## Phase 1: Setup and foundations

- [X] T001 Migration `0035_project_recommendations.sql` and schema, per [data-model.md](data-model.md).
- [X] T002 [P] Contracts `packages/contracts/src/recommendations.ts`, the error codes, and the queues `synthesis.recommendations` and `synthesis.takeaways`.
- [X] T003 Factor `insightsNow(deps, accountId, projectId)` out of the insight queries: insights with their level, polarity, counts and status.
- [X] T004 Ports and the store (Drizzle and in memory): recommendation runs, recommendations with their links (version check, `applyRun`), takeaways (save with a version, draft state).

## Phase 2: US1 — Find recommendations (P1)

- [X] T005 [P] Test-first `domain/recommendations.ts`:
  - `checkRecommendations`;
  - `mergeRecommendations`;
  - `isReproposal`;
  - `priority`;
  - `kindShown`;
  - `linkStateOf`.
- [X] T006 Prompt `prompts/recommendations.ts`; the fake runner answers the new tasks.
- [X] T007 Commands `recommendation-run-commands.ts`: estimate, start, stop and run job (stop checked before keeping an answer; any failure ends the run).
- [X] T008 Query `recommendation-queries.ts`: overview and detail, with the computed values, the run state and the costs.
- [X] T009 Routes; client generation.
- [X] T010 Web:
  - the third project tab;
  - `recommendations-tab.tsx` with its two panes;
  - the card, the run dialog and the labels.

## Phase 3: US2 — Decide (P1)

- [X] T011 [P] Test-first decisions in `domain/recommendations.ts`: validate, reject, edit, create, link, unlink, reviewed.
- [X] T012 Commands `recommendation-commands.ts`: the decisions, validate many, translations (the translate queue gains a `target`).
- [X] T013 Web:
  - `recommendation-panel.tsx`, edited in place;
  - `insights-picker.tsx`;
  - `new-recommendation-dialog.tsx`;
  - deciding an insight still to decide from the recommendation.

## Phase 4: US3 — Key takeaways (P2)

- [X] T014 [P] Test-first `domain/takeaways.ts`: the draft check and "out of date".
- [X] T015 Commands `takeaways-commands.ts`: save, draft (job), translation; the prompt.
- [X] T016 Web `takeaways.tsx`.

## Phase 5: US4 — Insights changed (P3)

- [X] T017 Link snapshots and "Reviewed", already covered by T005 and T011; shown in the card and the pane.

## Phase 6: Polish

- [X] T018 [P] EN/FR catalogs; docs (context map, synthesis README, apps/api README).
- [X] T019 PostgreSQL component test `apps/api/tests/recommendations.int.test.ts`.
- [X] T020 E2e `apps/web/e2e/recommendations.spec.ts`; run `pnpm check`, `pnpm test` and the e2e.
