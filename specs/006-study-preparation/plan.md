# Implementation Plan: Study preparation — interview guide with the assistant, best practices, interview schedule

**Branch**: `006-study-preparation` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-study-preparation/spec.md`

## Summary

The **research** module gets two new aggregates of a study: the **InterviewGuide** (framing, sections, questions with app identifiers, follow-ups; versioned, origin) and the **PlannedInterview** rows of the interview schedule, with commands, queries and routes gated like the other study actions (project team, then folder access). The **assistant** module gets a guide design mode on interview study pages: the current guide and the schedule counts in the context, a **skill** (the guide design method) the assistant loads when needed, and four tools — `load_skill`, `check_guide_questions` (the app's writing rules), `report_guide_progress` (the app computes the percentage), all three run by the app during the answer, and `propose_interview_guide` (a proposal applied through the research command with the version seen). The AI Gateway learns tools the app runs (`run`), with several model steps per answer. The web Preparation tab shows the guide (read, edit, download), the best practices (dialog, download) and the schedule (table, CSV); the panel shows the guide design progress and a guide proposal card. Decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 / Node 24 (unchanged)

**Primary Dependencies**: none new

**Storage**: PostgreSQL: `research_interview_guides`, `research_planned_interviews`; `assistant_proposals.kind` gets two values

**Testing**: Vitest (guide invariants and question identity, schedule rules, completeness, tool validation, context privacy) with in-memory fakes; API component tests with Testcontainers (routes, gate, versions, apply of a guide proposal); Playwright (design flow with the dev test provider, edit, schedule, best practices) + axe

**Target Platform / Project Type**: unchanged (web app + API)

**Performance Goals**: guide save < 200 ms; a 60-question guide fits in the context budget (~15 000 characters)

**Constraints**: guide and schedule gated by folder access; schedule never sent to the AI; guide validated by the same rules from the assistant and by hand; downloads built in the browser (no new endpoint)

**Scale/Scope**: 2 aggregates, 6 endpoints, 2 tools, 1 tab with 3 parts

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I. Spec-driven | Spec, plan, tasks in `specs/006-…` | ✅ |
| II. DDD pragmatic | `InterviewGuide` and `PlannedInterview` aggregates in Research (core); guide progress as plain data in the Assistant (supporting); assistant reaches research only through ports wired in `compose.ts` | ✅ |
| III. Provider-agnostic | No vendor in the method, the best practices or the domain; publishing to a source left behind a future port | ✅ |
| IV. AI proposes, humans decide | The guide is a proposal applied once with the version seen; the percentage is computed by the app from fixed weights | ✅ |
| V. Test-first | Guide invariants, question identity, completeness, schedule rules written test-first | ✅ |
| VI. Contracts | Zod for HTTP bodies and for the tool inputs (model output); limits shared by contracts and domain, tested | ✅ |
| VII. Privacy | Schedule (real names) never in the model context; gated by folder access; deleted with the study | ✅ |
| VIII. a11y & i18n | Progress bar with accessible name and per-point states, editor labels, dialogs; EN/FR | ✅ |
| IX. Simplicity | Downloads generated client-side; no document publishing; no rich-text editor (plain fields) | ✅ |

## Project Structure

```text
specs/006-study-preparation/  plan.md · research.md · data-model.md · contracts/http-api.md · quickstart.md · tasks.md
packages/contracts/src/preparation.ts           # guide content, guide, planned interview DTOs and bodies
apps/api/src/modules/research/
├── domain/        interview-guide.ts, planned-interview.ts (+ repositories)
├── application/   commands/preparation-commands.ts, queries/preparation-queries.ts
├── infrastructure/ schema.ts (+2 tables), drizzle repositories, http.routes.ts (+6 routes), module.ts
└── tests/
apps/api/src/modules/assistant/
├── domain/        proposal.ts (+4 kinds), guide-progress.ts (checklist, completeness), question-checks.ts (writing rules)
├── application/   skills.ts (guide design skill), context.ts (guide mode, skills), tools.ts (+4 tools), send-message.ts (tools run during the answer), proposal-commands.ts (apply guide)
apps/api/src/modules/ai-gateway/   ToolSpec.run, multi-step stream (AI SDK adapter and fake runner)
apps/api/src/compose.ts                          # research preparation reads and saveGuide action
apps/api/drizzle/0013_*.sql, 0014_*.sql          # tables, then rules (FKs, checks, kinds)
packages/ui/src/components/segmented-progress.tsx (+ story)
apps/web/src/features/preparation/  preparation-tab.tsx, guide-view.tsx, guide-editor.tsx, guide-markdown.ts,
                                     best-practices.tsx, best-practices.{en,fr}.ts, schedule.tsx, csv.ts
apps/web/src/features/assistant/    state.tsx (ask), panel.tsx (progress), proposal-card.tsx (guide card)
```

## Implementation phases (input for `/speckit-tasks`)

1. **Foundational**: contracts; research domain (guide, planned interview) test-first; schema + migrations; repositories (fake + drizzle); module wiring.
2. **US2 + US3 guide**: commands and queries (gate, versions, origin), routes, component tests; web guide view, editor, Markdown download.
3. **US1 assistant**: completeness and writing checks test-first; gateway tools run during the answer; skill and context (guide, counts, privacy); tools and validation; apply through `saveGuide`; fake runner scripts; panel progress, skill and check lines, guide card, "Design with the assistant".
4. **US4 best practices**: content EN/FR, dialog, download.
5. **US5 schedule**: commands, queries, routes, tests; web table, form, summary, CSV.
6. **Polish**: i18n FR, docs (context map, README, ADR-0005 note), e2e + axe, quickstart.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| The best practices are two localized content modules (`best-practices.en.ts`, `best-practices.fr.ts`) chosen by the active Lingui locale, not Lingui messages | A 160-line document split into dozens of catalog entries would be unreadable for translators and reviewers | One Lingui message per paragraph |
