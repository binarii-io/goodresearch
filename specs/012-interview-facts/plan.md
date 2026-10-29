# Implementation Plan: Interview verbatims and facts

**Branch**: `012-interview-facts` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-interview-facts/spec.md`

## Summary

The first step of the Analysis phase. A new **evidence** module (context map #6) cuts each validated interview into **verbatims**, then **facts**:
- the text read is the study's **text analysed**, computed by the transcripts module: corrections applied, proposed ones included (default), or the validated clean version only;
- the AI reads it in chunks of 60 turns (the Cleaning rule, moved to `packages/shared`) and returns verbatims, which the app checks word for word in interviewee turns;
- a second pass per interview groups them into facts (statement in English and French, polarity, guide theme, verbatims), checked against known ids, themes and names;
- a person decides every fact, in the interview view (transcript with verbatims highlighted, add by selecting text) or in the study's Facts view; edits are translated in the background.

Runs, consent, costs and placeholders follow specs 010–011. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new

**Storage**: PostgreSQL, one migration ([data-model.md](data-model.md)):
- new tables: `evidence_runs`, `evidence_readings`, `evidence_verbatims`, `evidence_facts`, `evidence_fact_verbatims`, `evidence_speakers`, `evidence_consents`;
- `research_studies.text_analysed`.
- Number: next free on `main` at merge time (`feat/lexicon-unsure-verdict` also adds `0028`; whichever merges second renumbers).

**Testing**: Vitest.
- **Test-first domain**: verbatim checks, verbatim merge and set-aside, fact checks, re-proposal of a rejected fact, re-anchoring, speaker role, interview state, Fact invariants.
- **Use cases with fakes**: in-memory evidence store, fake sources (analysed text, people, guide, settings), fake AI.
- **Postgres component tests**: [quickstart.md](quickstart.md) Commands.
- **Playwright + axe**: quickstart scenarios 1, 2, 6.

**Target Platform / Project Type**: unchanged (web app + API + worker)

**Performance Goals**: 30 one-hour interviews in under 30 min (SC-006): about 8 chunks each, 2 chunks of an interview and 3 interviews at once, then one fact pass per interview. A view re-anchors one interview's verbatims (a few hundred searches) well under 100 ms.

**Constraints**:
- No known name goes to the AI (placeholders, as Cleaning).
- Verbatims only from interviewee turns, verified word for word.
- A person decides every fact; a reading never touches a decided fact or a set-aside verbatim.
- One Analysis run per study, exclusive with the Enrichment runs.

**Scale/Scope**: 1 new module, ~16 endpoints, 2 queues, 1 migration, 1 study setting, 2 inner tabs, 1 interview view, 4 dialogs (run, fact, add verbatim, attribute speaker).

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 012 clarified, plan, tasks | ✅ |
| II. DDD pragmatic | Evidence is a core context with a domain model: `Fact` (invariants: ≥ 1 verbatim of its interview, no name, decisions) and `AnalysisRun` are aggregates; a verbatim is an entity of the interview's evidence. Other modules through ports wired in `compose.ts`; Evidence never reads transcripts', ingestion's or research's tables. Queries derive the state and re-anchor without writing. | ✅ |
| III. Provider-agnostic | AI through the gateway port; fake runner answers the three tasks | ✅ |
| IV. AI proposes, humans decide | Facts `proposed` until decided; verbatims verified verbatim; no re-proposal of a rejected fact or set-aside verbatim; ledger refs per interview | ✅ |
| V. Test-first | The domain functions above | ✅ |
| VI. Contracts | Zod for bodies, jobs and AI output; OpenAPI and client regenerated | ✅ |
| VII. Privacy | Placeholders in every request; statements without names (checked); pseudonyms shown when anonymised; data deleted with the session (cascade) | ✅ |
| VIII. a11y & i18n | Status and polarity as text labels, verbatims marked with text, keyboard selection alternative ("Add verbatim" from a turn's menu), EN/FR, axe | ✅ |
| IX. Simplicity | Reuses chunks, placeholders, run, consent and cost patterns; state derived, no sync | ✅ |

Re-checked after design: no new violation.

## Project Structure

```text
specs/012-interview-facts/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
packages/shared/src/chunks.ts             makeChunks moved from transcripts (R4)
packages/contracts/src/facts.ts           settings, interviews, verbatims, facts, runs; errors.ts codes
apps/api/src/modules/evidence/
├── domain/         verbatims.ts (check, merge, reanchor), facts.ts (check, invariants, isReproposal),
│                   speakers.ts, analysis-run.ts, analysis-state.ts
├── application/    ports.ts, commands/analysis-commands.ts (estimate, consent, start, stop, run job),
│                   commands/fact-commands.ts (decide, create, accept many, add verbatim, set aside,
│                   attribute speaker, translate job), queries/analysis-queries.ts (list, interview, facts)
├── infrastructure/ schema.ts, evidence.drizzle-store.ts, http.routes.ts, module.ts (queues
│                   evidence.facts, evidence.translate), prompts/facts.ts, README.md
├── tests/          domain + use-case tests, fakes
└── index.ts
apps/api/src/modules/transcripts/  analysedText(studyId, sessionId, mode), enrichmentLive(studyId);
                                   otherRunLive also asks Evidence
apps/api/src/modules/research/     study setting textAnalysed; guide sections for Evidence
apps/api/src/modules/ai-gateway/   fake runner answers fact-verbatims, facts, fact-translation
apps/api/src/compose.ts, platform/jobs.ts
apps/web/src/features/analysis/    analysis-tab.tsx (inner tabs), interviews-table.tsx, run dialog,
                                   interview-facts.tsx (transcript + facts), facts-table.tsx,
                                   fact-dialog.tsx, labels.ts
apps/web/src/features/research/    study settings: text analysed
apps/web/e2e/analysis-facts.spec.ts
docs: context map (Evidence: Verbatim, Fact, AnalysisRun, text analysed; glossary EN/FR),
      evidence README, transcripts README, apps/api README (module, queues, migration)
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: migration and schema; contracts and errors; `makeChunks` to shared; the transcripts `analysedText` and `enrichmentLive`; the research setting and guide themes; the module skeleton, store, queues, exclusive-run guards both ways; consent; the Analysis inner tabs and routes.
2. **US1, find facts** (P1): test-first checks (verbatims, facts), speaker role; AI port and prompts; fake runner; the job (chunks → verbatims → fact pass), stop, stale, retry; estimate; the interviews list, run dialog, progress and costs.
3. **US2, decide** (P1): Fact invariants and decisions, accept many, create, add verbatim from a selection, set aside, re-proposal rule, speaker attribution, translation job; the interview view and the Facts view.
4. **US3, text analysed** (P2): the setting in the study settings; `clean-only` → "Not clean yet"; setting change → to analyse again.
5. **US4, follow** (P3): re-anchoring at read, derived states, "Find facts again" per interview.
6. **Polish**: EN/FR catalogs, docs, e2e + axe, Postgres component tests.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| A new module | Evidence is its own core context (context map); facts outlive transcript versions and feed Synthesis | Adding facts to transcripts (a supporting context, already large) |
| Re-anchoring at read time instead of on events | No event bus between modules; queries must not write; the cost is small per interview | Domain events from every Cleaning decision |
| A background translation job per edit | Saves are never blocked by the AI; the cost is recorded like any call | Translating synchronously in the request (slow, fails the save when the provider fails) |
