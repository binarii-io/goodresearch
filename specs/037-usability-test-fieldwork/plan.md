# Implementation Plan: Usability test fieldwork

**Branch**: `037-usability-test-fieldwork` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/037-usability-test-fieldwork/spec.md`

## Summary

Reuse the interview Fieldwork of specs 008, 009 and 025 for usability test studies, changing what anchors a session: a **video** file instead of a transcript. The inventory reads each video's duration from Drive; reconciliation starts from videos and matches transcripts and audio to them with the existing matching policy; sessions get a **protocol version** taken from a new immutable history of the test protocol; readiness for analysis is computed by the app. The schedule paths are skipped by type; the analysis keeps its rules-then-AI flow, the AI still only reading a transcript's beginning. The assistant's interview tools gain session wording, readiness and video hours.

## Technical Context

**Language/Version**: TypeScript strict, Node (repo versions)

**Primary Dependencies**: Fastify, Zod, Drizzle, pg-boss, AI Gateway, React, TanStack, Lingui, `packages/ui`. No new dependency.

**Storage**: PostgreSQL. Migration `0061_usability_sessions.sql`: `ingestion_inventory_files.duration_ms`; `ingestion_sessions.video_file_id`, `protocol_version` (a person's choice) and a unique index on (study_id, video_file_id); table `research_test_protocol_versions`.

**Testing**: Vitest (domain test-first: video reconciliation, protocol version choice, readiness, next step), use cases with fakes, Testcontainers component test, Playwright + axe on the Fieldwork tab of a usability test study.

**Target Platform**: The self-hosted web app and its worker.

**Project Type**: Web service + web app in a modular monolith.

**Performance Goals**: Same as interviews: one inventory pass, sessions computed in the store; readiness computed in the view query from columns already read (no extra Drive call).

**Constraints**: No video or audio content read or sent anywhere (FR-007, FR-016); names to the AI only under folder consent and never on an anonymised study (FR-008); interview and survey behaviour unchanged (SC-006).

**Scale/Scope**: Up to the existing 500 sessions per study; videos of any length (duration only).

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| I Spec-driven | Spec in the same PR, Spec Kit steps run | Pass |
| II DDD | Session stays the Ingestion aggregate; protocol versions belong to Research; Ingestion reads them through a port wired in `compose.ts`, never Research's tables | Pass |
| III Provider-agnostic | Duration read in the Drive adapter into the neutral `DriveItem`; domain sees a number | Pass |
| IV AI proposes | Rules first, AI only on a transcript's beginning, quotes verified; protocol version proposed, chosen by a person; readiness computed | Pass |
| V Test-first | Domain rules listed first in tasks | Pass |
| VI Contracts | Zod contracts extended, OpenAPI and client regenerated | Pass |
| VII Privacy | No media content read; consent and anonymisation rules of specs 009 and 022 unchanged; nothing deleted in Drive | Pass |
| VIII Accessible, international | Lingui with « séance » and « animateur », `packages/ui`, axe | Pass |
| IX Simplicity | No new aggregate: Session gets an anchor mode; roster roles kept (`interviewee`/`interviewer` shown as participant/facilitator) | Pass |

Re-checked after design: pass, no entry in Complexity Tracking.

## Project Structure

### Documentation

```text
specs/037-usability-test-fieldwork/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md
└── tasks.md (next step)
docs/domain/context-map.md: Session (video anchor), Protocol version, Session readiness, glossary (Séance, Animateur)
docs/agent-journeys/13-usability-sessions.md (new) and README row
```

### Source Code

```text
apps/api/src/modules/ingestion/
  infrastructure/drive.fetch-gateway.ts, dev-drive.ts       # videoMediaMetadata → durationMs
  domain/drive-gateway.ts, inventory-walk.ts, classify.ts  # DriveItem.durationMs, isVideo
  domain/reconcile-sessions.ts                             # reconcileVideoSessions
  domain/session.ts                                        # videoFileId, protocolVersion
  domain/session-readiness.ts (new)                        # readinessOf
  domain/protocol-version.ts (new)                         # versionAt
  domain/interview-filters.ts                              # not-ready filter, ready and video hours counts
  application/commands/run-inventory.ts                    # sessions mode by type
  application/commands/session-commands.ts                 # accept usability-test; setProtocolVersion
  application/commands/analysis-commands.ts                # accept usability-test; no schedule
  application/queries/session-queries.ts                   # view with duration, readiness, versions
  application/ports.ts                                     # protocolVersions port
  infrastructure/{schema,ingestion.drizzle-store,http.routes}.ts
  infrastructure/prompts/analysis.ts                       # participant/facilitator wording by type
apps/api/src/modules/research/
  infrastructure/{schema,test-protocol.drizzle-repository}.ts  # versions written with each save
  application/queries/test-protocol-queries.ts             # protocolVersions
apps/api/src/modules/assistant/
  domain/next-step.ts, application/{context,tools}.ts      # session steps and wording
apps/api/src/compose.ts                                    # protocolVersions port, schedule off by type
apps/api/drizzle/0061_usability_sessions.sql
packages/contracts/src/sessions.ts                         # duration, readiness, protocol version
apps/web/src/features/fieldwork/
  fieldwork-tab.tsx, session-dialog.tsx, analysis.tsx, labels.ts   # session mode
apps/web/src/routes/_authenticated/studies/$studyId.tsx    # usability Fieldwork
apps/web/e2e/usability-fieldwork.spec.ts
```

**Structure Decision**: Extend Ingestion's Session rather than a new aggregate: the files, matching, roster, analysis, renaming and assistant cards are the same; only the anchor and two fields differ.

## Complexity Tracking

None.
