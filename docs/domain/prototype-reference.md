# Prototype functional reference

> Input material for specs, **not** a spec. It records the concepts, flows, UX and rules validated on an internal prototype that preceded this project. The code of the prototype is not reused. Each feature is re-specified with `/speckit-specify`, which may change any of this. Ubiquitous language: see [context-map.md](context-map.md).

## Main workflow

1. **Project**: create a project, write the research goal, pick a team, attach studies.
2. **Preparation** (study): co-build the interview guide with the guide assistant; publish the guide, a best-practices document and a fieldwork schedule.
3. **Fieldwork**: run the interviews (out of the app; placeholder screen).
4. **Analysis** (study), seven steps:
   1. **Sessions**: connect the source folder, scan, review proposed transcript ↔ media matches (tabs *To review / Validated / Excluded / No transcript*), bulk-validate high-confidence ones.
   2. **Lexicon**: import transcripts, extract terms, decide them (tabs *Suspect / Domain / Validated / Ignored*), choose scope, give yes/no verdicts in context.
   3. **Correction**: run or replay a correction pass, review inline strike-and-replace edits, publish the clean version, export markdown.
   4. **Quality**: per-interviewer and per-session neutrality tables, detail with explained calculations, unasked guide questions, interventions filterable by category.
   5. **Participants**: review and validate profiles.
   6. **Fact extraction**: per-session status, cost, extract or replay.
   7. **Facts**: filter; full-session view with colour-coded quotes; hover card to edit/validate/delete; create a fact by selecting text.
5. **Project analysis**: insights → recommendations → key takeaways → debrief deck.

## Screens

- **Shell** (identity, sidebar, account, language switch and home folders/cards built in spec 003; the rest comes with its features): collapsible sidebar (Projects, Studies, Teams, Lexicon, Recommendations, recent projects, account), top bar with search (`/` shortcut) and live AI status (calls in flight, rate-limit count), language switch, review-policy switch, provider configuration with a validation checklist.
- **Home**: team filters, project cards (generated visual, last activity, counts, interviewers), sort by activity/name/session count.
- **Project**: tabs *Overview | Insights | Recommendations | Debrief*, plus a network graph.
  - Overview: goal editable in place, team selector, 5-step journey (Sessions → Facts → Insights → Recommendations → Debrief) with validated-share progress and a highlighted next step, study cards with costs, attach/detach studies, danger zone.
  - Insights: generate dialog (choose studies and fact scope), cards with computed confidence (tooltip explains the calculation and what is missing for *high*), polarity tag, facts modal grouped by participant, link/unlink facts (support/counter), manual insight, theme filter, "reclassify on guide". Facts side panel with paging, search, polarity and "unlinked" filters.
  - Recommendations: key takeaways block (AI draft, manual save), editable recommendations, insights side panel ("unused" filter), link to the evidence chain.
  - Debrief deck (16:9, generated from data, not stored): title, key takeaways, context, method & guide, interview review, panel, insights overview then one per slide, nuances (mandatory), recommendations table and impact×effort matrix, limits, next steps, thanks. Overview and present modes, print to PDF.
  - Network graph: rings (studies, participants, insights, recommendations), hover highlights the full chain, zoom/pan, legend filters.
  - Evidence chain: 4 columns (recommendation → insights → facts → sessions).
- **Guide assistant**: immersive chat mode (sidebar collapsed, centred thread), segmented completeness bar, guide side panel, menu (cost, markdown export, reset — reset keeps the guide).

## UX patterns

- **AI proposes, humans validate** everywhere (see context map).
- **Background jobs**: request returns immediately, progress is live, items appear as they complete, *Stop* takes effect after the current item (remaining items marked "stopped", can be replayed), one error does not stop the batch, per-item replay, cost per run.
- One running job per (study, job type).
- Sessions are processed one at a time within a job.
- Costs visible at every level (run, session, study, project).
- Confirmation before destructive actions; deleting a project asks to type its name and optionally deletes studies linked only to it.
- Nothing is ever deleted in external sources.

## AI tasks

All AI calls return schema-constrained JSON, go through the AI Gateway, and are recorded in the usage ledger.

| Task | Input | Output | Guardrails |
|---|---|---|---|
| Lexicon extraction | transcript chunk (60 segments, 4 in parallel), language | terms (surface, kind, correction, category, confidence, context) | surface verified in text; no person names; no ordinary words; no examples in the prompt (the model copies them) |
| Correction | goal, validated lexicon, case-by-case candidates with yes/no examples, chunk | decisions (apply, confidence, reason) + other obvious edits | original text verbatim, shortest span, no style/grammar/name changes, "if in doubt, propose nothing" |
| Guide question extraction | guide document text | deduplicated questions with sections | — |
| Conduct classification | interviewer segments with context, goal, guide | category, guide question id, bias note | all shares computed by the app |
| Participant profiles | start of the session, expected names | role, team, description | empty rather than invented |
| Facts | chunk, roles, goal, existing facts | statement, segment, quote, polarity | quote verified, participant speech only, no names, incremental, dedup |
| Insights | anonymised fact lines, goal, existing insights, avoid list, theme list | updates + new insights | known ids only; app computes confidence/polarity; no percentages; counter-evidence and minority views required |
| Theme reclassification | insights, guide themes | theme per insight | never rewrites statements |
| Recommendations | insights (id, theme, confidence, participants), existing | updates + new (max 15) | known ids; build→test downgrade |
| Key takeaways | validated insights and recommendations | 2–4 sentences | no percentages or names; never auto-saved |
| Guide assistant | system skill + project context + language | message, readyToWrite, checklist progress; final protocol + questions | assumptions marked "to validate"; only https links rendered |

## Rules not detailed in the context map

- Language detected per transcript (function-word frequency); lexicon is per language; occurrences only counted in transcripts of that language.
- Transcript import is skipped when already done unless forced.
- Participant detection order: meeting invite metadata, then transcript speakers, then the session title. Silent guests (<10% of speech) are dropped. Interviewers are people present in several sessions of the study. (To be replaced by the validated speaker mapping, suggestions only.)
- Correction: verdict *no* → never edited; verdict *yes* → user edit, accepted; global scope → rule edit, accepted; case-by-case undecided → AI decides in context, proposed.
- Best available transcript: latest published clean version, else the latest correction run with applicable edits, else raw.
- Insight generation: max 25 per pass, over all non-rejected or validated-only facts; facts from a study later detached remain cited and are flagged "outside project".
- Schedule document statuses: *To contact, Invitation sent, Scheduled, Done, Postponed, Cancelled*.
- Fact CSV export: UTF-8 with BOM; columns statement, quote, polarity, role, team, group, session id, timestamp, segment, origin, status; no names, no session titles.
