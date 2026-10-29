# Data model: Project recommendations and key takeaways

Migration `0035_project_recommendations.sql` (the next free number). All tables belong to the `synthesis` module and cascade with the project.

## synthesis_recommendation_runs

The same columns as `synthesis_runs`, without `study_ids` and `scope`: `id`, `project_id`, `team_id`, `started_by`, `with_proposed`, `calls`, `calls_done`, `stop_requested`, `left_out`, `failure`, `started_at`, `heartbeat_at`, `finished_at`. There is a partial unique index on `project_id` where `finished_at is null`.

## synthesis_recommendations

| Column | Notes |
|---|---|
| id, project_id | |
| action_en, action_fr | ≤ 200 |
| rationale_en, rationale_fr | ≤ 1000 |
| measure_en, measure_fr | ≤ 300 |
| kind | `build \| test \| investigate` |
| impact, effort | `high \| medium \| low` |
| owner | text null, ≤ 100 |
| translation, pending_translation | as insights |
| origin, status, run_id, decided_by, decided_at, version | as insights |

## synthesis_recommendation_insights

| Column | Notes |
|---|---|
| (recommendation_id, insight_id) | primary key; cascade on the recommendation; no foreign key to the insight: a deleted one shows "deleted" |
| state | `counted \| suggested \| unlinked` |
| origin, by, at | |
| insight_statement_en, insight_theme_key, insight_level | the snapshot |

## synthesis_takeaways

One row per project (`project_id` is the primary key):
- `text_en`, `text_fr`;
- `translation`, `pending_translation`;
- `saved_by`, `saved_at`, `version`;
- `saved_over` (jsonb, the sorted `id:version` list);
- the draft: `draft_en`, `draft_fr`, `draft_state` (`none | drafting | ready | failed`), `draft_by`, `draft_at`.

## Derived (never stored)

- **Priority** and **kind shown** (research R4).
- **Link state**: the insight now against its snapshot.
- **"Insights changed"**.
- **Takeaways "may be out of date"**.
