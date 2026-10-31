# Data model: Interview quality

Tables of the `interview-quality` module; references to other modules by id, deleted with the session or study as Evidence's are. Speaking times and figures are never stored (research R6, R7).

## `quality_runs` (aggregate ReviewRun)

| Field | Notes |
|---|---|
| `id`, `study_id`, `started_by` | |
| `session_ids` | The interviews covered |
| `progress` | Per interview: `waiting | reading | done | failed`, chunks, chunks done, failure |
| `state` | `running | stopping | finished | stopped` |
| `heartbeat_at`, `started_at`, `finished_at` | A stale run closes, as spec 012 |

One live run per study; exclusive with the lexicon reading, cleaning and facts reading.

## `quality_evaluations` (one per interview, the last reading)

`session_id` (PK), `study_id`, `run_id`, `raw_imported_at`, `text_analysed`, `anonymised`, `fingerprint`, `interviewers` (the labels read as interviewers'; null for a review older than this record), `left_out`, `read_at`. Its ledger refs give the cost.

**State** (derived): `no-transcript`, `not-clean`, `speakers-not-identified`, `not-measurable`, `not-reviewed`, `reviewing`, `to-review-again`, `reviewed`.

## `quality_speaker_counts`

`session_id`, `speaker_label` (PK together), `sentences`, `questions`. Replaced at each reading.

## `quality_reformulations` (simple reformulations)

`id`, `session_id`, `segment_id`, `offset`, `length`, `text`, `speaker_label`, `requalified_remark_id` (null unless a person requalified it). Those requalified survive a new reading; the others are replaced.

## `quality_remarks` (aggregate Remark)

| Field | Notes |
|---|---|
| `id`, `session_id`, `study_id`, `run_id` | |
| `segment_id`, `offset`, `length`, `text`, `speaker_label` | Exact text, re-anchored at read |
| `kind` | `leading-question | reformulation-with-opinion | opinion` |
| `reason_en`, `reason_fr` | AI remark; a person's reason is kept as written in `reason_person` |
| `recommendation`, `added_element` | Interview's language; `added_element` required for AI `reformulation-with-opinion` |
| `origin` | `ai | person` |
| `stance` | `agree | disagree | null`, the person's opinion |
| `stance_by`, `stance_at` | |
| `version` | Checked on each change |

**Rules** (domain, test-first):
- Kept only when the text is in that turn, spoken by an interviewer; a reformulation with opinion must name an element not found earlier in the interviewees' words, otherwise it counts as simple.
- A remark with an opinion or of origin `person` survives a review; the others are replaced.
- A flag on a text equal to a disagreed remark's in the same turn is dropped.
- A `person` remark is created with `stance = agree`. Withdrawing it deletes it and clears `requalified_remark_id`. Its opinion cannot be turned to `disagree`, only withdrawn.
- One remark per sentence: the first found stays.
- Lost text: flagged at read, never deleted.

**Transitions of `stance`**: `null ⇄ agree ⇄ disagree`, `null ⇄ disagree`.

## `quality_consents`

`account_id`, `study_id`, `provider`, `given_at`, as `evidence_consents`.

## Figures (derived)

For any group (study, person, interview): `words` by role, `minutes` when known, `sentences`, `questions`, `simpleReformulations`, `withOpinion`, `leadingQuestions`, `opinions`, each flagged kind split into `agreed`, `noOpinion`, `disagreed`. Disagreed never counts. Invariant: the rows of a view add up to the overall figures.
