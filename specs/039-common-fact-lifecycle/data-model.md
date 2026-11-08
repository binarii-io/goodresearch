# Data model: One fact lifecycle for every type of study

## Fact (Evidence, table `evidence_facts`, unchanged columns)

| Field | Values | Notes |
|---|---|---|
| `source` | `interview`, `survey`, `usability` | unchanged |
| `status` | `proposed`, `accepted`, `edited`, `rejected` | shown as to decide, accepted, edited, rejected for every source |
| `session_id` | nullable | null for survey facts and, now, for usability **task facts** (check widened, migration 0064) |
| `version`, `decided_by`, `decided_at` | | every decision bumps the version; reopen clears `decided_by` and `decided_at` |

**Lifecycle (every source)**: `proposed` → accept → `accepted`; → edit → `edited`; → reject → `rejected`; any decided status → reopen → `proposed`. A decision is refused if the version seen is not the current one.

## Usability support (table `evidence_usability_supports`, migration 0064)

| Field | Change | Notes |
|---|---|---|
| `observation_id` | becomes nullable (still unique) | an observation fact |
| `task_id` | new, nullable | a task fact; unique per fact's study and task |
| `outcomes` | new jsonb, nullable | `{success, partial, failure, notAttempted}` of decided task results |
| `sessions` | new integer, nullable | sessions counted |
| `figures_changed` | new boolean, default false | set when a decided task fact's counts change; cleared at its next decision |
| `study_id` | new, nullable | the task fact's study, for one task fact per study and task (unique with `task_id`) |
| check | new | exactly one of `observation_id` and `task_id` |

## Usability observation → fact status

| Observation | Fact |
|---|---|
| proposed, kept or doubted by the checks | proposed |
| proposed, rejected by the checks | none |
| accepted | accepted |
| edited | edited |
| rejected | rejected (kept, no longer deleted) |
| SUS answer | none (it feeds the SUS score) |

## Task fact

- One per study and task with at least one decided task result (status `accepted` or `edited`).
- Its statement is written by the app in English and French from the counts.
- Its polarity: negative when failures plus non-attempts are at least half of the sessions; positive when successes are at least 80 %; neutral otherwise.
- Its theme is the task's instruction.
- Its counts change → when the fact is decided, it goes back to `proposed` and `figures_changed` is set; when it is still `proposed`, its statement is updated. A person's edited statement is kept until the counts change.

## FactRow (read model, shared Facts component)

`{ id, version, studyId, source, sessionId | null, status: 'to-decide' | 'accepted' | 'edited' | 'rejected', statement {en, fr}, polarity, theme, participant | null, translation, canDecide, insights (count), evidence }`

`evidence` is one of:

- `{ kind: 'verbatims', count }`
- `{ kind: 'figure', base, changed }`
- `{ kind: 'observation', observationId, sessionId, momentMs, screenshot }`
- `{ kind: 'task', taskId, outcomes, sessions, figuresChanged }`

Counts per status are returned with each page.
