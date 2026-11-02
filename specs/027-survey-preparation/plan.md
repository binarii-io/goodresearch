# Implementation Plan: Survey preparation

**Branch**: `027-survey-preparation` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/027-survey-preparation/spec.md`

## Summary

Make `survey` a creatable study type, with a **Questionnaire** aggregate mirroring `InterviewGuide` in the Research module, fixed writing rules shared by the screen and the assistant, a questionnaire design skill, and a new publication kind `questionnaire` rendered as a form through the study's files port, under the existing three-way sync. Interview code paths stay as they are. The form stays closed to responses; spec 028 opens it and reads responses through the identity map stored here.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, Vercel AI SDK through the AI Gateway, React, TanStack, Lingui, `packages/ui`. No new dependency: the form service is called with `fetch`, like the other document adapters.

**Storage**: PostgreSQL. Two new Research tables, three new columns on `publishing_documents`, widened check constraints (migration `0055`).

**Testing**: Vitest (domain test-first, use cases with fakes, fake `StudyFiles` forms), Testcontainers for the repository, Playwright + axe on one critical flow. The real form service is only reachable by hand: [quickstart.md](quickstart.md) scenario 5 must pass before merge.

**Target Platform**: The self-hosted web app and its worker.

**Project Type**: Web service + web app in a modular monolith.

**Performance Goals**: Same as the guide: the tab loads what it shows; checks are pure and run on at most 80 items.

**Constraints**: Domain imports nothing from frameworks; vendor names only in adapters; no real names reach the AI (a questionnaire holds none, the rules flag identifying items).

**Scale/Scope**: At most 80 items and 12 sections per questionnaire; one form per study.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Spec-driven | Spec in the same PR, Spec Kit steps run | Pass |
| II DDD | `Questionnaire` aggregate, pure domain; form rendering pure in Publishing; modules talk via `index.ts` and ports | Pass |
| III Provider-agnostic | Neutral `FormModel`, adapter in Ingestion's infrastructure, `FilesPort` extended; deployment note for enabling the service | Pass |
| IV AI proposes | Whole-questionnaire card, saved on Apply; percentage, checks and estimate computed by the app | Pass |
| V Test-first | Domain rules listed in tasks first: questionnaire, checks, form render, update plan, next step | Pass |
| VI Contracts | Zod in `packages/contracts`, OpenAPI and client regenerated; form responses validated with Zod in the adapter | Pass |
| VII Privacy | Least privilege: the existing full scope, granted by editing consent, is reused; identity collection explicitly off (research R3); nothing deleted at source | Pass |
| VIII Accessible, international | Lingui, glossary, `packages/ui`, axe | Pass |
| IX Simplicity | Questionnaire stored as versioned JSON like the guide; no shared abstraction forced between guide and questionnaire | Pass |

Re-checked after design: pass, no entry in Complexity Tracking.

## Project Structure

### Documentation

```text
specs/027-survey-preparation/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md
└── tasks.md (next step)
docs/agent-journeys/09-questionnaire.md (new) and README table
docs/domain/context-map.md, apps/api/README.md (or the root README's Drive section): deployment note
docs/adr/0010-forms-as-survey-collection.md (new)
```

### Source Code

```text
packages/contracts/src/questionnaire.ts            # schemas; errors.ts adds NOT_A_SURVEY_STUDY
apps/api/src/modules/research/
  domain/study.ts                                  # CREATABLE gets 'survey'
  domain/questionnaire.ts                          # aggregate, limits, identities
  domain/questionnaire-checks.ts                   # fixed rules, estimate, analysis per kind
  domain/questionnaire.repository.ts
  application/commands/questionnaire-commands.ts   # save, mark and unmark readiness
  application/queries/questionnaire-queries.ts
  infrastructure/{schema,questionnaire.drizzle-repository,http.routes}.ts
apps/api/src/modules/publishing/
  domain/form.ts                                   # FormModel, render, read-back items, update plan
  application/ports.ts, commands/publication-commands.ts   # kind 'questionnaire'
  infrastructure/{schema,publishing.drizzle-store}.ts
apps/api/src/modules/ingestion/
  domain/drive-documents.ts, application/study-files.ts    # createForm, readForm, updateForm
  infrastructure/google-forms.ts, in-memory.drive-documents.ts
apps/api/src/modules/assistant/
  domain/questionnaire-progress.ts, domain/next-step.ts, domain/proposal.ts
  application/{skills,tools,context}.ts, commands/send-message.ts
  application/queries (design cost of a study)
apps/api/drizzle/0055_questionnaires.sql
apps/web/src/features/preparation/questionnaire/   # tab, view, editor, checks, readiness, practices
apps/web/src/features/preparation/drive-publishing.tsx, drive-review.tsx  # new kind
apps/web/src/features/assistant/proposal-card.tsx
apps/web/src/features/research/study-list.tsx      # Survey available
apps/web/src/routes/_authenticated/studies/$studyId.tsx  # Preparation by type
```

**Structure Decision**: Follow the existing modules. The questionnaire does not generalise `InterviewGuide`: they share a shape, not rules, and interview code stays untouched (SC-007).

## Complexity Tracking

None.
