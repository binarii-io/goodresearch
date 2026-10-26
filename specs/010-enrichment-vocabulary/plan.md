# Implementation Plan: Enrichment phase and team lexicon

**Branch**: `010-enrichment-vocabulary` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-enrichment-vocabulary/spec.md`

## Summary

A new study phase, **Enrichment**, sits between Fieldwork and Analysis. It works on the validated interviews. A new **transcripts** module (context map #4) owns:

- the imported **Transcript** (raw version, speaker turns with stable ids);
- the team's **LexiconTerm**s with their variants and occurrences;
- the **lexicon readings**.

How a reading works:

- **Import**: it imports the transcripts through ingestion's public API.
- **Candidates**: the app's rules find them: common-word lists, capitals, acronyms, repetition across interviews, close spellings of known terms. Known names are excluded.
- **AI**: it sends only the candidates, with ≤ 3 short excerpts each, in batches of 30, through the AI Gateway (2-minute limit per call). The answers are checked: variants must be among the candidates, and quotes must be in the excerpts.
- **Counting**: the app counts the occurrences with the shared match rule.

People accept, edit, merge or reject terms. A new reading never changes a decision. Costs are recorded per run and shown on the tab. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new. Two data files (word lists, research R2) are added with their sources and licences.

**Storage**: PostgreSQL. Migration `0024_enrichment_lexicon.sql` ([data-model.md](data-model.md)):

- tables `transcripts_transcripts`, `transcripts_lexicon_terms`, `transcripts_occurrences`, `transcripts_lexicon_runs`, `transcripts_consents`;
- foreign keys to `ingestion_sessions`, `research_studies` and `workspace_teams` with cascade (integrity only).

**Testing**: Vitest.

- **Test-first domain**: segment parsing and stable ids, candidates and exclusions, excerpts, answer checks, term decisions, merge, re-reading rules, occurrences and the shared match rule.
- **Use cases with fakes**: in-memory store, ingestion sources (fake), the AI runner, common words.
- **Postgres component tests**:
  - cascade when a session is deleted;
  - a run with stop and stale;
  - concurrent decisions;
  - cost sums across accounts;
  - no known name nor full text in AI requests (recording runner).
- **Playwright + axe**: [quickstart.md](quickstart.md) scenarios 1, 2, 4.

**Target Platform / Project Type**: unchanged (web app + API + worker)

**Performance Goals**: 30 one-hour interviews in < 10 min (SC-006). Imports run 3 at a time; candidates are found in memory (a `Set` lookup per word); 300 candidates make ≤ 10 AI calls.

**Constraints**:

- No full transcript and no known name goes to the AI. With anonymisation on, the excerpts use placeholders.
- The text is stored only for validated interviews and is deleted with its session.
- Drive: read only.
- One reading per study at a time.

**Scale/Scope**: 1 module, 8 endpoints, 1 queue, 1 migration, 1 tab (interviews + lexicon), 3 dialogs (run, edit, merge).

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 010, plan, tasks | ✅ |
| II. DDD pragmatic | New module `transcripts` per the context map. Aggregates: Transcript (per session) and LexiconTerm (one decision = one term); a merge changes two terms in one transaction, the only exception, justified below. Ingestion is reached only through its `index.ts`. Occurrences are a read model. | ✅ (see Complexity) |
| III. Provider-agnostic | The AI goes through the gateway port; the word lists are data, not a vendor. The fake runner and fake Drive cover dev and e2e. | ✅ |
| IV. AI proposes, humans decide | Terms and variants are proposals. Variants are checked against the candidates and quotes against the excerpts. Output is schema-constrained. A decision is never overwritten, a rejection is never proposed again. Counts come from the app. Ledger with `ref`. | ✅ |
| V. Test-first | Domain rules listed above, written test-first | ✅ |
| VI. Contracts | Zod bodies and AI output; OpenAPI and client regenerated | ✅ |
| VII. Privacy | Excerpts only; known names excluded and replaced under anonymisation; consent before the first reading; text deleted with its session; read-only Drive | ✅ |
| VIII. a11y & i18n | Tables with labelled actions, progress as text, EN/FR, axe in e2e | ✅ |
| IX. Simplicity | No new dependency; common words as a `Set`; same run pattern as spec 009 | ✅ |

Re-checked after design: no new violation.

## Project Structure

```text
specs/010-enrichment-vocabulary/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
packages/shared/src/text/         fold, quotes (moved), placeholders (moved), nameKey (moved), term-match
apps/api/src/modules/transcripts/
├── domain/         segments.ts (parse, stable ids), candidates.ts, excerpts.ts, lexicon-term.ts
│                   (decisions, merge, re-reading), occurrences.ts, lexicon-run.ts, answer-check.ts
├── application/    ports.ts (Sources = ingestion API, CommonWords, LexiconAi, Costs, store),
│                   commands/lexicon-commands.ts (start, stop, run job, decide, merge, bulk),
│                   queries/enrichment-queries.ts (tab, lexicon page, estimate)
├── infrastructure/ schema.ts, transcripts.drizzle-store.ts, http.routes.ts, module.ts (job handler),
│                   common-words.ts + words/{en,fr}.txt.gz, prompts/lexicon.ts, README.md
├── tests/          domain + use-case tests, fakes
└── index.ts
apps/api/src/modules/ingestion/   index.ts + queries: enrichmentSessions, readTranscript (full text,
                                  VTT times kept), knownNames; quotes/pseudonyms import shared helpers
apps/api/src/modules/ai-gateway/  fake runner answers lexicon requests; task `lexicon`
apps/api/src/platform/jobs.ts     queue transcripts.lexicon (exclusive by study)
apps/api/src/compose.ts           transcripts module wiring
apps/api/drizzle/0024_enrichment_lexicon.sql
packages/contracts/src/lexicon.ts, errors.ts, assistant.ts (phase enrichment), index.ts
apps/web/src/features/enrichment/ enrichment-tab.tsx, lexicon-table.tsx, term-dialog.tsx,
                                  merge-dialog.tsx, run-dialog.tsx, labels.ts
apps/web/src/routes/_authenticated/studies/$studyId.tsx  four phases
apps/web/e2e/enrichment-lexicon.spec.ts
docs: context map (Enrichment phase, Transcript import, LexiconTerm fields, glossary), transcripts
      README, ingestion README, ADR? (no: no structuring change beyond the context map)
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**:
   - move the text helpers to `@goodresearch/shared` and add the match rule (test-first);
   - migration and schema; contracts and error codes;
   - the transcripts module skeleton and its wiring;
   - the ingestion API (`enrichmentSessions`, `readTranscript`, `knownNames`);
   - the queue; the four phases in the study page and the assistant context.
2. **US1 find terms** (P1):
   - segments and stable ids; common words and their loader;
   - candidates and excerpts, with the placeholders;
   - the AI port, the prompt and the answer checks;
   - the run (import → candidates → AI → counting) with stop, stale and consent;
   - the estimate; the tab with the run dialog and progress; costs.
3. **US2 decide** (P1): the term aggregate (accept, edit, reject, reopen, variants, merge, bulk); routes; the lexicon table, filters, search, and the edit and merge dialogs.
4. **US3 team lexicon** (P2): re-reading rules across studies (known terms, close spellings, rejected never again); the other-studies count; access through the study.
5. **US4 interview states** (P3): derived states, "Changed since", "Terms to decide (X)" opens the lexicon filtered.
6. **Polish**:
   - catalogs EN/FR;
   - docs (context map, READMEs);
   - the word-list build script and licences;
   - e2e + axe; the Postgres component tests listed above.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| A merge changes two LexiconTerm aggregates in one transaction | The merged term must disappear when the kept one takes its spellings; otherwise both stay active for a moment and a reading can propose a duplicate | An eventual merge through an event (extra job and a window with two active terms for one spelling) |
| Word-list data files (~2 MB gzipped) committed in the repo | The rules need the common words of each language offline, with no service and no dependency (R2) | A spell-checker dependency (slow for French), asking the AI for every word (cost, full text) |
| Text helpers moved to `@goodresearch/shared` | Ingestion, transcripts and the web use the same quote, placeholder and match rules | Duplicating them (rules would drift) |
