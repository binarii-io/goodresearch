# Implementation Plan: Survey analysis

**Branch**: `029-survey-analysis` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-survey-analysis/spec.md`

## Summary

Give survey studies an Analysis tab: figures (flat sort and one cross) computed in SQL over the counted responses of spec 028, themes of open answers proposed by AI on masked text and decided by a person, and survey facts made from a figure or an accepted theme with a template statement. Survey facts are Evidence Facts with a `survey` source and a support snapshot, so Synthesis uses them with interview facts; confidence takes survey bases into account. A new ADR records what is masked and sent.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, AI Gateway (structured output), pg-boss, React, TanStack, Lingui, `packages/ui`. No new dependency.

**Storage**: PostgreSQL. Migration `0057`: three Surveys tables, Evidence facts gain `source`, a nullable session and a study foreign key, plus `evidence_survey_supports`.

**Testing**: Vitest test-first on the pure domain (figures, masking, statements, theme answers check, fact support rules, confidence), use cases with fakes, Testcontainers for the SQL figures (compared with the pure function on the same responses) and the cascade, fake model runner branch for themes, Playwright + axe on one flow.

**Target Platform**: The self-hosted web app and its worker.

**Project Type**: Web service + web app in a modular monolith.

**Performance Goals**: Figures within 2 s for 5,000 counted responses and 80 items (SC-006): one grouped query per request, not per item.

**Constraints**: Domain imports nothing from frameworks; vendor names only in adapters; masked text only ever reaches the provider; every AI call in the ledger with its cost on the tab.

**Scale/Scope**: At most 80 items, 20,000 responses (spec 028 limit), open items themed 150 answers per call.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Spec-driven | Spec, plan, tasks in the same PR | Pass |
| II DDD | Figures and themes in Surveys; Fact stays one concept in Evidence with a source; Synthesis reads through its port; modules talk through `index.ts` and compose | Pass |
| III Provider-agnostic | Themes through the AI Gateway; provider-neutral prompts; fake runner branch | Pass |
| IV AI proposes | Themes proposed, decided by a person; facts proposed then validated; quotes verified; statements by the app | Pass |
| V Test-first | Domain rules listed first in tasks | Pass |
| VI Contracts | Zod contracts, OpenAPI and client regenerated; AI answers validated by schema then checked | Pass |
| VII Privacy | Masking before sending (ADR-0012), screen shows masked text, assistant gets figures only, cascade on deletion, spec 026 access | Pass |
| VIII Accessible, international | Lingui, glossary, bars with numbers in text, axe | Pass |
| IX Simplicity | No stored figures; one fact model; one cross only | Pass |

Re-checked after design: pass. Complexity Tracking: none.

## Project Structure

### Documentation

```text
specs/029-survey-analysis/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md
└── tasks.md (next step)
docs/adr/0012-masked-open-answers-to-ai.md (new)
docs/domain/context-map.md (Survey fact, Figure, Theme of open answers; glossary)
docs/agent-journeys/11-survey-analysis.md (new) and README table
apps/api/src/modules/{surveys,evidence,synthesis,reporting}/README.md
```

### Source Code

```text
packages/shared/src/text.ts                      # maskAnswer (names, emails, phones, links, numbers)
packages/contracts/src/survey-analysis.ts        # figures, open answers, themes
packages/contracts/src/facts.ts, insights.ts     # survey facts, source, respondents
apps/api/drizzle/0057_survey_analysis.sql
apps/api/src/modules/surveys/
  domain/figures.ts, domain/themes.ts            # pure: measures, small base; theme answer checks, merges
  application/queries/figure-queries.ts          # SQL counts, cross
  application/commands/theme-commands.ts         # estimate, start, run job, decide, merge, move
  infrastructure/{schema,surveys.drizzle-store,http.routes,module}.ts
  infrastructure/prompts/themes.ts               # gateway adapter
apps/api/src/modules/evidence/
  domain/facts.ts, domain/survey-facts.ts        # source, support, templates, figure changed
  application/commands/survey-fact-commands.ts
  application/queries/survey-fact-queries.ts, synthesis-reads.ts
  infrastructure/{schema,evidence.drizzle-store,http.routes}.ts
apps/api/src/modules/synthesis/
  domain/fact-lines.ts, domain/confidence.ts, infrastructure/prompts/insights.ts, ports.ts
apps/api/src/modules/reporting/                  # survey facts in studyCounts
apps/api/src/modules/assistant/                  # tools, skill text, cards
apps/api/src/modules/ai-gateway/infrastructure/fake.model-runner.ts   # themes branch
apps/api/src/platform/jobs.ts                    # queue surveys.themes
apps/api/src/compose.ts
apps/web/src/features/surveys/
  survey-analysis-tab.tsx, figure-card.tsx, cross-select.tsx,
  open-item.tsx, themes-dialog.tsx, survey-facts.tsx
apps/web/src/features/synthesis/                 # fact source for survey facts
apps/web/src/features/research/project-journey.tsx
apps/web/src/routes/_authenticated/studies/$studyId.tsx  # survey Analysis tab
apps/web/e2e/survey-analysis.spec.ts
```

**Structure Decision**: Figures and themes belong to Surveys (they read its responses); facts stay in Evidence with a `survey` source so there is one fact model for Synthesis. Interview code paths are untouched except where a field becomes nullable.

## Complexity Tracking

None.
