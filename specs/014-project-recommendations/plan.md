# Implementation Plan: Project recommendations and key takeaways

**Branch**: `014-project-recommendations` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

## Summary

This plan adds recommendations and key takeaways to the `synthesis` module (spec 013).

**Recommendations**
- The AI reads the project's insights as anonymous lines, with their computed confidence, and proposes recommendations.
- The app checks the references and merges new answers incrementally, never touching a person's decision.
- The app computes the priority and the kind shown.
- A person decides each recommendation in a two-pane tab and edits it in place.

**Key takeaways**
- The AI writes a draft that is never saved by itself.
- The tab warns when the saved takeaways may be out of date.

Decisions: [research.md](research.md).

## Technical Context

- **Language, dependencies, platform**: unchanged; no new dependency.
- **Storage**: one migration, described in [data-model.md](data-model.md).
- **Testing**:
  - written test-first: the recommendation checks, merge, reproposal, priority, kind shown, link state, decisions, takeaways draft check and "out of date";
  - use cases tested with fakes;
  - PostgreSQL component tests for the new store;
  - e2e with axe: quickstart scenarios 1 to 3.
- **Performance**: a run makes one call for 60 insights, under 2 minutes (SC-006).
- **Constraints**:
  - No fact, verbatim, name or study name is sent to the AI.
  - Takeaways are never saved by the AI.
  - A run never changes a person's decision.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | ✅ spec 014 clarified, plan and tasks |
| II. DDD | ✅ `Recommendation` and `KeyTakeaways` are aggregates of Synthesis; insights are read within the module; queries derive values and never write |
| III. Provider-agnostic | ✅ gateway port; the fake runner answers the new tasks |
| IV. AI proposes, humans decide | ✅ statuses, no overwrite, no re-proposal, no re-link; priority and kind computed; takeaways never applied by themselves |
| V. Test-first | ✅ |
| VI. Contracts | ✅ Zod schemas, OpenAPI, generated client |
| VII. Privacy | ✅ only insight statements and computed values are sent; owners are never sent |
| VIII. a11y & i18n | ✅ values shown as text; EN/FR; axe |
| IX. Simplicity | ✅ reuses the run, consent, translation and two-pane patterns |

## Project Structure

```text
packages/contracts/src/recommendations.ts
apps/api/src/modules/synthesis/
  domain/recommendations.ts (check, merge, reproposal, priority, kind shown, link state, decisions)
  domain/takeaways.ts (draft check, out of date)
  application/queries/insights-now.ts (shared with insight-queries)
  application/commands/recommendation-run-commands.ts, recommendation-commands.ts, takeaways-commands.ts
  application/queries/recommendation-queries.ts
  infrastructure: schema, store, routes, module (queues synthesis.recommendations, synthesis.takeaways), prompts/recommendations.ts
apps/web/src/features/synthesis/recommendations-tab.tsx, recommendation-card.tsx, recommendation-panel.tsx,
  recommendation-run-dialog.tsx, new-recommendation-dialog.tsx, insights-picker.tsx, takeaways.tsx
apps/web/src/routes/_authenticated/projects/$projectId.tsx (third tab)
apps/web/e2e/recommendations.spec.ts
docs: context map, synthesis README, apps/api README
```

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| Queries read recommendations, insights and takeaways through the store's loaders (plain SQL reads) and derive priority, kind shown, link states and "out of date" in memory with the domain's pure functions | These values depend on the insights' computed confidence, which comes from the facts of another module; computing them in SQL would duplicate the domain rules (spec 013 does the same for confidence) | SQL views duplicating the confidence, polarity and link-state rules |
