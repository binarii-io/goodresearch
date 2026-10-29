# Implementation Plan: Project insights

**Branch**: `013-project-insights` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-project-insights/spec.md`

## Summary

This is the first step of the project-level synthesis. A new **synthesis** module (context map #7) proposes **insights** from the accepted facts of a project's studies:
- the AI receives anonymised fact lines (refs `fN`, statement, polarity, theme, participant code) with the goal, the themes, the existing insights and an avoid list;
- the app keeps only known refs, removes percentages and names, caps a run at 25 new insights, and merges incrementally without touching a person's decision;
- confidence and polarity are computed by the app at read time;
- a person validates, edits, rejects, links and unlinks facts, or writes insights by hand;
- links keep a snapshot of their fact, so "Evidence changed" is derived when a fact changes later.

The project page gets "Overview | Insights" tabs. Runs, consent, costs and translation follow spec 012. The decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new

**Storage**: PostgreSQL, one migration ([data-model.md](data-model.md)):
- `synthesis_runs`
- `synthesis_insights`
- `synthesis_insight_facts`
- `synthesis_consents`

**Testing**: Vitest.
- **Test-first domain**: fact lines, insight checks, merge, reproposal, panel, confidence, polarity, link state, Insight invariants.
- **Use cases with fakes**: an in-memory synthesis store, fake sources (project, studies, access, facts) and a fake AI.
- **Postgres component tests**: see [quickstart.md](quickstart.md).
- **Playwright + axe**: quickstart scenarios 1, 2 and 6.

**Target Platform / Project Type**: unchanged (web app, API and worker)

**Performance Goals**:
- 750 facts in under 5 min (SC-006): 1–2 calls of at most 40,000 characters, 2 at once.
- The Insights tab computes confidence for about 100 insights over about 1,000 facts in memory, well under 100 ms.

**Constraints**:
- No name, verbatim, interview title or study name is sent to the AI.
- Only accepted facts are sent or counted.
- A run never changes a decided insight's texts and never re-adds an unlinked fact.
- One run per project at a time.

**Scale/Scope**: 1 new module, ~14 endpoints, 2 queues, 1 migration, 2 project tabs, 1 insight view, 1 side panel, 2 dialogs (run, new insight).

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 013 clarified, plan, tasks | ✅ |
| II. DDD pragmatic | Synthesis is a core context with a domain model. `Insight` (with its links) and `InsightRun` are aggregates. Evidence is read through its public `projectFacts` / `factsByIds` / `knownNames`, and research through ports in `compose.ts`; Synthesis never reads another module's tables. Confidence, polarity and link state are derived by queries without writing. | ✅ |
| III. Provider-agnostic | AI through the gateway port; the fake runner answers both tasks | ✅ |
| IV. AI proposes, humans decide | Insights stay `proposed` until decided. A run never edits a decided insight, never re-adds an unlinked fact, never re-proposes a rejected one; suggested links count only once accepted. Confidence and polarity are computed by the app. | ✅ |
| V. Test-first | The domain functions above | ✅ |
| VI. Contracts | Zod for bodies, jobs and the AI output; OpenAPI and client regenerated | ✅ |
| VII. Privacy | AI input pseudonymised (codes, refs); statements checked for names; facts of a study without folder access are not shown | ✅ |
| VIII. a11y & i18n | Confidence, polarity and status as text labels with icons; EN/FR; axe | ✅ |
| IX. Simplicity | Reuses the run, consent, cost and translation patterns; state derived, no sync | ✅ |

Re-checked after design: no new violation.

## Project Structure

```text
specs/013-project-insights/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
packages/shared/src/text.ts                 sharedWords (moved from evidence facts.ts, R6)
packages/contracts/src/insights.ts          cards, detail, facts page, runs; errors.ts codes
apps/api/src/modules/synthesis/
├── domain/         insights.ts (checks, merge, reproposal, invariants), confidence.ts (panel,
│                   confidence, polarity), links.ts (link state), insight-run.ts, fact-lines.ts
├── application/    ports.ts, commands/insight-run-commands.ts (estimate, consent, start, stop,
│                   run job), commands/insight-commands.ts (create, edit, decide, validate many,
│                   link, unlink, reviewed, translate job), queries/insight-queries.ts
├── infrastructure/ schema.ts, synthesis.drizzle-store.ts, http.routes.ts, module.ts (queues
│                   synthesis.insights, synthesis.translate), prompts/insights.ts, README.md
├── tests/          domain + use-case tests, fakes
└── index.ts
apps/api/src/modules/evidence/   index: projectFacts(studyIds), factsByIds(ids), knownNames
apps/api/src/modules/research/   the project's studies, goal and guide themes, for Synthesis
apps/api/src/modules/ai-gateway/ fake runner answers insights, insight-translation
apps/api/src/compose.ts, platform/jobs.ts
apps/web/src/routes/_authenticated/projects/$projectId.tsx   Overview | Insights tabs (?tab=)
apps/web/src/features/synthesis/  insights-tab.tsx, insight-card.tsx, insight-dialog.tsx,
                                  insight-run-dialog.tsx, new-insight-dialog.tsx,
                                  facts-panel.tsx, labels.ts
apps/web/e2e/insights.spec.ts
docs: context map (Synthesis: Insight, link roles and states, InsightRun; glossary EN/FR),
      synthesis README, evidence README (public reads), apps/api README (module, queues, migration)
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**:
   - migration and schema;
   - contracts and errors;
   - `sharedWords` to shared;
   - the Evidence public reads;
   - the research ports;
   - the module skeleton, store and queues;
   - consent;
   - the project page tabs.
2. **US1, find insights** (P1):
   - test-first: fact lines, checks, merge, reproposal, confidence, polarity;
   - the AI port and prompt, and the fake runner;
   - the job (batches, stop, stale, retry) and the estimate;
   - the run dialog, the cards and the costs.
3. **US2, decide** (P1): the Insight invariants and decisions, validate many, link/unlink/role, suggested links, create by hand, translation job, the insight view.
4. **US3, facts panel** (P2): the paged query with search and filters, linking from the panel.
5. **US4, evidence changed** (P2): link snapshots, the derived link state, "Reviewed".
6. **Polish**: EN/FR catalogs, docs, e2e with axe, Postgres component tests.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| A new module | Synthesis is its own core context (context map), project-scoped, and recommendations will join it | Insights inside Evidence, which is study-scoped |
| Fact snapshots on links | "Evidence changed" without events between modules; queries stay read-only | Domain events from every fact decision |
