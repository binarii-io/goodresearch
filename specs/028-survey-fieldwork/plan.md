# Implementation Plan: Survey fieldwork

**Branch**: `028-survey-fieldwork` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/028-survey-fieldwork/spec.md`

## Summary

A new module `surveys` holds the responses read from the form, the target rule and former wordings. Publishing gains opening and closing, and refuses updates that would detach responses. Responses are read whole from the form service with the item map of spec 027; states and counts are computed in SQL at read time. The Fieldwork tab of a survey study gets its own screens, and the assistant gets counts and cards.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, AI Gateway through the assistant, React, TanStack, Lingui, `packages/ui`. No new dependency.

**Storage**: PostgreSQL. Migration `0056`: `surveys_responses`, `surveys_readings`, `surveys_target_rules`, `surveys_item_wordings`; columns on `publishing_documents`; widened assistant kinds.

**Testing**: Vitest (domain test-first, use cases with fakes, SQL states against a real database), Playwright + axe with simulated responses from the fake Drive. Real service by hand: [quickstart.md](quickstart.md) scenario 4.

**Target Platform**: The self-hosted web app. Reading runs in the request, started by the tab, not in the worker: it needs a person's access and is bounded.

**Project Type**: Web service + web app in a modular monolith.

**Performance Goals**: SC-007: counts and first page within 2 seconds for 5,000 responses read, through an index on the study and SQL filters.

**Constraints**: No answer to an AI provider; no contact answer stored; domain free of vendors.

**Scale/Scope**: At most 20,000 responses read per study: beyond, the tab says the reading stopped.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Spec-driven | Spec in the same PR | Pass |
| II DDD | New supporting context, plain handlers plus pure rules; other modules through ports | Pass, context map updated |
| III Provider-agnostic | Neutral response shape; parsing in the adapter | Pass |
| IV AI proposes | Rule and opening through cards; counts computed by the app | Pass |
| V Test-first | `readResponses`, `stateOf`, `impactOfUpdate`, next step first | Pass |
| VI Contracts | Zod, OpenAPI, adapter replies parsed | Pass |
| VII Privacy | Contact and identity never stored, even `respondentEmail`; no answer to AI; reserved to the team; nothing deleted at source | Pass |
| VIII Accessible | Lingui, glossary, `packages/ui`, axe | Pass |
| IX Simplicity | Full read rather than an incremental sync; no job | Pass |

Re-checked after design: pass.

## Project Structure

```text
specs/028-survey-fieldwork/ plan.md research.md data-model.md quickstart.md contracts/api.md tasks.md
docs/agent-journeys/10-survey-fieldwork.md, README table
docs/adr/0011-survey-responses-module.md
docs/domain/context-map.md (context 12, glossary)
packages/contracts/src/surveys.ts
apps/api/src/modules/surveys/
  domain/responses.ts             # raw answers to stored ones, states, target rule
  application/{ports,commands,queries}
  infrastructure/{schema,store,http.routes,module}.ts
  tests/
apps/api/src/modules/publishing/
  domain/form.ts                  # impactOfUpdate
  application/commands/publication-commands.ts  # setOpen, guarded update
apps/api/src/modules/ingestion/
  domain/form-model.ts, infrastructure/google-forms.ts, in-memory.drive-documents.ts
                                  # listResponses, setAccepting, responderLink
apps/api/src/modules/assistant/   # tools, cards, next step, context
apps/api/drizzle/0056_survey_responses.sql
apps/web/src/features/surveys/    # fieldwork tab, target rule, responses list, open and close
apps/web/src/routes/_authenticated/studies/$studyId.tsx
```

**Structure Decision**: A module of its own, not Ingestion: Ingestion models files and sessions, none of which apply, and Publishing's job ends at the file.

## Complexity Tracking

None.
