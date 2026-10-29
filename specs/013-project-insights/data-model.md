# Data model: Project insights

This is one migration, the next free number on `main` (`0032_project_insights.sql` today). All tables belong to the `synthesis` module.

## synthesis_runs (InsightRun, per project)

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid | FK `research_projects`, cascade |
| team_id, started_by | uuid | |
| study_ids | jsonb | the studies chosen |
| scope | text | `all` \| `unlinked` |
| calls, calls_done | int | progress (FR-015) |
| stop_requested | boolean | |
| left_out | int | insights dropped (no support, reproposal, name, over the cap) |
| failure | text null | `AI_PROVIDER_REQUIRED`, `AI_FAILED`, `INVALID_ANSWER`, `INTERRUPTED`, `NO_FACTS` |
| started_at, heartbeat_at, finished_at | timestamptz | live = not finished, and heartbeat within the last 10 min |

There is a unique partial index on `project_id` where `finished_at is null`, so a project has at most one open run.

## synthesis_insights

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid | FK `research_projects`, cascade |
| theme_key | text | the theme's folded title, or `other` |
| theme_title | text null | the title at the time |
| statement_en, statement_fr | text | 1–200 chars |
| description_en, description_fr | text | ≤ 1,000 |
| counter_en, counter_fr | text | ≤ 500 |
| minority_en, minority_fr | text | ≤ 500 |
| translation | text | `done \| translating \| not-translated` |
| origin | text | `ai \| person` |
| status | text | `proposed \| validated \| edited \| rejected` |
| run_id | uuid null | |
| decided_by, decided_at | | |
| version | int | optimistic check |

There is an index on `(project_id, status)`.

## synthesis_insight_facts (links)

| Column | Type | Notes |
|---|---|---|
| insight_id | uuid | FK insights, cascade |
| fact_id | uuid | no FK (another module's table); a deleted fact shows "deleted" |
| role | text | `support \| counter` |
| state | text | `counted \| suggested \| unlinked` |
| origin | text | `ai \| person` |
| fact_version, fact_polarity, fact_theme_id, fact_statement_en | | snapshot (research R7) |
| by, at | | |

The primary key is `(insight_id, fact_id)`, so a fact has one role per insight (the last role chosen wins). There is an index on `fact_id`.

## synthesis_consents

| Column | Type | Notes |
|---|---|---|
| (account_id, project_id) | pk | |
| provider | text | the consent is asked again when it changes |
| given_at | timestamptz | |

## Derived (never stored)

- **Panel**: the distinct `(studyId, participant)` pairs over the accepted facts of the project's studies.
- **Confidence**: `{ level, support, counter, panel, missingForHigh }` (research R4).
- **Polarity**: `positive | negative | neutral | mixed` (research R4).
- **Link state now**: `counted | suggested | unlinked`, crossed with the fact's state now: `accepted | not-accepted | deleted | outside | changed` (research R7).
- **Evidence changed**: true when any counted link is not-accepted, deleted, outside or changed.
- **Costs**: the ledger sums over `insights:<runId>:*` and `insights-translation:<projectId>`.

## Domain functions (written test-first)

- `factLines(facts, studies)` gives the refs and lines.
- `checkInsights(answer, refs, themes, names)` gives the kept insights and the left-out count.
- `mergeInsights(existing, checked, rejected)` gives the creates, updates and suggested links.
- `isReproposal(candidate, rejected)`.
- `panel(facts)`, `confidence(...)`, `polarity(...)`.
- `linkState(link, fact, projectStudyIds)`.
- `Insight` invariants:
  - a validated or edited insight needs one counted support link to an accepted fact when a person creates or edits it;
  - a person's create or edit sets `validated` or `edited`;
  - a rejected insight is never changed by a run.
