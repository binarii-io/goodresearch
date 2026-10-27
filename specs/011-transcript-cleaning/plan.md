# Implementation Plan: Transcript cleaning

**Branch**: `011-transcript-cleaning` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-transcript-cleaning/spec.md`

## Summary

Cleaning is the second step of the Enrichment phase. It runs in the **transcripts** module (context map #4) and gives each validated interview a reviewed **clean version** of its transcript. That version can be published to a Drive subfolder.

Where the corrections come from:
- **Lexicon and names**: computed by the app, live, from the raw version, the team's lexicon and its verdicts, and, when the study is anonymised, from the interview's people: interviewees become `P01`…, interviewers "Interviewer 1"…. No AI is involved and there is no cost. A decision on a lexicon correction *is* the verdict of spec 010.
- **AI**: a full reading in chunks of 60 turns with an overlap of 5. The text sent has the lexicon already applied and the names as placeholders. The AI proposes corrections of at most 8 words, and yes/no decisions on case-by-case occurrences. The app checks each answer against the turn. Every AI correction waits for a person.

People decide (accept, reject, edit, add their own, accept all shown), then validate a numbered clean version. Runs, consent and costs follow spec 010; publishing writes a new Google Doc, one way (spec 007 models). Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new

**Storage**: PostgreSQL, migration `0027_transcript_cleaning.sql` ([data-model.md](data-model.md)):
- new tables: `transcripts_corrections`, `transcripts_ai_suggestions`, `transcripts_correction_decisions`, `transcripts_cleanings`, `transcripts_clean_versions`, `transcripts_clean_publications`, `transcripts_clean_folders`, `transcripts_correction_runs`;
- `transcripts_consents.purpose` added to the key.

**Testing**: Vitest.
- **Test-first domain**:
  - lexicon corrections (scopes, verdicts, suspect);
  - name corrections (pseudonyms, interviewer labels, speaker labels);
  - overlap priority; apply and offset maps; fingerprint;
  - chunks (overlap, long turns);
  - the 7 AI checks; inheritance; interview states.
- **Use cases with fakes**: the in-memory store, the sources, the AI runner, and the clean files (fake Drive).
- **Postgres component tests**: see [quickstart.md](quickstart.md) Commands.
- **Playwright + axe**: quickstart scenarios 1, 2, 3, 6.

**Target Platform / Project Type**: unchanged (web app + API + worker)

**Performance Goals**: 30 one-hour interviews in under 20 min (SC-006).
- One hour is about 400 turns, so about 8 chunks.
- Chunks of one interview run 2 at a time, and 3 interviews at once.
- A computed correction is rebuilt for one interview per view: a few thousand regex matches, well under 100 ms.

**Constraints**:
- No known name goes to the AI; the text holds placeholders.
- The original Drive file is never written.
- One Enrichment run per study (lexicon or cleaning).
- A human decides every AI correction.

**Scale/Scope**: 1 module extended, 10 endpoints, 1 queue, 1 migration, 1 inner tab, 1 review view, 4 dialogs (run, correction, publish conflict).

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 011 clarified, plan, tasks | ✅ |
| II. DDD pragmatic | The cleaning lives in Transcripts, per the context map. Aggregates: a stored Correction (one decision = one row), a CleanVersion (append-only) and a CorrectionRun. Computed corrections are a read model. A decision on a `lex:` key writes the spec 010 verdict, so the verdict stays the one aggregate for "is this the term here". Ingestion is reached only through `index.ts` (`cleaningNames`, `cleanFiles`). | ✅ |
| III. Provider-agnostic | The AI goes through the gateway port. Drive goes through the ingestion port, with a fake adapter. The fake runner answers `cleaning` requests. | ✅ |
| IV. AI proposes, humans decide | Every AI correction is `proposed`. The checks place the original in the turn; at most 8 words change; no placeholders. A decision is never overwritten (inherited). Ledger with `ref`. | ✅ |
| V. Test-first | The domain functions listed above | ✅ |
| VI. Contracts | Zod bodies and AI output; OpenAPI and client regenerated | ✅ |
| VII. Privacy | Placeholders in every chunk; consent says the full text is sent; pseudonyms and interviewer labels under anonymisation; the text is deleted with its session (cascade) | ✅ |
| VIII. a11y & i18n | Each correction carries a text label for its source and status, not colour alone; keyboard decisions; EN/FR; axe | ✅ |
| IX. Simplicity | Live computation instead of syncing two copies; reuses the run, consent, cost and DocModel patterns | ✅ |

Re-checked after design: no new violation.

## Project Structure

```text
specs/011-transcript-cleaning/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
apps/api/src/modules/transcripts/
├── domain/         corrections.ts (lexicon, names, effective, apply, fingerprint, inherit),
│                   chunks.ts, correction-check.ts, correction-run.ts, cleaning-state.ts
├── application/    ports.ts (+ CleaningAi, CleaningNames, CleanFiles, store methods),
│                   commands/cleaning-commands.ts (estimate, start, stop, run job, decide, add,
│                   decideMany, validate, publish), queries/cleaning-queries.ts (list, interview)
├── infrastructure/ schema.ts, transcripts.drizzle-store.ts, http.routes.ts, module.ts (queue
│                   transcripts.cleaning), prompts/cleaning.ts, README.md
├── tests/          domain + use-case tests, fakes
└── index.ts        + latestClean(sessionId) for later phases
apps/api/src/modules/ingestion/  enrichment-sources.ts: cleaningNames (P/I codes via assignPseudonyms
                                 with a prefix); study-files.ts: cleanFiles (ensureFolder,
                                 createDocument in a folder); drive-documents port + Google adapter +
                                 in-memory fake: createFolder, parent for createDocument
apps/api/src/modules/ai-gateway/ fake runner answers `cleaning` requests (one valid, two invalid)
apps/api/src/platform/jobs.ts    queue transcripts.cleaning (exclusive by study)
apps/api/src/compose.ts          wiring
apps/api/drizzle/0027_transcript_cleaning.sql
packages/contracts/src/cleaning.ts, errors.ts, enrichment additions, index.ts
apps/web/src/features/enrichment/ cleaning-table.tsx, cleaning-run-dialog.tsx, labels.ts
apps/web/src/features/enrichment/ interview-cleaning.tsx (the review in place of the tab: turns
                                  with inline corrections, filters, fixed footer, correction, add
                                  and "changed in Drive" dialogs)
apps/web/e2e/enrichment-cleaning.spec.ts
docs: context map (CorrectionRun/Edit sources and states, clean versions, interviewer labels,
      glossary EN/FR), transcripts README, ingestion README, apps/api README (queue, migration)
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**:
   - the migration and the schema; contracts and error codes;
   - the store methods; the queue;
   - the shared-run guard (`ENRICHMENT_RUNNING`), also on lexicon runs;
   - consent with a purpose;
   - the ingestion APIs (`cleaningNames`, `cleanFiles`) and the Drive adapter (`createFolder`, a parent folder for documents);
   - the inner tab "Cleaning" and its route.
2. **US1, clean** (P1):
   - test-first: lexicon corrections, effective and apply, chunks, checks;
   - the AI port and the prompt; the fake runner;
   - the run: import missing raw versions → for each interview, chunks → AI → checks → suggestions and stored corrections;
   - stop, stale and retry; the estimate and the consent;
   - the cleaning list and the run dialog with progress; costs.
3. **US2, review** (P1):
   - inheritance, the decisions and the verdict link, a person's corrections, accept all, validate (fingerprint);
   - the review route with filters, the correction dialog and the sticky footer.
4. **US3, pseudonymise** (P2): the interviewer codes in ingestion; name corrections; the anonymisation change → "To clean again".
5. **US4, publish** (P2): folder ensure and find by id; document render; publish and republish; `DRIVE_CHANGED` with overwrite; a file gone → new.
6. **US5, states** (P3): the derived states (to redo, lexicon changed, out of date); re-cleaning only the unread turns.
7. **Polish**: EN/FR catalogs; docs; e2e + axe; Postgres component tests.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| Lexicon and name corrections are computed at read time, not stored | They depend on the team's lexicon, its verdicts and the study's people, which change after a run. Computing them keeps one truth (the verdict) and needs no AI to follow a lexicon change (FR-010, FR-014). | Storing them and syncing both ways (two copies of one decision, drift) |
| A decision on a `lex:` key writes a LexiconTerm verdict from the cleaning view | The spec asks that the two never disagree; the verdict is that decision | A separate cleaning decision mirrored by an event |
