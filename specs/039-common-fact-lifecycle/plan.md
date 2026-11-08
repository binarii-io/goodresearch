# Implementation Plan: One fact lifecycle for every type of study

**Branch**: `039-common-fact-lifecycle` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/039-common-fact-lifecycle/spec.md`

## Summary

Facts of interviews, surveys and usability tests already share one table and four statuses. What diverges is how they are born, decided and shown. This plan:

- **Usability facts to decide**: makes usability observations give facts to decide, kept and decided with the observation (a rejection keeps the fact, as rejected), and adds one **task fact** per task, computed from decided outcomes.
- **One decision path** in Evidence, for every source: accept, edit, reject and reopen, plus accept-all. Usability observation facts are decided through a port to the Usability module.
- **One SQL-paged fact board** per study, read by a shared web Facts component, used by:
  - the survey and usability Analysis tabs;
  - the project's Facts panel, which can now decide;
  - interviews, which keep their richer list built from the same row, status and actions.
- **Insight and recommendation dialogs**: they never grey out a study (or insights) that only has items to decide, and read them by default when nothing is decided.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, pg-boss, React, TanStack Query, Lingui, `packages/ui` (all already used)

**Storage**: PostgreSQL migration `0064_common_fact_lifecycle.sql`:
- `evidence_usability_supports`: `observation_id` nullable, new `task_id`, `outcomes`, `sessions` and `figures_changed`, a check for exactly one of observation or task, and a unique (fact study, task);
- `evidence_facts`: the session/source check widened, so a usability task fact has no session.

**Testing**: Vitest:
- domain first: reopen; task fact counts, statement and polarity; observation → fact status;
- use cases on fakes: decideAny dispatch, acceptAny, usability sync;
- component tests on PostgreSQL: fact board paging and counts, decisions, project facts, usability sync after an analysis;
- Playwright with axe: the common process across the three study types.

**Target Platform**: The self-hosted web app and its worker.

**Performance Goals**: The fact board and the project panel load one page (25) and counts in SQL. A decision answers in under 300 ms.

**Constraints**:
- Module boundaries: Evidence never imports Usability; it uses a port wired in `compose.ts`.
- No new AI call: task facts are written by the app, observation facts are translated by the existing job under the analysis reference.
- Readers never get decision actions.

**Scale/Scope**: Up to a few thousand facts per project; up to 500 sessions per usability study.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Spec-driven | Spec 039 with clarifications; Spec Kit steps run | Pass |
| II DDD | Decisions in each domain (reopen added to the interview and survey domains, task fact rules in Evidence's domain); commands return `Result`; queries read SQL into DTOs; Evidence ↔ Usability through ports and `index.ts` | Pass |
| III Provider-agnostic | No provider involved | Pass |
| IV AI proposes, humans decide | Usability facts start "to decide"; only people decide; task facts come from decided outcomes only | Pass |
| V Test-first | Domain rules first in tasks | Pass |
| VI Contracts | Zod contracts, OpenAPI and client regenerated | Pass |
| VII Privacy | Statements never name a person (existing check applies to new facts); readers see no actions | Pass |
| VIII Accessible, international | Shared component with Lingui EN/FR labels, axe in e2e | Pass |
| IX Simplicity | No new table; one decision command and one board query instead of three; the interview list keeps its specifics | Pass |

Re-checked after design: pass.

## Project Structure

### Documentation (this feature)

```text
specs/039-common-fact-lifecycle/{spec,plan,research,data-model,quickstart}.md, contracts/api.md, tasks.md
docs/domain/context-map.md: fact lifecycle (to decide, accepted, edited, rejected, reopen), task fact
apps/api/src/modules/evidence/README.md, apps/api/src/modules/usability/README.md
docs/agent-journeys/14-usability-analysis.md (facts to decide, task facts)
```

### Source Code (repository root)

```text
apps/api/drizzle/0064_common_fact_lifecycle.sql
apps/api/src/modules/evidence/
  domain/facts.ts, survey-facts.ts        reopen
  domain/usability-facts.ts               status from the observation; task facts (counts, statement, polarity)
  application/commands/fact-decisions.ts  decideAny, acceptAny (new)
  application/commands/usability-fact-commands.ts  upsert with status, syncSession, syncTasks
  application/queries/fact-board.ts       factBoard (new)
  application/ports.ts                    UsabilityDecisions port
  infrastructure/*                        store queries, routes, schema
apps/api/src/modules/usability/
  application/ports.ts                    Facts port: sync with status, syncSession, syncTasks
  application/commands/observation-commands.ts, analysis-run.ts  sync after decisions and after an analysis
apps/api/src/modules/synthesis/application/queries/insight-queries.ts  ProjectFact fields
apps/api/src/compose.ts                   wiring of the ports
packages/contracts/src/facts.ts, insights.ts
apps/web/src/features/facts/              shared Facts component (new): list, status badge, actions, accept all, evidence
apps/web/src/features/surveys/survey-facts.tsx, usability/analysis-tab.tsx, synthesis/facts-panel.tsx, analysis/facts-list.tsx
apps/web/src/features/synthesis/insight-run-dialog.tsx, recommendation-run-dialog.tsx
apps/web/e2e/common-facts.spec.ts
```

**Structure Decision**: The work stays in the existing modules: Evidence owns facts, Usability owns observations and task results, and Synthesis reads. A new web feature folder, `facts/`, holds the shared component.

## Complexity Tracking

No violation to justify.
