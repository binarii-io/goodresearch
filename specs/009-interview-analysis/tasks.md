---
description: "Task list for 009-interview-analysis"
---

# Tasks: Analyze the interviews

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [quickstart.md](quickstart.md)

Paths under `apps/api/src/modules/ingestion/` are written `ingestion/…`. Domain rules are written test-first (constitution V): the test task comes before its code and must fail first.

## Phase 1: Setup

- [X] T001 Add `fflate` to the `pnpm-workspace.yaml` catalog and `apps/api/package.json` (reason in the PR: `.docx` unzip, research R2).
- [X] T002 Migration `apps/api/drizzle/0022_interview_analysis.sql` and Drizzle schemas, per [data-model.md](data-model.md):
  - in `ingestion/infrastructure/schema.ts`:
    - `ingestion_sessions` + `interview_date date`, `language text`, `attachments jsonb not null default '[]'`, `analysis jsonb`;
    - `ingestion_analysis_runs` with a partial unique `(study_id) where state = 'running'`;
    - `ingestion_pseudonyms` unique `(study_id, name_key)` and `(study_id, code)`;
    - `ingestion_analysis_consents` with primary key `(account_id, study_id, provider)`;
  - in `research/infrastructure/schema.ts`: `research_studies.anonymised boolean not null default false`;
  - foreign keys to studies (and to accounts) on delete cascade, in SQL only.
- [X] T003 [P] Contracts in `packages/contracts/src/sessions.ts` and `research.ts`, and error codes in `errors.ts`:
  - schemas: `Proposal`, `SessionAnalysis`, `AnalyzeSession`, `AnalysisEstimate`, `StartAnalysisRun`, `DecideProposals`, `RenamePlan`, `RenameFiles`, `RenameResult`, `StudySettings`;
  - `Session` + `interviewDate`, `language`, `attachments`, `analysis`, `cost`;
  - `Fieldwork` + `analysisCost`, `run`, `anonymised`, `consentNeeded`;
  - error codes: `ANALYSIS_CONSENT_REQUIRED`, `ANALYSIS_RUNNING`, `NOTHING_TO_ANALYZE`, `PROPOSAL_NOT_FOUND`, `NAME_NOT_ACCEPTED`;
  - limits: names 1–120, people 1–10 per role, quote ≤ 300, name ≤ 160, attachments ≤ 20, decisions 1–10.

## Phase 2: Foundational (blocks every story)

- [X] T004 Test-first Session changes in `ingestion/domain/session.ts` and a new `ingestion/domain/analysis.ts`:
  - `interviewDate`, `language`, `attachments`, `analysis`;
  - edits refused on a session a person decided;
  - an attachment file counted with media for uniqueness;
  - `decideProposals(session, decisions)`:
    - accept/edit people replaces the roster entries of that role, keeping ids for the same names;
    - date and language set the field; a name sets the title without its kind;
    - reject keeps the proposal as rejected;
  - `mergeAnalysis(previous, next)`: decided proposals are kept, and a rejected value is never proposed again.
- [X] T005 [P] AI gateway in `apps/api/src/modules/ai-gateway/`:
  - `generateObject` takes `{ ref }`;
  - `studyCosts(refs)`: costs over every account, through a new store read `usageByRefsAll`;
  - `estimateCost(accountId, inputChars, outputTokens)`;
  - `providerOf(accountId)`;
  - all exported in `index.ts`; tests in `ai-gateway/tests/`.
- [X] T006 [P] Workspace `membersOfTeam(teamId)` in `workspace/application/queries/team-directory.ts`: active members, `{id, name}`. Research `getStudyAccess` returns `teamId` and `anonymised`. The ingestion ports in `ingestion/application/ports.ts`:
  - `Members.ofTeam`;
  - `StudyDirectory` with the new fields;
  - an `Analyzer` port (`(accountId, ref, text, schema) → result`), plus `Costs` and `Estimates`;
  - the store methods for runs, pseudonyms, consents and the analysis write;
  - all wired in `apps/api/src/compose.ts`.
- [X] T007 `readTextStart(token, file, maxChars)` in `ingestion/domain/drive-gateway.ts`, implemented in `ingestion/infrastructure/drive.fetch-gateway.ts` per research R2:
  - Google document: the transcript tab's text;
  - ranged download of `.txt`/`.vtt`/`.srt`: subtitles stripped, `<v Name>` becomes `Name:`;
  - `.docx` unzipped with fflate, at most 20 MB;
  - `.doc` rejected as `UNREADABLE_FORMAT`.
  - Adapter tests with recorded responses; the fake in `ingestion/tests/fakes/in-memory-drive.ts` holds text by file id.
- [X] T008 [P] Dev Drive in `ingestion/infrastructure/dev-drive.ts`: text content for the demo transcripts, per [quickstart.md](quickstart.md):
  - a participants line in "Interview Sam Example.txt";
  - non-member speaker labels in "Interview 2 - transcript.txt";
  - a real `.docx` for "Camille.docx";
  - "Sam Example consent.pdf" in Week 1.

  The fake model runner (`ai-gateway/infrastructure/fake.model-runner.ts`) answers the analysis task with one quote found in the text and one that is not.
- [X] T009 Ingestion Drizzle store and in-memory store (`ingestion/infrastructure/ingestion.drizzle-store.ts`, `ingestion/tests/fakes/in-memory-ingestion.ts`):
  - read and write the new session fields;
  - `writeAnalysis(sessionId, expected, analysis)`, writing only `analysis` with a version check;
  - attachments in the `media-taken` check;
  - reconcile keeps the new fields of sessions it keeps.

## Phase 3: US1 — analyze one interview and review (P1) 🎯 MVP

**Independent test**: quickstart scenarios 1–3 (without the rename): "Analyze" on one row, proposals with origins, "Accept all".

- [X] T010 [P] [US1] Test-first `ingestion/domain/header-rules.ts`:
  - dates (ISO, `21/10/2026`, `21 October 2026`, `21 octobre 2026`, with a time) and the priority header > file name > planned interview > file date; a different date set aside is kept as `otherDate` on the proposal and shown (spec edge case);
  - participants lines (`Participants:`, `Attendees:`, `Invités :`);
  - speaker labels (`Name:` ≤ 60 characters, `<v Name>`);
  - members matched on all name words, ignoring case and accents: a single match makes an interviewer, the others are interviewees.
- [X] T011 [P] [US1] Test-first `ingestion/domain/language.ts`: English or French when twice the other's common words, else `other`.
- [X] T012 [P] [US1] Test-first `ingestion/domain/quotes.ts`: `normaliseQuote` (case, spaces, apostrophes) and `quoteFound(text, quote)`; quotes ≤ 300 characters.
- [X] T013 [P] [US1] Test-first `ingestion/domain/normalised-name.ts`:
  - the name is `YYYY-MM-DD – A & B – C & D – Kind.ext`, with kinds per language (EN when unknown);
  - two files of one kind are numbered;
  - `/ \ : * ? " < > |` become `-`;
  - names are shortened to keep at most 120 characters before the kind, ending with `…`;
  - the title is the name without its kind.
- [X] T014 [US1] Test-first `analyzeSession` in `ingestion/application/commands/analysis-commands.ts`:
  - the text window is 4,000 characters, extended once to 8,000 when no person is found;
  - the rules run first, and the AI only when interviewees or the date are missing, or the speakers cannot be told apart;
  - never the AI without a transcript;
  - AI answers validated by Zod and their quotes checked; failures are kept with their reason, and the app's proposals are kept;
  - `ANALYSIS_CONSENT_REQUIRED` until consent for the current provider, `ANALYSIS_RUNNING`, `SESSION_DECIDED`;
  - no AI connection: the rules only, with the `AI_PROVIDER_REQUIRED` reason.

  Use-case tests with the in-memory store, fake Drive and a fake analyzer.
- [X] T015 [US1] Prompt and schema in `ingestion/infrastructure/prompts/analysis.ts`:
  - instructions in English with no names of the app;
  - the output schema `interviewees[]`, `interviewers[]`, `date`, each with a quote;
  - the analyzer adapter calls `gateway.generateObject` with task `session-analysis` and `ref = session-analysis:<id>`.
- [X] T016 [US1] `decideProposals` command and route `POST /api/sessions/:sessionId/proposals`: version check, `PROPOSAL_NOT_FOUND`, `MEDIA_UNAVAILABLE`. Route `POST /api/sessions/:sessionId/analysis`.
- [X] T017 [US1] Query `ingestion/application/queries/session-queries.ts`:
  - per session: `analysis` (with `filesChanged` from the file versions), `cost` (`studyCosts`), `interviewDate`, `language`, `attachments`;
  - for the study: `analysisCost`, `anonymised`, `consentNeeded`.

  Then `pnpm generate`.
- [X] T018 [US1] Web in `apps/web/src/features/fieldwork/`:
  - an analyze icon button per row;
  - the consent dialog (the text sent to the person's AI provider);
  - a cost column and a cost tile;
  - in `session-dialog.tsx`, a proposals list (value, origin, quote, accept / edit / reject, "Accept all", "files changed since", failure reason with retry).

  All strings with Lingui, all pieces from `packages/ui`.
- [X] T019 [US1] Postgres component test in `apps/api/tests/analysis.component.test.ts`:
  - ledger entries carry the session ref, and the row and total costs equal the ledger sums across two accounts (SC-004);
  - the transcript with a participants line makes no AI call (SC-005);
  - a quote absent from the text is never shown (SC-001);
  - a recording runner shows no name of the schedule or members in AI requests (SC-003).

## Phase 4: US2 — analyze all at once (P1)

**Independent test**: quickstart scenario 4: estimate, run, progress, stop.

- [X] T020 [US2] Queue `ingestion.analysis` in `apps/api/src/platform/jobs.ts` (exclusive by study id, no retry) and its handler in `ingestion/infrastructure/module.ts`, registered in the worker.
- [X] T021 [US2] Test-first run commands in `analysis-commands.ts`:
  - `startRun`: sessions not decided by a person, never analyzed or with files changed; `NOTHING_TO_ANALYZE`, `ANALYSIS_RUNNING`, consent;
  - `stopRun`;
  - `runJob`:
    - 3 at a time, each session waiting → analyzing → done | failed;
    - `stopRequested` checked between sessions, and a heartbeat;
    - a failure does not stop the others;
    - `writeAnalysis` retried 3 times on stale, never overwriting a person's change;
  - a stale run (10 min) can be replaced.
- [X] T022 [US2] Routes:
  - `GET /api/studies/:studyId/analysis-runs/estimate`: the count, the sessions with a transcript, and the maximum cost from `estimateCost` at 8,000 characters each;
  - `POST /api/studies/:studyId/analysis-runs` (202);
  - `POST …/analysis-runs/:runId/stop`;
  - `Fieldwork.run`.

  Then `pnpm generate`.
- [X] T023 [US2] Web:
  - "Analyze interviews" on the right of the filters;
  - a confirmation with the count and the estimated cost;
  - the progress per row (waiting, analyzing, done, failed) and in the bar, with "Stop";
  - polling while the run is running;
  - "a run is in progress" when another one is started.
- [X] T024 [US2] Component test: a run over three sessions with one failing, stop between sessions, a person's edit during the run kept (research R7), and at most 3 analyses at once (SC-007; the 10-minute target is checked by hand in the quickstart).

## Phase 5: US3 — rename in Drive (P2)

**Independent test**: quickstart scenario 3 (rename): the files renamed in the fake Drive, a refresh keeps the interview.

- [X] T025 [P] [US3] `rename(token, fileId, name)` in `ingestion/domain/drive-documents.ts`, in `ingestion/infrastructure/google-documents.ts` (files.update `name`, `supportsAllDrives`), in `in-memory.drive-documents.ts` and in the dev Drive; exposed on `StudyFiles`.
- [X] T026 [US3] Test-first `ingestion/application/commands/rename-commands.ts`:
  - `renamePlan`: the current name read from the metadata, the next name from the accepted name, `canEdit`, `NAME_NOT_ACCEPTED`;
  - `renameFiles`: write access (`DRIVE_WRITE_REQUIRED`), the current name read again before writing and returned with the result (US3.5), results file by file, the inventory row renamed in the same request, the session unchanged.

  Routes `GET` and `POST /api/sessions/:sessionId/rename`.
- [X] T027 [US3] Web `features/fieldwork/rename-dialog.tsx`:
  - the current and new name of each file;
  - the write consent when needed (spec 007 flow);
  - the results with "Retry" for the failed files.
- [X] T028 [US3] Component test: rename, then a refresh keeps the same sessions, files and decisions (SC-006).

## Phase 6: US4 — anonymisation (P2)

**Independent test**: quickstart scenario 6: P01 in the name, the roster unchanged, no known name sent.

- [X] T029 [P] [US4] Research command `setStudyAnonymisation` (version check) and route `PATCH /api/studies/:studyId/settings` in `apps/api/src/modules/research/`; tests.
- [X] T030 [P] [US4] Test-first:
  - `ingestion/domain/pseudonyms.ts`: `nameKey`, assignment in date order from the largest code + 1, never reused;
  - placeholders in `quotes.ts`: known names replaced as whole words, ignoring case and accents, then mapped back.
- [X] T031 [US4] In `analyzeSession` and the names:
  - with anonymisation on, placeholders go to the AI and pseudonyms are used in the names and titles;
  - the store assigns pseudonyms under the study lock;
  - the query counts the interviews whose file names hold an interviewee's name.
- [X] T032 [US4] Web: a gear in the study page bar opens `features/research/study-settings-dialog.tsx` with the anonymisation switch; turning it on shows the count of interviews with names and points to "Analyze".
- [X] T033 [US4] Component test: with anonymisation on, the recording runner sees no known name, and the name holds `P01` (SC-003).

## Phase 7: US5 — attachments (P3)

**Independent test**: quickstart scenario 7.

- [X] T034 [P] [US5] Test-first `ingestion/domain/attachments.ts`: "other" files of the same group with the same meeting title or a shared rare word (spec 008 rules), not held by another session.
- [X] T035 [US5] Attachment proposals in `analyzeSession`; accept adds the file, refused as `MEDIA_UNAVAILABLE` when it is taken. Attachments appear in the session dialog, in the list (an icon) and in the rename plan, with the kind taken from their own name.

## Phase 8: Polish

- [X] T036 Lingui: `pnpm --filter @goodresearch/web i18n:extract`, French filled in `apps/web/src/locales/fr/messages.po`, 0 missing.
- [X] T037 [P] Docs:
  - `docs/domain/context-map.md`: Interview analysis, Proposal, pseudonyms per study, the anonymisation setting, glossary EN/FR;
  - the ingestion and ai-gateway READMEs;
  - `AGENTS.md`, if a command changes.
- [X] T038 e2e `apps/web/e2e/fieldwork-analysis.spec.ts`: quickstart scenarios 1–4 and 6, axe in light and dark.
- [X] T039 `pnpm check`, `pnpm test`, `pnpm e2e` green; restart the user's stack `docker compose -p goodresearch up -d --build` for testing.

## Dependencies

- Phase 1 → Phase 2 → stories.
- US1 is needed by every other story: US2 runs `analyzeSession`, US3 needs an accepted name, US4 changes the analysis and the names, US5 adds proposals.
- After US1, US2, US3, US4 and US5 are independent of each other. US3 and US4 both touch the names: do US4's names after T013.

## Parallel examples

- Phase 2: T005, T006 and T008 together, then T007 and T009.
- US1: T010, T011, T012 and T013 together, then T014 → T015 → T016 → T017 → T018.
- After US1: US3 (T025) and US4 (T029, T030) can start alongside US2.

## Implementation strategy

- **MVP**: Phases 1–3. One row analyzed, proposals reviewed, costs shown. Test with the user before going on.
- Then US2 (the run), US3 (rename), US4 (anonymisation), US5 (attachments), each tested locally with the user. No push before the user validates (memory: no CI before validation).

## Phase 9: After the first test round

- [X] T040 [US1] "N to decide" opens the interview (FR-019) in `apps/web/src/features/fieldwork/analysis.tsx`.
- [X] T041 [US1] Test-first: the link suggestion compares the interviewees found in the transcript first, then the file name, then the interview date (FR-018) in `ingestion/domain/link-suggestion.ts`; the query passes them.
- [X] T042 [US1] "Add to the schedule" in the table and the dialog (FR-017): a planned interview, done, linked to the interview (`useAddToSchedule`).
- [X] T043 [US1] Interviews wait for a person (FR-020): reconcile proposes, migration `0023_sessions_to_validate.sql`, "To decide (X)" in the state column opens the window.
- [X] T044 [US1] The planned interview as a proposal card in the window (FR-021): `ProposalCard` shared by the proposals and the planned interview.
- [X] T045 [US1] Interview and planned interview share who and when, both ways (FR-022): `domain/planned-sync.ts` test-first, `application/commands/planned-sync.ts`, the research hook after `updatePlannedInterview`, `Schedule.update` in `compose.ts`.
- [X] T046 [US1] Summaries are not transcripts (FR-023): `looksLikeTranscript` test-first, exclusion by the app at analysis.
- [X] T047 Failed AI calls without tokens cost nothing (FR-024) in `ai-gateway/application/queries/usage-costs.ts`.
- [X] T048 Review of PR #9: attachments keep the label of their original name (names never grow); runs that stop or cannot start put sessions back, stuck ones read "interrupted"; an app rename updates the files read (no new analysis); Teams/Otter layouts are transcripts; member links checked against the team; pseudonyms for accepted interviewees only.

