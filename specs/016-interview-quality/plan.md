# Implementation Plan: Interview quality

**Branch**: `016-interview-quality` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-interview-quality/spec.md`

## Summary

A new **interview-quality** module (context map #5) and a Quality tab on interview studies:
- the app computes the speaking times at read time from the analysed text, with no AI;
- a **review** reads each interview in the worker, in the usual chunks of 60 turns. The app cuts the interviewers' turns into numbered sentences, and the AI only answers which ones are questions, simple reformulations or leading, so totals are the app's and quotes are exact;
- flagged sentences become **remarks** with a reason and a recommended wording. A person **agrees or disagrees**, which changes only the counts, and can requalify a simple reformulation;
- three views (overall, by person, by interview) are the same data grouped differently, always adding up.

Runs, consent, costs and placeholders follow spec 012. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new

**Storage**: PostgreSQL, one migration ([data-model.md](data-model.md)):
- new tables `quality_runs`, `quality_evaluations`, `quality_speaker_counts`, `quality_reformulations`, `quality_remarks`, `quality_consents`;
- no change to other modules' tables. Number: next free on `main` at merge time (`0040` today).

**Testing**: Vitest.
- **Test-first domain**: sentence cutting, speaking times, remark checks (exact text, interviewer turn, added element), reclassification of a failed reformulation with opinion, counts and breakdown, opinion rules, requalification, re-review rules, re-anchoring, evaluation state.
- **Use cases with fakes**: in-memory quality store, fake sources, fake AI.
- **Postgres component tests** and **Playwright + axe**: [quickstart.md](quickstart.md).
- **Reference set on a real provider** (SC-001, SC-002): synthetic excerpts in English and French, run by hand before release since it costs money; not in CI (research R9).

**Target Platform / Project Type**: unchanged (web app + API + worker)

**Performance Goals**: 30 one-hour interviews in under 30 minutes (SC-009): about 8 chunks each, 2 chunks of an interview and 3 interviews at once, as spec 012. The answer lists only sentences that are not `other`, which keeps it short (research R3). The real cost per interview is measured on the reference run; the dialog's estimate uses the same formula as spec 012 (research R10).

**Constraints**:
- No known name goes to the AI (placeholders, as spec 012).
- All figures computed by the app; no score, verdict or ranking.
- An opinion changes the counts and nothing else; a review never touches a remark with an opinion.
- One review per study, exclusive with the lexicon reading, the cleaning and the facts reading.

**Scale/Scope**: 1 new module, about 10 endpoints, 1 queue, 1 migration, 1 study tab, 2 dialogs (review, requalify).

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec 016 clarified, plan, then tasks | ✅ |
| II. DDD pragmatic | Core context with a domain model: `Remark` (invariants: exact text, interviewer turn, opinion rules) and `ReviewRun` are aggregates. An opinion changes one remark in one transaction. Other modules through ports wired in `compose.ts`. Queries derive figures and re-anchor without writing. | ✅ |
| III. Provider-agnostic | AI through the gateway port; the test provider answers the new task | ✅ |
| IV. AI proposes, humans decide | A remark is an **assessment that applies nothing**: it takes an opinion (constitution 1.2.0, amended for this spec). It counts until someone disagrees, the total shows its breakdown, a review never overwrites an opinion, a disagreed sentence is never flagged again, quotes are exact, metrics are the app's, every call is in the ledger. | ✅ |
| V. Test-first | The domain functions above | ✅ |
| VI. Contracts | Zod for bodies, jobs and AI output; OpenAPI and client regenerated | ✅ |
| VII. Privacy | Placeholders in every request; label and pseudonym when anonymised; data deleted with the session. The By person view names colleagues, by decision, to people with study access only (clarification 1). | ✅ |
| VIII. a11y & i18n | Kinds and opinions as text; tooltips reachable by keyboard; EN/FR; axe | ✅ |
| IX. Simplicity | Reuses chunks, placeholders, run, consent and cost patterns; figures derived, no sync | ✅ |

Re-checked after design: no new violation.

## Project Structure

```text
specs/016-interview-quality/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
packages/shared/src/speakers.ts            speakerRole and its helpers moved from evidence (research R5)
packages/contracts/src/quality.ts          overview, figures, remarks, runs; errors.ts codes
apps/api/src/modules/interview-quality/
├── domain/         sentences.ts (cut), speaking-times.ts, figures.ts (counts, breakdown, grouping),
│                   remarks.ts (checks, opinion, requalify, re-review), evaluation-state.ts, review-run.ts
├── application/    ports.ts, commands/review-commands.ts (estimate, consent, start, stop, run job),
│                   commands/remark-commands.ts (opinion, requalify, withdraw),
│                   queries/quality-queries.ts (overview)
├── infrastructure/ schema.ts, quality.drizzle-store.ts, http.routes.ts, module.ts (queue quality.review),
│                   prompts/review.ts, README.md
├── tests/          domain + use-case tests, fakes, reference/ (synthetic set)
└── index.ts
apps/api/src/modules/evidence/     speakerRole from shared; exposes speakerAttributions(studyId)
apps/api/src/modules/transcripts/  otherRunLive also asks Quality
apps/api/src/modules/ai-gateway/   test provider answers interview-review
apps/api/src/compose.ts, platform/jobs.ts
apps/api/scripts/quality-reference.ts  the reference runner
apps/web/src/features/quality/     quality-tab.tsx, figures.tsx, view-switch.tsx, remarks-list.tsx,
                                   remark-card.tsx, review-dialog.tsx, requalify-dialog.tsx, labels.ts
apps/web/src/routes/_authenticated/studies/$studyId.tsx   phase quality; 5 · Quality, 6 · Analysis
apps/web/e2e/quality-review.spec.ts
docs: context map (Interview Quality rewritten, glossary EN/FR, event EvaluationCompleted removed),
      prototype reference note, module README, apps/api README (module, queue, migration)
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: migration and schema; contracts and errors; `speakerRole` to shared; module skeleton, store, queue, exclusive-run guards in both directions; consent; the tab and route.
2. **US1, figures** (P1): test-first speaking times and sentence cutting; overview query; figures display with tooltips; the review (AI port, prompt, test provider, job, stop, retry, estimate, costs); counts.
3. **US3, reformulations** (P1, with US1's prompt): the added-element check; prompt rules; first reference run. Requalification comes with US2.
4. **US2, remarks** (P1): remark checks, opinions and breakdown; remarks list and card; link to the transcript; filters; requalify and withdraw.
5. **US4, views** (P2): grouping by person and interview, "Interviewer not identified" row, no ranking, anonymised labels.
6. **US5, follow** (P3): derived states, re-anchoring, review one interview, re-review rules.
7. **Polish**: EN/FR catalogs, docs, e2e + axe, Postgres component tests, final reference run.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| `speakerRole` moves to `packages/shared` | Two core contexts need the same rule, and modules may import each other only through `index.ts` | A copy (drifts); Quality importing Evidence's domain (forbidden) |
| A new module | Interview Quality is its own core context (context map) | Adding it to Evidence: mixes conduct and findings |
| A reference set outside CI | It needs a real provider and costs money; the fake provider cannot measure the AI's judgement | Skipping the measure: the prototype's error would go unseen |
