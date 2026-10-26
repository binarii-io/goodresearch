---
description: "Task list for 010-enrichment-vocabulary"
---

# Tasks: Enrichment phase and team lexicon

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [quickstart.md](quickstart.md)

Paths under `apps/api/src/modules/` are written `transcripts/…`, `ingestion/…`. Domain rules are written test-first (constitution V): the test task comes before its code and must fail first.

## Phase 1: Setup

- [X] T001 Module skeleton `transcripts/` (`domain/`, `application/`, `infrastructure/`, `tests/`, `index.ts`, `README.md`); add it to the dependency-cruiser module rules and knip if they list modules.
- [X] T002 Migration `apps/api/drizzle/0024_enrichment_lexicon.sql` and `transcripts/infrastructure/schema.ts`, per [data-model.md](data-model.md):
  - `transcripts_transcripts`: PK `session_id`, FK `ingestion_sessions(id) on delete cascade`;
  - `transcripts_lexicon_terms`: unique `(team_id, language, folded_form) where status <> 'merged'`, with `form ≤ 80`, `definition ≤ 200`, `quote ≤ 300` and `variants ≤ 50`;
  - `transcripts_occurrences`: PK `(term_id, spelling, session_id)`, cascade on term and session;
  - `transcripts_lexicon_runs`: a partial unique `(study_id) where finished_at is null`;
  - `transcripts_consents`: PK `(account_id, study_id, provider)`;
  - FKs to `research_studies` and `workspace_teams` on delete cascade, in SQL only.
- [X] T003 [P] Contracts in `packages/contracts/src/lexicon.ts` (exported in `index.ts`), per [contracts/http-api.md](contracts/http-api.md):
  - `Enrichment`, `LexiconPage`, `LexiconTerm`, `LexiconQuery`, `LexiconEstimate`, `StartLexiconRun`, `DecideTerm`, `MergeTerms`, `BulkDecision`;
  - error codes in `errors.ts`: `NO_VALIDATED_INTERVIEW`, `NOTHING_TO_READ`, `LEXICON_CONSENT_REQUIRED`, `LEXICON_RUNNING`, `TERM_NOT_FOUND`, `TERM_EXISTS`, `CORRECTION_REQUIRED`, `MERGE_ITSELF`, `LANGUAGE_DIFFERS`;
  - `assistant.ts`: phase `enrichment`.

## Phase 2: Foundational (blocks every story)

- [X] T004 Test-first `packages/shared/src/text/`:
  - `fold` (lower case, accents removed);
  - `termPattern(spelling)` and `countMatches(text, spelling)`: whole word or phrase, acronyms (2–6 capitals) case-sensitive, others case- and accent-insensitive;
  - move `normaliseQuote`, `quoteFound`, `withPlaceholders`, `fromPlaceholders` (from `ingestion/domain/quotes.ts`) and `nameKey` (from `ingestion/domain/pseudonyms.ts`) with their tests;
  - ingestion imports them from `@goodresearch/shared`, and its tests stay green.
- [X] T005 Ingestion public API in `ingestion/index.ts`, with use-case tests:
  - `enrichmentSessions(accountId, studyId)`: the validated sessions with transcript metadata (file id, name, mime type, `modifiedAt`), plus the count still to validate; null without access;
  - `readTranscript(accountId, studyId, sessionId)`: `readTextStart` with 400,000 characters; `TOO_LONG` when the text reaches the ceiling; the failures of research R3;
  - `knownNames(accountId, studyId)`: the rosters, the schedule and the team members.
  - The VTT/SRT conversion in `ingestion/domain/transcript-text.ts` keeps the cue start as `[hh:mm:ss] Name: text` (the spec 009 rules still read the label).
- [X] T006 [P] Queue `transcripts.lexicon` in `apps/api/src/platform/jobs.ts` (exclusive by study id, no retry, 60 min expiry), created in `createQueues`.
- [X] T007 Ports in `transcripts/application/ports.ts`:
  - `Sources`: the ingestion API above;
  - `StudyDirectory` (`getStudyAccess`: teamId, anonymised);
  - `CommonWords.has(language, word)`;
  - `LexiconAi` (`propose(accountId, ref, batch)`, `estimate`, `providerOf`, `costs`);
  - the store: transcripts, terms, occurrences, runs and consents.

  Module factory in `transcripts/infrastructure/module.ts`, wired in `apps/api/src/compose.ts`, with the job handler registered in the worker. Fakes in `transcripts/tests/fakes/`.
- [X] T008 Drizzle store `transcripts/infrastructure/transcripts.drizzle-store.ts` and an in-memory store:
  - `saveTranscript` (upsert by session);
  - terms with a version check;
  - `replaceOccurrences(studyId, rows)` in one transaction;
  - runs with a heartbeat;
  - consents.
- [X] T009 [P] Web: four phases in `apps/web/src/routes/_authenticated/studies/$studyId.tsx` (`1 · Preparation`, `2 · Fieldwork`, `3 · Enrichment`, `4 · Analysis`), `phase` search param `enrichment`, and the assistant page context phase in the API.

## Phase 3: US1 — find the unusual words (P1) 🎯 MVP

**Independent test**: quickstart scenarios 1–3: "Find terms" on three validated interviews proposes "Goodresearch" with its variants and "NPS", with verified quotes and no known name.

- [X] T010 [P] [US1] Test-first `transcripts/domain/segments.ts`:
  - parse the text into segments (`Name: text`, `<v Name>`, `Name 0:03`, `Name (00:01:15)`, an optional leading `[hh:mm:ss]`);
  - continuation lines join the previous turn;
  - leading text gets a null speaker;
  - `keepIds(previous, next)`: unchanged turns keep their ids (longest common subsequence on speaker + text), new turns get new ids.
- [X] T011 [P] [US1] Test-first `transcripts/domain/candidates.ts` (research R4):
  - tokenising: speaker labels, timestamps and numbers excluded;
  - the rules: absent from common words, capitals inside a sentence (2–3 in a row make a phrase), acronyms, Damerau–Levenshtein close spellings of known terms (≤ 1 up to 6 letters, ≤ 2 above);
  - excluded: known names, labels, placeholders, words of 1–2 letters, rejected terms and variants, spellings of accepted terms;
  - ranking: across ≥ 2 interviews first, then by count;
  - the limit of 300 with close spellings always kept, and `leftOut`.
- [X] T012 [P] [US1] Test-first `transcripts/domain/excerpts.ts`:
  - ≤ 3 excerpts of ≤ 200 characters per candidate, from different interviews first, cut on word boundaries;
  - known names (rosters, schedule, members, speaker labels) always replaced by placeholders via `withPlaceholders`, anonymisation on or off;
  - batches of 50 candidates, each with the close accepted forms.
- [X] T013 [P] [US1] Test-first `transcripts/domain/answer-check.ts`:
  - variants kept only when among the batch's candidates (folded), and the quote only when found in the excerpts sent;
  - proposals without a valid variant or quote are dropped;
  - `existingTerm` resolved to a known term or ignored;
  - field lengths cut (form 80, definition 200, quote 300).
- [X] T014 [P] [US1] Common words in `transcripts/infrastructure/common-words.ts`:
  - lazy load of `words/{en,fr}.txt.gz` into one `Set` per language;
  - build script `transcripts/infrastructure/words/build-words.ts` from SCOWL (size 60) and Grammalecte's Hunspell dictionary (Dicollecte);
  - sources, versions and licences in the module README;
  - an in-memory fake for tests.
- [X] T015 [US1] Prompt and schema in `transcripts/infrastructure/prompts/lexicon.ts`:
  - English instructions with no app names;
  - output `terms[] {form, kind, correction, category, definition, variants, existingTerm, quote}`;
  - `generateObject` with task `lexicon`, `ref = lexicon-reading:<runId>` and `maxOutputTokens` 4,000;
  - errors mapped like spec 009 (`AI_PROVIDER_REQUIRED`, `AI_FAILED`, `INVALID_ANSWER`).
  - The fake runner (`ai-gateway/infrastructure/fake.model-runner.ts`) answers the `lexicon` task by grouping close spellings, with one quote from an excerpt and one invented.
- [X] T016 [US1] Test-first `transcripts/domain/occurrences.ts`: counts per `(term, spelling, session)` with `countMatches`, ≤ 3 anchors `{segmentId, offset}`, the term's language only.
- [X] T017 [US1] Test-first run commands in `transcripts/application/commands/lexicon-commands.ts`:
  - `startRun(actor, studyId, {consent, all})`:
    - the sessions never read or changed (all: every validated session with a transcript);
    - errors `NO_VALIDATED_INTERVIEW`, `NOTHING_TO_READ`, `LEXICON_CONSENT_REQUIRED` (per provider), `LEXICON_RUNNING` (unless stale after 10 min), `AI_PROVIDER_REQUIRED`;
  - `stopRun`;
  - `runJob`:
    - import 3 at a time (re-import only when `modifiedAt` differs, keeping ids), each session waiting → reading → done | failed;
    - then candidates over the study, then the AI batches one by one with a stop check and a heartbeat, then the terms written (new terms `proposed`, new variants added to existing terms, nothing decided changed), then the occurrences replaced;
    - a stop keeps what was written.
  - Use-case tests with the in-memory store, fake sources, fake AI and fake common words.
- [X] T018 [US1] Queries `transcripts/application/queries/enrichment-queries.ts` and routes in `transcripts/infrastructure/http.routes.ts`:
  - `GET /api/studies/:studyId/enrichment`, with the derived states of [data-model.md](data-model.md), `toValidate`, counts, run, `lastRunCost` and `cost` (`studyCosts` over the study's run refs) and `consentNeeded`;
  - `GET …/lexicon-runs/estimate`;
  - `POST …/lexicon-runs`, `POST …/lexicon-runs/:runId/stop`.

  Then `pnpm generate --force` and the api-client generate.
- [X] T019 [US1] Web `apps/web/src/features/enrichment/`:
  - `enrichment-tab.tsx`: stat tiles for interviews read, terms to decide, accepted and cost;
  - the interviews table with states and per-row loaders (waiting hourglass, reading spinner);
  - the empty state with a link to Fieldwork;
  - "Find terms" with `run-dialog.tsx`: count, maximum cost, consent text, "read all again";
  - progress, "Stop", polling while running.

  Lingui strings; pieces from `packages/ui`.
- [X] T020 [US1] Postgres component test `apps/api/tests/lexicon.component.test.ts`:
  - a run over three demo interviews proposes the grouped term with verified quotes (SC-001);
  - a recording runner sees no known name and no full transcript, with anonymisation on and off (SC-002);
  - the ledger refs and the tab cost equal the ledger sums across two accounts (SC-004);
  - deleting a session deletes its transcript and occurrences.

## Phase 4: US2 — decide the terms (P1)

**Independent test**: quickstart scenario 4: accept, edit, reject, merge; a new reading proposes nothing decided again.

- [X] T021 [P] [US2] Test-first `transcripts/domain/lexicon-term.ts`:
  - `decide(term, decision, fields, variants, actor, now)` with the transitions of the data model;
  - `CORRECTION_REQUIRED` for an accepted `suspect` without correction;
  - edited fields validated;
  - `merge(from, into)`: the spellings move as accepted variants, `from` becomes `merged`; `MERGE_ITSELF`, `LANGUAGE_DIFFERS`;
  - `absorb(term, proposal)` for a new reading: adds proposed variants only, never changes a decided field, refreshes the definition and category of a term still proposed, never re-adds a rejected variant.
- [X] T022 [US2] Commands `decideTerm`, `mergeTerms` (one transaction for both terms, both versions checked) and `decideMany` (≤ 200, each with its version; returns done and changed) in `lexicon-commands.ts`, with `TERM_EXISTS` on an edited form taken. Routes `PATCH …/lexicon/terms/:termId`, `POST …/terms/:termId/merge` and `POST …/lexicon/decisions`.
- [X] T023 [US2] Query `GET /api/studies/:studyId/lexicon`:
  - filters status / kind / category / language / session and search `q` on form and variants (folded), 50 per page with a cursor;
  - occurrences in this study for validated sessions only, with ≤ 3 quotes rebuilt from the anchors;
  - `decidedBy`.

  Then `pnpm generate`.
- [X] T024 [US2] Web:
  - `lexicon-table.tsx`: filters in one row, search, the rows (form, kind/category badges, variants with their status, occurrences, other studies) and the accept / edit / reject / merge actions as icon buttons, plus "Accept all shown" with a confirmation and the result (done, changed meanwhile);
  - `term-dialog.tsx`: edit the fields, decide the variants, show the quotes per interview;
  - `merge-dialog.tsx`: pick the kept term, searchable.
- [X] T025 [US2] Use-case and component tests:
  - a second reading after decisions proposes nothing decided or rejected again, and a new spelling becomes a proposed variant of the accepted term (SC-003);
  - two people deciding one term: the second gets `CHANGED_MEANWHILE`.

## Phase 5: US3 — one lexicon for the team (P2)

**Independent test**: quickstart scenario 6.

- [X] T026 [US3] The team's terms in the reading of another study:
  - accepted forms and variants counted, not proposed;
  - close spellings sent with the known form;
  - rejected terms excluded.

  `otherStudies` count in the lexicon query (no study names). A study of another team neither sees nor uses the terms; a study whose project moves to another team shows the new team's terms. Tests in `lexicon-commands.test.ts` and the component test (SC-007).

## Phase 6: US4 — follow each interview (P3)

**Independent test**: quickstart scenario 7.

- [X] T027 [US4] Derived states `no-transcript | not-read | changed | to-decide (X) | read` in the enrichment query (tests). In the web, "Terms to decide (X)" opens the lexicon filtered on that interview, and "Changed since" is offered by "Find terms".
- [X] T028 [US4] Component test: a transcript changed in the fake Drive is re-imported, keeps the ids of unchanged turns (SC-008), and its row goes back to read after the reading.

## Phase 7: Polish

- [X] T029 Lingui: `pnpm --filter @goodresearch/web i18n:extract`, French filled in `apps/web/src/locales/fr/messages.po` (Enrichissement, Lexique, Trouver les termes…), 0 missing.
- [X] T030 [P] Docs:
  - `docs/domain/context-map.md`: phases Preparation → Fieldwork → Enrichment → Analysis, Transcript import, LexiconTerm (fields of the data model, the `merged` status, categories), Lexicon reading, and the glossary (Enrichment / Enrichissement, Lexicon / Lexique, Term / Terme, Variant / Variante);
  - the transcripts README (word lists and licences);
  - the ingestion README (public API) and `packages/shared` README.
- [X] T031 Demo content in `ingestion/infrastructure/dev-drive.ts`: "Goodresearch", "Gooresearch", "good research", "NPS", "Hmm" and the interviewee's name spoken, per [quickstart.md](quickstart.md).
- [X] T032 e2e `apps/web/e2e/enrichment-lexicon.spec.ts`: quickstart scenarios 1, 2 and 4, axe in light and dark (SC-009).
- [X] T033 `pnpm check`, `pnpm test`, `pnpm e2e` green; by hand: 30 one-hour demo interviews read in < 10 min (SC-006) and 50 terms decided in < 10 min with filters and "Accept all shown" (SC-005); restart the user's stack `docker compose -p goodresearch up -d --build` for testing.

## Phase 8: Verdicts and scope (added 2026-10-26, from the prototype)

- [X] T034 Test-first `scope` on LexiconTerm (`defaultScope`: case by case when a counted spelling has ≤ 3 letters; a person's choice kept) and `occurrenceAt` in `transcripts/domain/`.
- [X] T035 Migration `0025_lexicon_verdicts.sql`: `scope`, `scope_decided` on terms (existing terms given their default), table `transcripts_verdicts` with cascades; store and fake (`verdictsOf`, `saveVerdict`, verdicts moved by a merge).
- [X] T036 Command `judge` and route `PUT …/lexicon/terms/:termId/verdicts` (`OCCURRENCE_NOT_FOUND`); quotes carry their place and verdict, occurrences their yes / no counts; `scope` in the term and in the edit fields. Use-case and component tests.
- [X] T037 Web: yes / no buttons on each excerpt (pressed state, at once), counts per interview and in the table, the scope in the term dialog and as a badge; EN/FR; e2e.

## Dependencies

- Phase 1 → Phase 2 → stories.
- US1 is needed by every other story: US2 decides what US1 proposes, US3 needs decided terms, US4 needs readings.
- US2 can start in parallel with US1's web work (T019) once T017 is done.
- Within US1: T010–T016 [P] in parallel, then T017 → T018 → T019 → T020.

## Parallel examples

- Phase 2: T006 and T009 alongside T004/T005.
- US1: T010, T011, T012, T013, T014 at once (different files, pure domain or data).
- US2: T021 alongside T019.

## Implementation strategy

- **MVP**: Phases 1–3 (find terms) plus US2's decisions (T021–T024). Without decisions the lexicon cannot be used by Cleaning.
- Then US3 (team reuse), US4 (states), Polish.
- Commit locally after each phase; push only when the user validates.
