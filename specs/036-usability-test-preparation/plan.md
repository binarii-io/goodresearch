# Implementation Plan: Usability test preparation

**Branch**: `036-usability-test-preparation` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/036-usability-test-preparation/spec.md`

## Summary

Make `usability-test` a creatable study type, with a **TestProtocol** aggregate in Research mirroring `Questionnaire` (versioned JSON, ids kept by instruction), fixed task-writing rules and the planned length shared by the screen and the assistant, a test protocol design skill with its progress points, and three publications: the protocol as a document under the three-way sync (anchors per framing block and task, as the guide), the best practices chosen by study type, and a new one-way **participant sheet**. The SUS and the Single Ease Question are fixed content per language, referenced by a versioned key in the protocol. Interview and survey code paths keep their behaviour; every place that branches on type gets a third branch.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, Vercel AI SDK through the AI Gateway, React, TanStack, Lingui, `packages/ui`. No new dependency.

**Storage**: PostgreSQL. Two new Research tables (`research_test_protocols`, `research_protocol_checks`), widened check constraints for study type, publication kind and proposal kind (migration `0060_test_protocols.sql`).

**Testing**: Vitest (domain test-first: protocol, checks, planned length, render/read-back, next step, progress), use cases with the existing fakes, Testcontainers for the repository, one component test per route family, Playwright + axe on the Preparation flow. The real Docs service is reached by hand in [quickstart.md](quickstart.md) scenario 6, as for the guide.

**Target Platform**: The self-hosted web app and its worker.

**Project Type**: Web service + web app in a modular monolith.

**Performance Goals**: Same as the guide: the tab loads what it shows; checks are pure and run on at most 15 tasks.

**Constraints**: Domain imports nothing from frameworks; vendor names only in adapters; the tested interface link is validated as text and never fetched (FR-022); a protocol holds no real name.

**Scale/Scope**: 1 to 15 tasks, 10 warm-up and 10 debrief questions per protocol; one protocol, one participant sheet and one best-practices document per study.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Spec-driven | Spec in the same PR, Spec Kit steps run | Pass |
| II DDD | `TestProtocol` aggregate, pure domain; rendering pure in Publishing; modules talk via `index.ts` and ports | Pass |
| III Provider-agnostic | Reuses the neutral `DocModel` and `StudyFiles` port; no vendor in domain or application | Pass |
| IV AI proposes | Whole-protocol card saved on Apply; percentage, checks and planned length computed by the app; SUS and SEQ never written by a model | Pass |
| V Test-first | Domain rules listed first in tasks: protocol, checks, planned length, render and read-back, participant sheet, next step, progress | Pass |
| VI Contracts | Zod in `packages/contracts`, OpenAPI and client regenerated; links validated as `http(s)` URLs at the boundary | Pass |
| VII Privacy | Least privilege: existing editing consent reused; nothing deleted at source; consent text and anonymisation warning (FR-005, FR-022a) | Pass |
| VIII Accessible, international | Lingui, glossary, `packages/ui`, axe; SUS/SEQ and best practices as typed content per language (ADR-0006) | Pass |
| IX Simplicity | Protocol stored as versioned JSON like the questionnaire; identity rule copied, not generalised (as 027); best practices reuse the `best-practices` kind; participant sheet reuses the one-way path of best practices | Pass |

Re-checked after design: pass, no entry in Complexity Tracking.

## Project Structure

### Documentation

```text
specs/036-usability-test-preparation/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md
└── tasks.md (next step)
docs/agent-journeys/12-usability-preparation.md (new) and README table
docs/domain/context-map.md: Study, Test protocol, Test task, Tested interface, Standard questions,
  Readiness check, Participant sheet, Folder access next step, PublishedDocument kinds, glossary
docs/adr/0006-frontend-and-design-system.md: content modules list (stale since 027)
apps/api/README.md if it lists modules' aggregates or tables
```

### Source Code

```text
packages/contracts/src/test-protocol.ts           # schemas, limits, flags, readiness kinds; errors.ts adds NOT_A_USABILITY_TEST_STUDY
packages/contracts/src/{research,assistant,publishing}.ts  # type enums, proposal kinds, progress keys, publication kinds
packages/shared/src/content/
  usability-practices.{en,fr}.ts, usability-practices.ts   # best practices (ADR-0006)
  standard-questions.{en,fr}.ts, standard-questions.ts     # SUS v1, SEQ v1, consent and think-aloud defaults
apps/api/src/modules/research/
  domain/study.ts                                  # CREATABLE gets 'usability-test'
  domain/test-protocol.ts                          # aggregate, limits, identities
  domain/protocol-checks.ts                        # task rules, whole rules, planned length
  domain/test-protocol.repository.ts
  application/commands/test-protocol-commands.ts   # save, mark and unmark readiness
  application/queries/test-protocol-queries.ts     # view, checks, length, readiness; for the assistant
  infrastructure/{schema,test-protocol.drizzle-repository,http.routes,module}.ts
apps/api/src/modules/publishing/
  domain/protocol.ts                               # renderProtocol, readProtocol, protocolItems, applyToProtocol
  domain/participant-sheet.ts                      # renderParticipantSheet (one way)
  domain/practices.ts                              # content by study type
  application/ports.ts, commands/publication-commands.ts, queries/publication-queries.ts
  infrastructure/{schema,publishing.drizzle-store}.ts
apps/api/src/modules/assistant/
  domain/protocol-progress.ts, domain/next-step.ts (usabilityNextStep), domain/proposal.ts
  application/{skills,tools,context}.ts, commands/{send-message,proposal-commands}.ts
  application/queries/conversation-queries.ts      # design cost for the skill
apps/api/src/modules/reporting/application/queries/overview-queries.ts  # counts by type
apps/api/src/compose.ts, platform/http/change-guard.ts
apps/api/drizzle/0060_test_protocols.sql
apps/web/src/features/preparation/
  protocol-tab.tsx, protocol-editor.tsx, protocol-view.tsx, protocol-markdown.ts
  labels.ts, drive-publishing.tsx, best-practices.tsx
apps/web/src/features/assistant/{proposal-card,panel}.tsx
apps/web/src/features/research/{study-list,create-team-study-dialog,study-card,study-settings,project-journey}.tsx
apps/web/src/routes/_authenticated/studies/$studyId.tsx      # phases and Preparation by type
apps/web/src/features/workspace/errors.ts, locales/{en,fr}
apps/web/e2e/usability-preparation.spec.ts, studies.spec.ts
```

**Structure Decision**: Follow the existing modules and the 027 precedent. The protocol does not generalise `InterviewGuide` or `Questionnaire`: they share a shape, not rules, and existing paths stay untouched (SC-007).

## Complexity Tracking

None.
