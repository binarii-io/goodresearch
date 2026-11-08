# Research: One fact lifecycle for every type of study

Findings from the code (2026-11-08) and decisions. Paths are relative to the repository root.

## R1 — Where facts live today

- **Decision**: Keep the single table `evidence_facts` with its `source` (`interview`, `survey`, `usability`) and its status check (`proposed`, `accepted`, `edited`, `rejected`, migration 0028). The lifecycle is aligned in code and screens, not in a new table.
- **Rationale**: The three sources already share the table, the four statuses, `version`, `decided_by` and `decided_at`. What differs:
  - usability facts are only `accepted` or `edited`, made when an observation is decided and deleted when it is rejected or reopened (`evidence/domain/usability-facts.ts`, `usability/application/commands/observation-commands.ts` `syncFact`);
  - the project panel maps every status but `proposed` to "accepted" (`synthesis/application/queries/insight-queries.ts` l.278);
  - no fact can be reopened.
- **Alternatives considered**: A new common table for facts was rejected: there is nothing to merge.

## R2 — Facts to decide from usability observations

- **Decision**: After `completeAnalysis` (usability store), the run syncs every fact of the session with Evidence through a new port call, `syncSession(sessionId, facts)`:
  - each observation that gives a fact (not a SUS answer, and either decided, or proposed and not rejected by the checks) is upserted with its status mapped from the observation;
  - the session's usability facts whose observation is gone, or no longer gives a fact, are deleted.
  - A decision on an observation (`decide`, `add`) upserts its fact with the observation's status: `rejected` is kept as a rejected fact (no more delete), and `reopen` gives `proposed`.
- **Rationale**: One upsert path. The insight links of a rejected fact read "not accepted" instead of "deleted", as for the other sources. Re-analysis keeps decided facts, because decided observations are kept (`mergeAnalyses`).
- **Alternatives considered**:
  - Creating facts inside the usability transaction: rejected, Evidence owns its tables (module boundaries).
  - Facts only for observations the checks kept: rejected, the checks' "doubted" observations go to people too (spec 038).

## R3 — Task facts

- **Decision**: One usability fact per task of a study with at least one decided task result, kept by Evidence with a support row `{ taskId, outcomes: {success, partial, failure, notAttempted}, sessions, figuresChanged }`. Its session is null.
  - Its statement is written by the app in both languages, from the counts, with no AI call. For example: "Task 2 — Find the report: 3 failures, 1 partial success and 1 success out of 5 sessions".
  - Its polarity is negative when failures and non-attempts reach half of the sessions, positive when successes reach 80 %, neutral otherwise.
  - Its theme is the task.
  - Recomputed after `completeAnalysis` and after each `correctTask`. When the counts of a decided fact change, it goes back to `proposed` with `figuresChanged = true`, cleared at its next decision.
  - A person's edit replaces the statement until the counts change again.
- **Rationale**: The outcome per task is a usability test's main finding. Counts are exact, so no AI is needed and there is no translation cost. This mirrors survey facts and their figures (`updateFigure` / `keepFigure`).
- **Alternatives considered**: One fact per task and session: rejected at clarify (too many facts for one reading).

## R4 — One decision path for every source

- **Decision**: Evidence gets one command, `decideAny({actor, factId, decision, version, statement?})`, with `decision` among `accept`, `edit`, `reject`, `reopen`. It dispatches by source:
  - interview: the existing `decideIn` checks (verbatims, speaker), plus reopen;
  - survey: `decideSurveyFact`, plus reopen;
  - usability observation fact: a port `UsabilityDecisions.decideObservation`, wired in `compose.ts` to the Usability module, so the observation and its fact are decided together (FR-007);
  - task fact: decided in Evidence itself.
  - Reopen is added to the interview and survey domains: back to `proposed`, decision cleared, version + 1.
- `acceptAny(actor, items)` accepts many facts of any source with their versions, as `acceptMany` does for interviews. It returns `{done, changed}`.
- **Rationale**: The shared Facts component and the project panel decide without knowing the source.
- **Alternatives considered**: A route per source with a client that switches by source: rejected, it duplicates rights and version checks.

## R5 — One list for every study type

- **Decision**: A new query, `factBoard(actor, studyId, {status, q, page})`, reads every fact of a study in SQL, 25 per page, with counts per status. It returns `FactRow`s:
  - status `to-decide | accepted | edited | rejected`;
  - `canDecide`;
  - an `evidence` union: `verbatims {count}`, `figure {base, changed}`, `observation {observationId, sessionId, momentMs, screenshot}`, `task {taskId, outcomes, sessions, figuresChanged}`.
  - Used by the Facts list of the survey and usability Analysis tabs, and as the shape of the project panel.
  - The interview study keeps its richer list (themes, participants, verbatims, its interview view), built from the same shared row, status and actions.
- **Rationale**: Load only what is shown (SQL paging and counts). The same component everywhere gives the same labels and actions. Interviews keep their filters by theme and participant.
- **Alternatives considered**: Replacing the interview list entirely: rejected for this spec, it carries interview-only filters and verbatim editing.

## R6 — Project panel

- **Decision**: `ProjectFact` gains:
  - `version`;
  - `canDecide` (the person can change the study);
  - the full status `to-decide | accepted | edited | rejected`;
  - its evidence.
  - The panel shows the shared actions and "Accept all" on the shown facts to decide, through `decideAny` and `acceptAny`. It keeps hiding rejected facts by default.
- **Rationale**: FR-009 and FR-003a, with the same rights as in the study (spec 026 readers see no actions).

## R7 — Insight and recommendation dialogs

- **Decision**:
  - **Insight dialog**:
    - `usable(s) = s.facts > 0 || s.toDecide > 0`, so no study with facts to decide is greyed;
    - `withProposed` is on by default when no chosen study has decided facts, and is turned on when a person picks a study that has only facts to decide;
    - a line says why, and the option still lets a person turn it off, with the dialog then saying no fact is left;
    - a study with no fact is disabled, with "no fact yet".
  - **Recommendation dialog**: it reads insights, not studies, so it shows validated insights and insights to decide. It reads insights to decide by default when none is validated.
- **Rationale**: FR-011 to FR-015. The server rule (`sendable`, `readable`) is unchanged: it was already common.

## R8 — Translation and cost of the new usability facts

- **Decision**: A fact to decide from an observation is translated as other facts are, by the existing translation job under the session's analysis reference (spec 038). Its cost shows with the analysis cost. Task facts need no translation.
- **Rationale**: FR-016.
