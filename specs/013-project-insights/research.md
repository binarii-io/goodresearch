# Research: Project insights

Decisions for spec 013. Each one gives the decision, why it was taken, and the alternatives rejected.

## R1. A new `synthesis` module

- **Decision**: insights, their links and the insight runs live in a new module, `apps/api/src/modules/synthesis` (context map #7, Synthesis: core, domain model). It reaches the other modules only through ports wired in `compose.ts`:
  - **research**:
    - the project's access (team);
    - the project's studies, with each person's study access (folder, spec 002 FR-010a);
    - the research goal;
    - the theme sections of each study's guide.
  - **evidence**: a new public read, `projectFacts(studyIds)`. It returns the accepted and edited facts of those studies: id, study, interview, statement (EN/FR), polarity, theme, participants (the codes of its verbatims), version and `decidedAt`. A second read, `factsByIds(ids)`, returns any fact whatever its status, so links can show a rejected or deleted fact.
  - **ai-gateway**: `gateway`, `estimateCost`, and `studyCosts(refs)`, used as a generic per-ref cost read.
- **Why**: the context map puts Insight in Synthesis. Evidence stays the owner of facts; Synthesis only reads them through Evidence's interface (AGENTS.md: never another module's tables).
- **Rejected**: adding insights to `evidence`, because it mixes two core contexts and Evidence is study-scoped while insights are project-scoped.

## R2. What the AI receives

- **Decision**: per run, the facts of the chosen studies (scope applied) are numbered `f1…` in study → interview → theme order. One line per fact holds:
  - `fN`;
  - the statement in the runner's language;
  - the polarity;
  - the theme ref (`t1…`, `other`);
  - the participant code (`P01`, or `S2-P01` when the project has more than one study);
  - the study ref (`s1…`).

  The call also carries:
  - the goal;
  - the themes as `t1: title`;
  - the existing insights of those themes, not rejected, as `iN: theme, statement, support [fN…], counter [fN…]` (facts outside the run are omitted);
  - the rejected insights' statements, as an avoid list.

  The answer is `{ insights: [{ ref?: "iN", theme, statement: {en, fr}, description: {en, fr}, counterEvidence: {en, fr}, minorityView: {en, fr}, support: ["fN"], counter: ["fN"] }] }`. `ref` present means an update of that insight.
- **Why**: FR-004 and constitution VII (pseudonymised AI input for synthesis). Statements already hold no name (spec 012 FR-006), and the app checks again with `holdsName`. Codes are pseudonyms whatever the study's anonymisation.
- **Rejected**:
  - sending fact uuids: long, wastes tokens, and the model miscopies them;
  - sending verbatims: personal speech, not needed to group facts.

## R3. Splitting the calls

- **Decision**: one call while the fact lines fit in 40,000 characters (about 600 facts). Above that, facts are grouped by theme into batches under that limit, each batch with its themes' insights. A theme too large for one batch is split in fact order.
  - Calls run 2 at a time and stop between calls.
  - The 25-insight cap (FR-005) applies to the run as a whole. New insights are kept by most supporting participants first; ties go in answer order.
- **Why**: SC-006 asks for 750 facts in under 5 min, which means 1 or 2 calls. Theme grouping keeps related facts together.
- **Rejected**: a map-reduce over all facts (two AI passes, harder to verify against known refs).

## R4. Confidence and polarity, computed

- **Decision**: pure domain functions, written test-first.
  - `panel(facts)` = the distinct `(studyId, participant)` pairs over the accepted facts of all the project's studies.
  - `confidence(insight, facts, panelSize)`:
    - supporting participants `s` = distinct pairs over the counted `support` links whose fact is accepted and inside the project;
    - counter participants `c`, computed the same way over `counter` links;
    - level: `high` if `s ≥ max(5, ceil(0.3 × panel))`, else `medium` if `s ≥ 3`, else `low`;
    - then one level lower if `c ≥ ceil(s / 2)` and `c > 0`.

    With facts still to decide linked, it also gives what they would add (`pendingSupport`, `pendingCounter`) and the level once they are accepted, over the panel widened to the participants whose facts are still to decide (`panelIfAccepted`). It returns the level, `s`, `c`, the panel, the rule, and `missingForHigh` (how many more participants are needed, or the counter-evidence that holds it back).
  - `polarity(insight, facts)` uses the counted supporting facts: `neutral` if polarised facts are under 30%; `positive` or `negative` if one side is at least 60% of the polarised facts; `mixed` otherwise. No supporting fact gives `neutral`.
- There is no spread condition (clarification 2026-10-29). Values are computed at read time and never stored.
- **Why**: constitution IV (scores by the app). They are derived, so they always follow the facts.

## R5. Incremental runs

- **Decision**: a run's answer is merged by `mergeInsights(existing, answer, rejected, unlinked)`:
  - **New** (no `ref`):
    - dropped if a reproposal (R6);
    - otherwise kept as `proposed` with `ai` links (`counted`).
  - **Update of a `proposed` insight**: its texts are replaced, and its `ai` links are replaced by the answer's. Its `person` links are kept.
  - **Update of a decided insight** (validated, edited, rejected):
    - texts are untouched;
    - facts not yet linked are added as `suggested` links (`ai`);
    - nothing is removed;
    - a rejected one gets nothing.
  - A fact unlinked by a person (`unlinked` link) is never linked again to that insight.
  - An unknown `ref` or fact ref is dropped.
  - An insight left without a supporting fact is dropped and counted in `leftOut`.
- **Why**: constitution IV (never overwrite a decision, never re-add a removed link). FR-006.

## R6. Reproposal of a rejected insight

- **Decision**: a new insight is dropped when its statement (EN or FR) shares 60% or more of its words with a rejected insight's, or when its supporting facts equal a rejected insight's. Within a run, an insight repeating one already kept (60% of its words) is dropped too.
  - The word-share helper (`shareOf`, `words` + `fold`) moves from `evidence/domain/facts.ts` to `packages/shared/src/text.ts` as `sharedWords`, and both modules use it.
- **Why**: the same rule as for facts (spec 012 R7). Modules may not import each other's domain.

## R7. "Evidence changed", derived

- **Decision**: each link stores the snapshot of its fact taken when it was linked or last reviewed: `factVersion`, `polarity`, `themeId`, `statementEn`.
  - At read time, each link is compared with `factsByIds`:
    - **not accepted**: a fact rejected or proposed again;
    - **deleted**: absent;
    - **outside the project**: its study is no longer among the project's;
    - **changed**: a different version, with a different polarity, theme or statement.
  - The insight shows "Evidence changed (n)" when any of its counted links is one of these.
  - "Reviewed" (a command) refreshes the snapshots of its links, so changed links stop flagging. Links that are not accepted, deleted or outside the project still show their state and are never counted.
  - Editing the insight also refreshes the snapshots.
- **Why**: queries never write (AGENTS.md), and there is no event bus between Evidence and Synthesis. It is the same pattern as spec 012 R3.
- **Rejected**: domain events from every fact decision. That is a lot of plumbing for a check made at read time.

## R8. Checks on the AI's texts

- **Decision**:
  - statement 1–200 characters;
  - description at most 1,000 characters;
  - counter-evidence and minority view at most 500 characters each, required (the AI writes "None" / "Aucune" when there is none);
  - theme one of those sent, or `other`.
  - Sentences holding a percentage (`/\d+\s?%|\bper ?cent\b|\bpour ?cent\b/i`) are removed from description, counter-evidence and minority view.
  - A statement holding a percentage or a known name (`holdsName`, with the project's known names) drops the insight.
  - Known names come from Evidence's `knownNames` for each study of the project.
- **Why**: FR-005 and the prototype's guardrails ("no percentages").

## R9. Two languages

- **Decision**: as spec 012 R9.
  - The AI writes EN and FR.
  - A person's edit of one language saves at once, with the other marked `translating`. A job `synthesis.translate` translates the edited fields with the person's connection (task `insight-translation`, ledger ref `insights-translation:<projectId>`).
  - A failure marks the insight `not-translated`, with a retry.

## R10. Runs, consent, costs

- **Decision**:
  - **Runs**: an `InsightRun` per project on queue `synthesis.insights` (`exclusive`, keyed by project id). A run with no heartbeat for 10 min is stale. A run stops between calls, and a stop keeps the calls already merged; FR-015 says nothing of an *unfinished* call is kept.
  - **No exclusion with study runs**: a "Find facts" may run meanwhile, and the run reads the facts as they stand at its start.
  - **Consent**: `synthesis_consents (account_id, project_id)`, with the provider, asked again when the provider changes.
  - **Ledger refs**: `insights:<runId>:<n>` per call. The project total is all its runs' refs plus `insights-translation:<projectId>`.
  - **Estimate**: the characters of the fact lines plus the insights sent, at the person's model price, with about 6,000 output tokens per call.

## R11. Access

- **Decision**:
  - The project's team rules govern the tab (spec 002).
  - A study without the person's folder access is not offered in the dialog. Its facts show only as counts ("2 facts from a study you cannot open"), with no statement, and they still count for confidence.
  - A run uses only the studies chosen, which the runner can access.
- **Why**: FR-018, and the same barrier as the study page.

## R12. The views

- **Decision**:
  - **Project page**: `Tabs` from `packages/ui`, "Overview" and "Insights", in the page bar on the right as the study phases, with the tab in the address (`?tab=insights`).
  - **Insights tab**:
    - a header line: "Insights 12 · 0.42 $" (the last run and the total in a tooltip);
    - actions: "Find insights" (dark, as the other AI actions) and "New insight";
    - filters: theme, status, confidence, polarity;
    - cards grouped by theme: statement, a confidence badge with an icon and a text label (`Tooltip` with the calculation), a polarity tag with its text label, "for 7 · against 2" participants, "Evidence changed", "Suggested facts (n)";
    - a footer with "Validate all shown".
  - **Insight view**: the right pane of the tab (two panes: insights left, the one selected right, the first by default). It holds the editable texts (EN/FR toggle as facts), the facts grouped by participant (code, study) with role and state, change role, unlink, accept or dismiss suggested facts, and "Reviewed".
  - **Facts side panel**: a `Sheet`, 25 per page, with search, filters (polarity, theme, study, "not in any insight") and, when an insight is open, "Link as support / counter". Each fact links to `/studies/:id?phase=analysis&interview=…`.
  - **Run dialog**: the studies with their counts, the scope, the estimate, consent, then progress and stop.
