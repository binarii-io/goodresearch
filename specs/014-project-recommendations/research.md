# Research: Project recommendations and key takeaways

Decisions for spec 014. They follow spec 013 (`synthesis` module), unless said.

## R1. In the `synthesis` module

- **Decision**: recommendations, their links, their runs and the key takeaways go into `synthesis`. They read the insights in the same module, so they need no new port. Insights are read with their computed values (confidence level, polarity, participants) through a shared read, `insightsNow`, which is factored out of the Insights tab query.
- **Why**: Recommendation and KeyTakeaways are Synthesis objects (context map #7).

## R2. What the AI receives

- **Recommendations**: one call per run. Each insight is a line, `iN | theme | confidence | polarity | for N against M | statement` (runner's language). The call also carries:
  - the existing recommendations not rejected, as `rN | kind | action | insights iN…`;
  - the rejected ones' actions, as a list to avoid.

  The answer is `{ recommendations: [{ ref?, action{en,fr}, rationale{en,fr}, kind, impact, effort, successMeasure{en,fr}, insights[] }] }`. Over 200 insights, the lines are cut into calls by theme (as R3 of spec 013).
- **Takeaways draft**: one call with the validated insights (`theme | confidence | polarity | for N against M of P participants | F facts | statement`), the validated recommendations (`kind | priority | action`), an overview of the whole as counts (panel, insights by confidence, theme and polarity, recommendations by kind; never a share), the takeaways saved (to revise, not to write again) and the goal. Insight lines of recommendation runs carry the same weight. The answer is `{ sentences: [{ en, fr }] }`.
- **Never sent**: facts, verbatims, names, interview or study names, owners.

## R3. Checks, merge and decisions

- **Same rules as insights** (spec 013 R5, R6):
  - known refs only;
  - at least one insight;
  - values within their lists;
  - an action holding a known name is dropped;
  - lengths: action 200, rationale 1,000, success measure 300;
  - at most 15 new recommendations;
  - incremental merge with `suggested` links;
  - an unlinked insight is never linked again;
  - a reproposal (60% of the words of a rejected action, or the same insights) is dropped.
- **Validating needs** one counted link to a validated or edited insight.
- **A link keeps a snapshot** of its insight (statement in English, theme key, confidence level). The insight's state now is:
  - `validated`;
  - `to-decide` (proposed);
  - `rejected`;
  - `deleted`;
  - `changed`: the statement, theme or level differ from the snapshot.

  "Insights changed" counts the counted links that are rejected, deleted or changed; "Reviewed" takes the snapshots again.

## R4. Computed values

- **Priority**: impact × 2 − effort, with high 3, medium 2, low 1, so from −1 to 5.
- **Kind shown**: `test` when the kind is `build`, at least one link is counted, and every counted link that is validated has a `low` level.
- **Both are derived** at read time and never stored.

## R5. Key takeaways

- **One row per project**:
  - text EN/FR;
  - translation state;
  - who saved it and when;
  - version;
  - `saved_over`: the sorted ids and versions of the validated insights and recommendations;
  - the last draft: text EN/FR, state `drafting | ready | failed`, when, by whom.
- **"May be out of date"**: `saved_over` differs from the validated insights and recommendations now.
- **The draft** runs as a job (queue `synthesis.takeaways`, one per project via the singleton key) and is never applied by itself. "Use this draft" copies it into the text, which the person can still edit, and saves it.
- **Draft check**: sentences with a percentage or a known name are removed; fewer than 2 left marks the draft `failed`; more than 4 are cut to 4.

## R6. Runs, consent, costs, translations

- **Runs**: `synthesis_recommendation_runs`, as `synthesis_runs`, with `with_proposed`. Queue `synthesis.recommendations`, exclusive by project.
- **Consent**: the existing `synthesis_consents`, one consent for the project's synthesis. Its text now names insights and recommendations.
- **Ledger refs**:
  - `recommendations:<runId>:<n>`;
  - `takeaways:<projectId>`;
  - `recommendations-translation:<projectId>`.
- **Translations**: the queue `synthesis.translate` gains a `target` (`insight`, the default for jobs queued before, `recommendation` or `takeaways`). It uses the same pending-translation rules (spec 013 review).

## R7. The views

- **The tab**: a third project tab, "Recommendations". The takeaways block sits on top, then the two panes as for insights:
  - **list**: creation order; filters by status, kind and priority; "Validate all shown";
  - **right pane**: in-place edits, with Select for kind, impact and effort and InlineEdit for the texts and the owner, plus tiles for priority, kind, impact and effort;
  - **its insights**: each with a link to it in the Insights tab, and an insights panel to link more (search, theme, confidence, "not used").
