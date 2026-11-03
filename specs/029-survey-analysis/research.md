# Research: Survey analysis

Facts read in the code on 2026-11-03 (Evidence, Synthesis, AI Gateway, Surveys); no external service is new.

## R1. Figures

**Decision**: Counts in SQL over `surveys_responses`, restricted to the counted state with spec 028's `stateSql(accepted) = 'counted'`, the form's file and the study: `jsonb_array_elements_text(answers -> item)` grouped by value (flat sort), and the same grouped by the profiling item's value too (cross). Respondents per item = distinct responses with a non-empty answer. Mean, median, shares and the small-base rule are computed by a pure domain function from the counts per point (`figures.ts`), test-first. Nothing is stored.

**Rationale**: Project rule: SQL counts, not rows filtered in JS (load only what is shown). The counts per point are enough to compute every scale measure exactly, so the domain stays pure and testable.

**Alternatives**: Percentiles in SQL (`percentile_disc`): the median of a scale is simpler and exact from counts; one place for the rule.

## R2. Where survey facts live

**Decision**: In Evidence, as Facts with a **source**: `interview` (today) or `survey`. `evidence_facts.session_id` becomes nullable with a check (`source = 'interview'` ⇔ `session_id` not null); a `study_id` foreign key to `research_studies` with cascade is added, so a survey fact goes with its study. The support of a survey fact is a new table `evidence_survey_supports` (one row per fact): `item_id`, `kind` (`figure | theme`), the figure snapshot or the theme id, its share and quotes. Survey facts have their own commands (`surveyFacts`: create from a figure or a theme, decide, update to today's figure, keep), sharing the domain's statuses, versions and translation; interview commands keep refusing survey studies (`NOT_AN_INTERVIEW_STUDY`).

**Rationale**: The context map has one Fact, in Evidence, read by Synthesis; a second kind of fact elsewhere would make insights merge two models. The interview rules (verbatims, speakers, sessions) stay where they are; the survey branch only adds.

**Alternatives**: Facts in Surveys, merged by Synthesis through two ports: two status machines and two translations to keep alike. A fake session per survey: lies to every interview screen.

## R3. Figure snapshot and "Figure changed"

**Decision**: The snapshot holds `{ measure: 'option' | 'agree' | 'disagree' | 'mean', option?, value, base, cross?: { itemId, option }, ruleVersion, smallBase }`. The survey facts query asks Surveys, through a port, for today's figures of the items its facts cite (one call per page), and compares with a tolerance of one decimal; a different value or base gives `figureChanged` with today's figure; an item gone gives `itemRemoved`. "Update to today" rewrites statement and snapshot (new version); "Keep" records the decision on the current snapshot (the flag returns only if the figure moves again).

## R4. Statements

**Decision**: Templates in the domain, English and French: option ("{pct} % of the {base} respondents answered “{option}” to: {item}"), agreement, disagreement, mean ("{item}: mean {mean} out of {points}, over {base} respondents"), each with a cross prefix ("Among respondents who answered “{option}” to {crossItem}, …"). Small base adds "(small base)". A theme's fact takes its description. A person's edit is translated by the existing translation job, ref `facts-translation:survey:<studyId>`.

**Rationale**: Clarification of 2026-11-03: no AI to create a fact, exact figures.

## R5. Insights with survey facts

**Decision**: `SourceFact.sessionId` becomes nullable and facts carry `source` and, for survey facts, `respondents` (the base). Fact lines sort by study, then source, then session; a survey fact's code is `survey` (with the study prefix when several studies), followed by `n=<base>`. The system prompt adds: survey facts are figures over respondents; an insight may rest on them, still never gives a percentage. Confidence keeps counting interview participants; supporting survey facts with a base of 30 or more raise it by one level (at most high), and the support line shows "N participants · M respondents". Snapshots and "Evidence changed" need no change.

**Rationale**: Today support and confidence come only from participants: an insight backed by survey facts would show support 0 and low confidence. The level rule is simple, explainable and changes no interview-only project. To confirm at review.

**Alternatives**: Treat each respondent as a participant: a survey of 200 would drown 8 interviews.

## R6. Themes of open answers

**Decision**: In Surveys: `surveys_themes` (study, item, label and description in English and French, origin, status `proposed | accepted | rejected`, version, decided by and when), `surveys_theme_answers` (theme, response) and `surveys_theme_runs` (item, state, parts, cost ref, failure). One run per study at a time, on a new queue `surveys.themes`, never retried (as other runs). Answers are sent in parts of 150, each answer with a number local to the run; if several parts, a last call receives only the labels and descriptions of the parts' themes and returns merges, applied by the app. Rejected labels of the item are sent as "not to propose again"; a run on new answers sends only answers in no theme and may add them to existing themes (returned by id).

## R7. Masking

**Decision**: A pure `maskAnswer(text, names)` in `packages/shared`, built on `withPlaceholders` (names become `[Person N]`, consistent within one answer), plus patterns: emails → `[email]`, phone numbers (8+ digits with separators) → `[phone]`, web addresses → `[link]`, other runs of 6+ digits → `[number]`. Names come from compose's `teamKnownNames` (team members, rosters, schedules, lexicon person terms). The same masked text is what the screen shows and what quotes are checked against (`quoteFound`). An answer with nothing left but marks and punctuation is left out and counted.

**Rationale**: No masking of emails or phone numbers exists today (only questionnaire checks detect such items). Showing the masked text keeps quotes verifiable and avoids a second, unmasked copy in the theme.

## R8. Costs

**Decision**: Refs `survey-themes:<runId>:<part>`, `facts-translation:survey:<studyId>` and `survey-themes-translation:<studyId>`. The estimate uses `estimateCost(inputChars, outputTokens)` per part plus the merge call; `GET …/themes/estimate` before a run; the tab's total (returned by the figures route) sums every theme run and both translations of the study through `studyCosts`; each open item shows the cost of its runs.

## R9. Assistant

**Decision**: Tools on a survey study: `survey_analysis_state` (counts), `read_figures` (figures computed by the app, optional cross; no answer text), `propose_survey_facts` (card: list of figure references; each re-checked against today's figure on Apply, statements by the app), `propose_theme_analysis` (run-during-answer card as `propose_analysis` of spec 025: estimate, provider, Apply starts the run). The skill text stops saying analysis comes later.

## R10. Access and deletion

**Decision**: Every new route goes through spec 026's guard (`OPEN_READS` stays unchanged: none is open to readers). A reader's Analysis tab of a survey study says "reserved to the team"; in insights, survey facts show their statement and masked quotes. Deleting a study cascades: Surveys tables by `study_id`, survey facts by the new `study_id` key, supports by fact.

## R11. Project page

**Decision**: Reporting's `studyCounts` adds, for a survey study, the facts of the study with `source = 'survey'` (no session filter); the Facts step label already reads "Will come from the studies" only while the count is 0.
