---
description: "Task list for 011-transcript-cleaning"
---

# Tasks: Transcript cleaning

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [quickstart.md](quickstart.md)

Paths under `apps/api/src/modules/` are written `transcripts/…` and `ingestion/…`.

Domain rules are written test-first (constitution V): the test task comes before its code and must fail first.

## Phase 1: Setup

- [X] T001 Migration `apps/api/drizzle/0027_transcript_cleaning.sql` and `transcripts/infrastructure/schema.ts`, per [data-model.md](data-model.md).
  - New tables:
    - `transcripts_corrections`, unique `(session_id, segment_id, target, offset, original, replacement)`, with `reason ≤ 200` and `replacement ≤ 200` for a person's correction;
    - `transcripts_ai_suggestions`, PK `(term_id, segment_id, offset)`, cascade on term;
    - `transcripts_correction_decisions`, PK `(session_id, key)`;
    - `transcripts_cleanings`, PK `session_id`;
    - `transcripts_clean_versions`, PK `(session_id, number)`;
    - `transcripts_clean_publications`, PK `session_id`;
    - `transcripts_clean_folders`, PK `study_id`;
    - `transcripts_correction_runs`, partial unique `(study_id) where finished_at is null`, with `mode`.
  - Foreign keys, `on delete cascade`: every `session_id` → `transcripts_transcripts(session_id)`, every `study_id` → `research_studies(id)`.
  - `transcripts_consents`: add `purpose text not null default 'lexicon'`; the primary key becomes `(account_id, study_id, provider, purpose)`.
- [X] T002 [P] Contracts in `packages/contracts/src/cleaning.ts` (exported in `index.ts`), per [contracts/http-api.md](contracts/http-api.md):
  - `Cleaning`, `CleaningEstimate`, `StartCleaningRun`, `InterviewCleaning`, `InterviewCleaningQuery`, `Correction`, `DecideCorrection`, `AddCorrection`, `BulkCorrections` (keys ≤ 500), `ValidateClean`, `PublishClean`;
  - `Enrichment.cleaning` in `lexicon.ts`;
  - error codes in `errors.ts`: `CONSENT_REQUIRED`, `ENRICHMENT_RUNNING`, `NOTHING_TO_CLEAN`, `CORRECTION_NOT_FOUND`, `EDIT_NOT_ALLOWED`, `REPLACEMENT_TOO_LONG`, `ORIGINAL_NOT_FOUND`, `CORRECTIONS_TO_DECIDE`, `NOT_CLEAN`, `DRIVE_CHANGED`. Reuse `CHANGED_MEANWHILE` and `AI_PROVIDER_REQUIRED` if they exist.
- [X] T003 [P] Queue `transcripts.cleaning` in `apps/api/src/platform/jobs.ts`: exclusive by study id, no retry, 120 min expiry, created in `createQueues`.

## Phase 2: Foundational (blocks every story)

- [X] T004 Ports in `transcripts/application/ports.ts`:
  - `CleaningAi`: `correct(accountId, ref, chunkRequest)`, `estimate`, `providerOf`, `costs`;
  - `CleaningNames`: `cleaningNames(accountId, studyId, sessionId)` → `{ anonymised, people: { name, role, code }[] }`;
  - `CleanFiles`: `cleanFiles(accountId, studyId)` → `{ ensureFolder, createDocument, readRevision, rewriteDocument, metadata }`;
  - store methods for corrections, suggestions, decisions, cleanings, versions, publications, folders, correction runs, and consent with a purpose.

  Fakes go in `transcripts/tests/fakes/`. Wire the module in `transcripts/infrastructure/module.ts` and `apps/api/src/compose.ts`, and register the job handler in the worker.
- [X] T005 Drizzle store `transcripts/infrastructure/transcripts.drizzle-store.ts` and the in-memory store:
  - stored corrections with a version check;
  - `replaceRunFindings(sessionId, keepSegments, corrections, suggestions)` in one transaction, which keeps decided rows on unchanged turns;
  - versions (next number under a lock);
  - publications, folders;
  - runs with a heartbeat, `stopRequested`, `saveRun` only while unfinished;
  - consents by purpose. The existing lexicon calls pass `purpose: 'lexicon'`.
- [X] T006 Shared-run guard: `startRun` (lexicon) keeps `LEXICON_RUNNING` while a lexicon reading is live and answers `ENRICHMENT_RUNNING` while a cleaning is live; `startCleaning` answers `ENRICHMENT_RUNNING` while either is live. Say it in the module README. Add a use-case test for each direction.
- [X] T007 Ingestion public API in `ingestion/index.ts`, with use-case tests:
  - `cleaningNames(accountId, studyId, sessionId)`: the session's roster entries with role and code.
    - Interviewees get `P..` codes and interviewers `I..` codes, both through `assignPseudonyms(existing, needed, prefix)` (add the `prefix` parameter with a test; `P` stays the default) and `ensurePseudonyms` under the study lock, in interview-date order.
    - Return `anonymised`. Return null without access.
  - `cleanFiles(accountId, studyId)` in `ingestion/application/study-files.ts`: write access; `ensureFolder(name, knownId)` (keep `knownId` when it is still a folder inside the study folder, else create one); `createDocument(folderId, name, doc)`; `readRevision`; `rewriteDocument`; `metadata`.
- [X] T008 [P] Drive adapter `ingestion/domain/drive-documents.ts`: add `createFolder(token, parentId, name)`, a `parentId` argument for `createDocument`, and `revision(token, fileId)`.
  - Google adapter in `ingestion/infrastructure/google-documents.ts`: folder mime type `application/vnd.google-apps.folder`.
  - In-memory fake `ingestion/infrastructure/in-memory.drive-documents.ts`, with tests.
- [X] T009 [P] Web: a third inner tab "Cleaning (X to decide)" in `apps/web/src/features/enrichment/enrichment-tab.tsx`.
  - The review opens in place of the tab's content (`interview-cleaning.tsx`), with a back button (research R9).
  - Add the cleaning phase entries to the assistant page context.

## Phase 3: US1 — clean with the lexicon and the AI (P1) 🎯 MVP

**Independent test**: quickstart scenarios 1–2. "Lexicon only" corrects every spelling of an accepted *everywhere* term at no cost; the AI pass then proposes "eating → meeting" and drops the two invalid corrections.

- [X] T010 [P] [US1] Test-first `transcripts/domain/corrections.ts`, `lexiconCorrections(transcript, terms, verdicts, suggestions)` per data-model.md:
  - scope `global` gives every occurrence except verdict *no*;
  - scope `case-by-case` gives verdict *yes* as accepted, an AI suggestion yes as `ai-lexicon` proposed, and nothing otherwise;
  - the spellings are the term's form and its accepted variants (proposed variants give none);
  - the replacement is `form`, or `correction` for `suspect`; a spelling equal to its replacement gives none;
  - the longest match wins at a place; proposed and rejected terms give none;
  - keys follow `lex:<termId>:<segmentId>:<offset>`.
- [X] T011 [P] [US1] Test-first `effectiveCorrections` and `applyCorrections` in `transcripts/domain/corrections.ts`:
  - priority person > lexicon > name > ai-lexicon > ai-other, then the longest span;
  - rejected corrections are left out; `edited` uses its replacement; overridden corrections are flagged;
  - speaker-target corrections change `speaker` only;
  - `OffsetMap` maps clean ↔ raw offsets;
  - `fingerprint` is stable whatever the order.
- [X] T012 [P] [US1] Test-first `transcripts/domain/chunks.ts`, `makeChunks(segments, {turns: 60, overlap: 5, maxChars: 24000})`:
  - context turns are marked; every turn is in exactly one new part;
  - a turn longer than `maxChars` is split at sentence ends with offsets;
  - `onlyTurns` (a set of turn ids) keeps the chunks holding them, with their neighbours as context;
  - short ids `t<n>` map to segment ids.
- [X] T013 [P] [US1] Test-first `transcripts/domain/correction-check.ts`, `checkCorrections(chunk, answer, known)`, applying the 7 checks of research R4:
  - the turn is in the new part;
  - `before + original` is found exactly once (quote rule);
  - at most 8 words change;
  - the replacement differs from the original;
  - no placeholder and no known name on either side;
  - a speaker is among the transcript's speakers;
  - the place maps back outside lexicon and name corrections.

  It returns the kept corrections in raw offsets, the kept occurrence decisions (only for occurrences sent), and `leftOut`. `reason` is cut at 200 characters.
- [X] T014 [P] [US1] Test-first `transcripts/domain/correction-run.ts`: `CorrectionRun` with `mode` and per-session `chunks`/`chunksDone`; `runRef = cleaning:<runId>`; `isLive`; `interrupted`.
- [X] T015 [US1] Prompt and adapter `transcripts/infrastructure/prompts/cleaning.ts`:
  - `CLEANING_TASK = 'cleaning'` and the marker `<turns>`;
  - Zod answer schema with `corrections[]` and `decisions[]` (research R4), lenient on lengths;
  - system rules: correct only, never reword, at most 8 words, copy the original exactly, placeholders are not words; the `name` kind only when anonymised;
  - render: terms, occurrences to decide, speakers, turns with context marked;
  - `maxOutputTokens` 8000; timeout 120 s; `estimate` with 1500 output tokens per chunk.
  - The fake runner in `ai-gateway` answers `<turns>` requests with one valid correction per chunk ("eating" → "meeting" when present), a yes for each occurrence sent, one correction whose original is not in the turn, and one of 12 words.
- [X] T016 [US1] Use cases in `transcripts/application/commands/cleaning-commands.ts`, with tests on fakes:
  - `estimate(actor, studyId, mode, all)`: interviews to clean (never cleaned, to redo, or all), chunks, cost, consent needed;
  - `startCleaning`:
    - consent per purpose `cleaning` and provider; `AI_PROVIDER_REQUIRED` in `ai` mode;
    - `NOTHING_TO_CLEAN`; the guard of T006;
    - the run is closed when the enqueue fails.
  - `stopCleaning`.
  - `runCleaningJob(runId)`:
    1. Import missing or changed raw versions with the lexicon import (reuse spec 010's code).
    2. In `ai` mode, for each interview (3 at a time), chunk the text with the lexicon and names applied and the placeholders, only the unread turns when it was cleaned before. Call the AI (2 chunks at a time, 1 retry); check; inherit; save the findings and the read turn ids.
    3. Record `chunksDone`. Mark failures per interview. Keep the findings of chunks already done.
  - Every call goes through the gateway with `ref = cleaning:<runId>`.
- [X] T017 [US1] Query `transcripts/application/queries/cleaning-queries.ts`: `cleaningList(actor, studyId)` returns the interviews with state, counts, run progress, `lastRunCost` and `cost` (ledger over every account), `consentNeeded`, `anonymised` and the folder link. Add `Enrichment.cleaning` to the enrichment query.
- [X] T018 [US1] Routes in `transcripts/infrastructure/http.routes.ts`: `GET …/cleaning`, `GET …/cleaning-runs/estimate`, `POST …/cleaning-runs`, `POST …/cleaning-runs/:runId/stop`, with Zod and access rules. Then run `pnpm --filter @goodresearch/api generate` and `pnpm --filter @goodresearch/api-client generate`.
- [X] T019 [US1] Web `apps/web/src/features/enrichment/cleaning-table.tsx` and `cleaning-run-dialog.tsx`:
  - rows with the state badge (text label), counts, the last run date and a link to the review;
  - the run dialog: mode `ai` or `lexicon only`, "all again", the estimate (interviews, chunks, about {cost}), the consent text (full text, names replaced);
  - progress "chunk X of Y" with a stop button; costs next to the lexicon's.
  - Use labels from `labels.ts`.

## Phase 4: US2 — review the corrections (P1)

**Independent test**: quickstart scenario 3. Undoing a lexicon correction writes the verdict *no*; edit, reject and accept all, then validate; the clean version holds exactly the accepted corrections.

- [X] T020 [P] [US2] Test-first `inherit(next, decided)` and `cleaningState(...)` in `transcripts/domain/corrections.ts` and `cleaning-state.ts`, per research R7, covering all 8 states.
- [X] T021 [US2] Use cases, with tests on fakes:
  - `decideCorrection(actor, studyId, sessionId, key, decision)`:
    - a `lex:` key goes through spec 010's `judge` (verdict yes / no / none), and `edit` gives `EDIT_NOT_ALLOWED`;
    - a `name:` key writes a decision row;
    - stored corrections check `version`;
    - `CORRECTION_NOT_FOUND` and `CHANGED_MEANWHILE`.
  - `addCorrection`: `ORIGINAL_NOT_FOUND`, `REPLACEMENT_TOO_LONG`; status `accepted`, source `person`.
  - `decideMany` (≤ 500 keys).
  - `validateClean(actor, studyId, sessionId, fingerprint)`: `CORRECTIONS_TO_DECIDE`, `CHANGED_MEANWHILE`; writes the next version with `anonymised`, `raw_imported_at` and `fingerprint`.
- [X] T022 [US2] Query `interviewCleaning(actor, studyId, sessionId, filters)`:
  - raw turns with their computed and stored corrections, filtered (`onlyCorrected` by default);
  - overridden flags, counts, versions, publication, fingerprint;
  - names of the people who decided;
  - a stored correction or suggestion whose turn no longer exists, or whose original is no longer at its place (raw re-imported by a lexicon reading), is ignored, with a test.
  - Export `latestClean(sessionId)` from `transcripts/index.ts`.
- [X] T023 [US2] Routes: `GET …/cleaning/:sessionId`, `PUT …/corrections/:key`, `POST …/corrections`, `POST …/decisions`, `POST …/versions`. Regenerate the OpenAPI and the client.
- [X] T024 [US2] Web `apps/web/src/features/cleaning/interview-cleaning.tsx`:
  - turns with inline corrections: original struck through (`<del>`) and replacement (`<ins>`), with source and status as text badges, not colour alone;
  - filters by source, status, kind and confidence; "Only turns with corrections"; "Accept all shown";
  - a fixed footer with the counts and "Validate the clean version", disabled with the reason while corrections are left to decide;
  - decisions keep the scroll position.

  Also `correction-dialog.tsx`: edit the replacement, show the reason, accept, reject, reopen; for a lexicon correction, a link to the term. And "Add a correction" from a text selection inside one turn (keyboard alternative: a dialog with turn and text).

## Phase 5: US3 — pseudonymise the text (P2)

**Independent test**: quickstart scenario 5. With anonymisation on, the interviewee's name and speaker label become "P01" and the interviewer's "Interviewer 1"; a person term becomes "[Person]".

- [X] T025 [P] [US3] Test-first `nameCorrections(transcript, people, personTerms, language)` in `transcripts/domain/corrections.ts`:
  - matches the full name, then each name word of 2 letters or more (shared `nameKey`, whole words);
  - speaker labels equal to the name or one of its words;
  - interviewees → their code, interviewers → "Interviewer N" / « Intervieweur N », person terms → "[Person]" / « [Personne] »;
  - keys follow `name:<segmentId>:<target>:<offset>`; accepted by default; a decision row overrides.
- [X] T026 [US3] Wire the name corrections into the interview query, the AI chunk text (applied before the placeholders) and `validateClean`. A clean version whose `anonymised` differs from the study setting → `to-redo`. Add use-case tests.

## Phase 6: US4 — publish to Drive (P2)

**Independent test**: quickstart scenario 6. Publish creates one document in "Clean transcripts" matching the clean version; publishing again updates it; a Drive edit asks overwrite or cancel; the original is never written.

- [X] T027 [P] [US4] Test-first `renderCleanDoc(title, version, language)` in `transcripts/domain/clean-doc.ts`: a heading with the title + « – clean » / « – nettoyée », then one paragraph per turn `[hh:mm:ss] Speaker: text` (the time only when the raw version has one).
- [X] T028 [US4] Use case `publishClean(actor, studyId, sessionId, overwrite)`, with tests on the fake Drive:
  - `NOT_CLEAN`;
  - `ensureFolder` with the kept folder id, named in the person's language;
  - create, or rewrite when the kept file is still in the folder;
  - `DRIVE_CHANGED` when its revision differs and `overwrite` is false;
  - a file trashed, missing or moved → a new document;
  - save the publication with the revision read back after the write;
  - the original transcript file is never a target (assert in the test).
- [X] T029 [US4] Route `POST …/cleaning/:sessionId/publish`, then regenerate.
  - Web: "Publish to Drive" and "Update in Drive" in the review footer, and `publish-dialog.tsx` for "Changed in Drive" (overwrite or cancel), the write consent (spec 007 flow) and a link to the document.
  - The row state shows `published` or `out-of-date`.

## Phase 7: US5 — follow each interview (P3)

**Independent test**: quickstart scenarios 4 and 7. A lexicon change marks "Lexicon changed" with no AI call; a changed raw turn marks "To clean again", and the next run sends only its chunk.

- [X] T030 [US5] States end to end in `cleaningList` and the interview query:
  - `to-redo` (raw re-imported after the last version, or anonymisation toggled);
  - `lexicon-changed` (fingerprint differs, nothing to decide);
  - `out-of-date`.

  `runCleaningJob` sends only the chunks holding turns not in `ai_read_segments`, and `replaceRunFindings` keeps decisions on unchanged turns. Use-case tests for scenarios 4 and 7.

## Phase 8: Polish

- [X] T031 [P] Lingui: `pnpm --filter @goodresearch/web i18n:extract`, then fill FR in `apps/web/src/locales/fr/messages.po` using the glossary (0 missing).
- [X] T032 [P] Docs:
  - context map:
    - the Transcripts entries: Edit sources `person | lexicon | name | ai-lexicon | ai-other` and their priority, the clean version, the interview states;
    - interviewer labels under Anonymisation;
    - glossary EN/FR: Cleaning / Nettoyage, Correction, Clean version / Version propre, Clean transcripts / Transcriptions nettoyées, "Interviewer 1" / « Intervieweur 1 »;
  - `transcripts/README.md`, ingestion README (`cleaningNames`, `cleanFiles`, Drive folder creation), `apps/api/README.md` (queue, migration);
  - the spec 010 research note "may come with Cleaning".
- [X] T033 Postgres component tests in `apps/api/tests/cleaning.component.test.ts`:
  - cascade when a session is deleted;
  - a run with stop and stale;
  - the shared-run guard both ways;
  - a `lex:` decision writes the verdict;
  - cost sums across accounts;
  - no known name in any AI request (recording runner), anonymisation on and off;
  - a re-import with one changed turn keeps the other decisions and sends one chunk;
  - publishing twice leaves one document and never writes the original.
- [X] T034 E2E `apps/web/e2e/enrichment-cleaning.spec.ts` (a dedicated team per run): quickstart scenarios 1, 2, 3 and 6, with axe in light and dark themes. Add "eating" to a demo transcript in `dev-drive.ts`.
- [X] T035 Check SC-005 and SC-006 by hand during the user's tests (no automated timing). Run `pnpm check`, `pnpm test`, and `pnpm e2e` with the dev stack. Then restart the user stack (`docker compose -p goodresearch up -d --build`) for manual testing.

## Follow-up (user request)

- [X] T036 [US1] One interview cleaned alone, like "Analyze again" in Fieldwork: `sessionIds` on `POST …/cleaning-runs` and `sessionId` on the estimate (cleaned again in full); "Clean" / "Clean again" on each row of `cleaning-table.tsx` and in the review; use-case test in `transcripts/tests/cleaning-commands.test.ts`.

- [X] T037 [US1] Cost per interview (FR-016): ledger ref `cleaning:<runId>:<sessionId>`, `cost` on each interview of `GET …/cleaning` and on its review, a "Cost" column; component test.
- [X] T038 Review of PR #11: the ten findings (research R11), with use-case tests.

## Dependencies

- Setup (T001–T003) → Foundational (T004–T009) → the stories.
- US1 (T010–T019) comes first: US2 needs its findings, but US2's domain (T020) can start right away.
- US3 (T025–T026) needs T011 and T022.
- US4 (T027–T029) needs T021 (versions).
- US5 (T030) needs US1 and US2.
- Polish comes last; T032 can run alongside.

## Parallel opportunities

- T002 and T003 alongside T001.
- T008 and T009 alongside T004–T007.
- The domain tests T010–T014 together.
- T020, T025 and T027 alongside US1's use cases.

## Implementation strategy

- **MVP**: US1 + US2 (lexicon-only cleaning, the AI pass, review and validate).
- **Then**: US3 (pseudonyms) and US4 (Drive).
- **Last**: US5 (states and incremental re-cleaning).
- Commit locally per phase; push only when the user says so.
