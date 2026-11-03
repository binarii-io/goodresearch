# Data model: Survey analysis

Migration `0057_survey_analysis.sql`. Foreign keys to other modules and checks in SQL (docs/standards.md §6).

## Computed, never stored

**Figure** (Surveys, `domain/figures.ts`, pure): from counts per value of one item, over counted responses.

| Field | Rule |
|---|---|
| `base` | distinct counted responses with a non-empty answer to the item (per column in a cross) |
| `options[]` | `{ value, count, percent \| null }`, in the item's option order, then `other` (values not among options) |
| `points[]` (scale) | `{ point, count, percent \| null }` for 1..5 or 1..7 |
| `mean`, `median` (scale) | one decimal; median from the cumulative counts |
| `agree`, `disagree` (scale) | share of the two highest / two lowest points |
| `smallBase` | `base < 30`; `percent` is `null` when `base < 5` |
| `multiple` | true for a multiple-choice item: percentages over respondents |

**Cross**: one profiling choice item; one column per option (respondents counted in each option they chose), plus `total` (all counted respondents, those without a profiling answer included).

## Surveys (new tables)

**surveys_themes**: `id`, `study_id` (FK research_studies, cascade), `item_id`, `label_en`, `label_fr`, `description_en`, `description_fr`, `origin` (`ai | person`), `status` (`proposed | accepted | rejected`), `merged_into` (nullable, id), `version` (int), `run_id` (nullable), `decided_by`, `decided_at`, `created_at`. Index `(study_id, item_id, status)`.

- A rejected theme's label is sent to later runs as "not to propose again".
- Merge: the merged theme gets `status = rejected`, `merged_into` set; its answers move to the target.
- Rename: person's edit of label or description in one language; the other is translated in the background (same queue as facts' translations, ref `survey-themes-translation:<studyId>`).

**surveys_theme_answers**: `theme_id` (FK cascade), `study_id`, `source_id` (the response's id), `quote` (nullable, the verified masked excerpt), PK `(theme_id, source_id)`. An answer is in at most one theme: unique `(study_id, item via theme, source_id)` enforced by the command (move = delete + insert in one transaction).

**surveys_theme_runs**: `id`, `study_id` (cascade), `item_id`, `state` (`running | done | failed | stopped`), `parts`, `parts_done`, `answers_sent`, `left_out` (nothing left after masking), `dropped_quotes`, `dropped_themes`, `failure` (`AI_PROVIDER_REQUIRED | AI_FAILED | INVALID_ANSWER | INTERRUPTED`), `started_by`, `started_at`, `heartbeat_at`, `finished_at`. One live run per study (partial unique index on `state = 'running'`).

## Evidence (changed)

**evidence_facts**:

- `source text not null default 'interview'`, check `source in ('interview','survey')`.
- `session_id` nullable; check `(source = 'interview') = (session_id is not null)`.
- FK `study_id → research_studies(id) on delete cascade` (new; interview facts already went through sessions).
- New index `(study_id, source, status)`.

**evidence_survey_supports** (new): `fact_id` (PK, FK evidence_facts cascade), `item_id`, `kind` (`figure | theme`), `figure` (jsonb, nullable: `{ measure, option?, value, base, cross?, ruleVersion, smallBase }`), `theme_id` (nullable, no FK: a theme removed leaves the fact's snapshot), `theme_share` (nullable: `{ answers, base }`), `quotes` (jsonb array of masked excerpts, at most 5), `kept_at` (nullable: last "Keep" on a changed figure), check `kind`.

Survey **Fact** (domain): the Fact of spec 012 with `source = 'survey'`, `sessionId = null`, `verbatimIds = []`, `support: SurveySupport`. Statuses, versions, polarity (person-set, default `neutral`), theme (`{ id, title }` of the item's questionnaire section), translation unchanged. Invariants: a figure support needs `base ≥ 1`; a theme support needs an accepted theme at creation; the statement holds no known name.

## Synthesis (changed types only)

`SourceFact`: `sessionId: string | null`, `source`, `respondents: number | null` (the figure's or theme's base). `LineFact` idem. No table change: link snapshots already hold version, polarity, theme and statement.

## Reporting (changed read)

`StudyCounts.facts` for a survey study: status counts of the study's facts with `source = 'survey'`.
