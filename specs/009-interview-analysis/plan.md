# Implementation Plan: Analyze the interviews

**Branch**: `009-interview-analysis` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-interview-analysis/spec.md`

## Summary

The **Session** aggregate (ingestion, spec 008) gets an **analysis**: the proposals of one reading of the beginning of its transcript. The new fields are kept on the session (interview date, language, attachments).

- **Analysis** = pure rules first (date, people, language from the header, the speakers, file names, the linked planned interview, team members), then one schema-constrained AI call through the AI Gateway when interviewees or the date are still missing.
- **Quotes** are verified; known names never go to the AI, and with anonymisation on they are replaced by placeholders.
- **Normalised name** = a pure function. Accepting proposals updates the session in one versioned write. Renaming goes through the Drive documents port with the person's write access.
- **Runs** = a pg-boss queue, one per study, 3 sessions at a time. One row runs in the request.
- **Costs**: every call is recorded with `ref = session-analysis:<id>`. Per-row and study totals come from the ledger, for all accounts.
- **Anonymisation** = a study setting in research and pseudonyms in ingestion. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: + `fflate` (unzip `.docx`, research R2)

**Storage**: PostgreSQL. Migration `0022_interview_analysis.sql` ([data-model.md](data-model.md)):

- new columns on `ingestion_sessions` and `research_studies`;
- tables `ingestion_analysis_runs`, `ingestion_pseudonyms` and `ingestion_analysis_consents`;
- foreign keys to `research_studies` in SQL only (standards §6).

**Testing**: Vitest.

- **Test-first domain**: date and people rules, language, quote check, placeholders, normalised name, pseudonym assignment, proposal decisions, attachments.
- **Use cases with fakes**: in-memory store, Drive (with text) and AI runner.
- **Postgres component tests**: the ledger and cost sums across accounts, a run with stop and stale, a concurrent person edit during a run, rename then refresh, no known name in AI requests with anonymisation on (recording runner).
- **Playwright + axe**: scenarios 1–4 of [quickstart.md](quickstart.md).

**Target Platform / Project Type**: unchanged (web app + API + worker)

**Performance Goals**: 50 sessions in < 10 min (SC-007): 3 at a time; reading ≤ 8,000 characters per session.

**Constraints**:

- Names of the schedule and of members are never sent to the AI.
- Nothing of the text is stored except verified quotes (≤ 300 characters).
- Drive: read content (`drive.readonly`), rename only with write access; never move, copy or delete.
- One run per study.

**Scale/Scope**: 7 endpoints, 1 queue, 1 migration, the session dialog (proposals), 2 dialogs (run, rename), 1 settings dialog.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 009, plan, tasks | ✅ |
| II. DDD pragmatic | Analysis inside the Session aggregate: accepting changes one aggregate. Study setting in research, read through the existing `StudyDirectory` port. Members through a port. Costs through the AI gateway's public API. | ✅ |
| III. Provider-agnostic | Gateway methods `readTextStart`, `rename` (neutral). Prompts and domain name no vendor. The fake runner and fake Drive cover dev and e2e. | ✅ |
| IV. AI proposes, humans decide | Proposals only. Quotes verified. Schema-constrained output. A new pass never overwrites a person's value or re-proposes a rejected one. Ledger with `ref`. Language and date rules are deterministic. | ✅ |
| V. Test-first | Rules, name, quotes, placeholders, pseudonyms written test-first | ✅ |
| VI. Contracts | Zod bodies and AI output; OpenAPI and client regenerated | ✅ |
| VII. Privacy | No names of the app sent to the AI; placeholders under anonymisation; consent before the first analysis; text not stored; nothing deleted in Drive | ✅ |
| VIII. a11y & i18n | Proposals as a list with labelled actions, progress as text, EN/FR | ✅ |
| IX. Simplicity | No new module (Transcripts comes with Cleaning). The row analysis runs in the request. One new dependency (justified below). | ✅ |

## Project Structure

```text
specs/009-interview-analysis/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
apps/api/src/modules/ingestion/
├── domain/         analysis.ts (Analysis, Proposal, decide), header-rules.ts (date, participants, speakers),
│                   language.ts, quotes.ts (normaliseQuote, placeholders), normalised-name.ts, pseudonyms.ts,
│                   attachments.ts, session.ts (+ interviewDate, language, attachments, analysis)
│                   drive-gateway.ts (+ readTextStart), drive-documents.ts (+ rename)
├── application/    ports.ts (+ Analyzer AI port, Members.ofTeam, Costs, run store), commands/analysis-commands.ts
│                   (analyze one, start/stop run, run job, decide proposals), commands/rename-commands.ts,
│                   queries/session-queries.ts (+ analysis, costs, run, estimate)
├── infrastructure/ schema.ts, drizzle store, http.routes.ts, module.ts (+ analysis job handler),
│                   drive.fetch-gateway.ts (+ readTextStart: Docs tab text, ranged download, docx unzip),
│                   google-documents.ts (+ rename), dev-drive.ts (+ text content, consent.pdf), prompts/analysis.ts
└── tests/          domain + use-case tests; fakes (text in Drive, AI analyzer)
apps/api/src/modules/ai-gateway/  gateway.generateObject({ref}), studyCosts(refs), estimateCost, providerOf
apps/api/src/modules/research/    anonymised setting (command, route, getStudyAccess + teamId, anonymised)
apps/api/src/modules/workspace/   team-directory.membersOfTeam
apps/api/src/platform/jobs.ts     queue ingestion.analysis (exclusive by study)
apps/api/src/compose.ts           analyzer = ai.gateway.generateObject; costs; members.ofTeam
apps/api/drizzle/0022_interview_analysis.sql
packages/contracts/src/sessions.ts, research.ts, errors.ts
apps/web/src/features/fieldwork/  analyze buttons, run dialog + progress, proposals in session-dialog,
                                  rename dialog, cost column + total tile
apps/web/src/features/research/   study settings dialog (anonymisation switch), gear in the page bar
docs: context map (Interview analysis, Proposal, pseudonyms per study, glossary), ingestion README, e2e
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**:
   - migration and schema; contracts and error codes;
   - Session fields and Analysis/Proposal types (test-first);
   - the AI gateway `ref` on `generateObject`, `studyCosts`, `estimateCost`, `providerOf`;
   - `Members.ofTeam`; `StudyDirectory` with `teamId` and `anonymised`;
   - `readTextStart` in the gateway, the fetch adapter and the fakes; the dev Drive content.
2. **US1 one row** (P1):
   - the rules (date, people, language) and the quote check (test-first);
   - the AI analyzer and its prompt; the normalised name;
   - `analyze` and `decide proposals`; consent;
   - the list fields and costs; the analyze button, the proposals in the dialog, the cost column and tile.
3. **US2 run** (P1): the queue and job handler; start, stop, stale; estimate; the run dialog and progress.
4. **US3 rename** (P2): `rename` in the documents port and adapters; plan and rename commands; the dialog with results and retry.
5. **US4 anonymisation** (P2): the research setting and its route; the settings dialog; placeholders before the AI; pseudonyms in names; the count of interviews with names in their files.
6. **US5 attachments** (P3): proposals by rule; accept adds; uniqueness with media; renamed with the interview.
7. **Polish**: catalogs EN/FR; docs (context map, ingestion and ai-gateway READMEs); e2e + axe; the Postgres component tests listed above.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| New dependency `fflate` | `.docx` is a zip; transcripts exported from Word are common | A full Office parser (much larger), or skipping `.docx` (loses many transcripts) |
| Costs read across accounts | The team sees what its study's analyses cost, whoever ran them (FR-010) | Per-account costs only (the total would differ per viewer) |
