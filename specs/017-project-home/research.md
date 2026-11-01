# Research: Project home

## R1. Where the query lives

- **Decision**: a new Reporting module (first version: Synthesis), `GET /api/projects/{projectId}/overview`.
- **Rationale**: `docs/standards.md` places cross-module views in Reporting; it reads every module through ports wired in `compose.ts`, Synthesis included. "May be out of date" stays in Synthesis, whose rule it is.
- **Alternatives**: Research (would have to depend on the modules downstream of it); the browser calling each tab's endpoint (several requests, some of them backfilling or reading Drive).

## R2. Reading a study's part

- **Decision**: each module adds a read that takes a study id and neither checks access nor backfills: Ingestion (session states, participants, `session-analysis` cost), Transcripts (`lexicon-reading`, `cleaning` costs), Evidence (fact statuses, `facts` and `facts-translation` costs), Interview quality (`quality` cost). `compose.ts` merges them into one `studyOverview` source.
- **Rationale**: each module keeps the knowledge of its refs, using its existing `refsOf`-style helpers, so the figures match its own screen (SC-003). The existing screen queries are not reused: Ingestion's backfills sessions and others check Drive access (FR-010).
- **Alternatives**: a ledger query by ref prefix (would need studies inside the refs, which they do not hold).

## R3. Access

- **Decision**: `projectOf` gives team access and each study's access. Counts are returned only for accessible studies; costs of all studies enter the project's total, and a study without access shows name and type only, with the number of such studies returned.
- **Rationale**: spec 002 hides a folder's content, not what the team has spent; the total matches the cost shown to other members.

## R4. Costs

- **Decision**: costs over every account (`studyCosts`, as the other screens); `null` when any part is unknown, propagated by a shared sum. Uses: `analysis, lexicon, cleaning, quality, facts` per study; `studies, insights, recommendations, takeaways` per project. The takeaways ref stays separate from the recommendations' total of spec 014 only in the breakdown.
- **Rationale**: FR-007 and the existing convention. Guide-assistant conversations have no study-level ref here (spec assumption).

## R5. Next-step rule

- **Decision**: pure `stepsOf` and `nextStep` in `synthesis/domain/journey.ts`. `interviews`: `empty` without any kept interview, `to-decide` with none validated, else `done`. `facts`, `insights`, `recommendations`: `empty` at 0, `to-decide` with some proposed, else `done`. `debrief`: `done` when takeaways are written, else `empty`. Next step: the first not `done`.
- **Rationale**: spec clarification, including its Interviews exception. The action shown is decided by the UI from the step and its state.

## R6. UI pieces

- **Decision**: a new `JourneySteps` in `packages/ui` (ordered list of link cards, chevrons hidden when stacked, "Next step" as text). Chips are `Badge`, highlight uses the existing soft tokens. The breakdown is a focusable `Tooltip`, like `cost.tsx`. The band uses ink as its ground: dark-theme tokens already reverse `--primary`, so it uses `bg-primary text-primary-foreground`.
- **Rationale**: constitution VIII: one-off pieces belong to the design system. The progress bar uses the existing `Progress`.

## R-perf: Read only what the page shows

- **Decision**: Counts come from SQL (`COUNT ... GROUP BY status`, on the existing `(study_id, status)` and `(project_id, status)` indexes), and interviews from `id`, `state` and `roster` only, never the analysis stored with a session. Fact counts cover validated interviews, as Analysis does (SC-003). Insights, recommendations and facts are read as rows only when key takeaways exist, because "may be out of date" compares the confidence computed from them.
- **Rationale**: The page shows numbers; no row is displayed.
- **Alternatives considered**: Reusing `factsOfStudy`, `listSessions`, `insightsOf`: simpler, but they load everything to count it.

## R-split: Three reads, not one

- **Decision**: Counts, costs and "may be out of date" are three endpoints. Closed studies have no counts read. The Overview's fresh check is asked only with takeaways.
- **Rationale**: The numbers appear without waiting for the ledger or for every fact; other screens' endpoints stay untouched.
- **Alternatives considered**: One aggregate query (the first version): the slowest part held the whole page.

## R-measure: What the page costs

- **Measure** (local PostgreSQL, through the API, median of 12, 40 interviews, 1,500 facts, 3,000 verbatims, 60 insights, key takeaways): `/overview` 5 ms, `/overview/costs` 7 ms, `/takeaways/freshness` 73 ms. No network or browser time.
- **Decision**: `/takeaways/freshness` stays as it is. It blocks nothing, and narrowing it would touch the confidence computation that Insights and Recommendations share. It is read again on each visit: a decision on another screen, facts included, changes its answer, and those screens do not invalidate it.

## R-costs: One rule for costs

- **Decision**: `sumCosts`, `sumKnownCosts` and `anyCostUnknown` live in `@goodresearch/shared`, and the modules' own sums use them. Insights and Recommendations keep showing the known amount and now also say "some calls have no price" (`costIncomplete`); the other screens keep showing "unknown". Quality keeps its "nothing to show at zero".
- **Rationale**: no screen loses a figure, and none presents a partial sum as complete.
